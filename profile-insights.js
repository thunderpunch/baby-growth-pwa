import {getRecordsInRange} from "./db.js";
import {isStrictDayNap,recordDurationMinutes,shiftDateKey,sleepLocalRange} from "./record-model.js";

export const PROFILE_INSIGHT_DAYS=14;
const MIN_SAMPLES=3;

function clockMinutes(value){
  if(!/^\d{2}:\d{2}$/.test(value||""))return null;
  const [hour,minute]=value.split(":").map(Number);
  return hour*60+minute;
}
function median(values){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:Math.round((sorted[middle-1]+sorted[middle])/2);
}
function fmtClock(minutes){
  if(!Number.isFinite(minutes))return "";
  const normalized=((Math.round(minutes)%1440)+1440)%1440;
  return `${String(Math.floor(normalized/60)).padStart(2,"0")}:${String(normalized%60).padStart(2,"0")}`;
}
function fmtDuration(minutes){
  if(!Number.isFinite(minutes))return "";
  const rounded=Math.round(minutes),hours=Math.floor(rounded/60),rest=rounded%60;
  if(!hours)return `${rest}分钟`;
  return rest?`${hours}h${rest}m`:`${hours}h`;
}
function esc(value=""){
  return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function liveSleeps(records){
  return records.filter(record=>record?.type==="sleep"&&record.status==="confirmed"&&!record.deleted);
}
function topMethod(records){
  const counts=new Map();
  for(const record of records){
    const method=String(record.sleepMethod||"").trim();
    if(method)counts.set(method,(counts.get(method)||0)+1);
  }
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"zh-CN"));
  const samples=ranked.reduce((sum,[,count])=>sum+count,0);
  return ranked.length?{method:ranked[0][0],count:ranked[0][1],samples}:{method:"",count:0,samples:0};
}

export function deriveProfileInsights(records){
  const sleeps=liveSleeps(records);
  const nights=sleeps.filter(record=>record.nightAnchor&&recordDurationMinutes(record)!=null);
  const nightStarts=nights.map(record=>clockMinutes(sleepLocalRange(record).startTime)).filter(Number.isFinite).map(value=>value<6*60?value+1440:value);
  const nightDurations=nights.map(record=>recordDurationMinutes(record)).filter(Number.isFinite);

  const trackedDates=new Set(sleeps.map(record=>record.date).filter(Boolean));
  const napCounts=new Map([...trackedDates].map(date=>[date,0]));
  let napSamples=0;
  for(const record of sleeps){
    if(isStrictDayNap(record)){
      napCounts.set(record.date,(napCounts.get(record.date)||0)+1);
      napSamples++;
    }
  }
  const typicalNaps=median([...napCounts.values()]);
  const method=topMethod(sleeps);

  return {
    sleepDays:trackedDates.size,
    nightSamples:nights.length,
    napSamples,
    typicalNightStart:nightStarts.length>=MIN_SAMPLES?fmtClock(median(nightStarts)):"",
    averageNightSleep:nightDurations.length>=MIN_SAMPLES?fmtDuration(nightDurations.reduce((sum,value)=>sum+value,0)/nightDurations.length):"",
    typicalNapCount:napCounts.size>=MIN_SAMPLES&&napSamples>=MIN_SAMPLES?typicalNaps:null,
    mainSleepMethod:method.samples>=MIN_SAMPLES?method.method:"",
    mainSleepMethodCount:method.samples>=MIN_SAMPLES?method.count:0,
    sleepMethodSamples:method.samples
  };
}

export async function loadProfileInsights(endDate){
  const startDate=shiftDateKey(endDate,-(PROFILE_INSIGHT_DAYS-1));
  const records=await getRecordsInRange(startDate,endDate);
  return {startDate,endDate,...deriveProfileInsights(records)};
}

function ensureStyle(){
  if(document.querySelector('link[data-profile-insights-style]'))return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL("./profile-insights.css",import.meta.url).href;
  link.dataset.profileInsightsStyle="1";
  document.head.appendChild(link);
}
function insightCard(label,value,detail){
  const shown=value||"记录几天后自动显示";
  return `<div class="profile-insight"><small>${esc(label)}</small><b>${esc(shown)}</b>${detail?`<span>${esc(detail)}</span>`:""}</div>`;
}
export async function renderProfileInsights(container,endDate){
  if(!container)return;
  ensureStyle();
  container.innerHTML='<div class="profile-insights-loading">正在汇总最近记录…</div>';
  try{
    const insight=await loadProfileInsights(endDate);
    const nightDetail=insight.nightSamples?`基于 ${insight.nightSamples} 晚完整夜睡`:"需要至少 3 晚完整夜睡";
    const napDetail=insight.napSamples?`基于 ${insight.sleepDays} 个记录日 / ${insight.napSamples} 段白天睡眠`:"需要至少 3 段白天睡眠";
    const methodDetail=insight.sleepMethodSamples?`${insight.mainSleepMethodCount||0}/${insight.sleepMethodSamples} 次记录`:"需要至少 3 次方式记录";
    container.innerHTML=`<div class="profile-insights-grid">
      ${insightCard("夜间入睡",insight.typicalNightStart,nightDetail)}
      ${insightCard("夜间主睡",insight.averageNightSleep,nightDetail)}
      ${insightCard("白天小睡",insight.typicalNapCount==null?"":`通常 ${insight.typicalNapCount} 觉`,napDetail)}
      ${insightCard("主要入睡方式",insight.mainSleepMethod?`${insight.mainSleepMethod}为主`:"",methodDetail)}
    </div>`;
  }catch(error){
    console.warn("Profile insights failed",error);
    container.innerHTML='<div class="profile-insights-loading">近期规律暂时无法读取，不影响档案保存。</div>';
  }
}
