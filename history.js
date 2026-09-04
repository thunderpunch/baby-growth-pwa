import {getDaysInRange,getRecordsInRange} from "./db.js";
import {isStrictDayNap,occurredLocal,recordDurationMinutes,shiftDateKey,validDateKey,wakeLocalRange} from "./record-model.js";

const $=id=>document.getElementById(id);
const pad2=n=>String(n).padStart(2,"0");
let mode="recent";
let monthKey="";
let renderToken=0;

export function validMonthKey(value){
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value||"");
}

export function shiftMonthKey(value,delta){
  if(!validMonthKey(value))throw new Error("invalid month key");
  const [year,month]=value.split("-").map(Number);
  const d=new Date(year,month-1+delta,1,12,0,0,0);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
}

export function monthRange(value){
  if(!validMonthKey(value))throw new Error("invalid month key");
  const [year,month]=value.split("-").map(Number);
  const last=new Date(year,month,0,12,0,0,0).getDate();
  return {start:`${value}-01`,end:`${value}-${pad2(last)}`};
}

function localDateKey(date=new Date()){
  return `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`;
}

function localMonthKey(date=new Date()){
  return `${date.getFullYear()}-${pad2(date.getMonth()+1)}`;
}

export function recentRange(end=localDateKey()){
  if(!validDateKey(end))throw new Error("invalid end date");
  return {start:shiftDateKey(end,-29),end};
}

function parseDateKey(value){
  return new Date(`${value}T12:00:00`);
}

function weekdayCN(value){
  return ["周日","周一","周二","周三","周四","周五","周六"][parseDateKey(value).getDay()];
}

export function monthLabel(value,currentYear=new Date().getFullYear()){
  const [year,month]=value.split("-").map(Number);
  return year===Number(currentYear)?`${month}月`:`${year}年 ${month}月`;
}

export function historyDateLabel(value,currentYear=new Date().getFullYear()){
  const d=parseDateKey(value);
  const year=d.getFullYear();
  const prefix=year===Number(currentYear)?"":`${year}年 `;
  return `${prefix}${d.getMonth()+1}月${d.getDate()}日 · ${weekdayCN(value)}`;
}

function escapeHTML(value=""){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function hasDayContext(day){
  return !!((day?.context?.tags||[]).length||day?.context?.note||day?.nightSleep?.sleepAt||day?.nightSleep?.wakeAt);
}
function fmtDuration(minutes){
  if(!Number.isFinite(minutes)||minutes<=0)return "";
  const rounded=Math.round(minutes),hour=Math.floor(rounded/60),rest=rounded%60;
  return hour?(rest?`${hour}h${rest}m`:`${hour}h`):`${rest}分钟`;
}
export function summarizeHistoryDay(date,records,day=null){
  const confirmed=(records||[]).filter(record=>record.status==="confirmed"&&!record.deleted);
  const sleeps=confirmed.filter(record=>record.type==="sleep");
  const nights=sleeps.filter(record=>record.nightAnchor&&Number.isFinite(recordDurationMinutes(record)));
  const naps=sleeps.filter(record=>isStrictDayNap(record)&&record.date===date);
  const milk=confirmed.filter(record=>record.type==="milk");
  const diet=confirmed.filter(record=>record.type==="diet");
  const diapers=confirmed.filter(record=>record.type==="diaper");
  const stools=diapers.filter(record=>String(record.diaperType||"").includes("便"));
  const wakes=confirmed.filter(record=>record.type==="wake");
  const health=confirmed.filter(record=>record.type==="health");
  const temperatures=health.map(record=>Number(record.temperature)).filter(Number.isFinite);
  const stoolTimes=stools.map(record=>occurredLocal(record).time||record.time||"").filter(Boolean).sort();
  const wakeTimes=wakes.map(record=>wakeLocalRange(record).wakeTime||record.wakeTime||"").filter(Boolean).sort();
  return {
    confirmedCount:confirmed.length,
    pendingCount:(records||[]).filter(record=>record.status==="pending"&&!record.deleted).length,
    nightMinutes:nights.reduce((sum,record)=>sum+(recordDurationMinutes(record)||0),0),
    napCount:naps.length,
    napMinutes:naps.reduce((sum,record)=>sum+(recordDurationMinutes(record)||0),0),
    milkCount:milk.length,
    milkTotal:milk.reduce((sum,record)=>sum+(Number(record.amount)||0),0),
    dietCount:diet.length,
    diaperCount:diapers.length,
    stoolCount:stools.length,
    stoolTimes,
    wakeCount:wakes.length,
    wakeTimes,
    healthCount:health.length,
    maxTemperature:temperatures.length?Math.max(...temperatures):null,
    contextTags:day?.context?.tags||[],
    hasContext:hasDayContext(day)
  };
}
function historyFact(label,value,extra=""){
  return `<div class="history-fact ${extra}"><span>${escapeHTML(label)}</span><b>${escapeHTML(value)}</b></div>`;
}

function ensureStyle(){
  if(document.querySelector('link[data-history-style]'))return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL("./history.css",import.meta.url).href;
  link.dataset.historyStyle="1";
  document.head.appendChild(link);
}

function ensureBrowser(){
  const grid=$("historyGrid");
  if(!$("historyView")||!grid)return null;
  let browser=$("historyBrowser");
  if(browser)return browser;

  browser=document.createElement("section");
  browser.id="historyBrowser";
  browser.className="history-browser";
  browser.setAttribute("aria-label","历史记录浏览范围");
  browser.innerHTML=`
    <button type="button" class="history-recent" data-history-recent aria-pressed="true">最近30天</button>
    <div class="history-range-divider" aria-hidden="true"></div>
    <div class="history-month-nav">
      <button type="button" class="history-arrow" data-history-shift="-1" aria-label="上个月">‹</button>
      <input id="historyMonthPicker" type="month" aria-label="选择月份">
      <button type="button" class="history-arrow" data-history-shift="1" aria-label="下个月">›</button>
    </div>`;

  grid.before(browser);
  monthKey=localMonthKey();
  $("historyMonthPicker").value=monthKey;

  browser.addEventListener("click",event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    if(target.closest("[data-history-recent]")){setRecent();return;}
    const shift=target.closest("[data-history-shift]");
    if(shift)setMonth(shiftMonthKey(monthKey,Number(shift.dataset.historyShift)||0));
  });
  $("historyMonthPicker")?.addEventListener("change",event=>{
    const value=event.target.value;
    if(validMonthKey(value))setMonth(value);
  });
  grid.addEventListener("click",event=>{
    const target=event.target instanceof Element?event.target.closest("[data-history-date]"):null;
    if(target?.dataset.historyDate)openDate(target.dataset.historyDate);
  });
  return browser;
}

function updateModeUI(){
  const recent=document.querySelector("[data-history-recent]");
  if(recent){
    const active=mode==="recent";
    recent.classList.toggle("active",active);
    recent.setAttribute("aria-pressed",String(active));
  }
}

function setRecent({render=true}={}){
  mode="recent";
  updateModeUI();
  if(render)void renderRange();
}

function setMonth(value,{render=true}={}){
  if(!validMonthKey(value))return;
  mode="month";
  monthKey=value;
  const picker=$("historyMonthPicker");
  if(picker&&picker.value!==value)picker.value=value;
  updateModeUI();
  if(render)void renderRange();
}

function switchView(name){
  document.querySelectorAll(".view").forEach(view=>view.classList.toggle("active",view.id===`${name}View`));
  document.querySelectorAll(".nav button").forEach(button=>button.classList.toggle("active",button.dataset.view===name));
}

function openDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||""))return;
  const input=$("pageDate");
  if(!input)return;
  switchView("today");
  input.value=date;
  input.dispatchEvent(new Event("change",{bubbles:true}));
  window.scrollTo({top:0,behavior:"smooth"});
}

function recordMap(records){
  const map=new Map();
  for(const record of records){
    if(record.deleted)continue;
    const list=map.get(record.date)||[];
    list.push(record);
    map.set(record.date,list);
  }
  return map;
}

function renderCard(date,records,day){
  const summary=summarizeHistoryDay(date,records,day);
  const context=summary.hasContext?`<span class="history-context-mark">${summary.contextTags.length?escapeHTML(summary.contextTags.join(" · ")):"有备注"}</span>`:"";
  const pendingText=summary.pendingCount?`<span class="history-pending-mark">${summary.pendingCount} 条待确认</span>`:"";
  const facts=[];
  if(summary.healthCount)facts.push(historyFact("健康",summary.maxTemperature!=null?`最高 ${summary.maxTemperature}℃`:`${summary.healthCount} 条记录`,"history-fact-alert"));
  if(summary.nightMinutes)facts.push(historyFact("夜睡",fmtDuration(summary.nightMinutes)));
  if(summary.napCount)facts.push(historyFact("小睡",`${summary.napCount}次 · ${fmtDuration(summary.napMinutes)}`));
  if(summary.milkCount)facts.push(historyFact("吃奶",`${summary.milkCount}次${summary.milkTotal?` · ${summary.milkTotal}ml`:""}`));
  facts.push(historyFact("粑粑",summary.stoolCount?`${summary.stoolCount}次${summary.stoolTimes.length?` · ${summary.stoolTimes.join(" / ")}`:""}`:"无","history-fact-stool"));
  if(summary.dietCount)facts.push(historyFact("辅食 / 饮食",`${summary.dietCount}次`));
  if(summary.diaperCount)facts.push(historyFact("尿布",`${summary.diaperCount}次`));
  if(summary.wakeCount)facts.push(historyFact("夜醒",`${summary.wakeCount}次${summary.wakeTimes.length?` · ${summary.wakeTimes[0]}`:""}`));
  return `<article class="history-card">
    <div class="history-top">
      <div><b>${historyDateLabel(date)}</b></div>
      <button type="button" class="secondary" data-history-date="${escapeHTML(date)}">查看当天</button>
    </div>
    <div class="history-card-meta"><span>${summary.confirmedCount} 条已确认</span>${pendingText}${context}</div>
    <div class="history-facts">${facts.join("")}</div>
  </article>`;
}

function activeRange(){
  if(mode==="recent")return {...recentRange(),emptyLabel:"最近30天还没有记录",loadingLabel:"正在读取最近30天…"};
  const range=monthRange(monthKey);
  return {...range,emptyLabel:`${monthLabel(monthKey)}还没有记录`,loadingLabel:`正在读取${monthLabel(monthKey)}…`};
}

async function renderRange(){
  const grid=$("historyGrid");
  if(!grid)return;
  const token=++renderToken;
  const range=activeRange();
  grid.innerHTML=`<div class="history-loading">${range.loadingLabel}</div>`;

  try{
    const [records,days]=await Promise.all([
      getRecordsInRange(range.start,range.end),
      getDaysInRange(range.start,range.end)
    ]);
    if(token!==renderToken)return;

    const byDate=recordMap(records);
    const daysByDate=new Map(days.map(day=>[day.date,day]));
    const dates=new Set([...byDate.keys(),...days.filter(hasDayContext).map(day=>day.date)]);
    const sorted=[...dates].sort().reverse();
    grid.innerHTML=sorted.length
      ?sorted.map(date=>renderCard(date,byDate.get(date)||[],daysByDate.get(date))).join("")
      :`<div class="history-empty"><b>${range.emptyLabel}</b><span>有记录后会按日期显示在这里。</span></div>`;
  }catch(error){
    if(token!==renderToken)return;
    grid.innerHTML=`<div class="history-empty"><b>历史记录读取失败</b><span>${escapeHTML(error?.message||error)}</span></div>`;
  }
}

function openHistory(){
  ensureStyle();
  ensureBrowser();
  switchView("history");
  updateModeUI();
  void renderRange();
  window.scrollTo({top:0,behavior:"smooth"});
}

function install(){
  ensureStyle();
  document.addEventListener("click",event=>{
    const target=event.target instanceof Element?event.target.closest('.nav button[data-view="history"]'):null;
    if(!target)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openHistory();
  },true);
}

if(typeof document!=="undefined"){
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
}
