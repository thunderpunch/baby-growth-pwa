import assert from "node:assert/strict";
import {access,readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFile(path.join(root,p),"utf8");

const [agents,readme,architecture,maintenance,schema,dataIo]=await Promise.all([
  read("AGENTS.md"),read("README.md"),read("ARCHITECTURE.md"),read("MAINTENANCE.md"),read("JSON_DATA_SCHEMA.md"),read("data-io-v3.js")
]);

for(const name of ["ARCHITECTURE.md","JSON_DATA_SCHEMA.md","MAINTENANCE.md","TESTING.md","SECURITY.md"]){
  assert.ok(agents.includes(name),`AGENTS.md must point agents to ${name}`);
  assert.ok(readme.includes(name),`README.md must expose ${name}`);
}

assert.match(agents,/代码收敛|洁癖/,"AGENTS.md must preserve the code-convergence requirement");
assert.match(agents,/static-check[\s\S]*Pages[\s\S]*completed \/ success/,"AGENTS.md must preserve the release gate");
assert.match(agents,/按自然年|自然年分档/,"AGENTS.md must preserve natural-year backup partitioning");
assert.match(agents,/完整 JSON 快照|年度完整 JSON/,"AGENTS.md must preserve full-snapshot JSON backup policy");
assert.match(agents,/聊天记忆不是唯一事实源/,"AGENTS.md must require repository documentation as durable context");

const runtimeSchema=dataIo.match(/const\s+SCHEMA_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
assert.ok(runtimeSchema,"data-io-v3.js schema version not found");
assert.ok(schema.includes(`schemaVersion = \"${runtimeSchema}\"`)||schema.includes(`schemaVersion = "${runtimeSchema}"`),`JSON_DATA_SCHEMA.md must document runtime schema ${runtimeSchema}`);
assert.match(schema,/dataVersion\s*=\s*3/,"JSON schema docs must describe dataVersion 3");
assert.match(schema,/timeModelVersion\s*=\s*1/,"JSON schema docs must describe timeModelVersion 1");
assert.match(schema,/canonical temporal/i,"JSON schema docs must describe canonical temporal");
assert.doesNotMatch(schema,/Current `schemaVersion` is `1\.0\.0`|当前.*1\.0\.0/,"obsolete schema 1.0 documentation must not return");

assert.doesNotMatch(architecture,/nightSleepAt|nightWakeAt|nightSleepEntries|ensureNightCard/,"Architecture must not document removed legacy sleep mounts as current");
assert.doesNotMatch(maintenance,/当前仍保留隐藏的 `nightSleepAt/,"Maintenance must not claim removed sleep mounts are current");

let obsoleteProtocolExists=true;
try{await access(path.join(root,"DATA_PROTOCOL.md"));}catch{obsoleteProtocolExists=false;}
assert.equal(obsoleteProtocolExists,false,"obsolete duplicate DATA_PROTOCOL.md must stay removed; JSON_DATA_SCHEMA.md is authoritative");

console.log("documentation contract tests passed");
