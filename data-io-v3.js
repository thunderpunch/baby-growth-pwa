import {
  getSetting,setSetting,getAllProfiles,getProfile,putProfile,
  getRecord,getRecordsInRange,putRecord,getDay,getDaysInRange,putDay,
  putImportBackup,snapshotAll
} from "./db.js";
import {
  canonicalizeRecord,canonicalRecordForExport,recordDurationMinutes,
  sleepLocalRange,wakeLocalRange,occurredLocal,validDateKey
} from "./record-model.js";

const SCHEMA_VERSION="1.2.0";
const APP_ID="baby-growth-tracker";
const MAX_IMPORT_BYTES=25*1024*1024;
const $=id=>document.getElementById(id);
let format="json";
let pendingImport=null;

function uuid(){return crypto.randomUUID?crypto.randomUUID():`id-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function nowISO(){return new Date().toISOString();}
function stampMs(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0;}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function xml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));}
function shiftDateKey(s,days){const d=new Date(`${s}T12:00:00`);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function fmtDuration(min){if(min==null)return "";const h=Math.floor(min/60),m=min%60;return h?(m?`${h}h${m}m`:`${h}h`):`${m}分钟`;}
function showToast(text){const toast=$("toast"),txt=$("toastText"),btn=$("toastAction");if(!toast||!txt)return;txt.textContent=text;btn?.classList.add("hidden");toast.classList.remove("hidden");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.add("hidden"),3800);}
function selectedRange(){const start=$("exportStart")?.value,end=$("exportEnd")?.value;if(!start||!end||start>end)throw new Error("请选择正确的日期范围");return {start,end};}
async function applicableProfiles(start,end){const ps=await getAllProfiles();return ps.filter((p,i)=>{const next=ps[i+1]?.effectiveFrom||"9999-12-31";return p.effectiveFrom<=end&&next>start;});}
function cleanDay(day){const x={...day};delete x.nightSleep;return x;}

async function buildPayload(){
  const range=selectedRange();
  const [records,days,profiles,deviceId,currentProfileVersionId]=await Promise.all([
    getRecordsInRange(range.start,range.end),getDaysInRange(range.start,range.end),applicableProfiles(range.start,range.end),
    getSetting("deviceId",""),getSetting("currentProfileId",null)
  ]);
  return {
    schemaVersion:SCHEMA_VERSION,dataVersion:3,timeModelVersion:1,appId:APP_ID,
    deviceId,exportId:uuid(),exportedAt:nowISO(),range,
    profileVersions:profiles,currentProfileVersionId,
    days:days.map(cleanDay),records:records.map(canonicalRecordForExport)
  };
}
function jsonFile(payload){return new File([JSON.stringify(payload,null,2)],`宝宝作息_${payload.range.start}_至_${payload.range.end}.json`,{type:"application/json"});}

function classifySleep(r){
  if(r.nightAnchor)return "夜间主睡";
  const min=recordDurationMinutes(r),x=sleepLocalRange(r);if(min==null)return "待判断";
  const hm=t=>{if(!/^\d{2}:\d{2}$/.test(t||""))return null;const [h,m]=t.split(":").map(Number);return h*60+m;};
  const sm=hm(x.startTime),em=hm(x.endTime),cross=x.startDate&&x.endDate&&x.startDate!==x.endDate;
  if(cross&&min>=120)return "夜间主睡";
  if(min>=300&&(sm>=17*60||em<=10*60))return "夜间主睡";
  if(!cross&&min<=210&&sm>=6*60&&em<=18*60+30)return "小睡";
  if(!cross&&min<=150&&sm>=7*60&&em<=20*60)return "小睡";
  return "待判断";
}
function cellRef(col,row){let n=col,s="";while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return `${s}${row}`;}
function sheetXml(rows){const body=rows.map((row,ri)=>`<row r="${ri+1}">${row.map((v,ci)=>`<c r="${cellRef(ci+1,ri+1)}" t="inlineStr"><is><t xml:space="preserve">${xml(v??"")}</t></is></c>`).join("")}</row>`).join("");return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function u16(n){const a=new Uint8Array(2);new DataView(a.buffer).setUint16(0,n,true);return a;}
function u32(n){const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,n>>>0,true);return a;}
function concat(parts){const len=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(len);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;}
function zipStore(files){
  const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;
  for(const f of files){const name=enc.encode(f.name),data=typeof f.data==="string"?enc.encode(f.data):f.data,crc=crc32(data);const local=concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);locals.push(local);const central=concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);centrals.push(central);offset+=local.length;}
  const centralBlob=concat(centrals),eocd=concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBlob.length),u32(offset),u16(0)]);
  return new Blob([...locals,centralBlob,eocd],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
function workbookFile(payload){
  const rs=payload.records.map(canonicalizeRecord).filter(r=>!r.deleted&&r.status==="confirmed");
  const dates=[];for(let d=payload.range.start;d<=payload.range.end;d=shiftDateKey(d,1))dates.push(d);
  const sleepRows=[["归档日期","分类","睡着日期","睡着时间","醒来日期","醒来时间","时长","入睡方式","备注"]];
  rs.filter(r=>r.type==="sleep").forEach(r=>{const x=sleepLocalRange(r);sleepRows.push([r.date,classifySleep(r),x.startDate,x.startTime,x.endDate,x.endTime,fmtDuration(recordDurationMinutes(r)),r.sleepMethod||"",r.note||""]);});
  const wakeRows=[["归档日期","夜醒日期","夜醒时间","再次入睡日期","再次入睡时间","属于哪一晚","结果","备注"]];
  rs.filter(r=>r.type==="wake").forEach(r=>{const x=wakeLocalRange(r);wakeRows.push([r.date,x.wakeDate,x.wakeTime,x.resleepDate,x.resleepTime,r.nightKey||"",r.resultLabel||r.result||"",r.note||""]);});
  const pointRows=(type,headers,mapper)=>[headers,...rs.filter(r=>r.type===type).map(r=>mapper(r,occurredLocal(r)))];
  const milkRows=pointRows("milk",["日期","时间","奶量(ml)","类型"],(r,x)=>[r.date,x.time,r.amount||"",r.feedType||""]);
  const dietRows=pointRows("diet",["日期","时间","类型","内容","摄入量","备注"],(r,x)=>[r.date,x.time,r.dietType||"",r.content||"",r.amount||"",r.note||""]);
  const diaperRows=pointRows("diaper",["日期","时间","类型","尿量","便量","颜色","性状","备注"],(r,x)=>[r.date,x.time,r.diaperType||"",r.urineAmount||"",r.stoolAmount||"",r.stoolColor||"",r.stoolForm||"",r.note||""]);
  const growthRows=pointRows("growth",["日期","体重(kg)","身高(cm)","头围(cm)","来源"],r=>[r.date,r.weight||"",r.height||"",r.headCircumference||"",r.sourceNote||""]);
  const healthRows=[["日期","类型","时间","内容/症状","用药/备注"]];
  rs.filter(r=>["health","medical"].includes(r.type)).forEach(r=>{const x=occurredLocal(r);healthRows.push([r.date,r.type==="health"?"健康/用药":(r.eventType||"就诊"),x.time,r.symptoms||r.content||"",r.medication||r.note||""]);});
  const otherRows=[["日期","类型","时间","内容","备注"]];
  rs.filter(r=>["milestone","activity"].includes(r.type)).forEach(r=>{const x=occurredLocal(r);otherRows.push([r.date,r.type==="milestone"?"发育里程碑":"活动/户外",x.time,r.milestone||r.activityType||r.description||"",r.note||r.description||""]);});
  const profileRows=[["版本","生效日期","出生日期","性别","饮食阶段","平日放床","周末放床","主要问题"]];payload.profileVersions.forEach(p=>profileRows.push([`V${p.version}`,p.effectiveFrom,p.base?.birthDate||"",p.base?.sex||"",p.stage?.dietStage||"",p.stage?.weekday?.bedtime||"",p.stage?.weekend?.bedtime||"",p.stage?.mainIssue||""]));
  const overview=[["日期","小睡次数","小睡总计","夜间睡眠","夜醒次数","奶量(ml)","换尿布"]];
  for(const d of dates){const day=rs.filter(r=>r.date===d),sleeps=day.filter(r=>r.type==="sleep"),naps=sleeps.filter(r=>classifySleep(r)==="小睡"),night=sleeps.filter(r=>classifySleep(r)==="夜间主睡");overview.push([d,naps.length,fmtDuration(naps.reduce((s,r)=>s+(recordDurationMinutes(r)||0),0)),fmtDuration(night.reduce((s,r)=>s+(recordDurationMinutes(r)||0),0)),day.filter(r=>r.type==="wake").length,day.filter(r=>r.type==="milk").reduce((s,r)=>s+(Number(r.amount)||0),0),day.filter(r=>r.type==="diaper").length]);}
  const sheets=["每日概览","睡眠","夜醒","吃奶","辅食饮食","尿布","成长","健康医疗","其它记录","档案"],rows=[overview,sleepRows,wakeRows,milkRows,dietRows,diaperRows,growthRows,healthRows,otherRows,profileRows];
  const overrides=sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const content=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((n,i)=>`<sheet name="${xml(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`;
  const wbRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}</Relationships>`;
  const files=[{name:"[Content_Types].xml",data:content},{name:"_rels/.rels",data:rels},{name:"xl/workbook.xml",data:wb},{name:"xl/_rels/workbook.xml.rels",data:wbRels},...rows.map((r,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXml(r)}))];
  const blob=zipStore(files);return new File([blob],`宝宝作息_${payload.range.start}_至_${payload.range.end}.xlsx`,{type:blob.type});
}
function download(file){const u=URL.createObjectURL(file),a=document.createElement("a");a.href=u;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
async function shareOrDownload(file){try{if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:"宝宝成长记录",text:`宝宝成长记录 ${file.name.endsWith(".xlsx")?"Excel":"JSON"} 数据`,files:[file]});return;}}catch(e){if(e?.name==="AbortError")return;}download(file);showToast("当前环境无法分享文件，已改为下载保存");}
async function runExport(mode){try{const payload=await buildPayload(),file=format==="xlsx"?workbookFile(payload):jsonFile(payload);if(mode==="share")await shareOrDownload(file);else download(file);}catch(e){showToast(e.message||"导出失败");}}

function installExportUi(){
  const grid=$("shareBtn")?.closest(".export-grid");if(!grid||$("exportFormatChoice"))return;
  const choice=document.createElement("div");choice.id="exportFormatChoice";choice.className="export-format-choice";choice.innerHTML=`<button type="button" class="active" data-export-format="json"><b>JSON</b><span>归档 / 恢复 / 分析</span></button><button type="button" data-export-format="xlsx"><b>Excel</b><span>查看 / 筛选 / 转发</span></button>`;grid.before(choice);
  const share=$("shareBtn"),save=$("downloadBtn");if(share){share.querySelector("b").textContent="系统分享";share.querySelector("span").textContent="Android、PWA、iPad/iPhone 均优先使用系统分享面板。";}if(save){save.querySelector("b").textContent="保存文件";save.querySelector("span").textContent="按上方所选格式保存到本机或云盘。";}
}
function installStyle(){if(document.querySelector('link[data-export-v3-style]'))return;const l=document.createElement("link");l.rel="stylesheet";l.href=new URL("./export-v2.css",import.meta.url).href;l.dataset.exportV3Style="1";document.head.appendChild(l);}
function normalizeIncoming(raw){
  if(!raw||raw.appId!==APP_ID)throw new Error("不是本应用的数据文件");
  if(!["1.1.0",SCHEMA_VERSION].includes(raw.schemaVersion))throw new Error("数据版本不兼容");
  if(!raw.range||!validDateKey(raw.range.start)||!validDateKey(raw.range.end)||raw.range.start>raw.range.end)throw new Error("日期范围无效");
  if(!Array.isArray(raw.records)||raw.records.length>20000||!Array.isArray(raw.days)||!Array.isArray(raw.profileVersions))throw new Error("数据结构不完整");
  const ids=new Set();
  const records=raw.records.map(r=>{if(!r||typeof r!=="object"||typeof r.id!=="string"||ids.has(r.id)||!validDateKey(r.date))throw new Error("存在无效或重复记录");ids.add(r.id);return canonicalizeRecord(r,{inferredZone:raw.schemaVersion!==SCHEMA_VERSION});});
  return {...raw,schemaVersion:SCHEMA_VERSION,dataVersion:3,timeModelVersion:1,records,days:raw.days.map(cleanDay)};
}
async function previewImport(file){
  if(file.size>MAX_IMPORT_BYTES)throw new Error("文件过大，已拒绝导入");
  const payload=normalizeIncoming(JSON.parse(await file.text()));let newCount=0,updateCount=0,sameCount=0;
  for(const incoming of payload.records){const local=await getRecord(incoming.id);if(!local)newCount++;else if(stampMs(incoming.updatedAt)>stampMs(local.updatedAt))updateCount++;else sameCount++;}
  pendingImport={payload};const box=$("importPreview");box.classList.remove("hidden");box.innerHTML=`<b>${esc(file.name)}</b><br>新增：${newCount}　更新：${updateCount}　相同：${sameCount}<br>JSON ${SCHEMA_VERSION} · 日期：${esc(payload.range.start)} ～ ${esc(payload.range.end)}`;$("applyImportBtn").disabled=false;
}
async function applyPendingImport(){
  if(!pendingImport)return;const p=pendingImport.payload;await putImportBackup({id:uuid(),createdAt:nowISO(),snapshot:await snapshotAll()});
  for(const x of p.profileVersions){const local=await getProfile(x.id);if(!local||stampMs(x.updatedAt)>stampMs(local.updatedAt))await putProfile(x);}
  for(const x of p.records){const local=await getRecord(x.id);if(!local||stampMs(x.updatedAt)>stampMs(local.updatedAt))await putRecord(x);}
  for(const x of p.days){const local=await getDay(x.date);if(!local||stampMs(x.updatedAt)>stampMs(local.updatedAt))await putDay(x);}
  if(p.currentProfileVersionId){const cp=await getProfile(p.currentProfileVersionId);if(cp)await setSetting("currentProfileId",cp.id);}
  await setSetting("dataVersion",3);location.reload();
}
function bind(){
  document.addEventListener("click",async e=>{const t=e.target instanceof Element?e.target:null;if(!t)return;const f=t.closest("[data-export-format]");if(f){e.preventDefault();format=f.dataset.exportFormat;document.querySelectorAll("[data-export-format]").forEach(b=>b.classList.toggle("active",b===f));return;}if(t.closest("#shareBtn")){e.preventDefault();e.stopImmediatePropagation();await runExport("share");return;}if(t.closest("#downloadBtn")){e.preventDefault();e.stopImmediatePropagation();await runExport("download");return;}if(t.closest("#applyImportBtn")&&pendingImport){e.preventDefault();e.stopImmediatePropagation();await applyPendingImport();}},true);
  document.addEventListener("change",async e=>{const input=e.target;if(!(input instanceof HTMLInputElement)||input.id!=="jsonInput")return;e.stopImmediatePropagation();const file=input.files?.[0];if(!file)return;try{await previewImport(file);}catch(err){pendingImport=null;$("applyImportBtn").disabled=true;const box=$("importPreview");box.classList.remove("hidden");box.textContent="文件无法导入："+(err.message||err);}},true);
}
function init(){installStyle();installExportUi();bind();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
