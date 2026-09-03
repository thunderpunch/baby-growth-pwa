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

function structureNightCard(){
  const input=$("nightSleepAt"),entries=$("nightSleepEntries"),summary=$("lastNightSummary");
  const card=input?.closest(".card.pad");
  if(!card||!entries)return;
  card.querySelector(".card-head")?.classList.add("sleep-v3-card-head-hidden");
  if(entries.dataset.sectioned!=="1"){
    const goodnight=entries.querySelector("[data-night-goodnight]");
    const morning=entries.querySelector("[data-night-morning]");
    if(goodnight&&morning){
      const tonight=document.createElement("section");
      tonight.className="night-sleep-section tonight";
      tonight.innerHTML='<div class="night-sleep-section-title">今晚</div>';
      tonight.appendChild(goodnight);
      const last=document.createElement("section");
      last.className="night-sleep-section last-night";
      last.innerHTML='<div class="night-sleep-section-title">昨夜</div>';
      last.appendChild(morning);
      entries.replaceChildren(tonight,last);
      entries.dataset.sectioned="1";
    }
  }
  const last=entries.querySelector(".night-sleep-section.last-night");
  if(last&&summary&&summary.parentElement!==last)last.appendChild(summary);
}

async function decorateTimeline(){
  const edits=Array.from(document.querySelectorAll("#timeline [data-edit-id]"));
  await Promise.all(edits.map(async edit=>{
    const row=edit.closest(".row"),main=row?.querySelector(".rowmain"),sub=row?.querySelector(".rowsub"),time=row?.querySelector(".time");
    if(!row||!main||!sub)return;
    const record=await getRecord(edit.dataset.editId);if(!record)return;
    if(record.type==="sleep"){
      edit.dataset.sleepV3Record="sleep";
      const start=timePart(record.startDateTime)||record.startTime||"";
      const end=timePart(record.endDateTime)||record.endTime||"";
      const suffix=end||(record.nightAnchor?"待早安":"?");
      setText(time,start||end||"—");
      setText(main,`${record.nightAnchor?"夜间睡眠":"睡眠"} · ${start||"?"}～${suffix}`);
      const mins=durationMinutes(record)??clockMinutes(record.startTime,record.endTime);
      setText(sub,[fmtDuration(mins),record.sleepMethod].filter(Boolean).join(" · ")||"记录未完整");
    }else if(record.type==="wake"){
      edit.dataset.sleepV3Record="wake";
      setText(sub,[record.resultLabel,record.note,record.nightKey&&`归属 ${fmtDay(record.nightKey)}昨夜`].filter(Boolean).join(" · "));
    }
  }));
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
  structureNightCard();
  scheduleDecorate(0);
  const timeline=$("timeline");
  if(timeline)new MutationObserver(()=>scheduleDecorate(30)).observe(timeline,{childList:true,subtree:true});
  const nightRoot=$("nightSleepAt")?.closest(".card.pad");
  if(nightRoot)new MutationObserver(()=>structureNightCard()).observe(nightRoot,{childList:true,subtree:true});
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
