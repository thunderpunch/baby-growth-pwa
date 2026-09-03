import {getSetting,setSetting,getAllRecords,putRecord} from "./db.js";
import {runDataMigrationV2} from "./migration-v2.js";
import {canonicalizeRecord} from "./record-model.js";

export const CURRENT_DATA_VERSION=3;

function repairLegacyNightAnchor(record){
  if(record.type!=="sleep"||record.deleted||record.nightAnchor||record.source!=="migration_v2_night_sleep")return record;
  const nightKey=record.endDateTime?.slice?.(0,10)||record.temporal?.end?.date||record.date||"";
  return nightKey?{...record,nightAnchor:true,nightKey}:record;
}

export async function runDataMigrationV3(){
  let changed=await runDataMigrationV2();
  const version=Number(await getSetting("dataVersion",1))||1;
  if(version>=CURRENT_DATA_VERSION)return changed;

  const records=await getAllRecords();
  for(const record of records){
    // Legacy night-anchor repair belongs to the one-time representation migration, not app boot.
    const repaired=repairLegacyNightAnchor(record);
    const normalized=canonicalizeRecord(repaired,{inferredZone:true});
    if(JSON.stringify(normalized)!==JSON.stringify(record)){
      // Keep updatedAt unchanged: this is a representation migration, not a user edit.
      await putRecord(normalized);
      changed=true;
    }
  }

  // Write the migration marker only after every record has been normalized.
  await setSetting("dataVersion",CURRENT_DATA_VERSION);
  return true;
}
