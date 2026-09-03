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

console.log("[1/3] JavaScript syntax");
const files=await walk(root);
for(const file of files.filter(f=>f.endsWith(".js"))){
  const source=await readFile(file,"utf8");
  const result=spawnSync(process.execPath,["--input-type=module","--check"],{
    cwd:root,input:source,encoding:"utf8"
  });
  if(result.status!==0)fail(`syntax: ${path.relative(root,file)}`,result);
}
console.log("  ok");

console.log("[2/3] App structure contracts");
let result=spawnSync(process.execPath,["--experimental-default-type=module","tests/app-contract.test.mjs"],{
  cwd:root,encoding:"utf8",stdio:"pipe",env:{...process.env,TZ:"Asia/Singapore"}
});
if(result.status!==0)fail("app contract tests",result);
process.stdout.write(result.stdout);

console.log("[3/3] Temporal model regressions");
result=spawnSync(process.execPath,["--experimental-default-type=module","tests/record-model.test.mjs"],{
  cwd:root,encoding:"utf8",stdio:"pipe",env:{...process.env,TZ:"Asia/Singapore"}
});
if(result.status!==0)fail("temporal regression tests",result);
process.stdout.write(result.stdout);

console.log("\nAll pre-release verification checks passed.");
