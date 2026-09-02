const DB_NAME = "baby-growth-tracker";
const DB_VERSION = 1;
const STORES = {
  settings: "settings",
  profiles: "profiles",
  records: "records",
  days: "days",
  importBackups: "importBackups"
};

let dbPromise;

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ()=>{
      const db = req.result;

      if(!db.objectStoreNames.contains(STORES.settings)){
        db.createObjectStore(STORES.settings,{keyPath:"key"});
      }
      if(!db.objectStoreNames.contains(STORES.profiles)){
        const s=db.createObjectStore(STORES.profiles,{keyPath:"id"});
        s.createIndex("effectiveFrom","effectiveFrom",{unique:false});
      }
      if(!db.objectStoreNames.contains(STORES.records)){
        const s=db.createObjectStore(STORES.records,{keyPath:"id"});
        s.createIndex("date","date",{unique:false});
        s.createIndex("type","type",{unique:false});
        s.createIndex("updatedAt","updatedAt",{unique:false});
      }
      if(!db.objectStoreNames.contains(STORES.days)){
        db.createObjectStore(STORES.days,{keyPath:"date"});
      }
      if(!db.objectStoreNames.contains(STORES.importBackups)){
        db.createObjectStore(STORES.importBackups,{keyPath:"id"});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}

async function tx(storeNames, mode, callback){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tr=db.transaction(storeNames,mode);
    const stores={};
    storeNames.forEach(n=>stores[n]=tr.objectStore(n));
    let result;
    try{ result=callback(stores,tr); }catch(e){ reject(e); return; }
    tr.oncomplete=()=>resolve(result);
    tr.onerror=()=>reject(tr.error);
    tr.onabort=()=>reject(tr.error || new Error("transaction aborted"));
  });
}

function reqPromise(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

export async function getSetting(key, fallback=null){
  const db=await openDB();
  const tr=db.transaction(STORES.settings,"readonly");
  const v=await reqPromise(tr.objectStore(STORES.settings).get(key));
  return v ? v.value : fallback;
}

export async function setSetting(key,value){
  return tx([STORES.settings],"readwrite",({settings})=>{
    settings.put({key,value});
  });
}

export async function putProfile(profile){
  return tx([STORES.profiles],"readwrite",({profiles})=>profiles.put(profile));
}
export async function getProfile(id){
  const db=await openDB();
  const tr=db.transaction(STORES.profiles,"readonly");
  return reqPromise(tr.objectStore(STORES.profiles).get(id));
}
export async function getAllProfiles(){
  const db=await openDB();
  const tr=db.transaction(STORES.profiles,"readonly");
  const all=await reqPromise(tr.objectStore(STORES.profiles).getAll());
  return all.sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
}

export async function putRecord(record){
  return tx([STORES.records],"readwrite",({records})=>records.put(record));
}
export async function getRecord(id){
  const db=await openDB();
  const tr=db.transaction(STORES.records,"readonly");
  return reqPromise(tr.objectStore(STORES.records).get(id));
}
export async function getRecordsByDate(date, {includeDeleted=true}={}){
  const db=await openDB();
  const tr=db.transaction(STORES.records,"readonly");
  const idx=tr.objectStore(STORES.records).index("date");
  const all=await reqPromise(idx.getAll(IDBKeyRange.only(date)));
  return includeDeleted ? all : all.filter(x=>!x.deleted);
}
export async function getRecordsInRange(start,end){
  const db=await openDB();
  const tr=db.transaction(STORES.records,"readonly");
  const idx=tr.objectStore(STORES.records).index("date");
  return reqPromise(idx.getAll(IDBKeyRange.bound(start,end)));
}
export async function getAllRecords(){
  const db=await openDB();
  const tr=db.transaction(STORES.records,"readonly");
  return reqPromise(tr.objectStore(STORES.records).getAll());
}

export async function putDay(day){
  return tx([STORES.days],"readwrite",({days})=>days.put(day));
}
export async function getDay(date){
  const db=await openDB();
  const tr=db.transaction(STORES.days,"readonly");
  return reqPromise(tr.objectStore(STORES.days).get(date));
}
export async function getDaysInRange(start,end){
  const db=await openDB();
  const tr=db.transaction(STORES.days,"readonly");
  return reqPromise(tr.objectStore(STORES.days).getAll(IDBKeyRange.bound(start,end)));
}
export async function getAllDays(){
  const db=await openDB();
  const tr=db.transaction(STORES.days,"readonly");
  return reqPromise(tr.objectStore(STORES.days).getAll());
}

export async function putImportBackup(backup){
  return tx([STORES.importBackups],"readwrite",({importBackups})=>importBackups.put(backup));
}
export async function getLatestImportBackup(){
  const db=await openDB();
  const tr=db.transaction(STORES.importBackups,"readonly");
  const all=await reqPromise(tr.objectStore(STORES.importBackups).getAll());
  return all.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0] || null;
}
export async function deleteImportBackup(id){
  return tx([STORES.importBackups],"readwrite",({importBackups})=>importBackups.delete(id));
}

export async function replaceAllData(snapshot){
  const names=[STORES.settings,STORES.profiles,STORES.records,STORES.days];
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tr=db.transaction(names,"readwrite");
    names.forEach(n=>tr.objectStore(n).clear());

    (snapshot.settings||[]).forEach(x=>tr.objectStore(STORES.settings).put(x));
    (snapshot.profiles||[]).forEach(x=>tr.objectStore(STORES.profiles).put(x));
    (snapshot.records||[]).forEach(x=>tr.objectStore(STORES.records).put(x));
    (snapshot.days||[]).forEach(x=>tr.objectStore(STORES.days).put(x));

    tr.oncomplete=resolve;
    tr.onerror=()=>reject(tr.error);
  });
}

export async function snapshotAll(){
  const db=await openDB();
  async function all(store){
    const tr=db.transaction(store,"readonly");
    return reqPromise(tr.objectStore(store).getAll());
  }
  return {
    settings:await all(STORES.settings),
    profiles:await all(STORES.profiles),
    records:await all(STORES.records),
    days:await all(STORES.days)
  };
}
