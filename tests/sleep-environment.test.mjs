import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {canonicalizeRecord,canonicalRecordForExport} from "../record-model.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [sleep,schema,largeText]=await Promise.all([
  readFile(path.join(root,"sleep-v3.js"),"utf8"),
  readFile(path.join(root,"JSON_DATA_SCHEMA.md"),"utf8"),
  readFile(path.join(root,"large-text.css"),"utf8")
]);

const base={
  id:"sleep-temp-test",date:"2026-09-04",type:"sleep",status:"confirmed",deleted:false,
  startDateTime:"2026-09-04T10:00",endDateTime:"2026-09-04T11:00",roomTemperatureC:24.5
};
const canonical=canonicalizeRecord(base);
assert.equal(canonical.roomTemperatureC,24.5,"canonical temporal normalization must preserve optional room temperature");
assert.equal(canonicalRecordForExport(canonical).roomTemperatureC,24.5,"JSON canonical export must preserve optional room temperature");

assert.match(sleep,/id="sleepV3RoomTemperature"[^>]*type="number"[^>]*inputmode="decimal"/,"sleep modal must expose a numeric optional room temperature field");
assert.match(sleep,/delete next\.roomTemperatureC/,"clearing optional room temperature must remove the field instead of storing an empty string");
assert.match(sleep,/roomTemperatureC=reading\.value/,"valid room temperature must be stored as a numeric sleep fact");
assert.match(sleep,/temperatureField\(record\?\.roomTemperatureC\)/,"ordinary sleep edit must restore the stored room temperature");
assert.match(sleep,/temperatureField\(existing\?\.roomTemperatureC\)/,"Good Night must restore the same night-anchor temperature");
assert.match(sleep,/temperatureField\(anchor\?\.roomTemperatureC\)/,"Good Morning must inherit and allow editing the Good Night temperature");
assert.match(sleep,/室温 \$\{temperature\}/,"last-night summary should surface a recorded room temperature without making it mandatory");
assert.match(schema,/`roomTemperatureC`/,"JSON schema must document roomTemperatureC");
assert.match(largeText,/\.large-text \.sleep-v3-environment-head b\{font-size:17px\}/,"large-text mode must enlarge the optional sleep environment field too");

console.log("sleep environment temperature regressions passed");
