import assert from "node:assert/strict";
import {
  canonicalizeRecord,canonicalRecordForExport,recordTimelineClock,recordDurationMinutes,
  sleepLocalRange,wakeLocalRange,occurredLocal
} from "../record-model.js";

const base={status:"confirmed",deleted:false,createdAt:"2026-09-03T00:00:00.000Z",updatedAt:"2026-09-03T00:00:00.000Z"};

const night=canonicalizeRecord({...base,id:"night",type:"sleep",date:"2026-09-03",nightAnchor:true,nightKey:"2026-09-03",startDateTime:"2026-09-02T19:42",endDateTime:"2026-09-03T05:35"});
assert.equal(recordTimelineClock(night),"05:35");
assert.equal(recordDurationMinutes(night),593);
assert.deepEqual(sleepLocalRange(night),{startDate:"2026-09-02",startTime:"19:42",endDate:"2026-09-03",endTime:"05:35"});

const nap=canonicalizeRecord({...base,id:"nap",type:"sleep",date:"2026-09-03",startDateTime:"2026-09-03T09:45",endDateTime:"2026-09-03T10:35"});
assert.equal(recordTimelineClock(nap),"09:45");
assert.equal(recordDurationMinutes(nap),50);

const wake=canonicalizeRecord({...base,id:"wake",type:"wake",date:"2026-09-03",wakeTime:"22:10",resleepTime:"00:15",nightKey:"2026-09-04"});
assert.equal(recordTimelineClock(wake),"22:10");
assert.deepEqual(wakeLocalRange(wake),{wakeDate:"2026-09-03",wakeTime:"22:10",resleepDate:"2026-09-04",resleepTime:"00:15"});

const milk=canonicalizeRecord({...base,id:"milk",type:"milk",date:"2026-09-03",time:"07:10",amount:"180"});
assert.equal(recordTimelineClock(milk),"07:10");
assert.deepEqual(occurredLocal(milk),{date:"2026-09-03",time:"07:10"});

const clean=canonicalRecordForExport(night);
assert.equal("startDateTime" in clean,false);
assert.equal("startTime" in clean,false);
assert.equal(clean.temporal.start.time,"19:42");
const roundTrip=canonicalizeRecord(clean);
assert.equal(roundTrip.startDateTime,"2026-09-02T19:42");
assert.equal(roundTrip.endDateTime,"2026-09-03T05:35");
assert.equal(recordTimelineClock(roundTrip),"05:35");

console.log("record-model temporal regression tests passed");
