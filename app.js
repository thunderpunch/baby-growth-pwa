import {
  getSetting,setSetting,putProfile,getProfile,getAllProfiles,
  putRecord,getRecord,getRecordsByDate,getRecordsInRange,getAllRecords,
  putDay,getDay,getDaysInRange,getAllDays,
  putImportBackup,getLatestImportBackup,deleteImportBackup,replaceAllData,snapshotAll
} from "./db.js";

const $ = id => document.getElementById(id);
const qsa = s => Array.from(document.querySelectorAll(s));

const SCHEMA_VERSION = "1.0.0";
const APP_ID = "baby-growth-tracker";
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const ALLOWED_RECORD_TYPES = new Set(["sleep","milk","diet","diaper","wake","health","growth","medical","milestone","activity"]);
const CONTEXT_TAGS = ["长牙","不舒服","疫苗后","外出多","环境变化","照护者不同"];

function refuseFraming(){
  if(window.top===window.self) return false;
  document.body.replaceChildren();
  const box=document.createElement("div");
  box.textContent="为保护本机记录，本页面不能嵌入其它网站中使用。";
  box.style.padding="24px";
  box.style.fontFamily="system-ui,sans-serif";
  document.body.appendChild(box);
  return true;
}

function isPlainObject(v){ return !!v && typeof v==="object" && !Array.isArray(v); }
function validDateKey(v){
  if(typeof v!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d=new Date(v+"T12:00:00");
  return !Number.isNaN(d.getTime()) && localDateKey(d)===v;
}
function validTime(v,{allowEmpty=true}={}){
  if(v==="" && allowEmpty) return true;
  return typeof v==="string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
}
function validISO(v){ return typeof v==="string" && v.length<=40 && Number.isFinite(Date.parse(v)); }
function timestampMs(v){ const n=Date.parse(v||""); return Number.isFinite(n)?n:0; }
function safeString(v,max=4000,{allowEmpty=true}={}){
  if(typeof v!=="string") return false;
  if(!allowEmpty && !v.length) return false;
  return v.length<=max;
}
function optionalString(v,max=4000){ return v===undefined || v===null || safeString(v,max); }
function optionalNumberLike(v,min,max){
  if(v===undefined || v===null || v==="") return true;
  if(typeof v!=="string" && typeof v!=="number") return false;
  const n=Number(v); return Number.isFinite(n) && n>=min && n<=max;
}
function assertImport(cond,msg){ if(!cond) throw new Error(msg); }

const DEFAULT_MODULES = {
  sleep:true,milk:true,diet:true,diaper:true,wake:true,
  health:false,growth:false,medical:false,milestone:false,activity:false
};

const MODULES = [
  {id:"sleep",name:"睡眠",desc:"睡着 ～ 醒来",cls:"lav",icon:"moon"},
  {id:"milk",name:"吃奶",desc:"时间 + 奶量",cls:"pink",icon:"milk"},
  {id:"diet",name:"饮食",desc:"当前饮食阶段",cls:"peach",icon:"diet"},
  {id:"diaper",name:"换尿布",desc:"尿 / 便 / 量 / 颜色",cls:"mint",icon:"diaper"},
  {id:"wake",name:"夜间醒来",desc:"系统判断早醒",cls:"blue",icon:"wake"},
  {id:"health",name:"健康 / 用药",desc:"体温、症状、药物",cls:"pink",icon:"health"},
  {id:"growth",name:"成长测量",desc:"体重、身高、头围",cls:"lav",icon:"growth"},
  {id:"medical",name:"疫苗 / 就诊",desc:"疫苗、儿保、门诊",cls:"blue",icon:"medical"},
  {id:"milestone",name:"发育里程碑",desc:"翻身、坐、爬、出牙",cls:"peach",icon:"milestone"},
  {id:"activity",name:"活动 / 户外",desc:"活动量和户外",cls:"mint",icon:"activity"}
];

const ICONS = {
  moon:`<svg viewBox="0 0 24 24"><path d="M20 12.5A7.5 7.5 0 1 1 11.5 4A6 6 0 0 0 20 12.5Z"/></svg>`,
  milk:`<svg viewBox="0 0 24 24"><path d="M9 4h6M10 4v3l-2 3v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-8l-2-3V4"/></svg>`,
  diet:`<svg viewBox="0 0 24 24"><path d="M5 12h14M7 12c0 5 2 8 5 8s5-3 5-8M8 8h8"/></svg>`,
  diaper:`<svg viewBox="0 0 24 24"><path d="M5 7c1 2 2 3 4 4c-2 1-3 3-3 5c2 2 4 3 6 3s4-1 6-3c0-2-1-4-3-5"/></svg>`,
  wake:`<svg viewBox="0 0 24 24"><path d="M12 3v3M3 12h3M18 12h3M6 6l2 2M16 8l2-2"/><path d="M8 17a4 4 0 0 1 8 0"/></svg>`,
  health:`<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
  growth:`<svg viewBox="0 0 24 24"><path d="M5 19V8M5 19h14M8 15l3-4l3 2l4-6"/></svg>`,
  medical:`<svg viewBox="0 0 24 24"><path d="M7 5h10v14H7Z"/><path d="M9 3h6v4H9Z"/><path d="M9 11h6"/></svg>`,
  milestone:`<svg viewBox="0 0 24 24"><path d="M12 3l2.5 5l5.5.8l-4 3.9l1 5.5l-5-2.6l-5 2.6l1-5.5l-4-3.9l5.5-.8Z"/></svg>`,
  activity:`<svg viewBox="0 0 24 24"><path d="M7 20l3-7l-2-3l3-5M11 5l4 4l4 1M10 13l5 2l2 5"/></svg>`
};

let state = {
  date:localDateKey(new Date()),
  modules:{...DEFAULT_MODULES},
  displaySize:"standard",
  currentProfile:null,
  dietStage:"辅食",
  modal:null,
  lastDeleted:null,
  pendingImport:null,
  batchMode:false
};

function uuid(){
  if(crypto.randomUUID) return crypto.randomUUID();
  return "id-"+Date.now()+"-"+Math.random().toString(16).slice(2);
}
function nowISO(){ return new Date().toISOString(); }
function localDateKey(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function parseDateKey(s){ return new Date(s+"T12:00:00"); }
function shiftDateKey(s,days){
  const d=parseDateKey(s); d.setDate(d.getDate()+days); return localDateKey(d);
}
function weekdayCN(dateKey){
  return ["周日","周一","周二","周三","周四","周五","周六"][parseDateKey(dateKey).getDay()];
}
function minutesOf(t){
  if(!t || !/^\d{2}:\d{2}$/.test(t)) return null;
  const [h,m]=t.split(":").map(Number); return h*60+m;
}
function durationMinutes(start,end){
  const a=minutesOf(start), b=minutesOf(end);
  if(a==null || b==null) return null;
  let d=b-a; if(d<0) d+=1440; return d;
}
function fmtDuration(min){
  if(min==null) return "—";
  if(min<60) return `${min}分钟`;
  const h=Math.floor(min/60), m=min%60;
  return m ? `${h}h${m}m` : `${h}h`;
}
function escapeHTML(s=""){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function setSavedStatus(text="已保存"){
  $("saveStatus").textContent=text;
}
function markSaving(){
  setSavedStatus("正在保存…");
  clearTimeout(markSaving.timer);
  markSaving.timer=setTimeout(()=>setSavedStatus("本地离线保存"),900);
}
function showToast(text, actionText="", action=null){
  $("toastText").textContent=text;
  $("toast").classList.remove("hidden");
  const btn=$("toastAction");
  if(actionText && action){
    btn.textContent=actionText; btn.classList.remove("hidden");
    btn.onclick=async()=>{ await action(); hideToast(); };
  }else{
    btn.classList.add("hidden"); btn.onclick=null;
  }
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(hideToast,4200);
}
function hideToast(){ $("toast").classList.add("hidden"); }

async function init(){
  state.modules={...DEFAULT_MODULES,...(await getSetting("modules",{}))};
  state.displaySize=await getSetting("displaySize","standard");
  const email=await getSetting("recipientEmail","");
  $("recipientEmail").value=email;

  let deviceId=await getSetting("deviceId");
  if(!deviceId){ deviceId=uuid(); await setSetting("deviceId",deviceId); }

  const currentProfileId=await getSetting("currentProfileId");
  if(currentProfileId) state.currentProfile=await getProfile(currentProfileId);
  if(state.currentProfile) state.dietStage=state.currentProfile.stage?.dietStage || "辅食";

  document.body.classList.toggle("large-text",state.displaySize==="large");
  qsa("[data-display]").forEach(b=>b.classList.toggle("active",b.dataset.display===state.displaySize));

  $("pageDate").value=state.date;
  setExportDates();
  bindStaticEvents();
  await loadProfileUI();
  renderModuleSettings();
  await loadDay();

  if("serviceWorker" in navigator){
    try{ await navigator.serviceWorker.register("./sw.js"); }catch(e){ console.warn("SW registration failed",e); }
  }
}

function bindStaticEvents(){
  qsa(".nav button").forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $("prevDay").onclick=()=>changeDate(shiftDateKey(state.date,-1),false);
  $("nextDay").onclick=()=>changeDate(shiftDateKey(state.date,1),false);
  $("todayBtn").onclick=()=>changeDate(localDateKey(new Date()),true);
  $("pageDate").onchange=()=>changeDate($("pageDate").value,false);
  $("historyTodayBtn").onclick=()=>{ showView("today"); changeDate(localDateKey(new Date()),true); };
  $("backfillBtn").onclick=openBackfillModal;

  qsa("[data-now-target]").forEach(b=>b.onclick=()=>fillNow($(b.dataset.nowTarget)));
  $("nightSleepAt").onchange=saveNightSleep;
  $("nightWakeAt").onchange=saveNightSleep;

  $("contextToggle").onclick=()=>{
    $("contextPanel").classList.toggle("open");
    $("contextToggle").textContent=$("contextPanel").classList.contains("open")?"收起":"＋ 标记";
  };
  $("contextNote").addEventListener("input",debounce(saveContext,650));

  qsa("[data-profile-mode]").forEach(b=>b.onclick=()=>{
    qsa("[data-profile-mode]").forEach(x=>x.classList.toggle("active",x===b));
    $("weekdayProfile").classList.toggle("hidden",b.dataset.profileMode!=="weekday");
    $("weekendProfile").classList.toggle("hidden",b.dataset.profileMode!=="weekend");
  });
  qsa("[data-diet-stage]").forEach(b=>b.onclick=()=>{
    qsa("[data-diet-stage]").forEach(x=>x.classList.toggle("active",x===b));
    state.dietStage=b.dataset.dietStage;
  });

  $("correctProfileBtn").onclick=()=>saveProfile(false);
  $("newStageBtn").onclick=()=>saveProfile(true);

  qsa("[data-display]").forEach(b=>b.onclick=async()=>{
    state.displaySize=b.dataset.display;
    qsa("[data-display]").forEach(x=>x.classList.toggle("active",x===b));
    document.body.classList.toggle("large-text",state.displaySize==="large");
    await setSetting("displaySize",state.displaySize);
  });

  qsa("[data-open]").forEach(b=>b.onclick=()=>openRecordModal(b.dataset.open));

  $("recipientEmail").addEventListener("change",async()=>{
    await setSetting("recipientEmail",$("recipientEmail").value.trim());
  });
  $("copyEmailBtn").onclick=copyRecipientEmail;
  $("downloadBtn").onclick=()=>exportData("download");
  $("shareBtn").onclick=()=>exportData("share");
  $("jsonInput").onchange=handleImportFile;
  $("applyImportBtn").onclick=applyImport;
  $("undoImportBtn").onclick=undoLatestImport;

  $("modalClose").onclick=closeModal;
  $("modalCancel").onclick=closeModal;
  $("modalSave").onclick=()=>saveModal(false);
  $("modalSaveContinue").onclick=()=>saveModal(true);
  $("modal").onclick=e=>{ if(e.target===$("modal")) closeModal(); };

  function checkDayBoundary(){
    const today=localDateKey(new Date());
    if(state.date===state.lastToday && today!==state.lastToday) changeDate(today,true);
    state.lastToday=today;
  }
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible") checkDayBoundary();
  });
  state.lastToday=localDateKey(new Date());
  setInterval(checkDayBoundary,60000);
}

function showView(name){
  qsa(".view").forEach(v=>v.classList.toggle("active",v.id===name+"View"));
  qsa(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  if(name==="history") renderHistory();
  if(name==="profile") loadProfileUI();
  window.scrollTo({top:0,behavior:"smooth"});
}

async function changeDate(dateKey, followsToday=false){
  state.date=dateKey;
  $("pageDate").value=dateKey;
  await loadDay();
  if(followsToday) state.lastToday=dateKey;
}

function updateDayTitle(){
  const today=localDateKey(new Date());
  $("dayRecordTitle").textContent=state.date===today
    ? "今天的记录"
    : `${parseDateKey(state.date).getMonth()+1}月${parseDateKey(state.date).getDate()}日 ${weekdayCN(state.date)}的记录`;
}

async function ensureDay(){
  let day=await getDay(state.date);
  if(!day){
    day={
      date:state.date,
      nightSleep:{sleepAt:"",wakeAt:""},
      context:{tags:[],note:""},
      templateGenerated:false,
      templateGeneratedFrom:null,
      updatedAt:nowISO()
    };
    await putDay(day);
  }
  return day;
}

async function loadDay(){
  updateDayTitle();
  const day=await ensureDay();
  await generatePreviousDayTemplates(day);
  const freshDay=await getDay(state.date);

  $("nightSleepAt").value=freshDay?.nightSleep?.sleepAt || "";
  $("nightWakeAt").value=freshDay?.nightSleep?.wakeAt || "";
  await renderContext(freshDay);
  renderQuickbar();

  const records=await getRecordsByDate(state.date,{includeDeleted:false});
  renderMetrics(records,freshDay);
  renderTimeline(records);
  $("timelineSub").textContent=`${parseDateKey(state.date).getMonth()+1}月${parseDateKey(state.date).getDate()}日`;
}

async function generatePreviousDayTemplates(day){
  if(day.templateGenerated) return;
  const existing=await getRecordsByDate(state.date,{includeDeleted:false});
  if(existing.some(r=>r.status==="confirmed" && (r.type==="milk" || r.type==="diet"))){
    day.templateGenerated=true;
    day.templateGeneratedFrom=null;
    day.updatedAt=nowISO();
    await putDay(day);
    return;
  }
  const prev=shiftDateKey(state.date,-1);
  const prevRecords=(await getRecordsByDate(prev,{includeDeleted:false}))
    .filter(r=>r.status==="confirmed" && (r.type==="milk" || r.type==="diet"));

  for(const src of prevRecords){
    const id=`tpl:${state.date}:${src.id}`;
    if(await getRecord(id)) continue;

    if(src.type==="milk"){
      await putRecord({
        id,date:state.date,type:"milk",status:"pending",source:"previous_day_template",
        templateSourceId:src.id,time:src.time||"",amount:src.amount||"",feedType:src.feedType||"",
        createdAt:nowISO(),updatedAt:nowISO(),deleted:false
      });
    }else{
      await putRecord({
        id,date:state.date,type:"diet",status:"pending",source:"previous_day_template",
        templateSourceId:src.id,time:src.time||"",dietType:state.dietStage,content:"",amount:"",
        createdAt:nowISO(),updatedAt:nowISO(),deleted:false
      });
    }
  }
  day.templateGenerated=true;
  day.templateGeneratedFrom=prev;
  day.updatedAt=nowISO();
  await putDay(day);
}

function confirmed(records){ return records.filter(r=>r.status==="confirmed" && !r.deleted); }
function pending(records){ return records.filter(r=>r.status==="pending" && !r.deleted); }

function renderMetrics(records,day){
  const c=confirmed(records), p=pending(records);
  const naps=c.filter(r=>r.type==="sleep");
  const napMinutes=naps.reduce((s,r)=>s+(durationMinutes(r.startTime,r.endTime)||0),0);
  const milkTotal=c.filter(r=>r.type==="milk").reduce((s,r)=>s+(Number(r.amount)||0),0);

  const wakes=c.filter(r=>r.type==="wake");
  const suspected=wakes
    .filter(r=>r.result==="no_resleep" || (minutesOf(r.wakeTime)!=null && minutesOf(r.wakeTime)<330))
    .sort((a,b)=>(a.wakeTime||"").localeCompare(b.wakeTime||""))[0];

  $("metrics").innerHTML=`
    <div class="metric"><b>${naps.length} 觉</b><small>白天睡眠</small></div>
    <div class="metric"><b>${napMinutes?fmtDuration(napMinutes):"—"}</b><small>小睡总计</small></div>
    <div class="metric"><b>${milkTotal?milkTotal+"ml":"—"}</b><small>已确认奶量</small></div>
    <div class="metric"><b>${suspected?.wakeTime || "—"}</b><small>疑似早醒</small></div>
    <div class="metric"><b>${p.length} 条</b><small>待确认模板</small></div>`;
}

function recordTime(r){
  return r.time || r.startTime || r.wakeTime || "99:99";
}

function renderTimeline(records){
  const live=records.filter(r=>!r.deleted).sort((a,b)=>recordTime(a).localeCompare(recordTime(b)));
  const p=pending(live);
  if(p.length){
    $("pendingSummary").classList.remove("hidden");
    $("pendingSummary").innerHTML=`<div><b>还有 ${p.length} 条昨日模板待确认</b><small>　未确认前不算正式记录</small></div>`;
  }else{
    $("pendingSummary").classList.add("hidden");
  }

  if(!live.length){
    $("timeline").innerHTML=`<div class="empty-state">这一天还没有记录。可以从上方“快速记录”开始。</div>`;
    return;
  }

  $("timeline").innerHTML=live.map(r=>renderRecordRow(r)).join("");
  qsa("[data-confirm-id]").forEach(b=>b.onclick=e=>{e.stopPropagation();confirmPending(b.dataset.confirmId);});
  qsa("[data-skip-id]").forEach(b=>b.onclick=e=>{e.stopPropagation();skipPending(b.dataset.skipId);});
  qsa("[data-edit-id]").forEach(b=>b.onclick=e=>{e.stopPropagation();editRecord(b.dataset.editId);});
  qsa("[data-delete-id]").forEach(b=>b.onclick=e=>{e.stopPropagation();deleteRecord(b.dataset.deleteId);});
  qsa("[data-pending-row]").forEach(row=>row.onclick=e=>{
    if(e.target.closest("button")) return;
    editRecord(row.dataset.pendingRow);
  });
}

function renderRecordRow(r){
  const icon=ICONS[MODULES.find(m=>m.id===r.type)?.icon] || ICONS.medical;
  const label=recordLabel(r);
  const sub=recordSub(r);

  if(r.status==="pending"){
    return `<div class="row pending-row" data-pending-row="${escapeHTML(r.id)}">
      <div class="time">${escapeHTML(recordTime(r)==="99:99"?"—":recordTime(r))}</div>
      <div class="typeicon">${icon}</div>
      <div class="rowbody">
        <div class="rowmain">${escapeHTML(label)} <span class="pending-badge">待确认</span></div>
        <div class="rowsub">${escapeHTML(sub)}</div>
      </div>
      <div class="rowactions">
        <button class="confirm-btn" data-confirm-id="${escapeHTML(r.id)}">确认</button>
        <button class="skip-btn" data-skip-id="${escapeHTML(r.id)}">今天没有</button>
      </div>
    </div>`;
  }

  return `<div class="row">
    <div class="time">${escapeHTML(recordTime(r)==="99:99"?"—":recordTime(r))}</div>
    <div class="typeicon">${icon}</div>
    <div class="rowbody">
      <div class="rowmain">${escapeHTML(label)}</div>
      <div class="rowsub">${escapeHTML(sub)}</div>
    </div>
    <div class="rowactions">
      <button class="edit" data-edit-id="${escapeHTML(r.id)}">修改</button>
      <button class="del" data-delete-id="${escapeHTML(r.id)}">删除</button>
    </div>
  </div>`;
}

function recordLabel(r){
  switch(r.type){
    case "milk": return `吃奶${r.amount?` · ${r.amount}ml`:""}`;
    case "diet": return `${r.dietType || state.dietStage}${r.content?` · ${r.content}`:""}`;
    case "sleep": return `睡眠 · ${r.startTime||"?"}～${r.endTime||"?"}`;
    case "diaper": return `换尿布 · ${r.diaperType||"未选择"}`;
    case "wake": return `夜间醒来 · ${r.wakeTime||"?"}`;
    case "health": return `健康 / 用药${r.temperature?` · ${r.temperature}℃`:""}`;
    case "growth": return `成长测量${r.weight?` · ${r.weight}kg`:""}`;
    case "medical": return `${r.eventType||"疫苗 / 就诊"}`;
    case "milestone": return `发育里程碑 · ${r.milestone||"记录"}`;
    case "activity": return `活动 / 户外 · ${r.activityType||"记录"}`;
    default:return r.type;
  }
}
function recordSub(r){
  if(r.status==="pending" && r.type==="milk") return `昨日沿用：${r.time||"—"} · ${r.amount||"—"}ml · ${r.feedType||"未填写"}`;
  if(r.status==="pending" && r.type==="diet") return `昨日沿用：${r.time||"—"} · ${r.dietType||state.dietStage}时段；内容和摄入量待填写`;
  switch(r.type){
    case "milk": return r.feedType || "";
    case "diet": return [r.amount,r.note].filter(Boolean).join(" · ");
    case "sleep": return durationMinutes(r.startTime,r.endTime)!=null ? fmtDuration(durationMinutes(r.startTime,r.endTime)) : "记录未完整";
    case "diaper": return [r.urineAmount&&`尿量${r.urineAmount}`,r.stoolAmount&&`便量${r.stoolAmount}`,r.stoolColor,r.stoolForm,r.note].filter(Boolean).join(" · ");
    case "wake": return [r.resultLabel,r.note].filter(Boolean).join(" · ");
    case "health": return [r.symptoms,r.medication].filter(Boolean).join(" · ");
    case "growth": return [r.height&&`${r.height}cm`,r.headCircumference&&`头围${r.headCircumference}cm`,r.sourceNote].filter(Boolean).join(" · ");
    case "medical": return [r.content,r.note].filter(Boolean).join(" · ");
    case "milestone": return r.description || "";
    case "activity": return [r.duration,r.note].filter(Boolean).join(" · ");
    default:return "";
  }
}

function renderQuickbar(){
  const enabled=MODULES.filter(m=>state.modules[m.id]);
  const hidden=MODULES.filter(m=>!state.modules[m.id]);
  $("quickbar").innerHTML=enabled.map(m=>{
    const title=m.id==="diet" ? state.dietStage : m.name;
    return `<button class="quick" data-quick="${m.id}">
      <span class="qicon ${m.cls}">${ICONS[m.icon]}</span>
      <span class="qcopy"><b>${escapeHTML(title)}</b><small>${escapeHTML(m.id==="diet"?"点击直接记录"+state.dietStage:m.desc)}</small></span>
    </button>`;
  }).join("") + (hidden.length ? `<button class="quick more" data-quick="more">
      <span class="qicon pink">${ICONS.medical}</span>
      <span class="qcopy"><b>更多记录</b><small>${hidden.length} 个未显示项目</small></span>
    </button>`:"");

  qsa("[data-quick]").forEach(b=>b.onclick=async()=>{
    const type=b.dataset.quick;
    if(type==="more") openMoreModal();
    else if(type==="milk" || type==="diet"){
      const candidates=(await getRecordsByDate(state.date,{includeDeleted:false}))
        .filter(r=>r.status==="pending" && r.type===type)
        .sort((a,b)=>(a.time||"").localeCompare(b.time||""));
      if(candidates.length){
        openRecordModal(type,candidates[0]);
      }else openRecordModal(type);
    }else openRecordModal(type);
  });
}

async function renderContext(day){
  const context=day?.context || {tags:[],note:""};
  const tags=new Set(context.tags||[]);
  $("contextTags").innerHTML=CONTEXT_TAGS.map(t=>`<button class="pill ${tags.has(t)?"active":""}" data-context="${t}">${t}</button>`).join("");
  $("contextNote").value=context.note||"";
  $("contextSummary").textContent=tags.size ? Array.from(tags).join(" · ") : "暂无例外记录";
  qsa("[data-context]").forEach(b=>b.onclick=async()=>{
    b.classList.toggle("active");
    await saveContext();
  });
}
async function saveContext(){
  const day=await ensureDay();
  const tags=qsa("[data-context].active").map(b=>b.dataset.context);
  day.context={tags,note:$("contextNote").value.trim()};
  day.updatedAt=nowISO();
  markSaving(); await putDay(day);
  $("contextSummary").textContent=tags.length?tags.join(" · "):"暂无例外记录";
  $("contextSave").textContent="✓ 已自动保存";
  setTimeout(()=>$("contextSave").textContent="选择和备注会自动保存",1000);
}
async function saveNightSleep(){
  const day=await ensureDay();
  day.nightSleep={sleepAt:$("nightSleepAt").value,wakeAt:$("nightWakeAt").value};
  day.updatedAt=nowISO();
  markSaving(); await putDay(day);
}

function currentTimeValue(){
  const d=new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fillNow(input){ input.value=currentTimeValue(); input.dispatchEvent(new Event("change",{bubbles:true})); }
function debounce(fn,ms){ let t; return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}; }

function openModal(title,body,{type=null,record=null,onSave=null}={}){
  state.modal={type,record,onSave};
  $("modalTitle").textContent=title;
  $("modalBody").innerHTML=body;
  $("modal").classList.remove("hidden");
  enhanceModal();
}
function closeModal(){ $("modal").classList.add("hidden"); state.modal=null; }

function timeField(id,label,value=""){
  return `<label>${label}<div class="time-row"><input id="${id}" type="time" value="${escapeHTML(value)}"><button type="button" class="now-btn" data-now="${id}">现在</button></div></label>`;
}

async function openRecordModal(type, record=null){
  const r=record || {};
  let title="",body="";
  if(type==="sleep"){
    title=r.id?"修改睡眠":"添加睡眠";
    body=`<div class="fields2">${timeField("fStart","几点睡着",r.startTime||"")}${timeField("fEnd","几点醒来",r.endTime||"")}</div>
      <div class="hint">可以先只填一个时间，之后再补完整。</div>
      <label class="form-label">备注<input id="fNote" type="text" value="${escapeHTML(r.note||"")}" placeholder="例如：抱哄后放床；这觉特别短"></label>`;
  }else if(type==="milk"){
    title=r.status==="pending"?"确认今日吃奶":(r.id?"修改吃奶":"添加吃奶");
    body=`<div class="fields2">${timeField("fTime","时间",r.time||"")}
      <label>奶量 ml<input id="fAmount" type="number" inputmode="numeric" value="${escapeHTML(r.amount||"")}" placeholder="例如：180"></label></div>
      <label class="form-label">类型<select id="fFeedType">
        ${["配方奶","母乳瓶喂","母乳亲喂"].map(x=>`<option ${x===(r.feedType||"配方奶")?"selected":""}>${x}</option>`).join("")}
      </select></label>
      ${r.status==="pending"?`<div class="smallnote">时间、奶量和类型来自昨天。完全一致可直接保存并确认；有变化就改完再保存。</div>`:""}`;
  }else if(type==="diet"){
    title=r.status==="pending"?`确认今日${state.dietStage}`:(r.id?`修改${state.dietStage}`:`添加${state.dietStage}`);
    const selected=r.dietType||state.dietStage;
    body=`<label>本次类型</label><div class="optionchips" id="dietTypeChips">
        ${[state.dietStage,"水果","饮水","加餐","其它"].map((x,i)=>`<button type="button" class="optionchip ${x===selected||(!r.dietType&&i===0)?"active":""}" data-choice="${x}">${x}</button>`).join("")}
      </div>
      <div class="fields2 form-label">${timeField("fTime","时间",r.time||"")}
        <label>摄入量<input id="fAmountText" type="text" value="${escapeHTML(r.amount||"")}" placeholder="例如：半碗；几口；约80ml"></label></div>
      <label class="form-label">吃了什么<input id="fContent" type="text" value="${escapeHTML(r.content||"")}" placeholder="例如：米糊 + 南瓜泥"></label>
      ${r.status==="pending"?`<div class="smallnote">这里只沿用昨天的时间和当前饮食阶段。今天吃了什么、吃了多少仍需按实际填写。</div>`:""}`;
  }else if(type==="diaper"){
    const kind=r.diaperType||"尿";
    title=r.id?"修改换尿布":"添加换尿布";
    body=`<div class="fields2">${timeField("fTime","时间",r.time||"")}
      <label>类型<div class="optionchips" id="diaperKind">
      ${["尿","便","尿 + 便"].map(x=>`<button type="button" class="optionchip ${x===kind?"active":""}" data-kind="${x}">${x}</button>`).join("")}</div></label></div>
      <div id="urineArea" class="${kind==="便"?"hidden":""} form-label"><label>尿量<div class="optionchips" id="urineAmount">
      ${["少","中","多"].map(x=>`<button type="button" class="optionchip ${x===(r.urineAmount||"中")?"active":""}" data-choice="${x}">${x}</button>`).join("")}</div></label></div>
      <div id="stoolArea" class="${kind==="尿"?"hidden":""}">
        <div class="form-divider"></div>
        <div class="fields2">
          <label>便量<div class="optionchips" id="stoolAmount">${["少","中","多"].map(x=>`<button type="button" class="optionchip ${x===r.stoolAmount?"active":""}" data-choice="${x}">${x}</button>`).join("")}</div></label>
          <label>颜色<div class="optionchips" id="stoolColor">${["黄","棕","绿","黑","红","灰白","其它"].map(x=>`<button type="button" class="optionchip ${x===r.stoolColor?"active":""}" data-choice="${x}">${x}</button>`).join("")}</div></label>
        </div>
        <label class="form-label">性状<div class="optionchips" id="stoolForm">${["稀","糊状","成形","偏硬","水样","其它"].map(x=>`<button type="button" class="optionchip ${x===r.stoolForm?"active":""}" data-choice="${x}">${x}</button>`).join("")}</div></label>
      </div>
      <label class="form-label">备注<input id="fNote" type="text" value="${escapeHTML(r.note||"")}" placeholder="例如：比平时稀；颜色明显不同"></label>`;
  }else if(type==="wake"){
    title=r.id?"修改夜间醒来":"添加夜间醒来";
    body=`<div class="fields2">${timeField("fWake","几点醒",r.wakeTime||"")}${timeField("fResleep","几点又睡着",r.resleepTime||"")}</div>
      <label class="form-label">结果<select id="fWakeResult">
        <option value="reslept" ${r.result==="reslept"?"selected":""}>后来重新睡着</option>
        <option value="no_resleep" ${r.result==="no_resleep"?"selected":""}>一直没再睡到起床</option>
        <option value="unknown" ${!r.result||r.result==="unknown"?"selected":""}>暂时不知道</option>
      </select></label>
      <label class="form-label">备注<input id="fNote" type="text" value="${escapeHTML(r.note||"")}" placeholder="例如：抱哄20分钟；喂奶后仍清醒"></label>`;
  }else if(type==="health"){
    title=r.id?"修改健康 / 用药":"添加健康 / 用药";
    body=`<div class="fields2">${timeField("fTime","时间",r.time||"")}<label>体温 ℃<input id="fTemp" type="number" step="0.1" value="${escapeHTML(r.temperature||"")}" placeholder="例如：37.6"></label></div>
      <label class="form-label">症状<input id="fSymptoms" type="text" value="${escapeHTML(r.symptoms||"")}" placeholder="例如：鼻塞、咳嗽、精神一般"></label>
      <label class="form-label">用药<input id="fMedication" type="text" value="${escapeHTML(r.medication||"")}" placeholder="例如：药名 + 实际剂量"></label>`;
  }else if(type==="growth"){
    title=r.id?"修改成长测量":"添加成长测量";
    body=`<div class="fields2">
      <label>体重 kg<input id="fWeight" type="number" step="0.01" value="${escapeHTML(r.weight||"")}" placeholder="例如：8.20"></label>
      <label>身高 cm<input id="fHeight" type="number" step="0.1" value="${escapeHTML(r.height||"")}" placeholder="例如：69.5"></label>
      <label>头围 cm<input id="fHead" type="number" step="0.1" value="${escapeHTML(r.headCircumference||"")}" placeholder="例如：44"></label>
      <label>测量来源<input id="fSource" type="text" value="${escapeHTML(r.sourceNote||"")}" placeholder="例如：社区体检；家用秤"></label></div>`;
  }else if(type==="medical"){
    title=r.id?"修改疫苗 / 就诊":"添加疫苗 / 就诊";
    body=`<label>事件类型</label><div class="optionchips" id="eventType">${["疫苗","儿保","门诊","急诊","其它"].map((x,i)=>`<button type="button" class="optionchip ${x===(r.eventType||"疫苗")?"active":""}" data-choice="${x}">${x}</button>`).join("")}</div>
      <label class="form-label">内容<input id="fContent" type="text" value="${escapeHTML(r.content||"")}" placeholder="例如：接种某疫苗；因咳嗽就诊"></label>
      <label class="form-label">备注<textarea id="fNote" placeholder="例如：医生建议；接种后的观察情况">${escapeHTML(r.note||"")}</textarea></label>`;
  }else if(type==="milestone"){
    title=r.id?"修改发育里程碑":"添加发育里程碑";
    body=`<label>里程碑</label><div class="optionchips" id="milestoneType">${["翻身","独坐","爬行","扶站","出牙","语言","其它"].map(x=>`<button type="button" class="optionchip ${x===(r.milestone||"翻身")?"active":""}" data-choice="${x}">${x}</button>`).join("")}</div>
      <label class="form-label">描述<input id="fDescription" type="text" value="${escapeHTML(r.description||"")}" placeholder="例如：第一次可以稳定独坐约1分钟"></label>`;
  }else if(type==="activity"){
    title=r.id?"修改活动 / 户外":"添加活动 / 户外";
    body=`<label>活动类型</label><div class="optionchips" id="activityType">${["户外","大运动","亲子活动","其它"].map(x=>`<button type="button" class="optionchip ${x===(r.activityType||"户外")?"active":""}" data-choice="${x}">${x}</button>`).join("")}</div>
      <div class="fields2 form-label">${timeField("fTime","开始时间",r.time||"")}<label>大概时长<input id="fDuration" type="text" value="${escapeHTML(r.duration||"")}" placeholder="例如：45分钟；约2小时"></label></div>
      <label class="form-label">备注<input id="fNote" type="text" value="${escapeHTML(r.note||"")}" placeholder="例如：今天户外明显比平时久"></label>`;
  }
  openModal(title,body,{type,record:r});
}

function openMoreModal(){
  const hidden=MODULES.filter(m=>!state.modules[m.id]);
  const body=`<div class="smallnote">这些项目当前没有放在首页，但仍可临时记录。</div>
    <div class="module-grid form-label">${hidden.map(m=>`<button class="mode" data-more="${m.id}"><b>${m.name}</b><span>${m.desc}</span></button>`).join("")}</div>`;
  openModal("更多记录",body,{type:"more"});
  qsa("[data-more]").forEach(b=>b.onclick=()=>openRecordModal(b.dataset.more));
}

function enhanceModal(){
  qsa("[data-now]").forEach(b=>b.onclick=()=>fillNow($(b.dataset.now)));
  qsa(".optionchips").forEach(group=>{
    const chips=Array.from(group.querySelectorAll(".optionchip"));
    chips.forEach(chip=>chip.onclick=e=>{
      e.preventDefault();
      chips.forEach(x=>x.classList.remove("active"));
      chip.classList.add("active");

      if(chip.dataset.kind){
        $("urineArea").classList.toggle("hidden",chip.dataset.kind==="便");
        $("stoolArea").classList.toggle("hidden",chip.dataset.kind==="尿");
      }
    });
  });
}

function activeChoice(id, attr="choice"){
  return document.querySelector(`#${id} .optionchip.active`)?.dataset?.[attr] || "";
}

async function confirmPending(id){
  const r=await getRecord(id); if(!r) return;
  if(r.type==="diet" && !r.content && !r.amount){
    return openRecordModal("diet",r);
  }
  r.status="confirmed"; r.updatedAt=nowISO();
  markSaving(); await putRecord(r); await loadDay();
}

async function skipPending(id){
  const r=await getRecord(id); if(!r) return;
  r.deleted=true;r.deleteReason="not_occurred";r.updatedAt=nowISO();
  await putRecord(r); await loadDay();
}

async function editRecord(id){
  const r=await getRecord(id); if(r) openRecordModal(r.type,r);
}

async function deleteRecord(id){
  const r=await getRecord(id); if(!r) return;
  r.deleted=true;r.deletedAt=nowISO();r.updatedAt=nowISO();
  await putRecord(r);
  state.lastDeleted={...r};
  await loadDay();
  showToast("记录已删除","撤销",async()=>{
    const x={...state.lastDeleted,deleted:false,deletedAt:null,updatedAt:nowISO()};
    await putRecord(x); await loadDay();
  });
}

async function renderHistory(){
  const days=await getAllDays();
  const records=await getAllRecords();
  const meaningfulDayDates=days.filter(d=>{
    const hasNight=!!(d.nightSleep?.sleepAt || d.nightSleep?.wakeAt);
    const hasContext=!!((d.context?.tags||[]).length || d.context?.note);
    return hasNight || hasContext;
  }).map(d=>d.date);
  const liveRecordDates=records.filter(r=>!r.deleted).map(r=>r.date);
  const dates=new Set([...meaningfulDayDates,...liveRecordDates]);
  const sorted=Array.from(dates).sort().reverse().slice(0,30);

  if(!sorted.length){
    $("historyGrid").innerHTML=`<div class="history-card"><b>还没有历史记录</b><p>先从今天或批量补历史开始。</p></div>`;
    return;
  }

  $("historyGrid").innerHTML=sorted.map(date=>{
    const rs=records.filter(r=>r.date===date && !r.deleted && r.status==="confirmed");
    const naps=rs.filter(r=>r.type==="sleep").length;
    const milk=rs.filter(r=>r.type==="milk").reduce((s,r)=>s+(Number(r.amount)||0),0);
    const diapers=rs.filter(r=>r.type==="diaper").length;
    return `<div class="history-card">
      <div class="history-top"><b>${parseDateKey(date).getMonth()+1}月${parseDateKey(date).getDate()}日 · ${weekdayCN(date)}</b>
        <button class="secondary" data-history-date="${escapeHTML(date)}">查看</button></div>
      <p>${rs.length} 条已确认记录</p>
      <div class="hstats">
        <div class="hstat"><b>${naps}觉</b><small>小睡</small></div>
        <div class="hstat"><b>${milk?milk+"ml":"—"}</b><small>奶量</small></div>
        <div class="hstat"><b>${diapers}次</b><small>尿布</small></div>
      </div></div>`;
  }).join("");

  qsa("[data-history-date]").forEach(b=>b.onclick=async()=>{
    showView("today"); await changeDate(b.dataset.historyDate,false);
  });
}

function openBackfillModal(){
  openModal("批量补历史",`<div class="fields2">
    <label>从哪一天开始<input id="backfillDate" type="date" value="${state.date}"></label>
    <label>补录方向<select id="backfillDirection"><option value="forward">从旧日期往今天补</option><option value="backward">从今天往前补</option></select></label>
  </div><div class="smallnote">进入后仍使用首页的快速记录。保存并继续会保留录入窗口，适合照着纸本连续补。</div>`,
  {type:"backfill",onSave:async()=>{
    state.batchMode=true; await changeDate($("backfillDate").value,false); showView("today");
  }});
}

async function loadProfileUI(){
  if(!state.currentProfile){
    $("profileVersionInfo").innerHTML="<b>尚未创建档案。</b> 首次填写后点“修正当前信息”即可创建 V1。";
    return;
  }
  const p=state.currentProfile;
  $("birthDate").value=p.base?.birthDate||"";
  $("sex").value=p.base?.sex||"";
  $("weekdayBedtime").value=p.stage?.weekday?.bedtime||"";
  $("weekdayLatency").value=p.stage?.weekday?.latency||"";
  $("weekdayNaps").value=p.stage?.weekday?.naps||"";
  $("weekdayCaregiver").value=p.stage?.weekday?.caregiver||"";
  $("weekendBedtime").value=p.stage?.weekend?.bedtime||"";
  $("weekendLatency").value=p.stage?.weekend?.latency||"";
  $("weekendNaps").value=p.stage?.weekend?.naps||"";
  $("weekendCaregiver").value=p.stage?.weekend?.caregiver||"";
  $("mainIssue").value=p.stage?.mainIssue||"";
  state.dietStage=p.stage?.dietStage||"辅食";
  qsa("[data-diet-stage]").forEach(b=>b.classList.toggle("active",b.dataset.dietStage===state.dietStage));
  $("profileVersionInfo").innerHTML=`当前档案：<b>V${escapeHTML(p.version)}</b> · 从 <b>${escapeHTML(p.effectiveFrom)}</b> 起生效。重复导出同一版本不会被当成新阶段。`;
}
function profileFormValue(){
  return {
    base:{birthDate:$("birthDate").value,sex:$("sex").value},
    stage:{
      dietStage:state.dietStage,
      weekday:{bedtime:$("weekdayBedtime").value,latency:$("weekdayLatency").value.trim(),naps:$("weekdayNaps").value.trim(),caregiver:$("weekdayCaregiver").value.trim()},
      weekend:{bedtime:$("weekendBedtime").value,latency:$("weekendLatency").value.trim(),naps:$("weekendNaps").value.trim(),caregiver:$("weekendCaregiver").value.trim()},
      mainIssue:$("mainIssue").value.trim()
    }
  };
}
async function saveProfile(newStage){
  const value=profileFormValue();
  if(!state.currentProfile){
    const p={id:uuid(),version:1,effectiveFrom:state.date,createdAt:nowISO(),updatedAt:nowISO(),...value};
    await putProfile(p); await setSetting("currentProfileId",p.id); state.currentProfile=p;
  }else if(!newStage){
    const p={...state.currentProfile,...value,updatedAt:nowISO()};
    await putProfile(p); state.currentProfile=p;
  }else{
    openModal("宝宝进入新阶段",`<label>从哪一天开始生效<input id="stageEffectiveFrom" type="date" value="${state.date}"></label>
      <div class="smallnote">例如 3 觉稳定变 2 觉、辅食正式过渡到正餐、长期照护方式发生变化。只是填错内容请不要创建新阶段。</div>`,
    {type:"newStage",onSave:async()=>{
      const p={id:uuid(),version:(state.currentProfile.version||1)+1,effectiveFrom:$("stageEffectiveFrom").value,createdAt:nowISO(),updatedAt:nowISO(),...value};
      await putProfile(p);await setSetting("currentProfileId",p.id);state.currentProfile=p;await loadProfileUI();renderQuickbar();showToast("已创建新的成长阶段");
    }});
    return;
  }
  state.dietStage=state.currentProfile.stage?.dietStage||"辅食";
  await loadProfileUI(); renderQuickbar(); showToast("档案已保存");
}
function renderModuleSettings(){
  $("moduleGrid").innerHTML=MODULES.map(m=>`<div class="module">
    <div class="modulecopy"><b>${m.name}</b><small>${m.id==="diet"?"当前："+state.dietStage:m.desc}</small></div>
    <span class="toggle ${state.modules[m.id]?"on":""}" data-module="${m.id}"></span>
  </div>`).join("");
  qsa("[data-module]").forEach(t=>t.onclick=async()=>{
    state.modules[t.dataset.module]=!state.modules[t.dataset.module];
    await setSetting("modules",state.modules);
    renderModuleSettings();renderQuickbar();
  });
}

function setExportDates(){
  const today=localDateKey(new Date());
  $("exportEnd").value=today;
  $("exportStart").value=shiftDateKey(today,-6);
}
async function applicableProfiles(start,end){
  const ps=await getAllProfiles();
  if(!ps.length) return [];
  return ps.filter((p,i)=>{
    const next=ps[i+1]?.effectiveFrom || "9999-12-31";
    return p.effectiveFrom<=end && next>start;
  });
}
async function buildExportPayload(){
  const start=$("exportStart").value,end=$("exportEnd").value;
  if(!start||!end||start>end) throw new Error("请选择正确的日期范围");
  const deviceId=await getSetting("deviceId");
  const [records,days,profiles]=await Promise.all([
    getRecordsInRange(start,end), getDaysInRange(start,end), applicableProfiles(start,end)
  ]);
  return {
    schemaVersion:SCHEMA_VERSION,appId:APP_ID,
    deviceId,exportId:uuid(),exportedAt:nowISO(),
    range:{start,end},
    profileVersions:profiles,
    currentProfileVersionId:state.currentProfile?.id||null,
    days,
    records
  };
}
function exportFilename(payload){
  return `宝宝作息_${payload.range.start}_至_${payload.range.end}.json`;
}
function payloadFile(payload){
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  return new File([blob],exportFilename(payload),{type:"application/json"});
}
async function exportData(mode){
  try{
    const payload=await buildExportPayload();
    const file=payloadFile(payload);
    if(mode==="share" && navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
      await navigator.share({title:"宝宝成长记录",text:"宝宝成长记录 JSON 数据",files:[file]});
      return;
    }
    const url=URL.createObjectURL(file);
    const a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    if(mode==="share") showToast("当前浏览器未提供文件分享，已改为下载 JSON");
  }catch(e){ showToast(e.message||"导出失败"); }
}
async function copyRecipientEmail(){
  const email=$("recipientEmail").value.trim();
  if(!email) return showToast("请先填写接收邮箱");
  try{ await navigator.clipboard.writeText(email);showToast("邮箱已复制"); }
  catch{ showToast("无法自动复制，请手动复制邮箱"); }
}

async function handleImportFile(e){
  const file=e.target.files[0]; if(!file) return;
  try{
    if(file.size>MAX_IMPORT_BYTES) throw new Error("文件过大，已拒绝导入");
    const payload=JSON.parse(await file.text());
    validatePayload(payload);
    const comparison=await compareImport(payload);
    state.pendingImport={payload,comparison};
    $("importPreview").classList.remove("hidden");
    $("importPreview").innerHTML=`<b>${escapeHTML(file.name)}</b><br>
      新增：${comparison.newCount}　更新：${comparison.updateCount}　相同：${comparison.sameCount}<br>
      档案版本：${payload.profileVersions?.length||0}　日期：${escapeHTML(payload.range?.start||"?")} ～ ${escapeHTML(payload.range?.end||"?")}`;
    $("applyImportBtn").disabled=false;
  }catch(err){
    state.pendingImport=null;$("applyImportBtn").disabled=true;
    $("importPreview").classList.remove("hidden");
    $("importPreview").textContent="文件无法导入："+(err.message||err);
  }
}
function validatePayload(p){
  assertImport(isPlainObject(p),"数据文件格式错误");
  assertImport(p.appId===APP_ID,"不是本应用的数据文件");
  assertImport(p.schemaVersion===SCHEMA_VERSION,"数据版本不兼容");
  assertImport(safeString(p.deviceId,128,{allowEmpty:false}),"deviceId 无效");
  assertImport(safeString(p.exportId,128,{allowEmpty:false}),"exportId 无效");
  assertImport(validISO(p.exportedAt),"exportedAt 无效");
  assertImport(isPlainObject(p.range) && validDateKey(p.range.start) && validDateKey(p.range.end) && p.range.start<=p.range.end,"日期范围无效");
  assertImport(Array.isArray(p.records) && p.records.length<=20000,"记录数量异常");
  assertImport(Array.isArray(p.days) && p.days.length<=5000,"日期数据数量异常");
  assertImport(Array.isArray(p.profileVersions) && p.profileVersions.length<=500,"档案版本数量异常");
  assertImport(p.currentProfileVersionId===null || p.currentProfileVersionId===undefined || safeString(p.currentProfileVersionId,128),"当前档案 ID 无效");

  const recordIds=new Set();
  for(const r of p.records){
    assertImport(isPlainObject(r),"存在无效记录");
    assertImport(safeString(r.id,160,{allowEmpty:false}) && !recordIds.has(r.id),"记录 ID 无效或重复"); recordIds.add(r.id);
    assertImport(validDateKey(r.date),"记录日期无效");
    assertImport(ALLOWED_RECORD_TYPES.has(r.type),"存在未知记录类型");
    assertImport(r.status==="confirmed" || r.status==="pending","记录状态无效");
    assertImport(typeof r.deleted==="boolean","删除状态无效");
    assertImport(validISO(r.createdAt) && validISO(r.updatedAt),"记录时间戳无效");
    if(r.deletedAt!==undefined && r.deletedAt!==null) assertImport(validISO(r.deletedAt),"删除时间无效");
    if(r.time!==undefined) assertImport(validTime(r.time),"记录时间无效");
    if(r.startTime!==undefined) assertImport(validTime(r.startTime),"睡眠开始时间无效");
    if(r.endTime!==undefined) assertImport(validTime(r.endTime),"睡眠结束时间无效");
    if(r.wakeTime!==undefined) assertImport(validTime(r.wakeTime),"夜醒时间无效");
    if(r.resleepTime!==undefined) assertImport(validTime(r.resleepTime),"再次入睡时间无效");
    assertImport(optionalString(r.note,4000),"备注过长");
    assertImport(optionalString(r.content,2000),"内容过长");
    assertImport(optionalString(r.description,2000),"描述过长");
    assertImport(optionalString(r.symptoms,2000),"症状过长");
    assertImport(optionalString(r.medication,2000),"用药内容过长");
    assertImport(optionalString(r.feedType,100),"喂养类型无效");
    assertImport(optionalString(r.dietType,100),"饮食类型无效");
    assertImport(optionalString(r.diaperType,100),"尿布类型无效");
    assertImport(optionalString(r.eventType,100),"事件类型无效");
    assertImport(optionalString(r.milestone,100),"里程碑类型无效");
    assertImport(optionalString(r.activityType,100),"活动类型无效");
    assertImport(optionalString(r.duration,200),"活动时长无效");
    assertImport(optionalString(r.sourceNote,500),"来源说明过长");
    assertImport(optionalString(r.templateSourceId,160),"模板来源 ID 无效");
    assertImport(optionalNumberLike(r.amount,0,3000),"奶量数值异常");
    assertImport(optionalNumberLike(r.temperature,30,45),"体温数值异常");
    assertImport(optionalNumberLike(r.weight,0.1,100),"体重数值异常");
    assertImport(optionalNumberLike(r.height,10,250),"身高数值异常");
    assertImport(optionalNumberLike(r.headCircumference,10,100),"头围数值异常");
  }

  const dayDates=new Set();
  for(const d of p.days){
    assertImport(isPlainObject(d) && validDateKey(d.date) && !dayDates.has(d.date),"日期背景无效或重复"); dayDates.add(d.date);
    assertImport(validISO(d.updatedAt),"日期背景时间戳无效");
    if(d.nightSleep!==undefined){
      assertImport(isPlainObject(d.nightSleep),"夜间睡眠结构无效");
      assertImport(validTime(d.nightSleep.sleepAt??""),"夜间入睡时间无效");
      assertImport(validTime(d.nightSleep.wakeAt??""),"最终起床时间无效");
    }
    if(d.context!==undefined){
      assertImport(isPlainObject(d.context) && Array.isArray(d.context.tags) && d.context.tags.length<=CONTEXT_TAGS.length,"当天例外结构无效");
      assertImport(d.context.tags.every(x=>CONTEXT_TAGS.includes(x)),"存在未知当天例外标签");
      assertImport(optionalString(d.context.note,4000),"当天例外备注过长");
    }
    if(d.templateGenerated!==undefined) assertImport(typeof d.templateGenerated==="boolean","模板状态无效");
    if(d.templateGeneratedFrom!==undefined && d.templateGeneratedFrom!==null) assertImport(validDateKey(d.templateGeneratedFrom),"模板来源日期无效");
  }

  const profileIds=new Set();
  for(const pr of p.profileVersions){
    assertImport(isPlainObject(pr),"档案结构无效");
    assertImport(safeString(pr.id,128,{allowEmpty:false}) && !profileIds.has(pr.id),"档案 ID 无效或重复"); profileIds.add(pr.id);
    assertImport(Number.isInteger(pr.version) && pr.version>=1 && pr.version<=10000,"档案版本号无效");
    assertImport(validDateKey(pr.effectiveFrom),"档案生效日期无效");
    assertImport(validISO(pr.createdAt) && validISO(pr.updatedAt),"档案时间戳无效");
    assertImport(isPlainObject(pr.base),"基础档案无效");
    assertImport(pr.base.birthDate==="" || validDateKey(pr.base.birthDate),"出生日期无效");
    assertImport(["","female","male"].includes(pr.base.sex),"性别字段无效");
    assertImport(isPlainObject(pr.stage),"成长阶段无效");
    assertImport(["辅食","正餐"].includes(pr.stage.dietStage),"饮食阶段无效");
    for(const key of ["weekday","weekend"]){
      const x=pr.stage[key]; assertImport(isPlainObject(x),"作息阶段无效");
      assertImport(validTime(x.bedtime??""),"通常放床时间无效");
      assertImport(optionalString(x.latency,200) && optionalString(x.naps,200) && optionalString(x.caregiver,500),"作息阶段文本过长");
    }
    assertImport(optionalString(pr.stage.mainIssue,4000),"主要问题过长");
  }
}

async function compareImport(payload){
  let newCount=0,updateCount=0,sameCount=0;
  for(const incoming of payload.records){
    const local=await getRecord(incoming.id);
    if(!local) newCount++;
    else if(timestampMs(incoming.updatedAt)>timestampMs(local.updatedAt)) updateCount++;
    else sameCount++;
  }
  return {newCount,updateCount,sameCount};
}
async function applyImport(){
  if(!state.pendingImport) return;
  const payload=state.pendingImport.payload;
  const backup={id:uuid(),createdAt:nowISO(),snapshot:await snapshotAll()};
  await putImportBackup(backup);

  for(const p of payload.profileVersions){
    const local=await getProfile(p.id);
    if(!local || timestampMs(p.updatedAt)>timestampMs(local.updatedAt)) await putProfile(p);
  }
  for(const r of payload.records){
    const local=await getRecord(r.id);
    if(!local || timestampMs(r.updatedAt)>timestampMs(local.updatedAt)) await putRecord(r);
  }
  for(const d of payload.days){
    const local=await getDay(d.date);
    if(!local || timestampMs(d.updatedAt)>timestampMs(local.updatedAt)) await putDay(d);
  }

  if(payload.currentProfileVersionId){
    const p=await getProfile(payload.currentProfileVersionId);
    if(p){await setSetting("currentProfileId",p.id);state.currentProfile=p;state.dietStage=p.stage?.dietStage||"辅食";}
  }

  state.pendingImport=null;$("jsonInput").value="";$("importPreview").classList.add("hidden");$("applyImportBtn").disabled=true;
  await loadDay();await loadProfileUI();renderModuleSettings();showToast("导入完成，可撤销最近一次导入");
}
async function undoLatestImport(){
  const backup=await getLatestImportBackup();
  if(!backup) return showToast("没有可撤销的导入");
  await replaceAllData(backup.snapshot);
  await deleteImportBackup(backup.id);
  location.reload();
}

async function saveModal(continueAfter){
  if(state.modal?.onSave){
    const fn=state.modal.onSave; closeModal(); await fn(); return;
  }
  if(!state.modal || state.modal.type==="more") return closeModal();
  const type=state.modal.type;
  const old=state.modal.record || {};
  const isNew=!old.id;

  const base={
    ...old,id:old.id||uuid(),date:state.date,type,status:"confirmed",deleted:false,
    createdAt:old.createdAt||nowISO(),updatedAt:nowISO()
  };

  if(type==="sleep"){
    base.startTime=$("fStart").value;base.endTime=$("fEnd").value;base.note=$("fNote").value.trim();
  }else if(type==="milk"){
    base.time=$("fTime").value;base.amount=$("fAmount").value;base.feedType=$("fFeedType").value;
  }else if(type==="diet"){
    base.time=$("fTime").value;base.dietType=activeChoice("dietTypeChips")||state.dietStage;base.amount=$("fAmountText").value.trim();base.content=$("fContent").value.trim();
  }else if(type==="diaper"){
    base.time=$("fTime").value;base.diaperType=activeChoice("diaperKind","kind")||"尿";base.urineAmount=base.diaperType==="便"?"":activeChoice("urineAmount");base.stoolAmount=base.diaperType==="尿"?"":activeChoice("stoolAmount");base.stoolColor=base.diaperType==="尿"?"":activeChoice("stoolColor");base.stoolForm=base.diaperType==="尿"?"":activeChoice("stoolForm");base.note=$("fNote").value.trim();
  }else if(type==="wake"){
    base.wakeTime=$("fWake").value;base.resleepTime=$("fResleep").value;base.result=$("fWakeResult").value;base.resultLabel={reslept:"后来重新睡着",no_resleep:"一直没再睡到起床",unknown:"暂时不知道"}[base.result];base.note=$("fNote").value.trim();
  }else if(type==="health"){
    base.time=$("fTime").value;base.temperature=$("fTemp").value;base.symptoms=$("fSymptoms").value.trim();base.medication=$("fMedication").value.trim();
  }else if(type==="growth"){
    base.time="";base.weight=$("fWeight").value;base.height=$("fHeight").value;base.headCircumference=$("fHead").value;base.sourceNote=$("fSource").value.trim();
  }else if(type==="medical"){
    base.time="";base.eventType=activeChoice("eventType");base.content=$("fContent").value.trim();base.note=$("fNote").value.trim();
  }else if(type==="milestone"){
    base.time="";base.milestone=activeChoice("milestoneType");base.description=$("fDescription").value.trim();
  }else if(type==="activity"){
    base.time=$("fTime").value;base.activityType=activeChoice("activityType");base.duration=$("fDuration").value.trim();base.note=$("fNote").value.trim();
  }

  markSaving();await putRecord(base);await loadDay();
  if(continueAfter) openRecordModal(type);
  else{closeModal();if(isNew||old.status==="pending")showToast("已保存");}
}

if(!refuseFraming()) init().catch(err=>{
  console.error(err);
  showToast("应用初始化失败："+(err.message||err));
});
