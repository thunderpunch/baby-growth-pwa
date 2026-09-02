import {getAllRecords,getRecordsByDate,getDay,putRecord} from "./db.js";

const TARGET_IDS = new Set(["prevDay","nextDay","todayBtn","historyTodayBtn"]);
let refreshGuard = false;
let scheduleTimer = null;

function pad2(n){ return String(n).padStart(2,"0"); }
function localDateKey(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function tomorrowKey(){
  const d=new Date();
  d.setDate(d.getDate()+1);
  return localDateKey(d);
}
function dayHasFacts(day){
  return !!(
    day?.nightSleep?.sleepAt || day?.nightSleep?.wakeAt ||
    (day?.context?.tags||[]).length || day?.context?.note
  );
}

async function populateRecentMilk(dateKey){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKey||"") || dateKey>tomorrowKey()) return false;

  const [existing,day]=await Promise.all([
    getRecordsByDate(dateKey,{includeDeleted:true}),
    getDay(dateKey)
  ]);

  // Existing pending/confirmed/deleted milk means the day has already been decided.
  if(existing.some(r=>r.type==="milk")) return false;

  // “Blank page”: no confirmed event and no manually entered day-level facts.
  // Pending diet templates do not block milk prefill.
  if(existing.some(r=>r.status==="confirmed" && !r.deleted) || dayHasFacts(day)) return false;

  const all=await getAllRecords();
  const previousMilk=all.filter(r=>
    r.type==="milk" && r.status==="confirmed" && !r.deleted && r.date<dateKey
  );
  if(!previousMilk.length) return false;

  const sourceDate=previousMilk.reduce((latest,r)=>r.date>latest?r.date:latest,previousMilk[0].date);
  const sources=previousMilk
    .filter(r=>r.date===sourceDate)
    .sort((a,b)=>(a.time||"").localeCompare(b.time||""));

  for(const src of sources){
    const now=new Date().toISOString();
    await putRecord({
      id:`tpl:recent-milk:${dateKey}:${src.id}`,
      date:dateKey,
      type:"milk",
      status:"pending",
      source:"recent_day_template",
      templateSourceId:src.id,
      templateSourceDate:sourceDate,
      time:src.time||"",
      amount:src.amount||"",
      feedType:src.feedType||"",
      createdAt:now,
      updatedAt:now,
      deleted:false
    });
  }
  return sources.length>0;
}

async function checkCurrentDay(){
  if(refreshGuard) return;
  const pageDate=document.getElementById("pageDate");
  if(!pageDate?.value) return;
  try{
    const created=await populateRecentMilk(pageDate.value);
    if(!created) return;
    refreshGuard=true;
    pageDate.dispatchEvent(new Event("change",{bubbles:true}));
    setTimeout(()=>{ refreshGuard=false; },0);
  }catch(error){
    console.warn("Recent milk template prefill failed",error);
  }
}

function scheduleCheck(delay=160){
  clearTimeout(scheduleTimer);
  scheduleTimer=setTimeout(checkCurrentDay,delay);
}

function bindRecentMilkPrefill(){
  scheduleCheck(450);

  document.addEventListener("change",event=>{
    if(refreshGuard) return;
    if(event.target instanceof Element && event.target.id==="pageDate") scheduleCheck(180);
  },true);

  document.addEventListener("click",event=>{
    const target=event.target instanceof Element ? event.target.closest("button") : null;
    if(!target) return;
    if(TARGET_IDS.has(target.id) || target.matches("[data-history-date]")) scheduleCheck(220);
  },false);
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",bindRecentMilkPrefill,{once:true});
}else{
  bindRecentMilkPrefill();
}
