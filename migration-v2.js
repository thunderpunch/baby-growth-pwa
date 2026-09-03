import {getSetting,setSetting,getAllRecords,getAllDays,putRecord,putDay} from "./db.js";

export const CURRENT_DATA_VERSION=2;

function shiftDateKey(dateKey,days){
  const d=new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate()+days);
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function validTime(v){ return typeof v==="string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v); }
function localStamp(date,time){ return date && validTime(time) ? `${date}T${time}` : ""; }
function stampMs(v){ const n=Date.parse(v||""); return Number.isFinite(n)?n:null; }
function datePart(v){ return typeof v==="string" && v.length>=10 ? v.slice(0,10) : ""; }
function timePart(v){ return typeof v==="string" && v.length>=16 ? v.slice(11,16) : ""; }
function sleepInterval(r){
  const a=stampMs(r.startDateTime),b=stampMs(r.endDateTime);
  return a!=null && b!=null && b>a ? [a,b] : null;
}
function stronglySameSleep(a,b){
  const ia=sleepInterval(a),ib=sleepInterval(b);
  if(!ia||!ib) return false;
  const startDiff=Math.abs(ia[0]-ib[0])/60000;
  const endDiff=Math.abs(ia[1]-ib[1])/60000;
  if(startDiff<=45 && endDiff<=45) return true;
  const overlap=Math.max(0,Math.min(ia[1],ib[1])-Math.max(ia[0],ib[0]));
  const shorter=Math.min(ia[1]-ia[0],ib[1]-ib[0]);
  return shorter>0 && overlap/shorter>=0.88;
}
function normalizeLegacySleep(r){
  if(r.type!=="sleep") return r;
  const next={...r};
  let start=next.startDateTime||"",end=next.endDateTime||"";
  if(!start && validTime(next.startTime)) start=localStamp(next.date,next.startTime);
  if(!end && validTime(next.endTime)){
    let endDate=next.date;
    if(start && validTime(next.startTime) && next.endTime<next.startTime) endDate=shiftDateKey(datePart(start)||next.date,1);
    end=localStamp(endDate,next.endTime);
  }
  if(start && end && stampMs(end)<=stampMs(start)) end=localStamp(shiftDateKey(datePart(start),1),timePart(end));
  next.startDateTime=start;
  next.endDateTime=end;
  // Transitional presentation fields. Canonical sleep time is startDateTime/endDateTime.
  next.startTime=timePart(start)||next.startTime||"";
  next.endTime=timePart(end)||next.endTime||"";
  if(end) next.date=datePart(end); else if(start) next.date=datePart(start);
  return next;
}
function migratedNightSleep(day){
  const ns=day?.nightSleep;
  if(!ns || (!validTime(ns.sleepAt) && !validTime(ns.wakeAt))) return null;
  const wakeDate=day.date;
  const start=validTime(ns.sleepAt)?localStamp(shiftDateKey(wakeDate,-1),ns.sleepAt):"";
  const end=validTime(ns.wakeAt)?localStamp(wakeDate,ns.wakeAt):"";
  return {
    id:`migrated-night:${wakeDate}`,
    date:wakeDate,
    type:"sleep",status:"confirmed",deleted:false,
    startDateTime:start,endDateTime:end,
    startTime:timePart(start),endTime:timePart(end),
    note:"由旧版“夜间睡眠”一次性迁移",
    source:"migration_v2_night_sleep",
    createdAt:day.updatedAt||new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
}

export async function runDataMigrationV2(){
  const version=Number(await getSetting("dataVersion",1))||1;
  if(version>=CURRENT_DATA_VERSION) return false;

  const [rawRecords,days]=await Promise.all([getAllRecords(),getAllDays()]);
  const normalized=rawRecords.map(normalizeLegacySleep);
  const sleeps=normalized.filter(r=>r.type==="sleep"&&!r.deleted);

  for(const r of normalized){
    const original=rawRecords.find(x=>x.id===r.id);
    if(JSON.stringify(original)!==JSON.stringify(r)) await putRecord(r);
  }

  for(const day of days){
    const candidate=migratedNightSleep(day);
    if(candidate){
      const duplicate=sleeps.some(existing=>stronglySameSleep(existing,candidate));
      if(!duplicate){
        await putRecord(candidate);
        sleeps.push(candidate);
      }
    }
    if(day.nightSleep!==undefined){
      const next={...day};
      delete next.nightSleep;
      next.updatedAt=new Date().toISOString();
      await putDay(next);
    }
  }

  // Version is written last. If any write above fails, the next start retries idempotently.
  await setSetting("dataVersion",CURRENT_DATA_VERSION);
  return true;
}
