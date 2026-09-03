export const TIME_MODEL_VERSION=1;

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const TIME_RE=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const POINT_TYPES=new Set(["milk","diet","diaper","health","growth","medical","milestone","activity"]);
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);

export function validDateKey(v){
  if(typeof v!=="string"||!DATE_RE.test(v))return false;
  const d=new Date(`${v}T12:00:00`);
  if(Number.isNaN(d.getTime()))return false;
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`===v;
}
export function validClock(v){return typeof v==="string"&&TIME_RE.test(v);}
export function shiftDateKey(dateKey,days){
  if(!validDateKey(dateKey))return "";
  const d=new Date(`${dateKey}T12:00:00`);d.setDate(d.getDate()+days);
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
export function currentTimeZone(){
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"local";}catch{return "local";}
}
function splitLocalDateTime(v){
  if(typeof v!=="string"||v.length<16)return null;
  const date=v.slice(0,10),time=v.slice(11,16);
  return validDateKey(date)&&validClock(time)?{date,time}:null;
}
function localPartsAtOffset(ms,offsetMinutes){
  if(!Number.isFinite(ms))return null;
  if(Number.isFinite(offsetMinutes)){
    const d=new Date(ms-offsetMinutes*60000);
    return {
      date:`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`,
      time:`${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`
    };
  }
  const d=new Date(ms);
  return {
    date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`,
    time:`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
  };
}
function epochFromLocal(date,time,offsetMinutes=null){
  if(!validDateKey(date)||!validClock(time))return {atMs:null,offsetMinutes:null};
  const [y,m,d]=date.split("-").map(Number),[hh,mm]=time.split(":").map(Number);
  if(Number.isFinite(offsetMinutes))return {atMs:Date.UTC(y,m-1,d,hh,mm)+offsetMinutes*60000,offsetMinutes};
  const local=new Date(`${date}T${time}:00`);
  if(Number.isNaN(local.getTime()))return {atMs:null,offsetMinutes:null};
  return {atMs:local.getTime(),offsetMinutes:local.getTimezoneOffset()};
}
function normalizePoint(date,time,existing=null){
  const e=existing&&typeof existing==="object"?existing:{};
  if(!validDateKey(date)){
    if(Number.isFinite(e.atMs)){
      const parts=localPartsAtOffset(e.atMs,e.offsetMinutes);
      return parts?{...e,...parts}:null;
    }
    return null;
  }
  if(!validClock(time))return {date,time:"",atMs:null,offsetMinutes:null};
  if(e.date===date&&e.time===time&&Number.isFinite(e.atMs))return {...e,date,time};
  const useExistingOffset=Number.isFinite(e.offsetMinutes)?e.offsetMinutes:null;
  const absolute=epochFromLocal(date,time,useExistingOffset);
  return {date,time,...absolute};
}
function pointFromTemporal(node){
  if(!node||typeof node!=="object")return null;
  if(validDateKey(node.date))return normalizePoint(node.date,node.time||"",node);
  if(Number.isFinite(node.atMs)){
    const p=localPartsAtOffset(node.atMs,node.offsetMinutes);
    return p?normalizePoint(p.date,p.time,node):null;
  }
  return null;
}
function compatDateTime(point){return point?.date&&point?.time?`${point.date}T${point.time}`:"";}
function compatTime(point){return point?.time||"";}

function canonicalSleep(record,temporal){
  const oldStart=pointFromTemporal(temporal.start),oldEnd=pointFromTemporal(temporal.end);
  let startParts=splitLocalDateTime(record.startDateTime),endParts=splitLocalDateTime(record.endDateTime);
  if(!startParts&&!has(record,"startDateTime")&&oldStart)startParts={date:oldStart.date,time:oldStart.time};
  if(!endParts&&!has(record,"endDateTime")&&oldEnd)endParts={date:oldEnd.date,time:oldEnd.time};

  if(!startParts&&!oldStart&&validClock(record.startTime)&&validDateKey(record.date)){
    let startDate=record.date;
    if(validClock(record.endTime)&&record.endTime<record.startTime)startDate=shiftDateKey(record.date,-1);
    startParts={date:startDate,time:record.startTime};
  }
  if(!endParts&&!oldEnd&&validClock(record.endTime)&&validDateKey(record.date))endParts={date:record.date,time:record.endTime};

  const start=startParts?normalizePoint(startParts.date,startParts.time,oldStart):oldStart;
  const end=endParts?normalizePoint(endParts.date,endParts.time,oldEnd):oldEnd;
  return {...temporal,start:start||null,end:end||null};
}
function canonicalWake(record,temporal){
  const oldWake=pointFromTemporal(temporal.wake),oldResleep=pointFromTemporal(temporal.resleep);
  const date=validDateKey(record.date)?record.date:(oldWake?.date||"");
  const wakeTime=has(record,"wakeTime")?record.wakeTime:(oldWake?.time||"");
  const wake=normalizePoint(date,wakeTime,oldWake);
  let resleepDate=date;
  const resleepTime=has(record,"resleepTime")?record.resleepTime:(oldResleep?.time||"");
  if(validClock(wakeTime)&&validClock(resleepTime)&&resleepTime<wakeTime)resleepDate=shiftDateKey(date,1);
  else if(oldResleep?.date&&!has(record,"resleepTime"))resleepDate=oldResleep.date;
  const resleep=normalizePoint(resleepDate,resleepTime,oldResleep);
  return {...temporal,wake:wake||null,resleep:resleep||null};
}
function canonicalOccurred(record,temporal){
  const old=pointFromTemporal(temporal.occurred);
  const date=validDateKey(record.date)?record.date:(old?.date||"");
  const time=has(record,"time")?record.time:(old?.time||"");
  return {...temporal,occurred:normalizePoint(date,time,old)};
}

export function canonicalizeRecord(input,{inferredZone=false}={}){
  if(!input||typeof input!=="object")return input;
  const record={...input};
  const existing=record.temporal&&typeof record.temporal==="object"?record.temporal:{};
  let temporal={...existing,version:TIME_MODEL_VERSION,zone:existing.zone||currentTimeZone()};
  if(inferredZone&&!existing.zone)temporal.zoneInferred=true;

  if(record.type==="sleep")temporal=canonicalSleep(record,temporal);
  else if(record.type==="wake")temporal=canonicalWake(record,temporal);
  else if(POINT_TYPES.has(record.type))temporal=canonicalOccurred(record,temporal);
  record.temporal=temporal;
  record.timeModelVersion=TIME_MODEL_VERSION;

  // Compatibility projections. They are derived from temporal and can be removed from exports.
  if(record.type==="sleep"){
    record.startDateTime=compatDateTime(temporal.start);
    record.endDateTime=compatDateTime(temporal.end);
    record.startTime=compatTime(temporal.start);
    record.endTime=compatTime(temporal.end);
    if(!validDateKey(record.date))record.date=record.nightAnchor&&validDateKey(record.nightKey)?record.nightKey:(temporal.end?.date||temporal.start?.date||record.date);
  }else if(record.type==="wake"){
    record.wakeTime=compatTime(temporal.wake);
    record.resleepTime=compatTime(temporal.resleep);
    if(!validDateKey(record.date)&&temporal.wake?.date)record.date=temporal.wake.date;
  }else if(POINT_TYPES.has(record.type)){
    record.time=compatTime(temporal.occurred);
    if(!validDateKey(record.date)&&temporal.occurred?.date)record.date=temporal.occurred.date;
  }
  return record;
}

export function temporalNode(record,kind){
  const r=record?.temporal?.version===TIME_MODEL_VERSION?record:canonicalizeRecord(record,{inferredZone:true});
  return r?.temporal?.[kind]||null;
}
export function recordTimelinePoint(record){
  if(!record)return null;
  if(record.type==="sleep"){
    if(record.nightAnchor)return temporalNode(record,"end")||temporalNode(record,"start");
    return temporalNode(record,"start")||temporalNode(record,"end");
  }
  if(record.type==="wake")return temporalNode(record,"wake");
  return temporalNode(record,"occurred");
}
export function recordTimelineMs(record){
  const p=recordTimelinePoint(record);return Number.isFinite(p?.atMs)?p.atMs:null;
}
export function recordTimelineClock(record){return recordTimelinePoint(record)?.time||"";}
export function recordDurationMinutes(record){
  if(record?.type!=="sleep")return null;
  const a=temporalNode(record,"start")?.atMs,b=temporalNode(record,"end")?.atMs;
  return Number.isFinite(a)&&Number.isFinite(b)&&b>a?Math.round((b-a)/60000):null;
}
export function sleepLocalRange(record){
  const start=temporalNode(record,"start"),end=temporalNode(record,"end");
  return {startDate:start?.date||"",startTime:start?.time||"",endDate:end?.date||"",endTime:end?.time||""};
}
export function wakeLocalRange(record){
  const wake=temporalNode(record,"wake"),resleep=temporalNode(record,"resleep");
  return {wakeDate:wake?.date||"",wakeTime:wake?.time||"",resleepDate:resleep?.date||"",resleepTime:resleep?.time||""};
}
export function occurredLocal(record){
  const p=temporalNode(record,"occurred");return {date:p?.date||record?.date||"",time:p?.time||""};
}
export function canonicalRecordForExport(record){
  const x=canonicalizeRecord(record);
  const out={...x,temporal:structuredClone?structuredClone(x.temporal):JSON.parse(JSON.stringify(x.temporal))};
  delete out.timeModelVersion;
  if(out.type==="sleep"){
    delete out.startTime;delete out.endTime;delete out.startDateTime;delete out.endDateTime;
  }else if(out.type==="wake"){
    delete out.wakeTime;delete out.resleepTime;
  }else if(POINT_TYPES.has(out.type))delete out.time;
  return out;
}
