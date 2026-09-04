import {readdir,readFile,stat} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");

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

function fail(label,result){
  process.stderr.write(result.stdout||"");
  process.stderr.write(result.stderr||"");
  throw new Error(`${label} failed with exit code ${result.status}`);
}
function runTest(label,file){
  const result=spawnSync(process.execPath,["--experimental-default-type=module",file],{
    cwd:root,encoding:"utf8",stdio:"pipe",env:{...process.env,TZ:"Asia/Singapore"}
  });
  if(result.status!==0)fail(label,result);
  process.stdout.write(result.stdout);
}

console.log("[1/7] JavaScript syntax");
const files=await walk(root);
for(const file of files.filter(f=>f.endsWith(".js"))){
  const source=await readFile(file,"utf8");
  const result=spawnSync(process.execPath,["--input-type=module","--check"],{
    cwd:root,input:source,encoding:"utf8"
  });
  if(result.status!==0)fail(`syntax: ${path.relative(root,file)}`,result);
}
console.log("  ok");

console.log("[2/7] Repository hygiene");
runTest("repository hygiene checks","tests/repository-hygiene.test.mjs");

console.log("[3/7] App structure contracts");
runTest("app contract tests","tests/app-contract.test.mjs");
runTest("iPad layout regression tests","tests/ipad-layout.test.mjs");
runTest("date picker regression tests","tests/date-picker.test.mjs");
runTest("record template policy regressions","tests/record-templates.test.mjs");
runTest("sleep environment temperature regressions","tests/sleep-environment.test.mjs");

console.log("[4/7] Documentation contracts");
runTest("documentation contract tests","tests/documentation-contract.test.mjs");

console.log("[5/7] Page-load performance contracts");
runTest("performance contract tests","tests/performance-contract.test.mjs");

console.log("[6/7] Cross-year history regressions");
runTest("history regression tests","tests/history.test.mjs");

console.log("[7/7] Temporal model regressions");
runTest("temporal regression tests","tests/record-model.test.mjs");

console.log("\nAll pre-release verification checks passed.");
