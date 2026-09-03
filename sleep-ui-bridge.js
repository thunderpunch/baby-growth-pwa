import {getRecord} from "./db.js";

const $=id=>document.getElementById(id);
let decorateTimer=null;

function timePart(v){return typeof v==="string"&&v.length>=16?v.slice(11,16):"";}
function stampMs(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:null;}
function durationMinutes(r){
  const a=stampMs(r.startDateTime),b=stampMs(r.endDateTime);
  return a!=null&&b!=null&&b>a?Math.round((b-a)/60000):null;
}
function clockMinutes(start,end){
  if(!/^\d{2}:\d{2}$/.test(start||"")||!/^\d{2}:\d{2}$/.test(end||""))return null;
  const [ah,am]=start.split(":").map(Number),[bh,bm]=end.split(":").map(Number);
  let d=bh*60+bm-(ah*60+am);if(d<0)d+=1440;return d;
}
function fmtDuration(min){
  if(min==null)return "";
  if(min<60)return `${min}分钟`;
  const h=Math.floor(min/60),m=min%60;return m?`${h}h${m}m`:`${h}h`;
}
function fmtDay(v){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return "";
  const [,m,d]=v.split("-");return `${Number(m)}月${Number(d)}日`;
}
function setText(node,text){if(node&&node.textContent!==text)node.textContent=text;}
function sleepLikeRow(edit){
  if(!edit)return false;
  if(edit.dataset.sleepV3Record==="sleep")return true;
  const main=edit.closest(".row")?.querySelector(".rowmain")?.textContent?.trim()||"";
  return main.startsWith("睡眠 ·")||main.startsWith("夜间睡眠 ·");
}
function eventTime(record){
  if(!record)return "99:99";
  if(record.type==="sleep"){
    // A completed overnight record belongs to the morning/final-wake day, so its
    // position in that day's timeline is the good-morning time, not last night's bedtime.
    if(record.nightAnchor&&record.endDateTime)return timePart(record.endDateTime)||record.endTime||"99:99";
    return timePart(record.startDateTime)||record.startTime||timePart(record.endDateTime)||record.endTime||"99:99";
  }
  return record.time||record.wakeTime||"99:99";
}

// The old night-sleep card remains only because app.js still binds its hidden fields.
// Visually, the three sleep widgets are direct siblings in sidecol: 早安 -> 昨晚小结 -> 晚安.
function detachSleepWidgets(){
  const legacyInput=$("nightSleepAt");
  const legacyCard=legacyInput?.closest(".card.pad");
  const sidecol=legacyCard?.parentElement;
  const entries=$("nightSleepEntries");
  const summary=$("lastNightSummary");
  const morning=entries?.querySelector("[data-night-morning]");
  const goodnight=entries?.querySelector("[data-night-goodnight]");
  if(!legacyCard||!sidecol||!morning||!summary||!goodnight)return false;

  if(morning.parentElement!==sidecol)sidecol.insertBefore(morning,legacyCard);
  if(summary.parentElement!==sidecol)sidecol.insertBefore(summary,legacyCard);
  if(goodnight.parentElement!==sidecol)sidecol.insertBefore(goodnight,legacyCard);
  legacyCard.classList.add("sleep-v3-legacy-card");
  legacyCard.style.display="none";
  return true;
}

async function decorateTimeline(){
  const timeline=$("timeline");
  if(!timeline)return;
  const edits=Array.from(timeline.querySelectorAll("[data-edit-id]"));
  await Promise.all(edits.map(async edit=>{
    const row=edit.closest(".row"),main=row?.querySelector(".rowmain"),sub=row?.querySelector(".rowsub"),time=row?.querySelector(".time");
    if(!row||!main||!sub)return;
    const record=await getRecord(edit.dataset.editId);if(!record)return;
    const orderTime=eventTime(record);
    row.dataset.timelineEventTime=orderTime;
    if(record.type==="sleep"){
      edit.dataset.sleepV3Record="sleep";
      const start=timePart(record.startDateTime)||record.startTime||"";
      const end=timePart(record.endDateTime)||record.endTime||"";
      const suffix=end||(record.nightAnchor?"待早安":"?");
      setText(time,orderTime==="99:99"?"—":orderTime);
      setText(main,`${record.nightAnchor?"夜间睡眠":"睡眠"} · ${start||"?"}～${suffix}`);
      const mins=durationMinutes(record)??clockMinutes(record.startTime,record.endTime);
      setText(sub,[fmtDuration(mins),record.sleepMethod].filter(Boolean).join(" · ")||"记录未完整");
    }else if(record.type==="wake"){
      edit.dataset.sleepV3Record="wake";
      setText(sub,[record.resultLabel,record.note,record.nightKey&&`归属 ${fmtDay(record.nightKey)}昨夜`].filter(Boolean).join(" · "));
    }
  }));

  // app.js still sorts with legacy time fields. Reorder only when chronological order
  // actually differs, so the observer stays idempotent and does not trigger itself forever.
  const currentRows=Array.from(timeline.children).filter(node=>node.classList?.contains("row"));
  const sortedRows=[...currentRows].sort((a,b)=>(a.dataset.timelineEventTime||a.querySelector(".time")?.textContent||"99:99")
    .localeCompare(b.dataset.timelineEventTime||b.querySelector(".time")?.textContent||"99:99"));
  const changed=sortedRows.some((row,index)=>row!==currentRows[index]);
  if(changed)for(const row of sortedRows)timeline.appendChild(row);
}
function scheduleDecorate(delay=30){
  clearTimeout(decorateTimer);
  decorateTimer=setTimeout(()=>decorateTimeline().catch(e=>console.warn("Sleep timeline bridge failed",e)),delay);
}

// sleep-v3 owns the actual sleep editor. This capture listener only prevents the legacy
// app.js row handler from opening its old sleep dialog while sleep-v3 resolves the record.
document.addEventListener("click",event=>{
  const target=event.target instanceof Element?event.target:null;
  const edit=target?.closest("[data-edit-id]");
  if(sleepLikeRow(edit)){
    event.preventDefault();
    event.stopImmediatePropagation();
  }
},true);

function init(){
  detachSleepWidgets();
  scheduleDecorate(0);
  const timeline=$("timeline");
  if(timeline)new MutationObserver(()=>scheduleDecorate(30)).observe(timeline,{childList:true,subtree:true});
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
