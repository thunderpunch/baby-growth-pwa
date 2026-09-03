import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {recentDateKeys,templateSourceLabel} from "../record-templates.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [source,app,entry,sw]=await Promise.all([
  readFile(path.join(root,"record-templates.js"),"utf8"),
  readFile(path.join(root,"app.js"),"utf8"),
  readFile(path.join(root,"export-ipad.js"),"utf8"),
  readFile(path.join(root,"sw.js"),"utf8")
]);

assert.deepEqual(recentDateKeys("2026-09-03"),["2026-09-02","2026-09-01","2026-08-31"],"milk template lookup must inspect the previous three natural days");
assert.deepEqual(recentDateKeys("2027-01-01"),["2026-12-31","2026-12-30","2026-12-29"],"three-day lookup must cross year boundaries correctly");
assert.equal(templateSourceLabel("2026-09-02","2026-09-03"),"昨天");
assert.equal(templateSourceLabel("2026-09-01","2026-09-03"),"前天");
assert.equal(templateSourceLabel("2026-08-31","2026-09-03"),"大前天");

assert.match(source,/const\s+MILK_LOOKBACK_DAYS\s*=\s*3/,"milk autofill window must remain three days");
assert.match(source,/findNearestConfirmed\(date,"milk",MILK_LOOKBACK_DAYS\)/,"milk autofill must select the nearest confirmed milk day inside the window");
assert.match(source,/confirmedOfType\(current,"milk"\)/,"only existing milk should suppress milk autofill; other record types must not block it");
assert.match(source,/async function ensureMilkTemplates[\s\S]*async function ensureDietTemplates/,"milk and diet template policies must remain independent");
assert.doesNotMatch(source,/getAllRecords/,"template generation must never scan lifetime record history");
assert.match(app,/ensureRecordTemplates\(\{date:state\.date,day,dietStage:state\.dietStage,nowISO\}\)/,"Today load must invoke the canonical template owner directly");
assert.doesNotMatch(app,/function\s+generatePreviousDayTemplates/,"legacy combined previous-day template implementation must stay removed");
assert.doesNotMatch(entry,/recent-milk-template\.js/,"legacy DOM-driven recent milk bridge must stay out of boot");
assert.ok(sw.includes('"./record-templates.js"'),"offline app shell must cache record-templates.js");
assert.ok(!sw.includes("recent-milk-template.js"),"offline app shell must not cache the removed recent milk bridge");

console.log("record template policy regressions passed");
