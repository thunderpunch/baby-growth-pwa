import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFile(path.join(root,name),"utf8");
const [boot,sw,updater,sleep,timeline]=await Promise.all([
  read("export-ipad.js"),read("sw.js"),read("update-coordinator.js"),read("sleep-v3.js"),read("timeline-v3.js")
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

// Mutable application code must revalidate online so a deployment does not depend on a manual
// CACHE_NAME bump. Cache Storage remains the offline fallback; stable assets stay cache-first.
assert.match(sw,/const\s+mutableCode\s*=\s*\[[^\]]*"script"[^\]]*"style"[^\]]*"manifest"[^\]]*\]\.includes\(event\.request\.destination\)/,
  "service worker must explicitly classify mutable code");
assert.match(sw,/navigation\s*\|\|\s*remoteConfig\s*\|\|\s*mutableCode[\s\S]*\?\s*networkFirst\(event\.request\)[\s\S]*:\s*cacheFirst\(event\.request\)/,
  "scripts/styles/manifests must prefer fresh network responses with offline cache fallback");
assert.match(sw,/fetch\(request,\{cache:"no-cache"\}\)/,
  "network-first code requests must revalidate rather than accept a stale browser cache entry");
assert.doesNotMatch(sw,/version-owned static assets cache-first/,
  "old manual-cache-bump freshness policy must not return");

// SW update discovery starts as soon as the coordinator module is evaluated, not after window.load.
assert.match(updater,/void\s+requestFreshServiceWorker\(\)/,"service worker update check must start immediately");
assert.doesNotMatch(updater,/addEventListener\(["']load["']/,"service worker update check must not wait for window.load");
assert.match(updater,/updateViaCache:\s*["']none["']/,"worker script checks must bypass the HTTP cache");
assert.match(updater,/registration\.update\(\)/,"coordinator must explicitly request an update check");

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
