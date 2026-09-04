import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFile(path.join(root,name),"utf8");
const [boot,sw,updater,sleep,timeline,datePicker]=await Promise.all([
  read("export-ipad.js"),read("sw.js"),read("update-coordinator.js"),read("sleep-v3.js"),read("timeline-v3.js"),read("date-picker.js")
]);

// Boot helpers are independent and must not drift back to a long serial import waterfall.
assert.match(boot,/const\s+bootModules\s*=\s*\[/,"boot must declare parallel module group");
assert.match(boot,/await\s+Promise\.all\(bootModules\)/,"boot helpers must initialize in parallel");
for(const css of ["layout-fix.css","sleep-v3.css","icon-theme.css","baby-name.css","time-picker.css","date-picker.css","large-text.css","interaction-guard.css"]){
  assert.ok(boot.includes(css),`render-related stylesheet must be requested early: ${css}`);
}

// Data import/export is below-the-fold functionality and must not block Today hydration.
assert.match(boot,/requestIdleCallback[\s\S]*loadDataIo/,"data IO should be scheduled during browser idle time");
assert.doesNotMatch(boot,/await\s+import\(["']\.\/data-io-v3\.js["']\)/,"data IO must not block first-screen boot");

// Custom date hydration must not create a MutationObserver feedback loop. Rewriting trigger text
// from inside a broad childList observer can starve the main thread and make the rendered app untappable.
assert.match(datePicker,/if\(trigger\.textContent!==text\)trigger\.textContent=text/,"date trigger sync must avoid no-op DOM writes");
const observerBody=datePicker.match(/const\s+observer=new\s+MutationObserver\(mutations=>\{([\s\S]*?)\n\s*\}\);\n\s*observer\.observe/)?.[1]||"";
assert.ok(observerBody,"date picker MutationObserver body not found");
assert.doesNotMatch(observerBody,/\bsyncAll\s*\(/,"date MutationObserver must not rescan and rewrite the whole date UI from its own mutations");

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

// Saving Good Morning/other sleep facts causes app.js to rebuild the generic metrics asynchronously.
// Sleep must do one final projection after that exact child-list rebuild, otherwise the generic
// render can race and temporarily count last night's anchor as a daytime nap.
const refreshAppDay=sleep.match(/function\s+refreshAppDay\(\)\{([\s\S]*?)\n\}\nasync function persistOrdinary/)?.[1]||"";
assert.ok(refreshAppDay,"sleep refreshAppDay synchronization body not found");
assert.match(refreshAppDay,/new MutationObserver/,"sleep save refresh must synchronize with the generic metrics rebuild");
assert.match(refreshAppDay,/renderObserver\.observe\(metrics,\{childList:true\}\)/,"sleep refresh observer must watch only the metrics child-list rebuild");
assert.match(refreshAppDay,/renderObserver\.disconnect\(\)/,"sleep refresh observer must self-disconnect after the one rebuild");
assert.doesNotMatch(refreshAppDay,/subtree:true/,"sleep save synchronization must not become a broad long-lived subtree observer");

// Timeline projection should perform one indexed-day read, rather than one IDB transaction per row.
assert.match(timeline,/getRecordsByDate\(pageDate/,"timeline must batch records by indexed page date");
assert.doesNotMatch(timeline,/\bgetRecord\s*\(/,"timeline must not read one record per visible row");
assert.match(timeline,/subtree:false/,"timeline observer must ignore its own row-internal text updates");

console.log("page-load performance contracts passed");
