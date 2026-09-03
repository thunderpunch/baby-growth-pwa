import {getSetting,setSetting} from "./db.js";

const CONFIG_URL="./home-config.json";
const DEFAULT_QUICK_RECORDS=["milk","diet","diaper","sleep"];
const RECORD_TYPES=["sleep","milk","diet","diaper","wake","health","growth","medical","milestone","activity"];
const REFRESH_MIN_INTERVAL_MS=30000;
const PERIODIC_REFRESH_MS=5*60*1000;
let lastCheckedAt=0;
let refreshing=false;
let currentQuickRecords=[...DEFAULT_QUICK_RECORDS];

function applyManagedCopy(){
  const quickHint=document.querySelector(".quick-head small");
  if(quickHint) quickHint.textContent="首页快捷项由家庭配置统一管理";

  const grid=document.getElementById("moduleGrid");
  if(!grid) return;
  grid.classList.add("hidden");
  const section=grid.closest(".card.section");
  if(!section) return;
  const heading=section.querySelector("h3");
  const desc=section.querySelector(".sectiondesc");
  if(heading) heading.textContent="显示设置";
  if(desc) desc.textContent="首页快捷记录由远程配置统一管理；本机只保留显示大小设置。未放在首页的项目仍可从“更多记录”使用。";
}

function sanitizeQuickRecords(value,fallback=DEFAULT_QUICK_RECORDS){
  if(!Array.isArray(value)) return [...fallback];
  const result=[];
  for(const id of value){
    if(typeof id!=="string" || !RECORD_TYPES.includes(id) || result.includes(id)) continue;
    result.push(id);
  }
  return result;
}

function moduleMap(quickRecords){
  const enabled=new Set(quickRecords);
  return Object.fromEntries(RECORD_TYPES.map(id=>[id,enabled.has(id)]));
}

function sameModuleMap(a,b){
  return RECORD_TYPES.every(id=>Boolean(a?.[id])===Boolean(b?.[id]));
}

function applyQuickOrder(){
  const bar=document.getElementById("quickbar");
  if(!bar) return;
  const buttons=Array.from(bar.querySelectorAll(":scope > [data-quick]"));
  if(!buttons.length) return;

  const byId=new Map(buttons.map(button=>[button.dataset.quick,button]));
  const desired=currentQuickRecords.filter(id=>byId.has(id));
  const extras=buttons
    .map(button=>button.dataset.quick)
    .filter(id=>id!=="more" && !desired.includes(id));
  const expected=[...desired,...extras];
  if(byId.has("more")) expected.push("more");

  const actual=buttons.map(button=>button.dataset.quick);
  const alreadyOrdered=expected.length===actual.length && expected.every((id,index)=>id===actual[index]);
  if(alreadyOrdered) return;

  for(const id of expected){
    const button=byId.get(id);
    if(button) bar.appendChild(button);
  }
}

async function fetchRemoteConfig(){
  const response=await fetch(CONFIG_URL,{cache:"no-store",headers:{Accept:"application/json"}});
  if(!response.ok) throw new Error(`home-config ${response.status}`);
  const payload=await response.json();
  if(!payload || !Array.isArray(payload.quickRecords)) throw new Error("home-config quickRecords invalid");
  return sanitizeQuickRecords(payload.quickRecords,[]);
}

async function refreshRemoteQuickRecords({force=false}={}){
  if(refreshing) return;
  const now=Date.now();
  if(!force && now-lastCheckedAt<REFRESH_MIN_INTERVAL_MS) return;
  refreshing=true;
  lastCheckedAt=now;
  try{
    const cached=sanitizeQuickRecords(await getSetting("remoteQuickRecords",DEFAULT_QUICK_RECORDS));
    currentQuickRecords=cached;
    applyQuickOrder();

    let desired=cached;
    try{
      desired=await fetchRemoteConfig();
      await setSetting("remoteQuickRecords",desired);
    }catch(error){
      console.warn("Remote quick-record config unavailable; using cached config",error);
    }

    currentQuickRecords=desired;
    const desiredModules=moduleMap(desired);
    const currentModules=await getSetting("modules",{});
    if(!sameModuleMap(currentModules,desiredModules)){
      await setSetting("modules",desiredModules);
      location.reload();
      return;
    }
    applyQuickOrder();
  }finally{
    refreshing=false;
  }
}

applyManagedCopy();
refreshRemoteQuickRecords({force:true}).catch(error=>console.warn("Remote quick-record config failed",error));

const quickbar=document.getElementById("quickbar");
if(quickbar){
  new MutationObserver(()=>applyQuickOrder()).observe(quickbar,{childList:true});
}

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible") return;
  applyManagedCopy();
  refreshRemoteQuickRecords().catch(error=>console.warn("Remote quick-record refresh failed",error));
});

setInterval(()=>{
  if(document.visibilityState!=="visible") return;
  refreshRemoteQuickRecords().catch(error=>console.warn("Remote quick-record periodic refresh failed",error));
},PERIODIC_REFRESH_MS);
