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
const entry=await read("export-ipad.js");
const sw=await read("sw.js");

// IDs are behavioral contracts in this no-framework PWA. Duplicate IDs can silently bind
// handlers to the wrong node, so fail before deploy.
const ids=[...index.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
assert.deepEqual(duplicates,[],`index.html contains duplicate ids: ${duplicates.join(", ")}`);

for(const id of ["pageDate","quickbar","metrics","timeline","nightSleepAt","nightWakeAt","contextSummary","modal","toast"]){
  assert.ok(ids.includes(id),`missing required DOM mount #${id}`);
}
assert.match(index,/type=["']module["']\s+src=["']\.\/app\.js["']/,"index.html must load app.js as module");
assert.match(index,/type=["']module["']\s+src=["']\.\/export-ipad\.js["']/,"index.html must load export-ipad.js as module");

// Atomic boot contract: migration may run inline, but must not force another page reload.
assert.doesNotMatch(entry,/location\.reload\s*\(/,"export-ipad.js must not force a second boot after migration");
for(const moduleName of ["migration-v3.js","sleep-v3.js","sleep-ui-bridge.js","timeline-v3.js","data-io-v3.js"]){
  assert.ok(entry.includes(`./${moduleName}`),`export-ipad.js missing boot module ${moduleName}`);
}

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

console.log("app structure contract tests passed");
