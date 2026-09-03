import {getRecordsByDate} from "./db.js";
import {recordTimelineMs,recordTimelineClock,recordDurationMinutes,sleepLocalRange} from "./record-model.js";

const $=id=>document.getElementById(id);
let timer=null;
let running=false;

function fmtDuration(min){
  if(min==null)return "";
  if(min<60)return `${min}分钟`;
  const h=Math.floor(min/60),m=min%60;
  return m?`${h}h${m}m`:`${h}h`;
}
function fmtDay(v){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return "";
  const [,m,d]=v.split("-");return `${Number(m)}月${Number(d)}日`;
}
function setText(node,text){if(node&&node.textContent!==text)node.textContent=text;}
function recordIdForRow(row){
  return row.querySelector("[data-edit-id]")?.dataset.editId||row.dataset.pendingRow||"";
}
function projectRow(row,index,recordsById){
  const id=recordIdForRow(row);if(!id)return {row,index,sortMs:Number.POSITIVE_INFINITY};
  const record=recordsById.get(id);if(!record)return {row,index,sortMs:Number.POSITIVE_INFINITY};
  const main=row.querySelector(".rowmain"),sub=row.querySelector(".rowsub"),time=row.querySelector(".time");
  const clock=recordTimelineClock(record);
  setText(time,clock||"—");

  if(record.type==="sleep"){
    const r=sleepLocalRange(record),suffix=r.endTime||(record.nightAnchor?"待早安":"?");
    setText(main,`${record.nightAnchor?"夜间睡眠":"睡眠"} · ${r.startTime||"?"}～${suffix}`);
    setText(sub,[fmtDuration(recordDurationMinutes(record)),record.sleepMethod].filter(Boolean).join(" · ")||"记录未完整");
  }else if(record.type==="wake"){
    setText(sub,[record.resultLabel,record.note,record.nightKey&&`归属 ${fmtDay(record.nightKey)}昨夜`].filter(Boolean).join(" · "));
  }

  const ms=recordTimelineMs(record);
  row.dataset.timelineRecordId=id;
  row.dataset.timelineSort=Number.isFinite(ms)?String(ms):"";
  return {row,index,sortMs:Number.isFinite(ms)?ms:Number.POSITIVE_INFINITY};
}
function sameOrder(a,b){return a.length===b.length&&a.every((node,i)=>node===b[i]);}
async function projectTimeline(){
  if(running)return;
  const timeline=$("timeline");if(!timeline)return;
  const rows=Array.from(timeline.querySelectorAll(":scope > .row"));
  if(!rows.length)return;
  const pageDate=$("pageDate")?.value||"";
  if(!pageDate)return;

  running=true;
  try{
    // One indexed date query replaces one IndexedDB transaction per visible timeline row.
    const records=await getRecordsByDate(pageDate,{includeDeleted:true});
    const recordsById=new Map(records.map(record=>[record.id,record]));
    const projected=rows.map((row,index)=>projectRow(row,index,recordsById));
    projected.sort((a,b)=>a.sortMs-b.sortMs||a.index-b.index);
    const ordered=projected.map(x=>x.row);
    if(!sameOrder(rows,ordered))timeline.replaceChildren(...ordered);
  }finally{running=false;}
}
function schedule(delay=35){clearTimeout(timer);timer=setTimeout(()=>projectTimeline().catch(e=>console.warn("Timeline projection failed",e)),delay);}
function init(){
  schedule(0);
  const timeline=$("timeline");
  // app.js replaces/adds top-level rows when the day changes. Internal text edits performed by
  // this projection must not schedule another projection pass.
  if(timeline)new MutationObserver(()=>schedule()).observe(timeline,{childList:true,subtree:false});
  $("pageDate")?.addEventListener("change",()=>schedule(0));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
