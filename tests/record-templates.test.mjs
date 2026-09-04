import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {milkTemplateProjection,recentDateKeys,settledConfirmedOfType,templateSourceLabel} from "../record-templates.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [source,app,entry,sw]=await Promise.all([
  readFile(path.join(root,"record-templates.js"),"utf8"),
  readFile(path.join(root,"app.js"),"utf8"),
  readFile(path.join(root,"export-ipad.js"),"utf8"),
  readFile(path.join(root,"sw.js"),"utf8")
]);

assert.deepEqual(recentDateKeys("2026-09-03"),["2026-09-02","2026-09-01","2026-08-31"],"milk template lookup must inspect the previous three natural days");
assert.deepEqual(recentDateKeys("2027-01-01"),["2026-12-31","2026-12-30","2026-12-29"],"three-day lookup must cross year boundaries correctly");
assert.equal(templateSourceLabel("2026-09-02","2026-09-03"),"昨天");
assert.equal(templateSourceLabel("2026-09-01","2026-09-03"),"前天");
assert.equal(templateSourceLabel("2026-08-31","2026-09-03"),"大前天");

const confirmedMilk=(id,time,amount="180",feedType="配方奶")=>({id,type:"milk",status:"confirmed",deleted:false,time,amount,feedType});
const pendingMilk=(id,deleted=false)=>({id,type:"milk",status:"pending",deleted,source:"recent_milk_template"});
assert.deepEqual(
  settledConfirmedOfType([confirmedMilk("m1","08:00"),confirmedMilk("m2","12:00")],"milk").map(record=>record.id),
  ["m1","m2"],
  "a day whose milk set is fully resolved may become the next template source"
);
assert.deepEqual(
  settledConfirmedOfType([confirmedMilk("m1","08:00"),pendingMilk("m2")],"milk"),
  [],
  "partially confirmed milk templates must not propagate a half-finished day"
);
assert.deepEqual(
  settledConfirmedOfType([confirmedMilk("m1","08:00"),pendingMilk("m2",true)],"milk").map(record=>record.id),
  ["m1"],
  "a skipped/deleted pending milk no longer blocks the confirmed final fact set"
);
assert.deepEqual(
  settledConfirmedOfType([pendingMilk("m1",true)],"milk"),
  [],
  "a day with every suggested milk skipped must not become a future source"
);

const sourceBefore=confirmedMilk("m1","08:00","180","配方奶");
const sourceAfter=confirmedMilk("m1","08:35","200","母乳瓶喂");
assert.deepEqual(milkTemplateProjection(sourceBefore,"2026-09-02"),{
  templateSourceId:"m1",templateSourceDate:"2026-09-02",time:"08:00",amount:"180",feedType:"配方奶"
});
assert.deepEqual(milkTemplateProjection(sourceAfter,"2026-09-02"),{
  templateSourceId:"m1",templateSourceDate:"2026-09-02",time:"08:35",amount:"200",feedType:"母乳瓶喂"
},"an untouched template projection must follow edits to the source milk fact");

assert.match(source,/const\s+MILK_LOOKBACK_DAYS\s*=\s*3/,"milk autofill window must remain three days");
assert.match(source,/findNearestSettledConfirmed\(date,"milk",MILK_LOOKBACK_DAYS\)/,"milk autofill must select the nearest fully resolved confirmed milk day inside the window");
assert.match(source,/async function reconcileMilkTemplates/,"untouched generated milk must have one reconciliation owner");
assert.match(source,/sameMilkProjection\(existing,projection\)/,"unchanged source facts should not cause no-op template writes");
assert.match(source,/deleteReason:"template_source_changed"/,"stale untouched templates must be retired when the source set changes");
assert.match(source,/existingTemplates\.some\(isUserProcessedMilkTemplate\)/,"template syncing must freeze after the user starts confirming or skipping the target day");
assert.match(source,/getRecordsByDate\(sourceDate,\{includeDeleted:true\}\)/,"source resolution must see unresolved and skipped pending milk without scanning lifetime history");
assert.match(source,/confirmedOfType\(current,"milk"\)/,"only existing milk should suppress milk autofill; other record types must not block it");
assert.match(source,/async function ensureMilkTemplates[\s\S]*async function ensureDietTemplates/,"milk and diet template policies must remain independent");
assert.doesNotMatch(source,/getAllRecords/,"template generation must never scan lifetime record history");
assert.match(app,/ensureRecordTemplates\(\{date:state\.date,day,dietStage:state\.dietStage,nowISO\}\)/,"Today load must invoke the canonical template owner directly");
assert.doesNotMatch(app,/function\s+generatePreviousDayTemplates/,"legacy combined previous-day template implementation must stay removed");
assert.doesNotMatch(entry,/recent-milk-template\.js/,"legacy DOM-driven recent milk bridge must stay out of boot");
assert.ok(sw.includes('"./record-templates.js"'),"offline app shell must cache record-templates.js");
assert.ok(!sw.includes("recent-milk-template.js"),"offline app shell must not cache the removed recent milk bridge");

console.log("record template policy regressions passed");
