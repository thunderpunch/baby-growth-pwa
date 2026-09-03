import assert from "node:assert/strict";
import {readdir,readFile,stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const exists=async p=>{try{return (await stat(path.join(root,p))).isFile();}catch{return false;}};
const read=p=>readFile(path.join(root,p),"utf8");

const forbidden=[
  "export-v2.js",
  "json-import-v2.js",
  "sleep-v2.js",
  "sleep-v2.css",
  "sleep-method.js",
  "sleep-ui-bridge.js",
  "recent-milk-template.js",
  "icons/baby-neutral.svg",
  "DATA_PROTOCOL.md"
];
for(const file of forbidden){
  assert.equal(await exists(file),false,`obsolete file must not return: ${file}`);
}

const entries=await readdir(root,{withFileTypes:true});
const runtimeJs=entries.filter(e=>e.isFile()&&e.name.endsWith(".js")).map(e=>e.name).sort();
const roots=["app.js","export-ipad.js","sw.js"];
const reachable=new Set();

async function visit(file){
  if(reachable.has(file)||!await exists(file))return;
  reachable.add(file);
  const source=await read(file);
  const specs=[
    ...source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/g),
    ...source.matchAll(/import\s*\(\s*["'](\.[^"']+)["']\s*\)/g)
  ].map(m=>m[1].split("?")[0]);
  for(const spec of specs){
    const resolved=path.normalize(path.join(path.dirname(file),spec)).replaceAll("\\","/");
    if(resolved.endsWith(".js"))await visit(resolved);
  }
}
for(const entry of roots)await visit(entry);

const orphanJs=runtimeJs.filter(file=>!reachable.has(file));
assert.deepEqual(orphanJs,[],`orphan runtime JS files: ${orphanJs.join(", ")}`);

// CSS may be linked from HTML, injected by JS, imported by another stylesheet, or pre-cached by SW.
// A root-level stylesheet with no textual reference anywhere in the active shell is likely historical debris.
const cssFiles=entries.filter(e=>e.isFile()&&e.name.endsWith(".css")).map(e=>e.name).sort();
const referenceFiles=["index.html",...runtimeJs,...cssFiles.filter(f=>f!=="styles.css")];
const referenceText=(await Promise.all(referenceFiles.filter((v,i,a)=>a.indexOf(v)===i).map(async file=>await exists(file)?read(file):""))).join("\n");
const orphanCss=cssFiles.filter(file=>file!=="styles.css"&&!referenceText.includes(file));
assert.deepEqual(orphanCss,[],`orphan CSS files: ${orphanCss.join(", ")}`);

console.log("repository hygiene checks passed");
