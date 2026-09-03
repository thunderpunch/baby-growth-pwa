import {getAllRecords,getRecord,getRecordsByDate,putRecord,getSetting,getProfile} from "./db.js";

const $=id=>document.getElementById(id);
const SLEEP_METHODS=["自主入睡","奶睡","抱睡","拍睡","摇睡","其他"];
let modalState=null;
let refreshTimer=null;
let lastPageDate="";
let editingWakeId=null;
let wakeSaveContext=null;
let wakeReturnToMorning=false;
let forcedWakeNightKey="";

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
function shiftDateKey(s,days){const d=new Date(`${s}T12:00:00`);d.setDate(d.getDate()+days);return dateKey(d);}
function stamp(date,time){return date&&time?`${date}T${time}`:"";}
function stampMs(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:null;}
function dpart(v){return v?.slice?.(0,10)||"";}
function tpart(v){return v?.slice?.(11,16)||"";}
function minuteOf(t){if(!/^\d{2}:\d{2}$/.test(t||""))return null;const [h,m]=t.split(":").map(Number);return h*60+m;}
function duration(r){const a=stampMs(r.startDateTime),b=stampMs(r.endDateTime);return a!=null&&b!=null&&b>a?Math.round((b-a)/60000):null;}
function fmtDuration(min){if(min==null)return "—";const h=Math.floor(min/60),m=min%60;return h?(m?`${h}h${m}m`:`${h}h`):`${m}分钟`;}
function fmtStamp(v){if(!v)return "—";const d=dpart(v),t=tpart(v);return `${d.slice(5).replace("-","/")} ${t}`;}
function fmtDay(date){if(!date)return "";const [,m,d]=date.split("-");return `${Number(m)}月${Number(d)}日`;}
function overlapMinutes(a,b){
  const a0=stampMs(a.startDateTime),a1=stampMs(a.endDateTime),b0=stampMs(b.startDateTime),b1=stampMs(b.endDateTime);
  if([a0,a1,b0,b1].some(x=>x==null))return 0;
  return Math.max(0,Math.min(a1,b1)-Math.max(a0,b0))/60000;
}
function nowClock(){const d=new Date();return {date:dateKey(d),time:`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`};}
function escapeHTML(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function showToast(text){
  const toast=$("toast"),txt=$("toastText"),btn=$("toastAction");
  if(!toast||!txt)return;
  txt.textContent=text;btn?.classList.add("hidden");toast.classList.remove("hidden");
  clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.add("hidden"),3600);
}
function methodChoices(selected=""){
  return `<div class="sleep-method-grid">${SLEEP_METHODS.map(m=>`<button type="button" class="sleep-method-chip ${m===selected?"active":""}" data-sleep-method="${m}">${m}</button>`).join("")}</div>`;
}
function selectedMethod(){return document.querySelector("#sleepV2Modal .sleep-method-chip.active")?.dataset.sleepMethod||"";}
function bindMethodChoices(root){
  root.querySelectorAll("[data-sleep-method]").forEach(btn=>btn.onclick=e=>{
    e.preventDefault();const was=btn.classList.contains("active");
    root.querySelectorAll("[data-sleep-method]").forEach(x=>x.classList.remove("active"));
    if(!was)btn.classList.add("active");
  });
}
async function profileBedtimeMinutes(){
  try{const id=await getSetting("currentProfileId","");if(!id)return null;const p=await getProfile(id);return minuteOf(p?.stage?.weekday?.bedtime||p?.stage?.weekend?.bedtime||"");}catch{return null;}
}
function circularDistance(a,b){const d=Math.abs(a-b);return Math.min(d,1440-d);}
function basicClassify(r,bedtimeMin=null){
  if(r.nightAnchor)return {kind:"night",confidence:1,reason:"晚安/早安锚点"};
  const mins=duration(r);if(mins==null)return {kind:"uncertain",confidence:0,reason:"记录未完整"};
  const sm=minuteOf(tpart(r.startDateTime)),em=minuteOf(tpart(r.endDateTime)),cross=dpart(r.startDateTime)!==dpart(r.endDateTime);
  if(cross&&mins>=120)return {kind:"night",confidence:.98,reason:"跨午夜睡眠"};
  if(mins>=300&&(sm>=17*60||em<=10*60))return {kind:"night",confidence:.94,reason:"长时夜间睡眠"};
  if(bedtimeMin!=null&&sm!=null&&circularDistance(sm,bedtimeMin)<=120&&mins>=180)return {kind:"night",confidence:.9,reason:"接近典型入睡时间"};
  if(!cross&&mins<=210&&sm>=6*60&&em<=18*60+30)return {kind:"nap",confidence:.96,reason:"典型日间短睡"};
  if(!cross&&mins<=150&&sm>=7*60&&em<=20*60)return {kind:"nap",confidence:.86,reason:"较高概率日间睡眠"};
  return {kind:"uncertain",confidence:.45,reason:"缺少足够边界证据"};
}
function live(records,type){return records.filter(r=>r.type===type&&!r.deleted&&r.status==="confirmed");}
function nightAnchorFor(records,nightKey){
  return live(records,"sleep").filter(r=>r.nightAnchor&&r.nightKey===nightKey).sort((a,b)=>stampMs(b.updatedAt)-stampMs(a.updatedAt))[0]||null;
}
function inferredNightForDate(records,pageDate,bedtimeMin){
  const sleeps=live(records,"sleep").filter(r=>!r.nightAnchor&&duration(r)!=null&&dpart(r.endDateTime)===pageDate);
  return sleeps.filter(r=>basicClassify(r,bedtimeMin).kind==="night").sort((a,b)=>stampMs(a.startDateTime)-stampMs(b.startDateTime));
}
function wakesForNight(records,nightKey){
  const wakes=live(records,"wake");
  const explicit=wakes.filter(r=>r.nightKey===nightKey);
  if(explicit.length)return explicit.sort((a,b)=>(a.wakeTime||"").localeCompare(b.wakeTime||""));
  return wakes.filter(r=>!r.nightKey&&r.date===nightKey).sort((a,b)=>(a.wakeTime||"").localeCompare(b.wakeTime||""));
}
async function analysisForDate(pageDate){
  const records=await getAllRecords(),bedtime=await profileBedtimeMinutes();
  const anchor=nightAnchorFor(records,pageDate);
  const inferred=anchor?[]:inferredNightForDate(records,pageDate,bedtime);
  const night=anchor?[anchor]:inferred;
  const nightIds=new Set(night.map(r=>r.id));
  const naps=[],uncertain=[];
  for(const r of live(records,"sleep")){
    if(r.nightAnchor||nightIds.has(r.id)||duration(r)==null)continue;
    if(dpart(r.startDateTime)!==pageDate||dpart(r.endDateTime)!==pageDate)continue;
    const c=basicClassify(r,bedtime);if(c.kind==="nap"&&c.confidence>=.8)naps.push(r);else if(c.kind==="uncertain")uncertain.push(r);
  }
  const wakes=wakesForNight(records,pageDate);
  const wakeEarly=wakes.filter(r=>r.result==="no_resleep"||(minuteOf(r.wakeTime)!=null&&minuteOf(r.wakeTime)<330)).sort((a,b)=>(a.wakeTime||"").localeCompare(b.wakeTime||""))[0]||null;
  let inferredEarly=null;
  const finalEnd=night.map(r=>r.endDateTime).filter(Boolean).sort().at(-1);
  const endMin=minuteOf(tpart(finalEnd));if(!wakeEarly&&endMin!=null&&endMin<330)inferredEarly=tpart(finalEnd);
  return {records,bedtime,anchor,night,naps,uncertain,wakes,wakeEarly,inferredEarly};
}
async function repairLegacyNightAnchors(){
  const records=await getAllRecords();
  for(const r of records){
    if(r.type!=="sleep"||r.deleted||r.nightAnchor||r.source!=="migration_v2_night_sleep")continue;
    const nightKey=dpart(r.endDateTime)||r.date;
    if(!nightKey)continue;
    await putRecord({...r,nightAnchor:true,nightKey,updatedAt:new Date().toISOString()});
  }
}
function ensureNightCardShell(){
  const input=$("nightSleepAt");if(!input)return null;
  const card=input.closest(".card.pad");if(!card)return null;
  card.dataset.nightSleepV2="1";
  const title=card.querySelector(".card-title"),sub=card.querySelector(".card-sub");
  if(title)title.textContent="夜间睡眠";
  if(sub)sub.textContent="早安、晚安常驻；昨夜记录在这里统一汇总";
  const fields=input.closest(".fields2");if(fields)fields.classList.add("sleep-v2-legacy-hidden");
  card.querySelectorAll("[data-sleep-method-night]").forEach(x=>x.classList.add("sleep-v2-legacy-hidden"));
  Array.from(card.querySelectorAll(".hint")).forEach(x=>x.classList.add("sleep-v2-legacy-hidden"));
  let actions=$("nightAnchorActions");
  if(!actions){
    actions=document.createElement("div");actions.id="nightAnchorActions";actions.className="night-anchor-actions";
    actions.innerHTML=`<button type="button" class="night-anchor-btn goodnight" data-goodnight><span class="night-anchor-icon">☾</span><b>晚安</b><small data-goodnight-status>记录今晚入睡</small></button><button type="button" class="night-anchor-btn morning" data-morning><span class="night-anchor-icon">☀</span><b>早安</b><small data-morning-status>记录最终起床</small></button>`;
    fields?.insertAdjacentElement("afterend",actions);
  }
  let box=$("lastNightSummary");if(!box){box=document.createElement("div");box.id="lastNightSummary";box.className="last-night-summary";actions.insertAdjacentElement("afterend",box);}
  return box;
}
async function renderNightCard(pageDate){
  const box=ensureNightCardShell();if(!box)return;
  const a=await analysisForDate(pageDate),tonightKey=shiftDateKey(pageDate,1),tonight=nightAnchorFor(a.records,tonightKey);
  const goodStatus=$("nightAnchorActions")?.querySelector("[data-goodnight-status]");
  const morningStatus=$("nightAnchorActions")?.querySelector("[data-morning-status]");
  if(goodStatus)goodStatus.textContent=tonight?.startDateTime?`已记录 ${tpart(tonight.startDateTime)}`:`${fmtDay(pageDate)}晚`;
  if(morningStatus)morningStatus.textContent=a.anchor?.endDateTime?`已记录 ${tpart(a.anchor.endDateTime)}`:`${fmtDay(pageDate)}早`;

  if(!a.night.length){
    box.innerHTML=`<div class="last-night-section-title">昨夜</div><div class="last-night-empty"><b>还没有完整的昨夜睡眠</b><span>可以直接点“早安”补昨晚入睡和最终起床；普通小睡不会被自动当成昨夜。</span></div>`;
    return;
  }
  const first=a.night[0],start=first.startDateTime||"",end=a.night.map(r=>r.endDateTime).filter(Boolean).sort().at(-1)||"",total=a.night.reduce((s,r)=>s+(duration(r)||0),0),early=a.wakeEarly?.wakeTime||a.inferredEarly||"";
  box.innerHTML=`<div class="last-night-section-title">昨夜</div><div class="last-night-main"><div><small>睡眠窗口</small><b>${fmtStamp(start)} → ${end?fmtStamp(end):"待补充"}</b></div><div><small>${end?"已记录睡眠":"入睡方式"}</small><b>${end?fmtDuration(total):(first.sleepMethod||"未记录")}</b></div></div>
    <div class="last-night-facts">${first.sleepMethod&&end?`<span>${escapeHTML(first.sleepMethod)}</span>`:""}<span>夜醒 ${a.wakes.length} 次</span>${early?`<span class="sleep-v2-warn">疑似早醒 ${early}</span>`:""}${!a.anchor?`<span>系统推测</span>`:""}</div>
    <div class="last-night-note">${a.anchor?"由晚安 / 早安与夜醒记录汇总。":"尚无早安/晚安锚点，暂按已有睡眠记录推测。"}</div>`;
}
async function patchMetrics(pageDate){
  const metrics=$("metrics");if(!metrics)return;const items=Array.from(metrics.querySelectorAll(".metric"));if(items.length<4)return;
  const a=await analysisForDate(pageDate),napMin=a.naps.reduce((s,r)=>s+(duration(r)||0),0),set=(el,sel,text)=>{const n=el.querySelector(sel);if(n&&n.textContent!==text)n.textContent=text;};
  set(items[0],"b",`${a.naps.length} 觉`);set(items[0],"small","小睡");
  set(items[1],"b",napMin?fmtDuration(napMin):"—");set(items[1],"small",a.uncertain.length?`小睡总计 · ${a.uncertain.length}段待判断`:"小睡总计");
  set(items[3],"b",a.wakeEarly?.wakeTime||a.inferredEarly||"—");set(items[3],"small","疑似早醒");
}
function ensureModal(){
  let overlay=$("sleepV2Modal");if(overlay)return overlay;
  overlay=document.createElement("div");overlay.id="sleepV2Modal";overlay.className="sleep-v2-overlay hidden";document.body.appendChild(overlay);return overlay;
}
function setModal(html){const overlay=ensureModal();overlay.innerHTML=html;overlay.classList.remove("hidden");bindMethodChoices(overlay);}
function modalShell(title,body,saveLabel="保存"){
  return `<div class="sleep-v2-card" role="dialog" aria-modal="true"><div class="sleep-v2-head"><b>${title}</b><button type="button" data-sleep-v2-close aria-label="关闭">×</button></div><div class="sleep-v2-body">${body}</div><div class="sleep-v2-actions"><button type="button" class="secondary" data-sleep-v2-cancel>取消</button><button type="button" class="primary" data-sleep-v2-save>${saveLabel}</button></div></div>`;
}
function timeField(id,label,value=""){
  return `<label>${label}<div class="sleep-v2-time"><input id="${id}" type="time" value="${escapeHTML(value)}"><button type="button" data-sleep-v2-now="${id}">现在</button></div></label>`;
}
function hideModal(){ensureModal().classList.add("hidden");modalState=null;}
async function openSleepModal(record=null){
  const pageDate=$("pageDate")?.value||dateKey(new Date()),start=tpart(record?.startDateTime)||"",end=tpart(record?.endDateTime)||"";
  modalState={kind:"sleep",record,pageDate};
  setModal(modalShell(record?.id?"修改睡眠":"记录睡眠",`<div class="sleep-v2-pair">${timeField("sleepV2StartTime","睡着时间",start)}${timeField("sleepV2EndTime","醒来时间",end)}</div><div class="sleep-v2-hint">无需选择日期。结束时间早于开始时间时，系统按跨午夜睡眠处理；异常超长记录会在保存前再次确认。</div><label>入睡方式${methodChoices(record?.sleepMethod||"")}</label><label>备注<input id="sleepV2Note" type="text" value="${escapeHTML(record?.note||"")}" placeholder="例如：抱哄后放床；这觉特别短"></label><div id="sleepV2Conflict" class="sleep-v2-conflict hidden"></div>`));
}
function sleepCandidate(){
  const old=modalState?.record||{},pageDate=modalState?.pageDate||($("pageDate")?.value||dateKey(new Date())),st=$("sleepV2StartTime")?.value||"",et=$("sleepV2EndTime")?.value||"";
  let start="",end="";
  if(st&&et&&et<st){start=stamp(shiftDateKey(pageDate,-1),st);end=stamp(pageDate,et);}else{start=st?stamp(pageDate,st):"";end=et?stamp(pageDate,et):"";}
  if(old.id){
    if(st)start=stamp(dpart(old.startDateTime)||pageDate,st);
    if(et){let ed=dpart(old.endDateTime)||dpart(start)||pageDate;if(start&&et<tpart(start)&&ed===dpart(start))ed=shiftDateKey(ed,1);end=stamp(ed,et);}
  }
  return {...old,id:old.id||crypto.randomUUID(),date:dpart(end)||dpart(start)||pageDate,type:"sleep",status:"confirmed",deleted:false,startDateTime:start,endDateTime:end,sleepMethod:selectedMethod(),note:$("sleepV2Note")?.value.trim()||"",createdAt:old.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}
async function findConflict(candidate){
  if(duration(candidate)==null)return null;const all=await getAllRecords();
  return live(all,"sleep").find(r=>r.id!==candidate.id&&duration(r)!=null&&overlapMinutes(r,candidate)>0)||null;
}
function warningBox(title,lines,confirmText,onConfirm){
  const box=$("sleepV2Conflict");if(!box)return;box.classList.remove("hidden");box.innerHTML=`<b>${title}</b>${lines.map(x=>`<span>${escapeHTML(x)}</span>`).join("")}<div><button type="button" class="secondary" data-sleep-v2-back>返回修改</button><button type="button" class="primary" data-sleep-v2-force>${confirmText}</button></div>`;
  box.querySelector("[data-sleep-v2-back]").onclick=()=>box.classList.add("hidden");box.querySelector("[data-sleep-v2-force]").onclick=onConfirm;
}
function refreshAppDay(){const p=$("pageDate");if(p)p.dispatchEvent(new Event("change",{bubbles:true}));scheduleRefresh(80);}
async function mergeConflict(existing,candidate){
  const starts=[existing.startDateTime,candidate.startDateTime].filter(Boolean).sort(),ends=[existing.endDateTime,candidate.endDateTime].filter(Boolean).sort(),start=starts[0]||"",end=ends.at(-1)||"";
  await putRecord({...existing,startDateTime:start,endDateTime:end,date:dpart(end)||dpart(start)||existing.date,sleepMethod:existing.sleepMethod||candidate.sleepMethod||"",note:[existing.note,candidate.note].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join("；"),updatedAt:new Date().toISOString()});
  if(candidate.id!==existing.id&&modalState?.record?.id)await putRecord({...candidate,deleted:true,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  hideModal();refreshAppDay();showToast(`已合并为 ${fmtStamp(start)} → ${fmtStamp(end)}`);
}
async function persistSleep(c){await putRecord(c);hideModal();refreshAppDay();showToast("睡眠已保存");}
async function saveOrdinarySleep(){
  const c=sleepCandidate();if(!c.startDateTime&&!c.endDateTime)return showToast("至少填写一个睡眠时间");
  if(c.startDateTime&&c.endDateTime&&stampMs(c.endDateTime)<=stampMs(c.startDateTime))return showToast("醒来时间必须晚于睡着时间");
  const mins=duration(c);if(mins!=null&&mins>16*60){
    return warningBox("这段睡眠超过 16 小时",[`${fmtStamp(c.startDateTime)} → ${fmtStamp(c.endDateTime)}`,"请确认没有把结束时间误当成跨日时间。"],"仍然保存",()=>persistSleep(c));
  }
  const conflict=await findConflict(c);if(conflict){
    return warningBox(conflict.nightAnchor?"与夜间睡眠记录重叠":"与已有睡眠记录重叠",[`已有：${fmtStamp(conflict.startDateTime)} → ${fmtStamp(conflict.endDateTime)}`,`本次：${fmtStamp(c.startDateTime)} → ${fmtStamp(c.endDateTime)}`],"合并记录",()=>mergeConflict(conflict,c));
  }
  await persistSleep(c);
}
async function openGoodnight(){
  const pageDate=$("pageDate")?.value||dateKey(new Date()),nightKey=shiftDateKey(pageDate,1),records=await getAllRecords(),existing=nightAnchorFor(records,nightKey),defaultTime=existing?tpart(existing.startDateTime):(pageDate===dateKey(new Date())?nowClock().time:"");
  modalState={kind:"goodnight",record:existing,pageDate,nightKey};
  setModal(modalShell("晚安",`${timeField("nightStartTime","入睡时间",defaultTime)}<label>入睡方式${methodChoices(existing?.sleepMethod||"")}</label><label>备注<input id="sleepV2Note" type="text" value="${escapeHTML(existing?.note||"")}" placeholder="可选"></label><div class="sleep-v2-hint">记录 ${fmtDay(pageDate)} 晚的夜间主睡开始。再次记录会修改同一晚，不会新建第二条。</div>`,existing?"保存修改":"记录晚安"));
}
async function saveGoodnight(){
  const time=$("nightStartTime")?.value||"";if(!time)return showToast("请填写入睡时间");
  const old=modalState.record||{},start=stamp(modalState.pageDate,time),record={...old,id:old.id||crypto.randomUUID(),date:modalState.nightKey,type:"sleep",status:"confirmed",deleted:false,nightAnchor:true,nightKey:modalState.nightKey,startDateTime:start,endDateTime:old.endDateTime||"",sleepMethod:selectedMethod(),note:$("sleepV2Note")?.value.trim()||"",createdAt:old.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(record.endDateTime&&stampMs(record.endDateTime)<=stampMs(record.startDateTime))return showToast("入睡时间必须早于已经记录的早安时间");
  await putRecord(record);hideModal();refreshAppDay();showToast(old.id?"晚安已更新":"晚安已记录");
}
function wakeListHtml(wakes){
  if(!wakes.length)return `<div class="morning-wake-empty">昨夜还没有夜醒记录</div>`;
  return wakes.map(w=>`<div class="morning-wake-row"><span>${escapeHTML(w.wakeTime||"—")}${w.resleepTime?` → ${escapeHTML(w.resleepTime)}`:""}</span><small>${escapeHTML(w.resultLabel||"")}</small></div>`).join("");
}
async function openMorning(){
  const pageDate=$("pageDate")?.value||dateKey(new Date()),records=await getAllRecords(),anchor=nightAnchorFor(records,pageDate),wakes=wakesForNight(records,pageDate),defaultEnd=anchor?.endDateTime?tpart(anchor.endDateTime):(pageDate===dateKey(new Date())?nowClock().time:"");
  modalState={kind:"morning",record:anchor,pageDate,nightKey:pageDate};
  const missing=!anchor?.startDateTime;
  setModal(modalShell("早安",`${missing?`<div class="sleep-v2-hint strong">昨晚还没有记录晚安，请补充昨晚入睡时间和方式。</div>${timeField("nightStartTime","昨晚几点睡着","")}<label>入睡方式${methodChoices("")}</label>`:`<div class="morning-known"><small>昨晚入睡</small><b>${tpart(anchor.startDateTime)}${anchor.sleepMethod?` · ${escapeHTML(anchor.sleepMethod)}`:""}</b></div>`}${timeField("nightEndTime","最终起床时间",defaultEnd)}<div class="morning-wakes"><div class="morning-wakes-head"><b>昨夜夜醒</b><button type="button" class="secondary" data-add-wake-from-morning>＋ 补充夜醒</button></div>${wakeListHtml(wakes)}</div><div id="sleepV2Conflict" class="sleep-v2-conflict hidden"></div>`,anchor?.endDateTime?"保存修改":"完成早安"));
}
async function saveMorning(force=false){
  const old=modalState.record||{},endTime=$("nightEndTime")?.value||"";if(!endTime)return showToast("请填写最终起床时间");
  const startTime=old.startDateTime?tpart(old.startDateTime):($("nightStartTime")?.value||"");if(!startTime)return showToast("请补充昨晚入睡时间");
  const start=old.startDateTime||stamp(shiftDateKey(modalState.pageDate,-1),startTime),end=stamp(modalState.pageDate,endTime),mins=Math.round((stampMs(end)-stampMs(start))/60000);
  if(mins<=0)return showToast("最终起床时间必须晚于昨晚入睡时间");
  if(mins>18*60&&!force)return warningBox("整夜睡眠超过 18 小时",[`${fmtStamp(start)} → ${fmtStamp(end)}`,"请确认早安时间或昨晚入睡时间没有填错。"],"确认无误",()=>saveMorning(true));
  const record={...old,id:old.id||crypto.randomUUID(),date:modalState.pageDate,type:"sleep",status:"confirmed",deleted:false,nightAnchor:true,nightKey:modalState.pageDate,startDateTime:start,endDateTime:end,sleepMethod:old.sleepMethod||selectedMethod(),note:old.note||"",createdAt:old.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  const conflict=await findConflict(record);if(conflict&&!conflict.nightAnchor&&!force)return warningBox("昨夜与普通睡眠记录重叠",[`已有：${fmtStamp(conflict.startDateTime)} → ${fmtStamp(conflict.endDateTime)}`,"可能是同一段夜间睡眠，也可能是误录。"],"保留两条",()=>saveMorning(true));
  await putRecord(record);hideModal();refreshAppDay();showToast(old.id?"早安已更新":"早安已记录");
}
function wakeChoiceMarkup(pageDate,selected){
  const prev=pageDate,next=shiftDateKey(pageDate,1);
  return `<div id="wakeNightChoice" class="wake-night-choice"><button type="button" class="${selected===prev?"active":""}" data-wake-night-key="${prev}"><b>昨晚</b><span>${fmtDay(shiftDateKey(pageDate,-1))}晚 → ${fmtDay(pageDate)}早</span></button><button type="button" class="${selected===next?"active":""}" data-wake-night-key="${next}"><b>今晚</b><span>${fmtDay(pageDate)}晚 → ${fmtDay(next)}早</span></button></div>`;
}
function defaultWakeNightKey(pageDate,wakeTime){
  if(forcedWakeNightKey)return forcedWakeNightKey;
  const m=minuteOf(wakeTime);return m!=null&&m<12*60?pageDate:shiftDateKey(pageDate,1);
}
async function injectWakeNightChoice(){
  const modal=$("modal");if(!modal||modal.classList.contains("hidden")||!$("fWake")||$("wakeNightField"))return;
  const pageDate=$("pageDate")?.value||dateKey(new Date()),record=editingWakeId?await getRecord(editingWakeId):null,selected=record?.nightKey||defaultWakeNightKey(pageDate,$("fWake").value);
  const label=document.createElement("label");label.id="wakeNightField";label.className="form-label";label.innerHTML=`属于哪一晚${wakeChoiceMarkup(pageDate,selected)}`;
  const result=$("fWakeResult")?.closest("label");if(result)result.insertAdjacentElement("beforebegin",label);else $("modalBody")?.appendChild(label);
  const activate=key=>label.querySelectorAll("[data-wake-night-key]").forEach(b=>b.classList.toggle("active",b.dataset.wakeNightKey===key));
  label.querySelectorAll("[data-wake-night-key]").forEach(b=>b.onclick=e=>{e.preventDefault();activate(b.dataset.wakeNightKey);});
  $("fWake").addEventListener("change",()=>{if(record?.nightKey||forcedWakeNightKey)return;activate(defaultWakeNightKey(pageDate,$("fWake").value));});
}
function selectedWakeNightKey(){return document.querySelector("#wakeNightChoice [data-wake-night-key].active")?.dataset.wakeNightKey||"";}
function prepareWakeSave(){
  if(!$("fWake")||!$("wakeNightField"))return;
  wakeSaveContext={editingId:editingWakeId,date:$("pageDate")?.value||dateKey(new Date()),wakeTime:$("fWake").value,nightKey:selectedWakeNightKey(),startedAt:Date.now()};
  editingWakeId=null;
  setTimeout(persistWakeNightKey,80);
}
async function persistWakeNightKey(){
  const c=wakeSaveContext;if(!c?.nightKey)return;
  let record=null;
  for(let i=0;i<10&&!record;i++){
    if(i)await new Promise(r=>setTimeout(r,70));
    if(c.editingId)record=await getRecord(c.editingId);else{
      const rows=await getRecordsByDate(c.date,{includeDeleted:false});
      record=rows.filter(r=>r.type==="wake"&&r.wakeTime===c.wakeTime&&Date.parse(r.createdAt||0)>=c.startedAt-2500).sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0))[0]||null;
    }
  }
  if(record&&record.nightKey!==c.nightKey)await putRecord({...record,nightKey:c.nightKey,updatedAt:new Date().toISOString()});
  wakeSaveContext=null;forcedWakeNightKey="";scheduleRefresh(80);
  if(wakeReturnToMorning){wakeReturnToMorning=false;setTimeout(()=>openMorning(),140);}
}
function decorateTimeline(){
  document.querySelectorAll("#timeline [data-edit-id]").forEach(async btn=>{
    const r=await getRecord(btn.dataset.editId),sub=btn.closest(".row")?.querySelector(".rowsub");if(!sub||!r)return;
    if(r.type==="sleep"&&r.sleepMethod&&!sub.dataset.sleepMethodDecorated){sub.dataset.sleepMethodDecorated="1";sub.textContent=[sub.textContent,r.sleepMethod].filter(Boolean).join(" · ");}
    if(r.type==="wake"&&r.nightKey&&!sub.dataset.nightKeyDecorated){sub.dataset.nightKeyDecorated="1";sub.textContent=[sub.textContent,`归属 ${fmtDay(r.nightKey)}昨夜`].filter(Boolean).join(" · ");}
  });
}
function scheduleRefresh(delay=40){clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshAll,delay);}
async function refreshAll(){const pageDate=$("pageDate")?.value||dateKey(new Date());lastPageDate=pageDate;try{await Promise.all([renderNightCard(pageDate),patchMetrics(pageDate)]);decorateTimeline();}catch(e){console.warn("Sleep V2 refresh failed",e);}}
function bindEvents(){
  document.addEventListener("click",async e=>{
    const t=e.target instanceof Element?e.target:null;if(!t)return;
    const quick=t.closest('[data-quick="sleep"],[data-more="sleep"]');if(quick){e.preventDefault();e.stopImmediatePropagation();await openSleepModal();return;}
    if(t.closest("[data-goodnight]")){e.preventDefault();await openGoodnight();return;}
    if(t.closest("[data-morning]")){e.preventDefault();await openMorning();return;}
    const edit=t.closest("[data-edit-id]");if(edit){const r=await getRecord(edit.dataset.editId);if(r?.type==="sleep"){e.preventDefault();e.stopImmediatePropagation();await openSleepModal(r);return;}if(r?.type==="wake")editingWakeId=r.id;}
    if(t.closest('[data-quick="wake"],[data-more="wake"]'))editingWakeId=null;
    if(t.closest("[data-sleep-v2-close],[data-sleep-v2-cancel]")){e.preventDefault();hideModal();return;}
    if(t.closest("[data-add-wake-from-morning]")){e.preventDefault();forcedWakeNightKey=modalState?.nightKey||($("pageDate")?.value||dateKey(new Date()));wakeReturnToMorning=true;hideModal();const direct=document.querySelector('[data-quick="wake"]');if(direct)direct.click();else{const more=document.querySelector('[data-more="wake"]');if(more)more.click();else showToast("请从“更多记录”进入夜间醒来");}return;}
    if(t.closest("[data-sleep-v2-save]")){e.preventDefault();if(modalState?.kind==="sleep")await saveOrdinarySleep();else if(modalState?.kind==="goodnight")await saveGoodnight();else if(modalState?.kind==="morning")await saveMorning();return;}
    const now=t.closest("[data-sleep-v2-now]");if(now){const input=$(now.dataset.sleepV2Now);if(input)input.value=nowClock().time;return;}
    if(t.closest("#modalSave,#modalSaveContinue"))prepareWakeSave();
    if(t.closest("#modalCancel,#modalClose")){editingWakeId=null;forcedWakeNightKey="";wakeReturnToMorning=false;}
    if(t.closest("#prevDay,#nextDay,#todayBtn,[data-history-date]"))scheduleRefresh(120);
  },true);
  $("pageDate")?.addEventListener("change",()=>scheduleRefresh(100));
  const modal=$("modal");if(modal)new MutationObserver(()=>injectWakeNightChoice().catch(e=>console.warn("Wake night choice failed",e))).observe(modal,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
  const timeline=$("timeline");if(timeline)new MutationObserver(()=>scheduleRefresh(70)).observe(timeline,{childList:true,subtree:true});
  setInterval(()=>{const d=$("pageDate")?.value||"";if(d&&d!==lastPageDate)scheduleRefresh(0);},1500);
}

async function init(){injectStyle();ensureModal();ensureNightCardShell();await repairLegacyNightAnchors();bindEvents();scheduleRefresh(120);}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>init().catch(console.error),{once:true});else init().catch(console.error);
