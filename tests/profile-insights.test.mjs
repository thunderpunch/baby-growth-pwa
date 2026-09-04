import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {deriveProfileInsights,PROFILE_INSIGHT_DAYS} from "../profile-insights.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=await readFile(path.join(root,"profile-insights.js"),"utf8");

function sleep(id,date,start,end,{night=false,method="抱睡"}={}){
  return {id,date,type:"sleep",status:"confirmed",deleted:false,nightAnchor:night,nightKey:night?date:null,
    startDateTime:start,endDateTime:end,sleepMethod:method};
}
const rows=[
  sleep("n1","2026-09-02","2026-09-01T19:30","2026-09-02T05:30",{night:true}),
  sleep("a1","2026-09-02","2026-09-02T09:00","2026-09-02T10:00"),
  sleep("a2","2026-09-02","2026-09-02T13:30","2026-09-02T14:30"),
  sleep("n2","2026-09-03","2026-09-02T19:45","2026-09-03T05:15",{night:true}),
  sleep("b1","2026-09-03","2026-09-03T09:10","2026-09-03T10:10"),
  sleep("b2","2026-09-03","2026-09-03T13:40","2026-09-03T14:40",{method:"拍睡"}),
  sleep("n3","2026-09-04","2026-09-03T20:00","2026-09-04T06:00",{night:true}),
  sleep("c1","2026-09-04","2026-09-04T09:20","2026-09-04T10:20"),
  sleep("c2","2026-09-04","2026-09-04T13:50","2026-09-04T14:50")
];
const insight=deriveProfileInsights(rows);
assert.equal(PROFILE_INSIGHT_DAYS,14,"profile insights must stay a bounded recent window");
assert.equal(insight.typicalNightStart,"19:45","typical night start should use a robust median of explicit night anchors");
assert.equal(insight.averageNightSleep,"9h50m","night sleep should average only complete explicit night anchors");
assert.equal(insight.typicalNapCount,2,"typical daytime sleep count should derive from recorded facts rather than profile input");
assert.equal(insight.mainSleepMethod,"抱睡","main settling method should derive from recent sleep records");
assert.equal(insight.sleepDays,3);

const sparse=deriveProfileInsights(rows.slice(0,2));
assert.equal(sparse.typicalNightStart,"","fewer than three samples must not pretend to establish a routine");
assert.equal(sparse.typicalNapCount,null,"sparse data must stay explicitly unavailable");

assert.match(source,/getRecordsInRange\(startDate,endDate\)/,"profile insights must use one bounded range query");
assert.doesNotMatch(source,/getAllRecords|getAllDays/,"profile insights must never scan lifetime history");
assert.match(source,/record\.nightAnchor&&recordDurationMinutes\(record\)!=null/,"night averages must use explicit complete night anchors");
console.log("profile insight regressions passed");
