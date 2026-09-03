import {getSetting,setSetting,getAllRecords,putRecord} from "./db.js";
import {runDataMigrationV2} from "./migration-v2.js";
import {canonicalizeRecord} from "./record-model.js";

export const CURRENT_DATA_VERSION=3;

export async function runDataMigrationV3(){
  let changed=await runDataMigrationV2();
  const version=Number(await getSetting("dataVersion",1))||1;
  if(version>=CURRENT_DATA_VERSION)return changed;

  const records=await getAllRecords();
  for(const record of records){
    const normalized=canonicalizeRecord(record,{inferredZone:true});
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
