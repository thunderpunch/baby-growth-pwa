import {getAllRecords,getRecord,putRecord,getSetting,getProfile} from "./db.js";

const $=id=>document.getElementById(id);
let modalState=null;
let refreshTimer=null;
let lastPageDate="";

function injectStyle(){
  if(document.querySelector('link[data-sleep-v2-style]')) return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL("./sleep-v2.css",import.meta.url).href;
  link.dataset.sleepV2Style="1";
  document.head.appendChild(link);
}
function dateKey(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function shiftDateKey(s,days){ const d=new Date(`${s}T12:00:00`);d.setDate(d.getDate()+days);return dateKey(d); }
function stamp(date,time){ return date&&time?`${date}T${time}`:""; }
function stampMs(v){ const n=Date.parse(v||"");return Number.isFinite(n)?n:null; }
function dpart(v){ return v?.slice?.(0,10)||""; }
function tpart(v){ return v?.slice?.(11,16)||""; }
function minuteOf(t){ if(!/^\d{2}:\d{2}$/.test(t||""))return null;const [h,m]=t.split(":").map(Number);return h*60+m; }
function duration(r){ const a=stampMs(r.startDateTime),b=stampMs(r.endDateTime);return a!=null&&b!=null&&b>a?Math.round((b-a)/60000):null; }
function fmtDuration(min){ if(min==null)return "—";const h=Math.floor(min/60),m=min%60;return h?(m?`${h}h${m}m`:`${h}h`):`${m}分钟`; }
function fmtStamp(v){ if(!v)return "—";const d=dpart(v),t=tpart(v);return `${d.slice(5).replace("-","/")} ${t}`; }
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
async function profileBedtimeMinutes(){
  try{
    const id=await getSetting("currentProfileId","");
    if(!id)return null;
    const p=await getProfile(id);
    const t=p?.stage?.weekday?.bedtime||p?.stage?.weekend?.bedtime||"";
    return minuteOf(t);
  }catch{return null;}
}
function circularDistance(a,b){ const d=Math.abs(a-b);return Math.min(d,1440-d); }
function basicClassify(r,bedtimeMin=null){
  const mins=duration(r);if(mins==null)return {kind:"uncertain",confidence:0,reason:"记录未完整"};
  const s=tpart(r.startDateTime),e=tpart(r.endDateTime),sm=minuteOf(s),em=minuteOf(e),cross=dpart(r.startDateTime)!==dpart(r.endDateTime);
  if(cross&&mins>=120)return {kind:"night",confidence:.98,reason:"跨午夜睡眠"};
  if(mins>=300&&(sm>=17*60||em<=10*60))return {kind:"night",confidence:.94,reason:"长时夜间睡眠"};
  if(bedtimeMin!=null&&sm!=null&&circularDistance(sm,bedtimeMin)<=120&&mins>=180)return {kind:"night",confidence:.9,reason:"接近典型入睡时间"};
  if(!cross&&mins<=210&&sm>=6*60&&em<=18*60+30)return {kind:"nap",confidence:.96,reason:"典型日间短睡"};
  if(!cross&&mins<=150&&sm>=7*60&&em<=20*60)return {kind:"nap",confidence:.86,reason:"较高概率日间睡眠"};
  return {kind:"uncertain",confidence:.45,reason:"缺少足够边界证据"};
}
function completedSleeps(records){ return records.filter(r=>r.type==="sleep"&&!r.deleted&&r.status==="confirmed"&&duration(r)!=null); }
function nightGroupForDate(records,pageDate,bedtimeMin){
  const sleeps=completedSleeps(records).sort((a,b)=>stampMs(a.startDateTime)-stampMs(b.startDateTime));
  const anchors=sleeps.filter(r=>{
    if(dpart(r.endDateTime)!==pageDate)return false;
    const c=basicClassify(r,bedtimeMin),mins=duration(r),sm=minuteOf(tpart(r.startDateTime));
    return c.kind==="night" || (mins>=240&&sm>=16*60) || dpart(r.startDateTime)!==pageDate;
  });
  if(!anchors.length)return [];
  const group=[...anchors];
  let earliest=Math.min(...group.map(r=>stampMs(r.startDateTime))),latest=Math.max(...group.map(r=>stampMs(r.endDateTime)));
  for(const r of sleeps){
    if(group.includes(r))continue;
    const s=stampMs(r.startDateTime),e=stampMs(r.endDateTime),sm=minuteOf(tpart(r.startDateTime));
    if(sm==null)continue;
    const nearMorning=dpart(r.startDateTime)===pageDate&&sm<8*60&&s-latest<=3*60*60*1000&&s>=latest;
    const nearEvening=dpart(r.endDateTime)===shiftDateKey(pageDate,-1)&&minuteOf(tpart(r.startDateTime))>=17*60&&earliest-e<=3*60*60*1000&&e<=earliest;
    if(nearMorning||nearEvening){group.push(r);earliest=Math.min(earliest,s);latest=Math.max(latest,e);}
  }
  return group.sort((a,b)=>stampMs(a.startDateTime)-stampMs(b.startDateTime));
}
async function analysisForDate(pageDate){
  const records=await getAllRecords();
  const bedtime=await profileBedtimeMinutes();
  const night=nightGroupForDate(records,pageDate,bedtime);
  const nightIds=new Set(night.map(r=>r.id));
  const sleeps=completedSleeps(records);
  const naps=[],uncertain=[];
  for(const r of sleeps){
    if(nightIds.has(r.id))continue;
    if(dpart(r.startDateTime)!==pageDate||dpart(r.endDateTime)!==pageDate)continue;
    const c=basicClassify(r,bedtime);
    if(c.kind==="nap"&&c.confidence>=.8)naps.push(r);else if(c.kind==="uncertain")uncertain.push(r);
  }
  const wakes=records.filter(r=>r.type==="wake"&&!r.deleted&&r.status==="confirmed"&&r.date===pageDate);
  const wakeEarly=wakes.filter(r=>r.result==="no_resleep"||(minuteOf(r.wakeTime)!=null&&minuteOf(r.wakeTime)<330)).sort((a,b)=>(a.wakeTime||"").localeCompare(b.wakeTime||""))[0]||null;
  let inferredEarly=null;
  if(!wakeEarly&&night.length){
    const finalEnd=night.map(r=>r.endDateTime).filter(Boolean).sort().at(-1);
    const m=minuteOf(tpart(finalEnd));
    if(m!=null&&m<330)inferredEarly=tpart(finalEnd);
  }
  return {records,bedtime,night,naps,uncertain,wakes,wakeEarly,inferredEarly};
}
function ensureNightCardShell(){
  const sleepInput=$("nightSleepAt");if(!sleepInput)return null;
  const card=sleepInput.closest(".card.pad");if(!card)return null;
  const title=card.querySelector(".card-title"),sub=card.querySelector(".card-sub");
  if(title)title.textContent="昨夜睡眠";
  if(sub)sub.textContent="由睡眠与夜醒记录自动汇总；不完整时再补录";
  const fields=sleepInput.closest(".fields2");if(fields)fields.classList.add("sleep-v2-legacy-hidden");
  const hint=Array.from(card.querySelectorAll(".hint")).find(x=>x.textContent.includes("起床所在日期"));if(hint)hint.classList.add("sleep-v2-legacy-hidden");
  let box=$("lastNightSummary");
  if(!box){box=document.createElement("div");box.id="lastNightSummary";box.className="last-night-summary";card.appendChild(box);}
  return box;
}
async function renderNightCard(pageDate){
  const box=ensureNightCardShell();if(!box)return;
  const a=await analysisForDate(pageDate);
  if(!a.night.length){
    box.innerHTML=`<div class="last-night-empty"><b>尚未形成可确认的昨夜睡眠</b><span>可以只记录已知的睡着或醒来时间，其余之后再补。</span></div><button type="button" class="secondary sleep-v2-card-action" data-sleep-v2-new>补录睡眠</button>`;
    return;
  }
  const start=a.night[0].startDateTime,end=a.night.at(-1).endDateTime,total=a.night.reduce((s,r)=>s+(duration(r)||0),0);
  const early=a.wakeEarly?.wakeTime||a.inferredEarly||"";
  box.innerHTML=`<div class="last-night-main"><div><small>睡眠窗口</small><b>${fmtStamp(start)} → ${fmtStamp(end)}</b></div><div><small>已记录实际睡眠</small><b>${fmtDuration(total)}</b></div></div>
    <div class="last-night-facts"><span>夜醒 ${a.wakes.length} 次</span>${early?`<span class="sleep-v2-warn">疑似早醒 ${early}</span>`:""}</div>
    <div class="last-night-note">${a.night.length>1||a.wakes.length?"存在夜醒/分段记录，实际睡眠按已记录睡眠时段累计。":"已根据睡眠记录自动汇总。"}</div>
    <button type="button" class="secondary sleep-v2-card-action" data-sleep-v2-new>补充 / 调整睡眠</button>`;
}
async function patchMetrics(pageDate){
  const metrics=$("metrics");if(!metrics)return;
  const items=Array.from(metrics.querySelectorAll(".metric"));if(items.length<4)return;
  const a=await analysisForDate(pageDate);
  const napMin=a.naps.reduce((s,r)=>s+(duration(r)||0),0);
  const set=(el,selector,text)=>{const n=el.querySelector(selector);if(n&&n.textContent!==text)n.textContent=text;};
  set(items[0],"b",`${a.naps.length} 觉`);set(items[0],"small","小睡");
  set(items[1],"b",napMin?fmtDuration(napMin):"—");set(items[1],"small",a.uncertain.length?`小睡总计 · ${a.uncertain.length}段待判断`:"小睡总计");
  const early=a.wakeEarly?.wakeTime||a.inferredEarly||"—";set(items[3],"b",early);set(items[3],"small","疑似早醒");
}
function ensureModal(){
  let overlay=$("sleepV2Modal");if(overlay)return overlay;
  overlay=document.createElement("div");overlay.id="sleepV2Modal";overlay.className="sleep-v2-overlay hidden";
  overlay.innerHTML=`<div class="sleep-v2-card" role="dialog" aria-modal="true" aria-labelledby="sleepV2Title"><div class="sleep-v2-head"><b id="sleepV2Title">记录睡眠</b><button type="button" data-sleep-v2-close aria-label="关闭">×</button></div><div class="sleep-v2-body">
    <div class="sleep-v2-pair"><label>睡着日期<input id="sleepV2StartDate" type="date"></label><label>睡着时间<div class="sleep-v2-time"><input id="sleepV2StartTime" type="time"><button type="button" data-sleep-v2-now="start">现在</button></div></label></div>
    <div class="sleep-v2-pair"><label>醒来日期<input id="sleepV2EndDate" type="date"></label><label>醒来时间<div class="sleep-v2-time"><input id="sleepV2EndTime" type="time"><button type="button" data-sleep-v2-now="end">现在</button></div></label></div>
    <div class="sleep-v2-hint">只填写确定的事实即可。跨夜时可调整日期；时间完整后系统自动判断夜间主睡、小睡或待判断。</div>
    <label>备注<input id="sleepV2Note" type="text" placeholder="例如：抱哄后放床；这觉特别短"></label>
    <div id="sleepV2Conflict" class="sleep-v2-conflict hidden"></div>
  </div><div class="sleep-v2-actions"><button type="button" class="secondary" data-sleep-v2-cancel>取消</button><button type="button" class="primary" data-sleep-v2-save>保存</button></div></div>`;
  document.body.appendChild(overlay);return overlay;
}
function currentClock(){const d=new Date();return {date:dateKey(d),time:`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`};}
function hideModal(){const m=ensureModal();m.classList.add("hidden");modalState=null;}
function applyModalValues(record,pageDate){
  const start=record?.startDateTime||"",end=record?.endDateTime||"";
  $("sleepV2StartDate").value=dpart(start)||pageDate;$("sleepV2StartTime").value=tpart(start);
  $("sleepV2EndDate").value=dpart(end)||pageDate;$("sleepV2EndTime").value=tpart(end);
  $("sleepV2Note").value=record?.note||"";$("sleepV2Conflict").classList.add("hidden");$("sleepV2Conflict").innerHTML="";
}
async function openSleepModal(record=null){
  ensureModal();const pageDate=$("pageDate")?.value||dateKey(new Date());modalState={record};
  $("sleepV2Title").textContent=record?.id?"修改睡眠":"记录睡眠";applyModalValues(record,pageDate);$("sleepV2Modal").classList.remove("hidden");
}
function candidateFromModal(){
  const old=modalState?.record||{},sd=$("sleepV2StartDate").value,st=$("sleepV2StartTime").value,ed=$("sleepV2EndDate").value,et=$("sleepV2EndTime").value;
  const start=st?stamp(sd,st):"",end=et?stamp(ed,et):"";
  return {...old,id:old.id||crypto.randomUUID(),date:dpart(end)||dpart(start)||($("pageDate")?.value||dateKey(new Date())),type:"sleep",status:"confirmed",deleted:false,startDateTime:start,endDateTime:end,startTime:tpart(start),endTime:tpart(end),note:$("sleepV2Note").value.trim(),createdAt:old.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}
async function findConflict(candidate){
  if(duration(candidate)==null)return null;
  const all=await getAllRecords();
  return all.find(r=>r.type==="sleep"&&!r.deleted&&r.status==="confirmed"&&r.id!==candidate.id&&duration(r)!=null&&overlapMinutes(r,candidate)>0)||null;
}
function refreshAppDay(){const p=$("pageDate");if(p)p.dispatchEvent(new Event("change",{bubbles:true}));scheduleRefresh(80);}
async function mergeConflict(existing,candidate){
  const starts=[existing.startDateTime,candidate.startDateTime].filter(Boolean).sort(),ends=[existing.endDateTime,candidate.endDateTime].filter(Boolean).sort();
  const start=starts[0]||"",end=ends.at(-1)||"";
  const merged={...existing,startDateTime:start,endDateTime:end,startTime:tpart(start),endTime:tpart(end),date:dpart(end)||dpart(start)||existing.date,note:[existing.note,candidate.note].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join("；"),updatedAt:new Date().toISOString()};
  await putRecord(merged);
  if(candidate.id!==existing.id&&modalState?.record?.id){await putRecord({...candidate,deleted:true,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}
  hideModal();refreshAppDay();showToast(`已合并为 ${fmtStamp(start)} → ${fmtStamp(end)}`);
}
async function saveSleep(){
  const c=candidateFromModal();
  if(!c.startDateTime&&!c.endDateTime){showToast("至少填写一个睡眠时间");return;}
  if(c.startDateTime&&c.endDateTime&&stampMs(c.endDateTime)<=stampMs(c.startDateTime)){showToast("醒来时间必须晚于睡着时间");return;}
  const conflict=await findConflict(c);
  if(conflict){
    const box=$("sleepV2Conflict");box.classList.remove("hidden");box.innerHTML=`<b>与已有睡眠记录重叠</b><span>已有：${fmtStamp(conflict.startDateTime)} → ${fmtStamp(conflict.endDateTime)}</span><span>本次：${fmtStamp(c.startDateTime)} → ${fmtStamp(c.endDateTime)}</span><div><button type="button" class="secondary" data-sleep-v2-back>返回修改</button><button type="button" class="primary" data-sleep-v2-merge>合并记录</button></div>`;
    box.querySelector("[data-sleep-v2-back]").onclick=()=>box.classList.add("hidden");box.querySelector("[data-sleep-v2-merge]").onclick=()=>mergeConflict(conflict,c);return;
  }
  await putRecord(c);hideModal();refreshAppDay();showToast(c.date!==($("pageDate")?.value||"")?`已保存，并归档到 ${c.date}`:"睡眠已保存");
}
function scheduleRefresh(delay=40){clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshAll,delay);}
async function refreshAll(){
  const pageDate=$("pageDate")?.value||dateKey(new Date());lastPageDate=pageDate;
  try{await Promise.all([renderNightCard(pageDate),patchMetrics(pageDate)]);}catch(e){console.warn("Sleep V2 refresh failed",e);}
}
function bindEvents(){
  document.addEventListener("click",async e=>{
    const t=e.target instanceof Element?e.target:null;if(!t)return;
    const quick=t.closest('[data-quick="sleep"],[data-more="sleep"]');
    if(quick){e.preventDefault();e.stopImmediatePropagation();await openSleepModal();return;}
    const edit=t.closest("[data-edit-id]");
    if(edit){const r=await getRecord(edit.dataset.editId);if(r?.type==="sleep"){e.preventDefault();e.stopImmediatePropagation();await openSleepModal(r);return;}}
    if(t.closest("[data-sleep-v2-new]")){e.preventDefault();await openSleepModal();return;}
    if(t.closest("[data-sleep-v2-close],[data-sleep-v2-cancel]")){e.preventDefault();hideModal();return;}
    if(t.closest("[data-sleep-v2-save]")){e.preventDefault();await saveSleep();return;}
    const now=t.closest("[data-sleep-v2-now]");if(now){const c=currentClock(),which=now.dataset.sleepV2Now;$(which==="start"?"sleepV2StartDate":"sleepV2EndDate").value=c.date;$(which==="start"?"sleepV2StartTime":"sleepV2EndTime").value=c.time;return;}
    if(t.closest("#prevDay,#nextDay,#todayBtn,[data-history-date]"))scheduleRefresh(120);
  },true);
  $("pageDate")?.addEventListener("change",()=>scheduleRefresh(100));
  const endTime=$("sleepV2EndTime"),startTime=$("sleepV2StartTime");
  endTime?.addEventListener("change",()=>{const sd=$("sleepV2StartDate").value,ed=$("sleepV2EndDate").value;if(sd&&ed===sd&&startTime.value&&endTime.value&&endTime.value<startTime.value)$("sleepV2EndDate").value=shiftDateKey(sd,1);});
  const timeline=$("timeline");if(timeline)new MutationObserver(()=>scheduleRefresh(60)).observe(timeline,{childList:true,subtree:true});
  setInterval(()=>{const d=$("pageDate")?.value||"";if(d&&d!==lastPageDate)scheduleRefresh(0);},1500);
}

function init(){injectStyle();ensureModal();ensureNightCardShell();bindEvents();scheduleRefresh(120);}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
