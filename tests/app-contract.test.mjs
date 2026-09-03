import assert from "node:assert/strict";
import {readFile,readdir,stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=async p=>readFile(path.join(root,p),"utf8");

async function walk(dir){
  const out=[];
  for(const name of await readdir(dir)){
    if(name===".git"||name==="node_modules")continue;
    const full=path.join(dir,name),s=await stat(full);
    if(s.isDirectory())out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const index=await read("index.html");
const app=await read("app.js");
const sleep=await read("sleep-v3.js");
const sleepCss=await read("sleep-v3.css");
const styles=await read("styles.css");
const dataIo=await read("data-io-v3.js");
const datePicker=await read("date-picker.js");
const datePickerCss=await read("date-picker.css");
const entry=await read("export-ipad.js");
const sw=await read("sw.js");
const interaction=await read("interaction-guard.css");

// IDs are behavioral contracts in this no-framework PWA. Duplicate IDs can silently bind
// handlers to the wrong node, so fail before deploy.
const ids=[...index.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
assert.deepEqual(duplicates,[],`index.html contains duplicate ids: ${duplicates.join(", ")}`);

for(const id of ["pageDate","quickbar","metrics","timeline","lastNightSummary","historyView","historyGrid","contextSummary","modal","toast"]){
  assert.ok(ids.includes(id),`missing required DOM mount #${id}`);
}
for(const id of ["nightSleepAt","nightWakeAt","nightSleepEntries","backfillBtn","historyTodayBtn"]){
  assert.ok(!ids.includes(id),`obsolete DOM mount #${id} must stay removed`);
}
assert.equal((index.match(/data-night-morning/g)||[]).length,1,"Exactly one static Morning action is allowed");
assert.equal((index.match(/data-night-goodnight/g)||[]).length,1,"Exactly one static Goodnight action is allowed");
assert.ok(index.indexOf("data-night-morning")<index.indexOf('id="lastNightSummary"'),"Morning action must stay above last-night summary");
assert.ok(index.indexOf('id="lastNightSummary"')<index.indexOf("data-night-goodnight"),"Last-night summary must stay above Goodnight action");
assert.match(index,/type=["']module["']\s+src=["']\.\/app\.js["']/,"index.html must load app.js as module");
assert.match(index,/type=["']module["']\s+src=["']\.\/export-ipad\.js["']/,"index.html must load export-ipad.js as module");

// The global date control belongs to Today only. Other pages have their own range/navigation
// semantics and must not expose a misleading global date picker.
assert.match(styles,/body:not\(:has\(#todayView\.active\)\)\s+\.date-nav\s*\{\s*display:none/,"date navigation must be hidden outside Today");
assert.match(styles,/body:has\(#todayView\.active\)\s+\.date-nav\s*\{\s*display:flex/,"date navigation must be visible on Today");

// All date inputs use the custom calendar. Native iPad date controls have intrinsic widths that
// can overflow narrow grid cells, so the original input must be hidden after enhancement and the
// visible trigger must be explicitly shrinkable.
assert.match(datePicker,/DATE_INPUT_SELECTOR=['"]input\[type=\\?["']date\\?["']\]['"]/,"custom date picker must target every date input");
assert.match(datePicker,/new\s+MutationObserver/,"custom date picker must enhance dynamically inserted modal date inputs");
assert.match(datePicker,/dispatchEvent\(new Event\(["']change["']/,"custom date picker must preserve existing change handlers");
assert.match(datePickerCss,/data-custom-date-hidden=["']1["'][^}]*display:none!important/,"native date input must be removed from layout after enhancement");
assert.match(datePickerCss,/\.custom-date-trigger\{[\s\S]*min-width:0[\s\S]*max-width:100%/,"custom date trigger must be shrinkable inside iPad layouts");
assert.match(datePickerCss,/\.date-nav \.custom-date-trigger-compact\{[\s\S]*max-width:25vw/,"top date trigger must have an explicit compact width cap");

// History is owned by history.js. Removed backfill UI and legacy shell mounts must not return.
assert.doesNotMatch(index,/history-tools|连续补历史|开始批量补录/,"obsolete History backfill shell must stay physically removed");

// Sleep is owned by sleep-v3.js and renders directly into the static final DOM.
assert.doesNotMatch(sleep,/ensureNightCard|nightSleepAt|nightWakeAt|nightSleepEntries|sleep-v3-old-hidden|night-sleep-entries/,"legacy Sleep DOM compatibility must not return");
assert.match(sleep,/\$\(["']lastNightSummary["']\)/,"sleep-v3.js must render directly into #lastNightSummary");
assert.doesNotMatch(sleepCss,/sleep-v3-old-hidden|sleep-v3-legacy-card|night-sleep-entries/,"legacy Sleep compatibility CSS must stay deleted");

// app.js is the core Today/profile controller, not a second implementation of History, Sleep,
// Data IO or Service Worker update coordination.
assert.doesNotMatch(app,/\bgetAllRecords\b|\bgetAllDays\b/,"app controller must not perform lifetime History scans");
assert.doesNotMatch(app,/function\s+renderHistory\b/,"History rendering belongs only to history.js");
assert.doesNotMatch(app,/function\s+openBackfillModal\b|backfillBtn|historyTodayBtn/,"removed batch-backfill workflow must not return to app.js");
assert.doesNotMatch(app,/navigator\.serviceWorker\.register\s*\(/,"Service Worker registration belongs only to update-coordinator.js");
assert.doesNotMatch(app,/function\s+saveNightSleep\b/,"legacy day.nightSleep write path must not return");
assert.doesNotMatch(app,/\bSCHEMA_VERSION\b|\bMAX_IMPORT_BYTES\b|function\s+validatePayload\b|function\s+buildExportPayload\b|function\s+handleImportFile\b|function\s+applyImport\b/,"v3 Data IO must remain the unique import/export implementation");

// Native-looking file selection should not flash the browser's blue tap highlight. Data IO now
// supports only the current JSON schema and shares/saves the standard file without a text fallback.
assert.match(styles,/\.filelabel\s*\{[\s\S]*-webkit-tap-highlight-color\s*:\s*transparent/,"file picker label must suppress native blue tap highlight");
assert.match(styles,/\.filelabel:active\s*\{[\s\S]*background:/,"file picker label must own its pressed state");
assert.match(dataIo,/function\s+canShareFile\([^)]*\)[\s\S]*navigator\.canShare/,"file share must feature-check navigator.canShare");
assert.doesNotMatch(dataIo,/function\s+jsonTextShareFile\b|text\/plain/,"JSON sharing must not generate compatibility text attachments");
assert.match(dataIo,/raw\.schemaVersion!==SCHEMA_VERSION/,"JSON import must require the current schema exactly");
assert.doesNotMatch(dataIo,/schemaVersion[^\n]*1\.1\.0|dataVersion\s*:/,"legacy schema/dataVersion compatibility must stay removed");
assert.match(dataIo,/JSON\.stringify\(payload,null,2\)[\s\S]*JSON\.parse\(text\)[\s\S]*validateIncoming\(parsed\)/,"JSON export must round-trip through current-schema validation before file creation");
assert.doesNotMatch(dataIo,/!navigator\.canShare\s*\|\|\s*navigator\.canShare/,"missing canShare must not be treated as file-share support");

// Progressive boot contract: default HTML may paint first, but feature hydration must never
// blank the whole page or start the complete document a second time.
assert.doesNotMatch(entry,/location\.reload\s*\(/,"export-ipad.js must not force a second boot");
assert.doesNotMatch(entry,/style\.visibility\s*=\s*["']hidden["']/,"boot must not hide the whole document");
assert.doesNotMatch(entry,/style\.display\s*=\s*["']none["']/,"boot must not blank the whole document");
assert.match(entry,/document\.documentElement\.classList\.add\(["']app-ready["']\)/,"default UI must be released before awaited feature hydration");
const readyAt=entry.indexOf('classList.add("app-ready")');
const firstAwait=entry.indexOf("await ");
assert.ok(readyAt>=0&&(firstAwait<0||readyAt<firstAwait),"app-ready must happen before the first await");

for(const moduleName of ["date-picker.js","history.js","sleep-v3.js","timeline-v3.js","data-io-v3.js"]){
  assert.ok(entry.includes(`./${moduleName}`),`export-ipad.js missing boot module ${moduleName}`);
}
assert.doesNotMatch(entry,/migration-v\d|runDataMigration/,"legacy data migration must not return to the boot chain");
assert.doesNotMatch(entry,/sleep-ui-bridge\.js/,"runtime DOM bridge must not return to the boot chain");

// iPad app chrome should not expose Safari text-selection callouts, while real editing/copy
// surfaces must retain native selection, paste and caret behavior.
assert.match(interaction,/-webkit-touch-callout\s*:\s*none/,"app chrome must suppress iOS long-press callouts");
assert.match(interaction,/-webkit-user-select\s*:\s*none/,"app chrome must suppress accidental text selection");
assert.match(interaction,/\.app\s+input[\s\S]*-webkit-touch-callout\s*:\s*default/,"inputs must restore native text interaction");
assert.match(interaction,/\.text-selectable[\s\S]*user-select\s*:\s*text/,"copyable read-only text must have an explicit opt-in escape hatch");

// Every relative ESM import in repository JavaScript must resolve to a real local file.
const files=await walk(root);
const jsFiles=files.filter(f=>/\.(?:js|mjs)$/.test(f));
for(const file of jsFiles){
  const text=await readFile(file,"utf8");
  const specs=[
    ...text.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/g),
    ...text.matchAll(/import\s*\(\s*["'](\.[^"']+)["']\s*\)/g)
  ].map(m=>m[1]);
  for(const spec of specs){
    const resolved=path.resolve(path.dirname(file),spec.split("?")[0]);
    let ok=false;
    try{ok=(await stat(resolved)).isFile();}catch{}
    assert.ok(ok,`${path.relative(root,file)} imports missing file ${spec}`);
  }
}

// The Service Worker app shell is an offline installation contract. A stale/missing filename
// makes cache.addAll reject the entire install.
const shellMatch=sw.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
assert.ok(shellMatch,"sw.js APP_SHELL not found");
const shellEntries=[...shellMatch[1].matchAll(/["'](\.\/[^"']*)["']/g)].map(m=>m[1]);
assert.ok(shellEntries.length>0,"sw.js APP_SHELL is empty");
for(const item of shellEntries){
  if(item==="./")continue;
  const local=item.replace(/^\.\//,"").split("?")[0];
  let ok=false;
  try{ok=(await stat(path.join(root,local))).isFile();}catch{}
  assert.ok(ok,`sw.js APP_SHELL references missing file ${item}`);
}
for(const item of ["./history.js","./history.css","./date-picker.js","./date-picker.css"]){
  assert.ok(shellEntries.includes(item),`Service Worker must cache ${item}`);
}
assert.ok(!shellEntries.some(item=>item.includes("migration-v")||item.includes("sleep-ui-bridge.js")),"Service Worker must not cache removed migration/bridge modules");

console.log("app structure contract tests passed");
