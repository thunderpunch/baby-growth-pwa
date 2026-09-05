import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [index,app,sleep,schema]=await Promise.all([
  readFile(path.join(root,"index.html"),"utf8"),
  readFile(path.join(root,"app.js"),"utf8"),
  readFile(path.join(root,"sleep-v3.js"),"utf8"),
  readFile(path.join(root,"JSON_DATA_SCHEMA.md"),"utf8")
]);

for(const id of ["metricNapCountValue","metricNapTotalValue","metricNapTotalLabel","metricEarlyWakeValue","metricMilkTotalValue","metricPendingCountValue"]){
  assert.match(index,new RegExp(`id=["']${id}["']`),`${id} must exist statically in index.html`);
}
assert.match(index,/data-metric-owner="sleep"/,"sleep metric ownership must be explicit in the static shell");
assert.match(index,/data-metric-owner="app"/,"app metric ownership must be explicit in the static shell");

const renderMetrics=app.match(/function renderMetrics\(records\)\{[\s\S]*?\n\}/)?.[0]||"";
assert.ok(renderMetrics,"renderMetrics must exist");
assert.doesNotMatch(renderMetrics,/record\.type==="sleep"|sleepMinutes|suspected|wakeTime/,"app.js must not calculate sleep/early-wake metrics");
assert.doesNotMatch(renderMetrics,/metrics.*innerHTML|\$\("metrics"\)\.innerHTML/,"app.js must not replace the metric shell");
assert.match(app,/resetSleepMetricPlaceholders\(\);[\s\S]*?await loadDay\(\)/,"date changes must clear stale sleep values before async loading");

assert.match(sleep,/function renderSleepMetrics\(a\)/,"Sleep owner must render sleep metrics");
assert.match(sleep,/metricNapCountValue/,"Sleep owner must address stable nap metric IDs");
assert.match(sleep,/metricEarlyWakeValue/,"Sleep owner must address stable early-wake metric ID");
assert.doesNotMatch(sleep,/querySelectorAll\("\.metric"\)/,"Sleep metrics must not depend on positional metric order");
const refreshAppDay=sleep.match(/function refreshAppDay\(\)\{[\s\S]*?\n\}/)?.[0]||"";
assert.doesNotMatch(refreshAppDay,/MutationObserver|renderObserver|observerTimeout/,"sleep save refresh must not race app rendering through a metrics observer");
assert.match(sleep,/let refreshRevision=0/,"sleep refreshes need a generation token");
assert.match(sleep,/revision!==refreshRevision/,"stale date analyses must not overwrite the current date");

assert.match(app,/\["水样","稀","糊状","较稠","成形","偏硬","其它"\]/,"stool consistency choices should form a clear soft-to-hard sequence");
assert.match(schema,/水样.*稀.*糊状.*较稠.*成形.*偏硬/s,"JSON schema docs must describe the current stoolForm vocabulary");

console.log("sleep metric ownership regressions passed");
