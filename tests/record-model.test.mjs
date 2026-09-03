import assert from "node:assert/strict";
import {
  canonicalizeRecord,canonicalRecordForExport,recordTimelineClock,recordTimelineMs,recordDurationMinutes,
  sleepLocalRange,wakeLocalRange,occurredLocal
} from "../record-model.js";

const base={status:"confirmed",deleted:false,createdAt:"2026-09-03T00:00:00.000Z",updatedAt:"2026-09-03T00:00:00.000Z"};

const night=canonicalizeRecord({...base,id:"night",type:"sleep",date:"2026-09-03",nightAnchor:true,nightKey:"2026-09-03",startDateTime:"2026-09-02T19:42",endDateTime:"2026-09-03T05:35"});
assert.equal(recordTimelineClock(night),"05:35");
assert.ok(Number.isFinite(recordTimelineMs(night)));
assert.equal(recordDurationMinutes(night),593);
assert.deepEqual(sleepLocalRange(night),{startDate:"2026-09-02",startTime:"19:42",endDate:"2026-09-03",endTime:"05:35"});

const nap=canonicalizeRecord({...base,id:"nap",type:"sleep",date:"2026-09-03",startDateTime:"2026-09-03T09:45",endDateTime:"2026-09-03T10:35"});
assert.equal(recordTimelineClock(nap),"09:45");
assert.equal(recordDurationMinutes(nap),50);

// Legacy date + clock storage must migrate to the same overnight facts. The record's date is
// the final wake/business day, so 19:42 -> 05:35 starts on the previous calendar date.
const legacyNight=canonicalizeRecord({...base,id:"legacy-night",type:"sleep",date:"2026-09-03",nightAnchor:true,nightKey:"2026-09-03",startTime:"19:42",endTime:"05:35"},{inferredZone:true});
assert.deepEqual(sleepLocalRange(legacyNight),{startDate:"2026-09-02",startTime:"19:42",endDate:"2026-09-03",endTime:"05:35"});
assert.equal(recordTimelineClock(legacyNight),"05:35");
assert.equal(recordDurationMinutes(legacyNight),593);

const wake=canonicalizeRecord({...base,id:"wake",type:"wake",date:"2026-09-03",wakeTime:"22:10",resleepTime:"00:15",nightKey:"2026-09-04"});
assert.equal(recordTimelineClock(wake),"22:10");
assert.deepEqual(wakeLocalRange(wake),{wakeDate:"2026-09-03",wakeTime:"22:10",resleepDate:"2026-09-04",resleepTime:"00:15"});

const milk=canonicalizeRecord({...base,id:"milk",type:"milk",date:"2026-09-03",time:"07:10",amount:"180"});
assert.equal(recordTimelineClock(milk),"07:10");
assert.deepEqual(occurredLocal(milk),{date:"2026-09-03",time:"07:10"});

// Missing clock values are valid facts for date-only records; they must not invent an absolute
// event time just to make sorting convenient.
const growth=canonicalizeRecord({...base,id:"growth",type:"growth",date:"2026-09-03",time:"",weight:"8.2"});
assert.equal(recordTimelineClock(growth),"");
assert.equal(recordTimelineMs(growth),null);

// Canonicalization is a persistence boundary and must be idempotent. Re-saving an unchanged
// record cannot move the time because the device timezone changed or because compatibility fields exist.
const nightAgain=canonicalizeRecord(night);
assert.deepEqual(nightAgain.temporal,night.temporal);
assert.equal(nightAgain.startDateTime,night.startDateTime);
assert.equal(nightAgain.endDateTime,night.endDateTime);

// JSON export removes compatibility projections, then import reconstructs them from canonical
// temporal facts without changing the absolute timeline point.
const clean=canonicalRecordForExport(night);
assert.equal("startDateTime" in clean,false);
assert.equal("startTime" in clean,false);
assert.equal(clean.temporal.start.time,"19:42");
const roundTrip=canonicalizeRecord(clean);
assert.equal(roundTrip.startDateTime,"2026-09-02T19:42");
assert.equal(roundTrip.endDateTime,"2026-09-03T05:35");
assert.equal(recordTimelineClock(roundTrip),"05:35");
assert.equal(recordTimelineMs(roundTrip),recordTimelineMs(night));

console.log("record-model temporal regression tests passed");
