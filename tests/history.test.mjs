import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {historyDateLabel,monthLabel,monthRange,recentRange,shiftMonthKey,validMonthKey} from "../history.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const historySource=await readFile(path.join(root,"history.js"),"utf8");

assert.equal(validMonthKey("2026-12"),true);
assert.equal(validMonthKey("2026-13"),false);
assert.equal(shiftMonthKey("2026-12",1),"2027-01","December must roll into next year");
assert.equal(shiftMonthKey("2027-01",-1),"2026-12","January must roll into previous year");
assert.deepEqual(monthRange("2027-02"),{start:"2027-02-01",end:"2027-02-28"});
assert.deepEqual(monthRange("2028-02"),{start:"2028-02-01",end:"2028-02-29"},"leap year February must include Feb 29");
assert.deepEqual(recentRange("2027-01-10"),{start:"2026-12-12",end:"2027-01-10"},"recent 30 days must work across years");

assert.equal(monthLabel("2026-09",2026),"9月","current-year month label should omit the year");
assert.equal(monthLabel("2027-01",2026),"2027年 1月","cross-year month label must keep the year");
assert.match(historyDateLabel("2026-09-03",2026),/^9月3日 · /,"current-year history card should omit the year");
assert.match(historyDateLabel("2027-01-03",2026),/^2027年 1月3日 · /,"other-year history card must keep the year");

assert.match(historySource,/getRecordsInRange\(range\.start,range\.end\)/,"history must query records only for the active visible range");
assert.match(historySource,/getDaysInRange\(range\.start,range\.end\)/,"history must query day metadata only for the active visible range");
assert.doesNotMatch(historySource,/\bgetAllRecords\b/,"history must not scan all records");
assert.doesNotMatch(historySource,/\bgetAllDays\b/,"history must not scan all day metadata");
assert.doesNotMatch(historySource,/\.slice\(0,\s*30\)/,"recent 30 days must be a real date range, not a truncated list");
assert.match(historySource,/data-history-recent/,"History must expose a recent 30 day mode");
assert.doesNotMatch(historySource,/data-history-this-month|historyMonthSummary/,"History must not restore redundant current-month or summary controls");
assert.doesNotMatch(historySource,/historyJumpDate|data-history-jump|history-date-jump/,"History must not duplicate the global date-jump control");

console.log("history range regressions passed");
