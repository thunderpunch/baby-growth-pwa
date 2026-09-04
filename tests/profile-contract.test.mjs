import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [html,app,sleep,dataIo,babyName,guard]=await Promise.all([
  "index.html","app.js","sleep-v3.js","data-io-v3.js","baby-name.js","profile-save-guard.js"
].map(file=>readFile(path.join(root,file),"utf8")));

for(const id of ["babyName","feedingMode","weekdayCaregiver","weekendCaregiver","sleepEnvironment","mainIssue","profileInsights"]){
  assert.match(html,new RegExp(`id=["']${id}["']`),`streamlined profile field missing: ${id}`);
}
for(const obsolete of ["weekdayBedtime","weekdayLatency","weekdayNaps","weekendBedtime","weekendLatency","weekendNaps","data-profile-mode","settlingMethod"]){
  assert.doesNotMatch(html,new RegExp(obsolete),`obsolete manual profile input must stay removed: ${obsolete}`);
  assert.doesNotMatch(app,new RegExp(obsolete),`app must not save obsolete profile field: ${obsolete}`);
}
assert.match(app,/caregivers:\{[\s\S]*weekday:[\s\S]*weekend:/,"current profile must store caregiver background explicitly");
assert.match(app,/stage\.caregivers\?\.weekday\|\|stage\.weekday\?\.caregiver/,"old profile caregiver history must remain readable");
assert.match(app,/renderProfileInsights\(\$\("profileInsights"\),localDateKey\(new Date\(\)\)\)/,"Profile view must render derived recent patterns");
assert.doesNotMatch(sleep,/profileBedtimeMinutes|getProfile|getSetting|bedtimeMin/,"sleep classification must not depend on a manually maintained bedtime profile");
assert.match(dataIo,/平日主要照护者.*周末主要照护者.*睡眠环境/,"Excel profile sheet must reflect current long-term profile fields");
assert.doesNotMatch(babyName,/settlingMethod|profileLongTermContext|persistDraftProfileExtras/,"baby-name module must not remain a second profile context owner");
assert.match(guard,/#feedingMode/);
assert.doesNotMatch(guard,/weekdayBedtime|weekdayLatency|weekdayNaps|settlingMethod/);

console.log("profile structure contracts passed");
