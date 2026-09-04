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
assert.match(agents,/档案与近期规律[\s\S]*最近 ?14 天/,"AGENTS.md must preserve derived Profile insight policy");
assert.match(agents,/已退出当前档案 UI[\s\S]*通常放床|通常放床[\s\S]*已退出当前档案 UI/,"AGENTS.md must preserve removal of redundant manual Profile routines");
assert.match(schema,/caregivers[\s\S]*weekday[\s\S]*weekend/,"JSON schema docs must describe current caregiver profile structure");
assert.match(schema,/历史导出的 `profileVersions`[\s\S]*settlingMethod/,"JSON docs must preserve legacy Profile fields as historical data");

const runtimeSchema=dataIo.match(/const\s+SCHEMA_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
assert.ok(runtimeSchema,"data-io-v3.js schema version not found");
assert.ok(schema.includes(`schemaVersion = \"${runtimeSchema}\"`)||schema.includes(`schemaVersion = "${runtimeSchema}"`),`JSON_DATA_SCHEMA.md must document runtime schema ${runtimeSchema}`);
assert.match(schema,/timeModelVersion\s*=\s*1/,"JSON schema docs must describe timeModelVersion 1");
assert.match(schema,/canonical temporal/i,"JSON schema docs must describe canonical temporal");
assert.match(schema,/只维护当前结构[\s\S]*不提供旧 schema 迁移或兼容/,"JSON schema docs must explicitly declare current-only data support");
assert.doesNotMatch(schema,/dataVersion\s*=/,"removed migration dataVersion must not return to the current JSON protocol");
assert.doesNotMatch(schema,/Current `schemaVersion` is `1\.0\.0`|当前.*1\.0\.0/,"obsolete schema 1.0 documentation must not return");

// Removed compatibility names may appear in maintenance/history prose, but the docs must clearly
// state that they are gone rather than presenting them as current runtime requirements.
assert.match(architecture,/nightSleepAt[\s\S]{0,160}(?:已经删除|已删除)|隐藏挂载已经删除/,"Architecture must state that legacy Sleep mounts are removed");
assert.match(architecture,/ensureNightCard\(\)[\s\S]{0,120}(?:不再存在|已删除)|不再存在 `ensureNightCard/,"Architecture must state that ensureNightCard compatibility is gone");
assert.match(maintenance,/nightSleepAt[\s\S]{0,180}已物理删除|已物理删除的历史实现[\s\S]*nightSleepAt/,"Maintenance must classify legacy Sleep mounts as physically removed");

let obsoleteProtocolExists=true;
try{await access(path.join(root,"DATA_PROTOCOL.md"));}catch{obsoleteProtocolExists=false;}
assert.equal(obsoleteProtocolExists,false,"obsolete duplicate DATA_PROTOCOL.md must stay removed; JSON_DATA_SCHEMA.md is authoritative");

console.log("documentation contract tests passed");
