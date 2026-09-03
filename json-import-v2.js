import {
  getRecord,getProfile,getDay,
  putRecord,putProfile,putDay,
  setSetting,putImportBackup,snapshotAll
} from "./db.js";

const SCHEMA_VERSION="1.1.0";
const APP_ID="baby-growth-tracker";
const MAX_IMPORT_BYTES=25*1024*1024;
let pending=null;
const $=id=>document.getElementById(id);

function stampMs(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0;}
function validDate(v){return typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(`${v}T12:00:00`));}
function validDateTime(v,{allowEmpty=true}={}){
  if((v===""||v==null)&&allowEmpty)return true;
  return typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)&&!Number.isNaN(Date.parse(v));
}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function uuid(){return crypto.randomUUID?crypto.randomUUID():`id-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function nowISO(){return new Date().toISOString();}
function fail(msg){throw new Error(msg);}

function validate(payload){
  if(!payload||typeof payload!=="object"||Array.isArray(payload))fail("数据文件格式错误");
  if(payload.appId!==APP_ID)fail("不是本应用的数据文件");
  if(payload.schemaVersion!==SCHEMA_VERSION)fail(`仅支持 JSON ${SCHEMA_VERSION}，无需兼容旧导出格式`);
  if(payload.dataVersion!==2)fail("本地数据模型版本不兼容");
  if(!payload.range||!validDate(payload.range.start)||!validDate(payload.range.end)||payload.range.start>payload.range.end)fail("日期范围无效");
  if(!Array.isArray(payload.records)||payload.records.length>20000)fail("记录数据异常");
  if(!Array.isArray(payload.days)||payload.days.length>5000)fail("日期数据异常");
  if(!Array.isArray(payload.profileVersions)||payload.profileVersions.length>500)fail("档案数据异常");

  const ids=new Set();
  for(const r of payload.records){
    if(!r||typeof r!=="object"||!r.id||ids.has(r.id)||!validDate(r.date))fail("存在无效或重复记录");
    ids.add(r.id);
    if(r.type==="sleep"){
      if("startTime" in r||"endTime" in r)fail("睡眠记录仍包含旧版时间字段");
      if(!validDateTime(r.startDateTime)||!validDateTime(r.endDateTime))fail("睡眠日期时间无效");
      if(r.startDateTime&&r.endDateTime&&Date.parse(r.endDateTime)<=Date.parse(r.startDateTime))fail("睡眠结束时间必须晚于开始时间");
    }
    if(!r.createdAt||!r.updatedAt||!Number.isFinite(Date.parse(r.createdAt))||!Number.isFinite(Date.parse(r.updatedAt)))fail("记录时间戳无效");
  }
  for(const d of payload.days){
    if(!d||typeof d!=="object"||!validDate(d.date))fail("日期背景无效");
    if("nightSleep" in d)fail("日期数据仍包含旧版 nightSleep 字段");
  }
  return payload;
}

async function preview(file){
  if(file.size>MAX_IMPORT_BYTES)fail("文件过大，已拒绝导入");
  const payload=validate(JSON.parse(await file.text()));
  let newCount=0,updateCount=0,sameCount=0;
  for(const incoming of payload.records){
    const local=await getRecord(incoming.id);
    if(!local)newCount++;
    else if(stampMs(incoming.updatedAt)>stampMs(local.updatedAt))updateCount++;
    else sameCount++;
  }
  pending=payload;
  const box=$("importPreview");
  box.classList.remove("hidden");
  box.innerHTML=`<b>${esc(file.name)}</b><br>新增：${newCount}　更新：${updateCount}　相同：${sameCount}<br>JSON ${SCHEMA_VERSION} · 日期：${esc(payload.range.start)} ～ ${esc(payload.range.end)}`;
  $("applyImportBtn").disabled=false;
}

async function apply(){
  if(!pending)return;
  const p=pending;
  await putImportBackup({id:uuid(),createdAt:nowISO(),snapshot:await snapshotAll()});
  for(const incoming of p.profileVersions){const local=await getProfile(incoming.id);if(!local||stampMs(incoming.updatedAt)>stampMs(local.updatedAt))await putProfile(incoming);}
  for(const incoming of p.records){const local=await getRecord(incoming.id);if(!local||stampMs(incoming.updatedAt)>stampMs(local.updatedAt))await putRecord(incoming);}
  for(const incoming of p.days){const local=await getDay(incoming.date);if(!local||stampMs(incoming.updatedAt)>stampMs(local.updatedAt))await putDay(incoming);}
  if(p.currentProfileVersionId){const profile=await getProfile(p.currentProfileVersionId);if(profile)await setSetting("currentProfileId",profile.id);}
  await setSetting("dataVersion",2);
  location.reload();
}

function showError(error){
  pending=null;
  $("applyImportBtn").disabled=true;
  const box=$("importPreview");
  box.classList.remove("hidden");
  box.textContent="文件无法导入："+(error?.message||error);
}

document.addEventListener("change",event=>{
  const input=event.target;
  if(!(input instanceof HTMLInputElement)||input.id!=="jsonInput")return;
  event.stopImmediatePropagation();
  const file=input.files?.[0];
  if(!file)return;
  preview(file).catch(showError);
},true);

document.addEventListener("click",event=>{
  const target=event.target instanceof Element?event.target:null;
  if(!target?.closest("#applyImportBtn"))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(pending)apply().catch(showError);
},true);
