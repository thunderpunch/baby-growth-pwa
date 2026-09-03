import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFile(path.join(root,name),"utf8");
const [boot,sw,sleep,timeline]=await Promise.all([
  read("export-ipad.js"),read("sw.js"),read("sleep-v3.js"),read("timeline-v3.js")
]);

// Boot helpers are independent and must not drift back to a long serial import waterfall.
assert.match(boot,/const\s+bootModules\s*=\s*\[/,"boot must declare parallel module group");
assert.match(boot,/await\s+Promise\.all\(bootModules\)/,"boot helpers must initialize in parallel");
for(const css of ["layout-fix.css","sleep-v3.css","icon-theme.css","baby-name.css","time-picker.css","interaction-guard.css"]){
  assert.ok(boot.includes(css),`render-related stylesheet must be requested early: ${css}`);
}

// Data import/export is below-the-fold functionality and must not block Today hydration.
assert.match(boot,/requestIdleCallback[\s\S]*loadDataIo/,"data IO should be scheduled during browser idle time");
assert.doesNotMatch(boot,/await\s+import\(["']\.\/data-io-v3\.js["']\)/,"data IO must not block first-screen boot");

// A controlled SW version owns its static app shell. Repeat loads should not pay one network RTT
// per script/style; navigation and remotely controlled config remain network-first.
assert.match(sw,/navigation\s*\|\|\s*remoteConfig\s*\?\s*networkFirst\(event\.request\)\s*:\s*cacheFirst\(event\.request\)/,
  "service worker must serve version-owned static assets cache-first");
assert.doesNotMatch(sw,/codeOrPage\s*\?\s*networkFirst/,"scripts/styles must not regress to network-first on every refresh");

// Home sleep hydration must be proportional to the selected day, not lifetime history size.
assert.doesNotMatch(sleep,/\bgetAllRecords\b/,"sleep-v3 must not scan the complete record store during normal runtime");
assert.doesNotMatch(sleep,/\bsetInterval\s*\(/,"sleep-v3 must not poll in the background for page-date changes");
assert.match(sleep,/getRecordsByDate\(previousDate/,"sleep analysis should read the previous evening by indexed date");
assert.match(sleep,/getRecordsByDate\(pageDate/,"sleep analysis should read the selected day by indexed date");
assert.match(sleep,/const\s+analysis=await\s+analysisForDate\(pageDate\)/,"one refresh should compute sleep analysis once");

// Timeline projection should perform one indexed-day read, rather than one IDB transaction per row.
assert.match(timeline,/getRecordsByDate\(pageDate/,"timeline must batch records by indexed page date");
assert.doesNotMatch(timeline,/\bgetRecord\s*\(/,"timeline must not read one record per visible row");
assert.match(timeline,/subtree:false/,"timeline observer must ignore its own row-internal text updates");

console.log("page-load performance contracts passed");
