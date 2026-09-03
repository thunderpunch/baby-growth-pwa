import {getRecord,getRecordsByDate,getRecordsInRange,putRecord,getSetting,getProfile} from "./db.js";

const $=id=>document.getElementById(id);
const SLEEP_METHODS=["自主入睡","奶睡","抱睡","拍睡","摇睡","其他"];
let modalState=null;
let refreshTimer=null;
let editingWakeId=null;
let wakeSaveContext=null;
let forcedWakeNightKey="";

function injectStyle(){
  if(document.querySelector('link[data-sleep-v3-style]')) return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL("./sleep-v3.css",import.meta.url).href;
  link.dataset.sleepV3Style="1";
  document.head.appendChild(link);
}
function dateKey(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function shiftDateKey(s,days){const d=new Date(`${s}T12:00:00`);d.setDate(d.getDate()+days);return dateKey(d);}
function stamp(date,time){return date&&time?`${date}T${time}`:"";}
function stampMs(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:null;}
function dpart(v){return v?.slice?.(0,10)||"";}
function tpart(v){return v?.slice?.(11,16)||"";}
function minuteOf(t){if(!/^\d{2}:\d{2}$/.test(t||""))return null;const [h,m]=t.split(":").map(Number);return h*60+m;}
function duration(r){const a=stampMs(r.startDateTime),b=stampMs(r.endDateTime);return a!=null&&b!=null&&b>a?Math.round((b-a)/60000):null;}
function fmtDuration(min){if(min==null)return "—";const h=Math.floor(min/60),m=min%60;return h?(m?`${h}h${m}m`:`${h}h`):`${m}分钟`;}
function fmtStamp(v){if(!v)return "—";const d=dpart(v),t=tpart(v);return `${d.slice(5).replace("-","/")} ${t}`;}
function fmtDay(v){if(!v)return "";const [,m,d]=v.split("-");return `${Number(m)}月${Number(d)}日`;}
function nowClock(){const d=new Date();return {date:dateKey(d),time:`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`};}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function overlapMinutes(a,b){
  const a0=stampMs(a.startDateTime),a1=stampMs(a.endDateTime),b0=stampMs(b.startDateTime),b1=stampMs(b.endDateTime);
  if([a0,a1,b0,b1].some(x=>x==null))return 0;
  return Math.max(0,Math.min(a1,b1)-Math.max(a0,b0))/60000;
}
function showToast(text){
  const toast=$("toast"),txt=$("toastText"),btn=$("toastAction");
  if(!toast||!txt)return;
  txt.textContent=text;btn?.classList.add("hidden");toast.classList.remove("hidden");
  clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.add("hidden"),3600);
}
function live(records,type){return records.filter(r=>r.type===type&&!r.deleted&&r.status==="confirmed");}
function methodChoices(selected=""){
  return `<div class="sleep-v3-methods">${SLEEP_METHODS.map(m=>`<button type="button" class="sleep-v3-chip ${m===selected?"active":""}" data-sleep-v3-method="${m}">${m}</button>`).join("")}</div>`;
}
function bindMethodChoices(root){
  root.querySelectorAll("[data-sleep-v3-method]").forEach(btn=>btn.onclick=e=>{
    e.preventDefault();
    const was=btn.classList.contains("active");
    root.querySelectorAll("[data-sleep-v3-method]").forEach(x=>x.classList.remove("active"));
    if(!was)btn.classList.add("active");
  });
}
function selectedMethod(){return document.querySelector("#sleepV3Modal .sleep-v3-chip.active")?.dataset.sleepV3Method||"";}
async function profileBedtimeMinutes(){
  try{
    const id=await getSetting("currentProfileId","");
    if(!id)return null;
    const p=await getProfile(id);
    return minuteOf(p?.stage?.weekday?.bedtime||p?.stage?.weekend?.bedtime||"");
  }catch{return null;}
}
function circularDistance(a,b){const d=Math.abs(a-b);return Math.min(d,1440-d);}
function basicClassify(r,bedtimeMin=null){
  if(r.nightAnchor)return {kind:"night",confidence:1};
  const mins=duration(r);if(mins==null)return {kind:"uncertain",confidence:0};
  const sm=minuteOf(tpart(r.startDateTime)),em=minuteOf(tpart(r.endDateTime)),cross=dpart(r.startDateTime)!==dpart(r.endDateTime);
  if(cross&&mins>=120)return {kind:"night",confidence:.98};
  if(mins>=300&&(sm>=17*60||em<=10*60))return {kind:"night",confidence:.94};
  if(bedtimeMin!=null&&sm!=null&&circularDistance(sm,bedtimeMin)<=120&&mins>=180)return {kind:"night",confidence:.9};
  if(!cross&&mins<=210&&sm>=6*60&&em<=18*60+30)return {kind:"nap",confidence:.96};
  if(!cross&&mins<=150&&sm>=7*60&&em<=20*60)return {kind:"nap",confidence:.86};
  return {kind:"uncertain",confidence:.45};
}
function nightAnchorFor(records,nightKey){
  return live(records,"sleep").filter(r=>r.nightAnchor&&r.nightKey===nightKey)
    .sort((a,b)=>stampMs(b.updatedAt)-stampMs(a.updatedAt))[0]||null;
}
function inferredNightForDate(records,pageDate,bedtimeMin){
  return live(records,"sleep")
    .filter(r=>!r.nightAnchor&&duration(r)!=null&&dpart(r.endDateTime)===pageDate)
    .filter(r=>basicClassify(r,bedtimeMin).kind==="night")
    .sort((a,b)=>stampMs(a.startDateTime)-stampMs(b.startDateTime));
}
function wakesForNight(records,nightKey){
  const wakes=live(records,"wake");
  const explicit=wakes.filter(r=>r.nightKey===nightKey);
  if(explicit.length)return explicit.sort((a,b)=>(a.wakeTime||"").localeCompare(b.wakeTime||""));
  return wakes.filter(r=>!r.nightKey&&r.date===nightKey).sort((a,b)=>(a.wakeTime||"").localeCompare(b.wakeTime||""));
}
async function analysisForDate(pageDate){
  const previousDate=shiftDateKey(pageDate,-1);
  const [previous,current,bedtime]=await Promise.all([
    getRecordsByDate(previousDate,{includeDeleted:false}),
    getRecordsByDate(pageDate,{includeDeleted:false}),
    profileBedtimeMinutes()
  ]);
  const records=[...previous,...current];
  const anchor=nightAnchorFor(records,pageDate);
  const inferred=anchor?[]:inferredNightForDate(records,pageDate,bedtime);
  const night=anchor?[anchor]:inferred;
  const nightIds=new Set(night.map(r=>r.id));
  const naps=[],uncertain=[];
  for(const r of live(records,"sleep")){
    if(r.nightAnchor||nightIds.has(r.id)||duration(r)==null)continue;
    if(dpart(r.startDateTime)!==pageDate||dpart(r.endDateTime)!==pageDate)continue;
    const c=basicClassify(r,bedtime);
    if(c.kind==="nap"&&c.confidence>=.8)naps.push(r);
    else if(c.kind==="uncertain")uncertain.push(r);
  }
  const wakes=wakesForNight(records,pageDate);
  const wakeEarly=wakes.filter(r=>r.result==="no_resleep"||(minuteOf(r.wakeTime)!=null&&minuteOf(r.wakeTime)<330))
    .sort((a,b)=>(a.wakeTime||"").localeCompare(b.wakeTime||""))[0]||null;
  let inferredEarly=null;
  const finalEnd=night.map(r=>r.endDateTime).filter(Boolean).sort().at(-1);
  const endMin=minuteOf(tpart(finalEnd));
  if(!wakeEarly&&endMin!=null&&endMin<330)inferredEarly=tpart(finalEnd);
  return {records,anchor,night,naps,uncertain,wakes,wakeEarly,inferredEarly};
}
function renderNightCard(pageDate,a){
  const box=$("lastNightSummary");if(!box)return;
  if(!a.night.length){
    box.innerHTML=`<div class="last-night-title">昨夜</div><div class="last-night-empty"><b>暂无完整记录</b><span>如果昨晚忘记点“晚安”，可直接在“早安”里补充。</span></div>`;
    return;
  }
  const first=a.night[0],start=first.startDateTime||"",end=a.night.map(r=>r.endDateTime).filter(Boolean).sort().at(-1)||"";
  const total=a.night.reduce((s,r)=>s+(duration(r)||0),0),early=a.wakeEarly?.wakeTime||a.inferredEarly||"";
  box.innerHTML=`<div class="last-night-title">昨夜</div>
    <div class="last-night-main">
      <div><small>睡眠</small><b>${fmtStamp(start)} → ${end?fmtStamp(end):"待补充"}</b></div>
      <div><small>时长</small><b>${end?fmtDuration(total):"—"}</b></div>
    </div>
    <div class="last-night-facts">${first.sleepMethod?`<span>${esc(first.sleepMethod)}</span>`:""}<span>夜醒 ${a.wakes.length} 次</span>${early?`<span class="sleep-v3-warn">疑似早醒 ${early}</span>`:""}${!a.anchor?`<span>系统推测</span>`:""}</div>`;
}
function patchMetrics(pageDate,a){
  const metrics=$("metrics");if(!metrics)return;
  const items=Array.from(metrics.querySelectorAll(".metric"));if(items.length<4)return;
  const napMin=a.naps.reduce((s,r)=>s+(duration(r)||0),0);
  const set=(el,sel,text)=>{const n=el.querySelector(sel);if(n&&n.textContent!==text)n.textContent=text;};
  set(items[0],"b",`${a.naps.length} 觉`);set(items[0],"small","小睡");
  set(items[1],"b",napMin?fmtDuration(napMin):"—");set(items[1],"small",a.uncertain.length?`小睡总计 · ${a.uncertain.length}段待判断`:"小睡总计");
  set(items[3],"b",a.wakeEarly?.wakeTime||a.inferredEarly||"—");set(items[3],"small","疑似早醒");
}
function ensureModal(){
  let overlay=$("sleepV3Modal");if(overlay)return overlay;
  overlay=document.createElement("div");overlay.id="sleepV3Modal";overlay.className="sleep-v3-overlay hidden";document.body.appendChild(overlay);return overlay;
}
function modalShell(title,body,saveLabel="保存"){
  return `<div class="sleep-v3-card" role="dialog" aria-modal="true">
    <div class="sleep-v3-head"><b>${title}</b><button type="button" data-sleep-v3-close aria-label="关闭">×</button></div>
    <div class="sleep-v3-body">${body}</div>
    <div class="sleep-v3-actions"><button type="button" class="secondary" data-sleep-v3-cancel>取消</button><button type="button" class="primary" data-sleep-v3-save>${saveLabel}</button></div>
  </div>`;
}
function showModal(html){const m=ensureModal();m.innerHTML=html;m.classList.remove("hidden");bindMethodChoices(m);}
function hideModal(){ensureModal().classList.add("hidden");modalState=null;}
function timeField(id,label,value=""){
  return `<label>${label}<div class="sleep-v3-time"><input id="${id}" type="time" value="${esc(value)}"><button type="button" data-sleep-v3-now="${id}">现在</button></div></label>`;
}
function noteField(value=""){return `<label>备注<input id="sleepV3Note" type="text" value="${esc(value)}" placeholder="可选"></label>`;}
async function openSleep(record=null){
  const pageDate=$("pageDate")?.value||dateKey(new Date());
  modalState={kind:"sleep",record,pageDate};
  showModal(modalShell(record?.id?"修改睡眠":"记录睡眠",
    `<div class="sleep-v3-pair">${timeField("sleepV3Start","睡着时间",tpart(record?.startDateTime))}${timeField("sleepV3End","醒来时间",tpart(record?.endDateTime))}</div>
     <label>入睡方式${methodChoices(record?.sleepMethod||"")}</label>
     ${noteField(record?.note||"")}
     <div class="sleep-v3-hint">无需选择日期；结束时间早于开始时间时按跨午夜处理。</div>
     <div id="sleepV3Warning" class="sleep-v3-warning hidden"></div>`));
}
function ordinaryCandidate(){
  const old=modalState?.record||{},pageDate=modalState?.pageDate||($("pageDate")?.value||dateKey(new Date()));
  const st=$("sleepV3Start")?.value||"",et=$("sleepV3End")?.value||"";
  let start="",end="";
  if(st&&et&&et<st){start=stamp(shiftDateKey(pageDate,-1),st);end=stamp(pageDate,et);}
  else{start=st?stamp(pageDate,st):"";end=et?stamp(pageDate,et):"";}
  if(old.id){
    if(st)start=stamp(dpart(old.startDateTime)||pageDate,st);
    if(et){
      let ed=dpart(old.endDateTime)||dpart(start)||pageDate;
      if(start&&et<tpart(start)&&ed===dpart(start))ed=shiftDateKey(ed,1);
      end=stamp(ed,et);
    }
  }
  return {...old,id:old.id||crypto.randomUUID(),date:dpart(end)||dpart(start)||pageDate,type:"sleep",status:"confirmed",deleted:false,
    startDateTime:start,endDateTime:end,sleepMethod:selectedMethod(),note:$("sleepV3Note")?.value.trim()||"",
    createdAt:old.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}
async function findSleepConflict(candidate){
  if(duration(candidate)==null)return null;
  const startDate=dpart(candidate.startDateTime)||candidate.date,endDate=dpart(candidate.endDateTime)||startDate;
  const rows=await getRecordsInRange(startDate,endDate);
  return live(rows,"sleep").find(r=>r.id!==candidate.id&&duration(r)!=null&&overlapMinutes(r,candidate)>0)||null;
}
function warning(title,lines,confirmText,onConfirm){
  const box=$("sleepV3Warning");if(!box)return;
  box.classList.remove("hidden");
  box.innerHTML=`<b>${title}</b>${lines.map(x=>`<span>${esc(x)}</span>`).join("")}<div><button type="button" class="secondary" data-sleep-v3-back>返回修改</button><button type="button" class="primary" data-sleep-v3-force>${confirmText}</button></div>`;
  box.querySelector("[data-sleep-v3-back]").onclick=()=>box.classList.add("hidden");
  box.querySelector("[data-sleep-v3-force]").onclick=onConfirm;
}
function refreshAppDay(){const p=$("pageDate");if(p)p.dispatchEvent(new Event("change",{bubbles:true}));scheduleRefresh(80);}
async function persistOrdinary(c){await putRecord(c);hideModal();refreshAppDay();showToast("睡眠已保存");}
async function mergeOrdinary(existing,candidate){
  const starts=[existing.startDateTime,candidate.startDateTime].filter(Boolean).sort(),ends=[existing.endDateTime,candidate.endDateTime].filter(Boolean).sort();
  const start=starts[0]||"",end=ends.at(-1)||"";
  await putRecord({...existing,startDateTime:start,endDateTime:end,date:dpart(end)||dpart(start)||existing.date,
    sleepMethod:existing.sleepMethod||candidate.sleepMethod||"",note:[existing.note,candidate.note].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join("；"),updatedAt:new Date().toISOString()});
  if(candidate.id!==existing.id&&modalState?.record?.id)await putRecord({...candidate,deleted:true,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  hideModal();refreshAppDay();showToast("重叠睡眠已合并");
}
async function saveOrdinary(){
  const c=ordinaryCandidate();
  if(!c.startDateTime&&!c.endDateTime)return showToast("至少填写一个睡眠时间");
  if(c.startDateTime&&c.endDateTime&&stampMs(c.endDateTime)<=stampMs(c.startDateTime))return showToast("醒来时间必须晚于睡着时间");
  const mins=duration(c);
  if(mins!=null&&mins>16*60)return warning("这段睡眠超过 16 小时",[`${fmtStamp(c.startDateTime)} → ${fmtStamp(c.endDateTime)}`,"请确认是否误把时间记成跨日。"],"仍然保存",()=>persistOrdinary(c));
  const conflict=await findSleepConflict(c);
  if(conflict){
    if(conflict.nightAnchor)return warning("这段睡眠与夜间睡眠重叠",["如果是在夜间醒来，建议使用“夜醒”记录。"],"仍然保存",()=>persistOrdinary(c));
    return warning("与已有睡眠记录重叠",[`已有：${fmtStamp(conflict.startDateTime)} → ${fmtStamp(conflict.endDateTime)}`,`本次：${fmtStamp(c.startDateTime)} → ${fmtStamp(c.endDateTime)}`],"合并记录",()=>mergeOrdinary(conflict,c));
  }
  await persistOrdinary(c);
}
async function openGoodnight(){
  const pageDate=$("pageDate")?.value||dateKey(new Date()),nightKey=shiftDateKey(pageDate,1),records=await getRecordsByDate(nightKey,{includeDeleted:false});
  const existing=nightAnchorFor(records,nightKey),defaultTime=existing?tpart(existing.startDateTime):(pageDate===dateKey(new Date())?nowClock().time:"");
  modalState={kind:"goodnight",record:existing,pageDate,nightKey};
  showModal(modalShell("晚安",
    `${timeField("sleepV3Start","睡着时间",defaultTime)}
     <label>入睡方式${methodChoices(existing?.sleepMethod||"")}</label>
     ${noteField(existing?.note||"")}
     <div id="sleepV3Warning" class="sleep-v3-warning hidden"></div>`,
     existing?"保存修改":"保存"));
}
async function saveGoodnight(){
  const time=$("sleepV3Start")?.value||"";if(!time)return showToast("请填写睡着时间");
  const old=modalState.record||{},start=stamp(modalState.pageDate,time);
  const record={...old,id:old.id||crypto.randomUUID(),date:modalState.nightKey,type:"sleep",status:"confirmed",deleted:false,
    nightAnchor:true,nightKey:modalState.nightKey,startDateTime:start,endDateTime:old.endDateTime||"",
    sleepMethod:selectedMethod(),note:$("sleepV3Note")?.value.trim()||"",
    createdAt:old.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(record.endDateTime&&stampMs(record.endDateTime)<=stampMs(record.startDateTime))return showToast("睡着时间必须早于已经记录的早安时间");
  await putRecord(record);hideModal();refreshAppDay();showToast(old.id?"晚安已更新":"晚安已记录");
}
async function openMorning(){
  const pageDate=$("pageDate")?.value||dateKey(new Date()),records=await getRecordsByDate(pageDate,{includeDeleted:false}),anchor=nightAnchorFor(records,pageDate);
  const start=tpart(anchor?.startDateTime)||"",end=tpart(anchor?.endDateTime)||(pageDate===dateKey(new Date())?nowClock().time:"");
  modalState={kind:"morning",record:anchor,pageDate,nightKey:pageDate};
  showModal(modalShell("早安",
    `${!anchor?.startDateTime?`<div class="sleep-v3-hint attention">昨晚没有找到“晚安”记录，请补充昨晚的睡着时间和入睡方式。</div>`:`<div class="sleep-v3-hint">已带入 ${fmtDay(shiftDateKey(pageDate,-1))} 晚的“晚安”记录。</div>`}
     <div class="sleep-v3-pair">${timeField("sleepV3Start","睡着时间",start)}${timeField("sleepV3End","醒来时间",end)}</div>
     <label>入睡方式${methodChoices(anchor?.sleepMethod||"")}</label>
     ${noteField(anchor?.note||"")}
     <div id="sleepV3Warning" class="sleep-v3-warning hidden"></div>`,
     anchor?.endDateTime?"保存修改":"保存"));
}
async function persistMorning(record,conflict=null){
  if(conflict&&!conflict.nightAnchor){
    await putRecord({...conflict,deleted:true,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  }
  await putRecord(record);hideModal();refreshAppDay();showToast(record.endDateTime?"早安已记录":"夜间睡眠已保存");
}
async function saveMorning(force=false){
  const old=modalState.record||{},st=$("sleepV3Start")?.value||"",et=$("sleepV3End")?.value||"";
  if(!st)return showToast("请填写昨晚睡着时间");
  if(!et)return showToast("请填写醒来时间");
  const start=stamp(shiftDateKey(modalState.pageDate,-1),st),end=stamp(modalState.pageDate,et),mins=Math.round((stampMs(end)-stampMs(start))/60000);
  if(mins<=0)return showToast("醒来时间必须晚于昨晚睡着时间");
  const record={...old,id:old.id||crypto.randomUUID(),date:modalState.pageDate,type:"sleep",status:"confirmed",deleted:false,
    nightAnchor:true,nightKey:modalState.pageDate,startDateTime:start,endDateTime:end,sleepMethod:selectedMethod(),
    note:$("sleepV3Note")?.value.trim()||"",createdAt:old.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(mins>18*60&&!force)return warning("整夜睡眠超过 18 小时",[`${fmtStamp(start)} → ${fmtStamp(end)}`,"请确认时间没有填错。"],"确认无误",()=>saveMorning(true));
  const conflict=await findSleepConflict(record);
  if(conflict&&!conflict.nightAnchor&&!force){
    return warning("与已有普通睡眠记录重叠",[`已有：${fmtStamp(conflict.startDateTime)} → ${fmtStamp(conflict.endDateTime)}`,"如果它其实就是昨晚这段睡眠，可以合并，避免重复统计。"],"合并为昨夜睡眠",()=>persistMorning(record,conflict));
  }
  await persistMorning(record);
}
function wakeChoiceMarkup(pageDate,selected){
  const prev=pageDate,next=shiftDateKey(pageDate,1);
  return `<div id="wakeNightChoice" class="wake-night-choice">
    <button type="button" class="${selected===prev?"active":""}" data-wake-night-key="${prev}"><b>昨晚</b><span>${fmtDay(shiftDateKey(pageDate,-1))}晚 → ${fmtDay(pageDate)}早</span></button>
    <button type="button" class="${selected===next?"active":""}" data-wake-night-key="${next}"><b>今晚</b><span>${fmtDay(pageDate)}晚 → ${fmtDay(next)}早</span></button>
  </div>`;
}
function defaultWakeNightKey(pageDate,wakeTime){
  if(forcedWakeNightKey)return forcedWakeNightKey;
  const m=minuteOf(wakeTime);
  return m!=null&&m<12*60?pageDate:shiftDateKey(pageDate,1);
}
async function injectWakeNightChoice(){
  const modal=$("modal");if(!modal||modal.classList.contains("hidden")||!$("fWake")||$("wakeNightField"))return;
  const pageDate=$("pageDate")?.value||dateKey(new Date()),record=editingWakeId?await getRecord(editingWakeId):null;
  const selected=record?.nightKey||defaultWakeNightKey(pageDate,$("fWake").value);
  const label=document.createElement("label");label.id="wakeNightField";label.className="form-label";
  label.innerHTML=`属于哪一晚${wakeChoiceMarkup(pageDate,selected)}`;
  const result=$("fWakeResult")?.closest("label");
  if(result)result.insertAdjacentElement("beforebegin",label);else $("modalBody")?.appendChild(label);
  const activate=key=>label.querySelectorAll("[data-wake-night-key]").forEach(b=>b.classList.toggle("active",b.dataset.wakeNightKey===key));
  label.querySelectorAll("[data-wake-night-key]").forEach(b=>b.onclick=e=>{e.preventDefault();activate(b.dataset.wakeNightKey);});
  $("fWake").addEventListener("change",()=>{if(record?.nightKey||forcedWakeNightKey)return;activate(defaultWakeNightKey(pageDate,$("fWake").value));});
}
function selectedWakeNightKey(){return document.querySelector("#wakeNightChoice [data-wake-night-key].active")?.dataset.wakeNightKey||"";}
function prepareWakeSave(){
  if(!$("fWake")||!$("wakeNightField"))return;
  wakeSaveContext={editingId:editingWakeId,date:$("pageDate")?.value||dateKey(new Date()),wakeTime:$("fWake").value,nightKey:selectedWakeNightKey(),startedAt:Date.now()};
  editingWakeId=null;
  setTimeout(()=>persistWakeNightKey().catch(e=>console.warn("Wake night link save failed",e)),80);
}
async function persistWakeNightKey(){
  const c=wakeSaveContext;if(!c?.nightKey)return;
  let record=null;
  for(let i=0;i<10&&!record;i++){
    if(i)await new Promise(r=>setTimeout(r,70));
    if(c.editingId)record=await getRecord(c.editingId);
    else{
      const rows=await getRecordsByDate(c.date,{includeDeleted:false});
      record=rows.filter(r=>r.type==="wake"&&r.wakeTime===c.wakeTime&&Date.parse(r.createdAt||0)>=c.startedAt-2500)
        .sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0))[0]||null;
    }
  }
  if(record&&record.nightKey!==c.nightKey)await putRecord({...record,nightKey:c.nightKey,updatedAt:new Date().toISOString()});
  wakeSaveContext=null;forcedWakeNightKey="";scheduleRefresh(80);
}
function scheduleRefresh(delay=40){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refreshAll().catch(e=>console.warn("Sleep V3 refresh failed",e)),delay);}
async function refreshAll(){
  const pageDate=$("pageDate")?.value||dateKey(new Date());
  const analysis=await analysisForDate(pageDate);
  renderNightCard(pageDate,analysis);
  patchMetrics(pageDate,analysis);
}
function bindEvents(){
  document.addEventListener("click",async e=>{
    const t=e.target instanceof Element?e.target:null;if(!t)return;
    const quick=t.closest('[data-quick="sleep"],[data-more="sleep"]');
    if(quick){e.preventDefault();e.stopImmediatePropagation();await openSleep();return;}
    if(t.closest("[data-night-goodnight]")){e.preventDefault();await openGoodnight();return;}
    if(t.closest("[data-night-morning]")){e.preventDefault();await openMorning();return;}

    const edit=t.closest("[data-edit-id]");
    if(edit){
      const r=await getRecord(edit.dataset.editId);
      if(r?.type==="sleep"){e.preventDefault();e.stopImmediatePropagation();await openSleep(r);return;}
      if(r?.type==="wake")editingWakeId=r.id;
    }
    if(t.closest('[data-quick="wake"],[data-more="wake"]'))editingWakeId=null;

    if(t.closest("[data-sleep-v3-close],[data-sleep-v3-cancel]")){e.preventDefault();hideModal();return;}
    if(t.closest("[data-sleep-v3-save]")){
      e.preventDefault();
      if(modalState?.kind==="sleep")await saveOrdinary();
      else if(modalState?.kind==="goodnight")await saveGoodnight();
      else if(modalState?.kind==="morning")await saveMorning();
      return;
    }
    const now=t.closest("[data-sleep-v3-now]");
    if(now){const input=$(now.dataset.sleepV3Now);if(input)input.value=nowClock().time;return;}

    if(t.closest("#modalSave,#modalSaveContinue"))prepareWakeSave();
    if(t.closest("#modalCancel,#modalClose")){editingWakeId=null;forcedWakeNightKey="";}
    if(t.closest("#prevDay,#nextDay,#todayBtn,[data-history-date]"))scheduleRefresh(80);
  },true);
  $("pageDate")?.addEventListener("change",()=>scheduleRefresh(40));
  const modal=$("modal");
  if(modal)new MutationObserver(()=>injectWakeNightChoice().catch(e=>console.warn("Wake night choice failed",e)))
    .observe(modal,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
}

async function init(){
  injectStyle();ensureModal();bindEvents();scheduleRefresh(40);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>init().catch(console.error),{once:true});
else init().catch(console.error);
