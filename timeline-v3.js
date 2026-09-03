import {getRecord} from "./db.js";
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
async function projectRow(row,index){
  const id=recordIdForRow(row);if(!id)return {row,index,sortMs:Number.POSITIVE_INFINITY};
  const record=await getRecord(id);if(!record)return {row,index,sortMs:Number.POSITIVE_INFINITY};
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
  running=true;
  try{
    const rows=Array.from(timeline.querySelectorAll(":scope > .row"));
    if(!rows.length)return;
    const projected=await Promise.all(rows.map(projectRow));
    projected.sort((a,b)=>a.sortMs-b.sortMs||a.index-b.index);
    const ordered=projected.map(x=>x.row);
    if(!sameOrder(rows,ordered))timeline.replaceChildren(...ordered);
  }finally{running=false;}
}
function schedule(delay=35){clearTimeout(timer);timer=setTimeout(()=>projectTimeline().catch(e=>console.warn("Timeline projection failed",e)),delay);}
function init(){
  schedule(0);
  const timeline=$("timeline");
  if(timeline)new MutationObserver(()=>schedule()).observe(timeline,{childList:true,subtree:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
