import {
  getSetting,setSetting,putProfile,getProfile,
  putRecord,getRecord,getRecordsByDate,
  putDay,getDay,
  getLatestImportBackup,deleteImportBackup,replaceAllData
} from "./db.js";
import {ensureRecordTemplates,templateSourceLabel} from "./record-templates.js";
import {entryPreview,potentialDuplicate,recentConfirmed} from "./record-entry-utils.js";
import {renderProfileInsights} from "./profile-insights.js";

const $=id=>document.getElementById(id);
const qsa=selector=>Array.from(document.querySelectorAll(selector));

const CONTEXT_TAGS=["长牙","不舒服","疫苗后","外出多","环境变化","照护者不同"];
const DEFAULT_MODULES={
  sleep:true,milk:true,diet:true,diaper:true,wake:true,
  health:false,growth:false,medical:false,milestone:false,activity:false
};
const MODULES=[
  {id:"sleep",name:"睡眠",desc:"睡着 ～ 醒来",cls:"lav",icon:"moon"},
  {id:"milk",name:"吃奶",desc:"时间 + 奶量",cls:"pink",icon:"milk"},
  {id:"diet",name:"饮食",desc:"当前饮食阶段",cls:"peach",icon:"diet"},
  {id:"diaper",name:"换尿布",desc:"尿 / 便 / 量 / 颜色",cls:"mint",icon:"diaper"},
  {id:"wake",name:"夜间醒来",desc:"记录夜间醒来",cls:"blue",icon:"wake"},
  {id:"health",name:"健康 / 用药",desc:"体温、症状、药物",cls:"pink",icon:"health"},
  {id:"growth",name:"成长测量",desc:"体重、身高、头围",cls:"lav",icon:"growth"},
  {id:"medical",name:"疫苗 / 就诊",desc:"疫苗、儿保、门诊",cls:"blue",icon:"medical"},
  {id:"milestone",name:"发育里程碑",desc:"翻身、坐、爬、出牙",cls:"peach",icon:"milestone"},
  {id:"activity",name:"活动 / 户外",desc:"活动量和户外",cls:"mint",icon:"activity"}
];
const ICONS={
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

const state={
  date:localDateKey(new Date()),
  modules:{...DEFAULT_MODULES},
  displaySize:"standard",
  currentProfile:null,
  dietStage:"辅食",
  modal:null,
  lastDeleted:null,
  lastToday:null
};

function refuseFraming(){
  if(window.top===window.self)return false;
  document.body.replaceChildren();
  const box=document.createElement("div");
  box.textContent="为保护本机记录，本页面不能嵌入其它网站中使用。";
  box.style.padding="24px";
  box.style.fontFamily="system-ui,sans-serif";
  document.body.appendChild(box);
  return true;
}
function uuid(){
  return crypto.randomUUID?crypto.randomUUID():`id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function nowISO(){return new Date().toISOString();}
function localDateKey(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function parseDateKey(value){return new Date(`${value}T12:00:00`);}
function shiftDateKey(value,days){
  const date=parseDateKey(value);
  date.setDate(date.getDate()+days);
  return localDateKey(date);
}
function weekdayCN(dateKey){
  return ["周日","周一","周二","周三","周四","周五","周六"][parseDateKey(dateKey).getDay()];
}
function minutesOf(value){
  if(!/^\d{2}:\d{2}$/.test(value||""))return null;
  const [hour,minute]=value.split(":").map(Number);
  return hour*60+minute;
}
function durationMinutes(start,end){
  const a=minutesOf(start),b=minutesOf(end);
  if(a==null||b==null)return null;
  let minutes=b-a;
  if(minutes<0)minutes+=1440;
  return minutes;
}
function fmtDuration(minutes){
  if(minutes==null)return "—";
  if(minutes<60)return `${minutes}分钟`;
  const hour=Math.floor(minutes/60),rest=minutes%60;
  return rest?`${hour}h${rest}m`:`${hour}h`;
}
function escapeHTML(value=""){
  return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function setSavedStatus(text="已保存"){
  const node=$("saveStatus");
  if(node)node.textContent=text;
}
function markSaving(){
  setSavedStatus("正在保存…");
  clearTimeout(markSaving.timer);
  markSaving.timer=setTimeout(()=>setSavedStatus("本地离线保存"),900);
}
function showToast(text,actionText="",action=null){
  const toast=$("toast"),label=$("toastText"),button=$("toastAction");
  if(!toast||!label)return;
  label.textContent=text;
  toast.classList.remove("hidden");
  if(actionText&&action&&button){
    button.textContent=actionText;
    button.classList.remove("hidden");
    button.onclick=async()=>{await action();hideToast();};
  }else if(button){
    button.classList.add("hidden");
    button.onclick=null;
  }
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(hideToast,4200);
}
function hideToast(){$("toast")?.classList.add("hidden");}
function currentTimeValue(){
  const date=new Date();
  return `${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}
function fillNow(input){
  if(!input)return;
  input.value=currentTimeValue();
  input.dispatchEvent(new Event("change",{bubbles:true}));
}
function debounce(fn,ms){
  let timer;
  return (...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),ms);};
}

async function init(){
  const [modules,displaySize,email,currentProfileId]=await Promise.all([
    getSetting("modules",{}),
    getSetting("displaySize","standard"),
    getSetting("recipientEmail",""),
    getSetting("currentProfileId",null)
  ]);
  state.modules={...DEFAULT_MODULES,...modules};
  state.displaySize=displaySize;
  $("recipientEmail").value=email;
  if(!await getSetting("deviceId",""))await setSetting("deviceId",uuid());

  if(currentProfileId)state.currentProfile=await getProfile(currentProfileId);
  if(state.currentProfile)state.dietStage=state.currentProfile.stage?.dietStage||"辅食";

  document.body.classList.toggle("large-text",state.displaySize==="large");
  qsa("[data-display]").forEach(button=>button.classList.toggle("active",button.dataset.display===state.displaySize));

  $("pageDate").value=state.date;
  setExportDates();
  bindStaticEvents();
  await loadProfileUI(false);
  renderModuleSettings();
  await loadDay();
}

function bindStaticEvents(){
  qsa(".nav button").forEach(button=>button.onclick=()=>showView(button.dataset.view));
  $("prevDay").onclick=()=>changeDate(shiftDateKey(state.date,-1),false);
  $("nextDay").onclick=()=>changeDate(shiftDateKey(state.date,1),false);
  $("todayBtn").onclick=()=>changeDate(localDateKey(new Date()),true);
  $("pageDate").onchange=()=>changeDate($("pageDate").value,false);

  $("contextToggle").onclick=()=>{
    $("contextPanel").classList.toggle("open");
    $("contextToggle").textContent=$("contextPanel").classList.contains("open")?"收起":"＋ 标记";
  };
  $("contextNote").addEventListener("input",debounce(saveContext,650));

  qsa("[data-diet-stage]").forEach(button=>button.onclick=()=>{
    qsa("[data-diet-stage]").forEach(item=>item.classList.toggle("active",item===button));
    state.dietStage=button.dataset.dietStage;
  });
  $("correctProfileBtn").onclick=()=>saveProfile(false);
  $("newStageBtn").onclick=()=>saveProfile(true);

  qsa("[data-display]").forEach(button=>button.onclick=async()=>{
    state.displaySize=button.dataset.display;
    qsa("[data-display]").forEach(item=>item.classList.toggle("active",item===button));
    document.body.classList.toggle("large-text",state.displaySize==="large");
    await setSetting("displaySize",state.displaySize);
  });
  qsa("[data-open]").forEach(button=>button.onclick=()=>openRecordModal(button.dataset.open));

  $("recipientEmail").addEventListener("change",async()=>{
    await setSetting("recipientEmail",$("recipientEmail").value.trim());
  });
  $("copyEmailBtn").onclick=copyRecipientEmail;
  $("undoImportBtn").onclick=undoLatestImport;

  $("modalClose").onclick=closeModal;
  $("modalCancel").onclick=closeModal;
  $("modalSave").onclick=()=>saveModal(false);
  $("modalSaveContinue").onclick=()=>saveModal(true);
  $("modal").onclick=event=>{if(event.target===$("modal"))closeModal();};

  function checkDayBoundary(){
    const today=localDateKey(new Date());
    if(state.date===state.lastToday&&today!==state.lastToday)changeDate(today,true);
    state.lastToday=today;
  }
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible")checkDayBoundary();
  });
  state.lastToday=localDateKey(new Date());
  setInterval(checkDayBoundary,60000);
}

function showView(name){
  qsa(".view").forEach(view=>view.classList.toggle("active",view.id===`${name}View`));
  qsa(".nav button").forEach(button=>button.classList.toggle("active",button.dataset.view===name));
  if(name==="profile")void loadProfileUI(true);
  window.scrollTo({top:0,behavior:"smooth"});
}

async function changeDate(dateKey,followsToday=false){
  state.date=dateKey;
  $("pageDate").value=dateKey;
  resetSleepMetricPlaceholders();
  await loadDay();
  if(followsToday)state.lastToday=dateKey;
}
function updateDayTitle(){
  const today=localDateKey(new Date());
  const date=parseDateKey(state.date);
  $("dayRecordTitle").textContent=state.date===today
    ?"今天的记录"
    :`${date.getMonth()+1}月${date.getDate()}日 ${weekdayCN(state.date)}的记录`;
}
async function ensureDay(){
  let day=await getDay(state.date);
  if(day)return day;
  day={
    date:state.date,
    context:{tags:[],note:""},
    templateGenerated:false,
    templateGeneratedFrom:null,
    updatedAt:nowISO()
  };
  await putDay(day);
  return day;
}
async function loadDay(){
  updateDayTitle();
  const day=await ensureDay();
  await ensureRecordTemplates({date:state.date,day,dietStage:state.dietStage,nowISO});
  const freshDay=await getDay(state.date);
  await renderContext(freshDay);
  renderQuickbar();

  const records=await getRecordsByDate(state.date,{includeDeleted:false});
  renderMetrics(records);
  renderTimeline(records);
  $("timelineSub").textContent=`${parseDateKey(state.date).getMonth()+1}月${parseDateKey(state.date).getDate()}日`;
}

function confirmed(records){return records.filter(record=>record.status==="confirmed"&&!record.deleted);}
function pending(records){return records.filter(record=>record.status==="pending"&&!record.deleted);}
function setMetricText(id,text){
  const node=$(id);
  if(node&&node.textContent!==text)node.textContent=text;
}
function resetSleepMetricPlaceholders(){
  setMetricText("metricNapCountValue","—");
  setMetricText("metricNapTotalValue","—");
  setMetricText("metricNapTotalLabel","小睡总计");
  setMetricText("metricEarlyWakeValue","—");
  $("metrics")?.setAttribute("aria-busy","true");
}
function renderMetrics(records){
  const live=confirmed(records),templates=pending(records);
  const milkTotal=live.filter(record=>record.type==="milk").reduce((sum,record)=>sum+(Number(record.amount)||0),0);
  setMetricText("metricMilkTotalValue",milkTotal?`${milkTotal}ml`:"—");
  setMetricText("metricPendingCountValue",`${templates.length} 条`);
}
function recordTime(record){
  return record.time||record.startTime||record.wakeTime||"99:99";
}
function renderTimeline(records){
  const live=records.filter(record=>!record.deleted).sort((a,b)=>recordTime(a).localeCompare(recordTime(b)));
  const templates=pending(live);
  const detail=$("dayDetails"),count=$("timelineCount");
  if(count)count.textContent=`${live.length} 条${templates.length?` · ${templates.length} 待确认`:""}`;
  if(detail){
    const sameDate=detail.dataset.date===state.date;
    if(!sameDate)detail.open=templates.length>0;
    else if(templates.length)detail.open=true;
    detail.dataset.date=state.date;
  }
  if(templates.length){
    $("pendingSummary").classList.remove("hidden");
    $("pendingSummary").innerHTML=`<div><b>还有 ${templates.length} 条待确认模板</b><small>　未确认前不算正式记录</small></div>`;
  }else{
    $("pendingSummary").classList.add("hidden");
  }

  if(!live.length){
    $("timeline").innerHTML='<div class="empty-state">这一天还没有记录。可以从上方“快速记录”开始。</div>';
    return;
  }

  $("timeline").innerHTML=live.map(renderRecordRow).join("");
  qsa("[data-confirm-id]").forEach(button=>button.onclick=event=>{event.stopPropagation();void confirmPending(button.dataset.confirmId);});
  qsa("[data-skip-id]").forEach(button=>button.onclick=event=>{event.stopPropagation();void skipPending(button.dataset.skipId);});
  qsa("[data-edit-id]").forEach(button=>button.onclick=event=>{event.stopPropagation();void editRecord(button.dataset.editId);});
  qsa("[data-delete-id]").forEach(button=>button.onclick=event=>{event.stopPropagation();void deleteRecord(button.dataset.deleteId);});
  qsa("[data-pending-row]").forEach(row=>row.onclick=event=>{
    if(event.target.closest("button"))return;
    void editRecord(row.dataset.pendingRow);
  });
}
function renderRecordRow(record){
  const module=MODULES.find(item=>item.id===record.type);
  const icon=ICONS[module?.icon]||ICONS.medical;
  const label=recordLabel(record),sub=recordSub(record);
  if(record.status==="pending"){
    return `<div class="row pending-row" data-pending-row="${escapeHTML(record.id)}">
      <div class="time">${escapeHTML(recordTime(record)==="99:99"?"—":recordTime(record))}</div>
      <div class="typeicon">${icon}</div>
      <div class="rowbody"><div class="rowmain">${escapeHTML(label)} <span class="pending-badge">待确认</span></div><div class="rowsub">${escapeHTML(sub)}</div></div>
      <div class="rowactions"><button class="confirm-btn" data-confirm-id="${escapeHTML(record.id)}">确认</button><button class="skip-btn" data-skip-id="${escapeHTML(record.id)}">今天没有</button></div>
    </div>`;
  }
  return `<div class="row">
    <div class="time">${escapeHTML(recordTime(record)==="99:99"?"—":recordTime(record))}</div>
    <div class="typeicon">${icon}</div>
    <div class="rowbody"><div class="rowmain">${escapeHTML(label)}</div><div class="rowsub">${escapeHTML(sub)}</div></div>
    <div class="rowactions"><button class="edit" data-edit-id="${escapeHTML(record.id)}">修改</button><button class="del" data-delete-id="${escapeHTML(record.id)}">删除</button></div>
  </div>`;
}
function recordLabel(record){
  switch(record.type){
    case "milk":return `吃奶${record.amount?` · ${record.amount}ml`:""}`;
    case "diet":return `${record.dietType||state.dietStage}${record.content?` · ${record.content}`:""}`;
    case "sleep":return `睡眠 · ${record.startTime||"?"}～${record.endTime||"?"}`;
    case "diaper":return `换尿布 · ${record.diaperType||"未选择"}`;
    case "wake":return `夜间醒来 · ${record.wakeTime||"?"}`;
    case "health":return `健康 / 用药${record.temperature?` · ${record.temperature}℃`:""}`;
    case "growth":return `成长测量${record.weight?` · ${record.weight}kg`:""}`;
    case "medical":return record.eventType||"疫苗 / 就诊";
    case "milestone":return `发育里程碑 · ${record.milestone||"记录"}`;
    case "activity":return `活动 / 户外 · ${record.activityType||"记录"}`;
    default:return record.type;
  }
}
function recordSub(record){
  const sourceLabel=templateSourceLabel(record.templateSourceDate,state.date);
  if(record.status==="pending"&&record.type==="milk")return `参考${sourceLabel}：${record.time||"—"} · ${record.amount||"—"}ml · ${record.feedType||"未填写"}`;
  if(record.status==="pending"&&record.type==="diet")return `参考${sourceLabel}：${record.time||"—"} · ${record.dietType||state.dietStage}时段；内容和摄入量待填写`;
  switch(record.type){
    case "milk":return record.feedType||"";
    case "diet":return [record.amount,record.note].filter(Boolean).join(" · ");
    case "sleep":{
      const minutes=durationMinutes(record.startTime,record.endTime);
      return minutes!=null?fmtDuration(minutes):"记录未完整";
    }
    case "diaper":return [record.urineAmount&&`尿量${record.urineAmount}`,record.stoolAmount&&`便量${record.stoolAmount}`,record.stoolColor,record.stoolForm,record.note].filter(Boolean).join(" · ");
    case "wake":return [record.resultLabel,record.note].filter(Boolean).join(" · ");
    case "health":return [record.symptoms,record.medication].filter(Boolean).join(" · ");
    case "growth":return [record.height&&`${record.height}cm`,record.headCircumference&&`头围${record.headCircumference}cm`,record.sourceNote].filter(Boolean).join(" · ");
    case "medical":return [record.content,record.note].filter(Boolean).join(" · ");
    case "milestone":return record.description||"";
    case "activity":return [record.duration,record.note].filter(Boolean).join(" · ");
    default:return "";
  }
}

function renderQuickbar(){
  const enabled=MODULES.filter(module=>state.modules[module.id]);
  const hidden=MODULES.filter(module=>!state.modules[module.id]);
  $("quickbar").innerHTML=enabled.map(module=>{
    const title=module.id==="diet"?state.dietStage:module.name;
    const desc=module.id==="diet"?`点击直接记录${state.dietStage}`:module.desc;
    return `<button class="quick" data-quick="${module.id}">
      <span class="qicon ${module.cls}">${ICONS[module.icon]}</span>
      <span class="qcopy"><b>${escapeHTML(title)}</b><small>${escapeHTML(desc)}</small></span>
    </button>`;
  }).join("")+(hidden.length?`<button class="quick more" data-quick="more">
    <span class="qicon pink">${ICONS.medical}</span>
    <span class="qcopy"><b>更多记录</b><small>${hidden.length} 个未显示项目</small></span>
  </button>`:"");

  qsa("[data-quick]").forEach(button=>button.onclick=async()=>{
    const type=button.dataset.quick;
    if(type==="more"){openMoreModal();return;}
    if(type==="sleep")return;
    if(type==="milk"||type==="diet"){
      const candidates=(await getRecordsByDate(state.date,{includeDeleted:false}))
        .filter(record=>record.status==="pending"&&record.type===type)
        .sort((a,b)=>(a.time||"").localeCompare(b.time||""));
      openRecordModal(type,candidates[0]||null);
      return;
    }
    openRecordModal(type);
  });
}

async function renderContext(day){
  const context=day?.context||{tags:[],note:""};
  const tags=new Set(context.tags||[]);
  $("contextTags").innerHTML=CONTEXT_TAGS.map(tag=>`<button class="pill ${tags.has(tag)?"active":""}" data-context="${tag}">${tag}</button>`).join("");
  $("contextNote").value=context.note||"";
  $("contextSummary").textContent=tags.size?Array.from(tags).join(" · "):"暂无例外记录";
  qsa("[data-context]").forEach(button=>button.onclick=async()=>{
    button.classList.toggle("active");
    await saveContext();
  });
}
async function saveContext(){
  const day=await ensureDay();
  const tags=qsa("[data-context].active").map(button=>button.dataset.context);
  day.context={tags,note:$("contextNote").value.trim()};
  day.updatedAt=nowISO();
  markSaving();
  await putDay(day);
  $("contextSummary").textContent=tags.length?tags.join(" · "):"暂无例外记录";
  $("contextSave").textContent="✓ 已自动保存";
  setTimeout(()=>{$("contextSave").textContent="选择和备注会自动保存";},1000);
}

function openModal(title,body,{type=null,record=null,onSave=null}={}){
  state.modal={type,record,onSave};
  $("modalTitle").textContent=title;
  $("modalBody").innerHTML=body;
  $("modal").classList.remove("hidden");
  enhanceModal();
}
function closeModal(){
  $("modal").classList.add("hidden");
  state.modal=null;
}
function timeField(id,label,value=""){
  return `<label>${label}<div class="time-row"><input id="${id}" type="time" value="${escapeHTML(value)}"><button type="button" class="now-btn" data-now="${id}">现在</button></div></label>`;
}
function recentEntryMarkup(type,records,currentId=""){
  const all=(records||[]).filter(record=>record.type===type&&record.status==="confirmed"&&!record.deleted);
  const recent=recentConfirmed(records,type,{excludeId:currentId,limit:3});
  if(!all.length||!recent.length)return "";
  return `<section class="record-recent" aria-label="今天最近同类记录">
    <div class="record-recent-title"><div><b>今天已记录 ${all.length} 次</b><small>补录前可以先确认一下</small></div><span>最近 ${recent.length} 条</span></div>
    <div class="record-recent-list">${recent.map(item=>{const preview=entryPreview(item,{dietStage:state.dietStage});return `<button type="button" class="record-recent-item" data-recent-edit-id="${escapeHTML(item.id)}"><time>${escapeHTML(preview.time)}</time><span><b>${escapeHTML(preview.main)}</b>${preview.sub?`<small>${escapeHTML(preview.sub)}</small>`:""}</span><em>修改</em></button>`;}).join("")}</div>
  </section>`;
}
async function openRecordModal(type,record=null){
  if(type==="sleep")return;
  const item=record||{};
  const sourceLabel=templateSourceLabel(item.templateSourceDate,state.date);
  let title="",body="";
  if(type==="milk"){
    title=item.status==="pending"?"确认今日吃奶":(item.id?"修改吃奶":"添加吃奶");
    body=`<div class="fields2">${timeField("fTime","时间",item.time||"")}
      <label>奶量 ml<input id="fAmount" type="number" inputmode="numeric" value="${escapeHTML(item.amount||"")}" placeholder="例如：180"></label></div>
      <label class="form-label">类型<select id="fFeedType">
        ${["配方奶","母乳瓶喂","母乳亲喂"].map(value=>`<option ${value===(item.feedType||"配方奶")?"selected":""}>${value}</option>`).join("")}
      </select></label>
      ${item.status==="pending"?`<div class="smallnote">时间、奶量和类型参考${escapeHTML(sourceLabel)}。完全一致可直接保存并确认；有变化就改完再保存。</div>`:""}`;
  }else if(type==="diet"){
    title=item.status==="pending"?`确认今日${state.dietStage}`:(item.id?`修改${state.dietStage}`:`添加${state.dietStage}`);
    const selected=item.dietType||state.dietStage;
    body=`<label>本次类型</label><div class="optionchips" id="dietTypeChips">
        ${[state.dietStage,"水果","饮水","加餐","其它"].map((value,index)=>`<button type="button" class="optionchip ${value===selected||(!item.dietType&&index===0)?"active":""}" data-choice="${value}">${value}</button>`).join("")}
      </div>
      <div class="fields2 form-label">${timeField("fTime","时间",item.time||"")}
        <label>摄入量<input id="fAmountText" type="text" value="${escapeHTML(item.amount||"")}" placeholder="例如：半碗；几口；约80ml"></label></div>
      <label class="form-label">吃了什么<input id="fContent" type="text" value="${escapeHTML(item.content||"")}" placeholder="例如：米糊 + 南瓜泥"></label>
      ${item.status==="pending"?`<div class="smallnote">这里只参考${escapeHTML(sourceLabel)}的时间和当前饮食阶段。今天吃了什么、吃了多少仍需按实际填写。</div>`:""}`;
  }else if(type==="diaper"){
    const kind=item.diaperType||"尿";
    title=item.id?"修改换尿布":"添加换尿布";
    body=`<div class="fields2">${timeField("fTime","时间",item.time||"")}
      <label>类型<div class="optionchips" id="diaperKind">
      ${["尿","便","尿 + 便"].map(value=>`<button type="button" class="optionchip ${value===kind?"active":""}" data-kind="${value}">${value}</button>`).join("")}</div></label></div>
      <div id="urineArea" class="${kind==="便"?"hidden":""} form-label"><label>尿量<div class="optionchips" id="urineAmount">
      ${["少","中","多"].map(value=>`<button type="button" class="optionchip ${value===(item.urineAmount||"中")?"active":""}" data-choice="${value}">${value}</button>`).join("")}</div></label></div>
      <div id="stoolArea" class="${kind==="尿"?"hidden":""}">
        <div class="form-divider"></div>
        <div class="fields2">
          <label>便量<div class="optionchips" id="stoolAmount">${["少","中","多"].map(value=>`<button type="button" class="optionchip ${value===item.stoolAmount?"active":""}" data-choice="${value}">${value}</button>`).join("")}</div></label>
          <label>颜色<div class="optionchips" id="stoolColor">${["黄","棕","绿","黑","红","灰白","其它"].map(value=>`<button type="button" class="optionchip ${value===item.stoolColor?"active":""}" data-choice="${value}">${value}</button>`).join("")}</div></label>
        </div>
        <label class="form-label">性状<div class="optionchips" id="stoolForm">${["水样","稀","糊状","较稠","成形","偏硬","其它"].map(value=>`<button type="button" class="optionchip ${value===item.stoolForm?"active":""}" data-choice="${value}">${value}</button>`).join("")}</div></label>
      </div>
      <label class="form-label">备注<input id="fNote" type="text" value="${escapeHTML(item.note||"")}" placeholder="例如：比平时稀；颜色明显不同"></label>`;
  }else if(type==="wake"){
    title=item.id?"修改夜间醒来":"添加夜间醒来";
    body=`<div class="fields2">${timeField("fWake","几点醒",item.wakeTime||"")}${timeField("fResleep","几点又睡着",item.resleepTime||"")}</div>
      <label class="form-label">结果<select id="fWakeResult">
        <option value="reslept" ${item.result==="reslept"?"selected":""}>后来重新睡着</option>
        <option value="no_resleep" ${item.result==="no_resleep"?"selected":""}>一直没再睡到起床</option>
        <option value="unknown" ${!item.result||item.result==="unknown"?"selected":""}>暂时不知道</option>
      </select></label>
      <label class="form-label">备注<input id="fNote" type="text" value="${escapeHTML(item.note||"")}" placeholder="例如：抱哄20分钟；喂奶后仍清醒"></label>`;
  }else if(type==="health"){
    title=item.id?"修改健康 / 用药":"添加健康 / 用药";
    body=`<div class="fields2">${timeField("fTime","时间",item.time||"")}<label>体温 ℃<input id="fTemp" type="number" step="0.1" value="${escapeHTML(item.temperature||"")}" placeholder="例如：37.6"></label></div>
      <label class="form-label">症状<input id="fSymptoms" type="text" value="${escapeHTML(item.symptoms||"")}" placeholder="例如：鼻塞、咳嗽、精神一般"></label>
      <label class="form-label">用药<input id="fMedication" type="text" value="${escapeHTML(item.medication||"")}" placeholder="例如：药名 + 实际剂量"></label>`;
  }else if(type==="growth"){
    title=item.id?"修改成长测量":"添加成长测量";
    body=`<div class="fields2">
      <label>体重 kg<input id="fWeight" type="number" step="0.01" value="${escapeHTML(item.weight||"")}" placeholder="例如：8.20"></label>
      <label>身高 cm<input id="fHeight" type="number" step="0.1" value="${escapeHTML(item.height||"")}" placeholder="例如：69.5"></label>
      <label>头围 cm<input id="fHead" type="number" step="0.1" value="${escapeHTML(item.headCircumference||"")}" placeholder="例如：44"></label>
      <label>测量来源<input id="fSource" type="text" value="${escapeHTML(item.sourceNote||"")}" placeholder="例如：社区体检；家用秤"></label></div>`;
  }else if(type==="medical"){
    title=item.id?"修改疫苗 / 就诊":"添加疫苗 / 就诊";
    body=`<label>事件类型</label><div class="optionchips" id="eventType">${["疫苗","儿保","门诊","急诊","其它"].map(value=>`<button type="button" class="optionchip ${value===(item.eventType||"疫苗")?"active":""}" data-choice="${value}">${value}</button>`).join("")}</div>
      <label class="form-label">内容<input id="fContent" type="text" value="${escapeHTML(item.content||"")}" placeholder="例如：接种某疫苗；因咳嗽就诊"></label>
      <label class="form-label">备注<textarea id="fNote" placeholder="例如：医生建议；接种后的观察情况">${escapeHTML(item.note||"")}</textarea></label>`;
  }else if(type==="milestone"){
    title=item.id?"修改发育里程碑":"添加发育里程碑";
    body=`<label>里程碑</label><div class="optionchips" id="milestoneType">${["翻身","独坐","爬行","扶站","出牙","语言","其它"].map(value=>`<button type="button" class="optionchip ${value===(item.milestone||"翻身")?"active":""}" data-choice="${value}">${value}</button>`).join("")}</div>
      <label class="form-label">描述<input id="fDescription" type="text" value="${escapeHTML(item.description||"")}" placeholder="例如：第一次可以稳定独坐约1分钟"></label>`;
  }else if(type==="activity"){
    title=item.id?"修改活动 / 户外":"添加活动 / 户外";
    body=`<label>活动类型</label><div class="optionchips" id="activityType">${["户外","大运动","亲子活动","其它"].map(value=>`<button type="button" class="optionchip ${value===(item.activityType||"户外")?"active":""}" data-choice="${value}">${value}</button>`).join("")}</div>
      <div class="fields2 form-label">${timeField("fTime","开始时间",item.time||"")}<label>大概时长<input id="fDuration" type="text" value="${escapeHTML(item.duration||"")}" placeholder="例如：45分钟；约2小时"></label></div>
      <label class="form-label">备注<input id="fNote" type="text" value="${escapeHTML(item.note||"")}" placeholder="例如：今天户外明显比平时久"></label>`;
  }else{
    return;
  }
  if(["milk","diet","diaper"].includes(type)){
    const dayRecords=await getRecordsByDate(state.date,{includeDeleted:false});
    body=`${recentEntryMarkup(type,dayRecords,item.id||"")}${body}<div id="recordDuplicateWarning" class="record-duplicate-warning hidden"></div>`;
  }
  openModal(title,body,{type,record:item});
}
function openMoreModal(){
  const hidden=MODULES.filter(module=>!state.modules[module.id]);
  const body=`<div class="smallnote">这些项目当前没有放在首页，但仍可临时记录。</div>
    <div class="module-grid form-label">${hidden.map(module=>`<button class="mode" data-more="${module.id}"><b>${module.name}</b><span>${module.desc}</span></button>`).join("")}</div>`;
  openModal("更多记录",body,{type:"more"});
  qsa("[data-more]").forEach(button=>button.onclick=()=>openRecordModal(button.dataset.more));
}
function enhanceModal(){
  qsa("[data-now]").forEach(button=>button.onclick=()=>fillNow($(button.dataset.now)));
  qsa("[data-recent-edit-id]").forEach(button=>button.onclick=event=>{event.preventDefault();void editRecord(button.dataset.recentEditId);});
  qsa(".optionchips").forEach(group=>{
    const chips=Array.from(group.querySelectorAll(".optionchip"));
    chips.forEach(chip=>chip.onclick=event=>{
      event.preventDefault();
      chips.forEach(item=>item.classList.remove("active"));
      chip.classList.add("active");
      if(chip.dataset.kind){
        $("urineArea")?.classList.toggle("hidden",chip.dataset.kind==="便");
        $("stoolArea")?.classList.toggle("hidden",chip.dataset.kind==="尿");
      }
    });
  });
}
function activeChoice(id,attr="choice"){
  return document.querySelector(`#${id} .optionchip.active`)?.dataset?.[attr]||"";
}

async function confirmPending(id){
  const record=await getRecord(id);
  if(!record)return;
  if(record.type==="diet"&&!record.content&&!record.amount){
    openRecordModal("diet",record);
    return;
  }
  record.status="confirmed";
  record.updatedAt=nowISO();
  markSaving();
  await putRecord(record);
  await loadDay();
}
async function skipPending(id){
  const record=await getRecord(id);
  if(!record)return;
  record.deleted=true;
  record.deleteReason="not_occurred";
  record.updatedAt=nowISO();
  await putRecord(record);
  await loadDay();
}
async function editRecord(id){
  const record=await getRecord(id);
  if(!record||record.type==="sleep")return;
  openRecordModal(record.type,record);
}
async function deleteRecord(id){
  const record=await getRecord(id);
  if(!record)return;
  record.deleted=true;
  record.deletedAt=nowISO();
  record.updatedAt=nowISO();
  await putRecord(record);
  state.lastDeleted={...record};
  await loadDay();
  showToast("记录已删除","撤销",async()=>{
    if(!state.lastDeleted)return;
    await putRecord({...state.lastDeleted,deleted:false,deletedAt:null,updatedAt:nowISO()});
    await loadDay();
  });
}

async function loadProfileUI(includeInsights=false){
  const profile=state.currentProfile;
  if(profile){
    const stage=profile.stage||{};
    if($("babyName"))$("babyName").value=profile.base?.name||"";
    $("birthDate").value=profile.base?.birthDate||"";
    $("sex").value=profile.base?.sex||"";
    $("feedingMode").value=stage.feedingMode||"";
    $("weekdayCaregiver").value=stage.caregivers?.weekday||stage.weekday?.caregiver||"";
    $("weekendCaregiver").value=stage.caregivers?.weekend||stage.weekend?.caregiver||"";
    $("sleepEnvironment").value=stage.sleepEnvironment||"";
    $("mainIssue").value=stage.mainIssue||"";
    state.dietStage=stage.dietStage||"辅食";
    $("profileVersionInfo").innerHTML=`当前档案：<b>V${escapeHTML(profile.version)}</b> · 从 <b>${escapeHTML(profile.effectiveFrom)}</b> 起生效。近期规律由实际记录自动计算，不需要维护“典型小睡”等重复信息。`;
  }else{
    $("profileVersionInfo").innerHTML="<b>尚未创建档案。</b> 首次填写后点“保存当前档案”即可创建 V1。";
  }
  qsa("[data-diet-stage]").forEach(button=>button.classList.toggle("active",button.dataset.dietStage===state.dietStage));
  if(includeInsights)await renderProfileInsights($("profileInsights"),localDateKey(new Date()));
}
function profileFormValue(){
  const current=state.currentProfile||{},base=current.base||{};
  return {
    base:{
      ...base,
      name:$("babyName")?.value.trim()||base.name||"",
      birthDate:$("birthDate").value,
      sex:$("sex").value
    },
    stage:{
      dietStage:state.dietStage,
      feedingMode:$("feedingMode").value,
      caregivers:{
        weekday:$("weekdayCaregiver").value.trim(),
        weekend:$("weekendCaregiver").value.trim()
      },
      sleepEnvironment:$("sleepEnvironment").value.trim(),
      mainIssue:$("mainIssue").value.trim()
    }
  };
}
async function saveProfile(newStage){
  const value=profileFormValue();
  if(!state.currentProfile){
    const profile={id:uuid(),version:1,effectiveFrom:state.date,createdAt:nowISO(),updatedAt:nowISO(),...value};
    await putProfile(profile);
    await setSetting("currentProfileId",profile.id);
    state.currentProfile=profile;
  }else if(!newStage){
    const profile={...state.currentProfile,...value,updatedAt:nowISO()};
    await putProfile(profile);
    state.currentProfile=profile;
  }else{
    openModal("宝宝进入新阶段",`<label>从哪一天开始生效<input id="stageEffectiveFrom" type="date" value="${state.date}"></label>
      <div class="smallnote">例如辅食正式过渡到正餐，或长期喂养方式、主要照护者、睡眠环境发生变化。小睡次数和通常入睡时间会从记录自动推导，不需要为了它们单独建阶段。只是填错内容请不要创建新阶段。</div>`,
    {type:"newStage",onSave:async()=>{
      const profile={
        id:uuid(),version:(state.currentProfile.version||1)+1,effectiveFrom:$("stageEffectiveFrom").value,
        createdAt:nowISO(),updatedAt:nowISO(),...value
      };
      await putProfile(profile);
      await setSetting("currentProfileId",profile.id);
      state.currentProfile=profile;
      await loadProfileUI(true);
      renderQuickbar();
      showToast("已创建新的成长阶段");
    }});
    return;
  }
  state.dietStage=state.currentProfile.stage?.dietStage||"辅食";
  await loadProfileUI(true);
  renderQuickbar();
  showToast("档案已保存");
}
function renderModuleSettings(){
  $("moduleGrid").innerHTML=MODULES.map(module=>`<div class="module">
    <div class="modulecopy"><b>${module.name}</b><small>${module.id==="diet"?`当前：${state.dietStage}`:module.desc}</small></div>
    <span class="toggle ${state.modules[module.id]?"on":""}" data-module="${module.id}"></span>
  </div>`).join("");
  qsa("[data-module]").forEach(toggle=>toggle.onclick=async()=>{
    state.modules[toggle.dataset.module]=!state.modules[toggle.dataset.module];
    await setSetting("modules",state.modules);
    renderModuleSettings();
    renderQuickbar();
  });
}

function setExportDates(){
  const today=localDateKey(new Date());
  $("exportEnd").value=today;
  $("exportStart").value=shiftDateKey(today,-6);
}
async function copyRecipientEmail(){
  const email=$("recipientEmail").value.trim();
  if(!email){showToast("请先填写接收邮箱");return;}
  try{
    await navigator.clipboard.writeText(email);
    showToast("邮箱已复制");
  }catch{
    showToast("无法自动复制，请手动复制邮箱");
  }
}
async function undoLatestImport(){
  const backup=await getLatestImportBackup();
  if(!backup){showToast("没有可撤销的导入");return;}
  await replaceAllData(backup.snapshot);
  await deleteImportBackup(backup.id);
  location.reload();
}

function showDuplicateWarning(existing,continueAfter){
  const box=$("recordDuplicateWarning");
  if(!box)return false;
  const preview=entryPreview(existing,{dietStage:state.dietStage});
  box.classList.remove("hidden");
  box.innerHTML=`<b>可能已经记录过这一条</b><span>${escapeHTML(preview.time)} 已有：${escapeHTML(preview.main)}${preview.sub?` · ${escapeHTML(preview.sub)}`:""}</span><div><button type="button" class="secondary" data-duplicate-edit>修改已有</button><button type="button" class="primary" data-duplicate-keep>仍然新增</button></div>`;
  box.querySelector("[data-duplicate-edit]").onclick=()=>void editRecord(existing.id);
  box.querySelector("[data-duplicate-keep]").onclick=()=>{if(!state.modal)return;state.modal.duplicateAccepted=true;void saveModal(continueAfter);};
  box.scrollIntoView({block:"nearest",behavior:"smooth"});
  return true;
}
async function saveModal(continueAfter){
  if(state.modal?.onSave){
    const save=state.modal.onSave;
    closeModal();
    await save();
    return;
  }
  if(!state.modal||state.modal.type==="more")return closeModal();

  const type=state.modal.type;
  if(type==="sleep")return closeModal();
  const old=state.modal.record||{};
  const isNew=!old.id;
  const base={
    ...old,
    id:old.id||uuid(),
    date:state.date,
    type,
    status:"confirmed",
    deleted:false,
    createdAt:old.createdAt||nowISO(),
    updatedAt:nowISO()
  };

  if(type==="milk"){
    base.time=$("fTime").value;
    base.amount=$("fAmount").value;
    base.feedType=$("fFeedType").value;
  }else if(type==="diet"){
    base.time=$("fTime").value;
    base.dietType=activeChoice("dietTypeChips")||state.dietStage;
    base.amount=$("fAmountText").value.trim();
    base.content=$("fContent").value.trim();
  }else if(type==="diaper"){
    base.time=$("fTime").value;
    base.diaperType=activeChoice("diaperKind","kind")||"尿";
    base.urineAmount=base.diaperType==="便"?"":activeChoice("urineAmount");
    base.stoolAmount=base.diaperType==="尿"?"":activeChoice("stoolAmount");
    base.stoolColor=base.diaperType==="尿"?"":activeChoice("stoolColor");
    base.stoolForm=base.diaperType==="尿"?"":activeChoice("stoolForm");
    base.note=$("fNote").value.trim();
  }else if(type==="wake"){
    base.wakeTime=$("fWake").value;
    base.resleepTime=$("fResleep").value;
    base.result=$("fWakeResult").value;
    base.resultLabel={reslept:"后来重新睡着",no_resleep:"一直没再睡到起床",unknown:"暂时不知道"}[base.result];
    base.note=$("fNote").value.trim();
  }else if(type==="health"){
    base.time=$("fTime").value;
    base.temperature=$("fTemp").value;
    base.symptoms=$("fSymptoms").value.trim();
    base.medication=$("fMedication").value.trim();
  }else if(type==="growth"){
    base.time="";
    base.weight=$("fWeight").value;
    base.height=$("fHeight").value;
    base.headCircumference=$("fHead").value;
    base.sourceNote=$("fSource").value.trim();
  }else if(type==="medical"){
    base.time="";
    base.eventType=activeChoice("eventType");
    base.content=$("fContent").value.trim();
    base.note=$("fNote").value.trim();
  }else if(type==="milestone"){
    base.time="";
    base.milestone=activeChoice("milestoneType");
    base.description=$("fDescription").value.trim();
  }else if(type==="activity"){
    base.time=$("fTime").value;
    base.activityType=activeChoice("activityType");
    base.duration=$("fDuration").value.trim();
    base.note=$("fNote").value.trim();
  }else{
    return closeModal();
  }

  if(!state.modal.duplicateAccepted&&["milk","diet","diaper"].includes(type)){
    const records=await getRecordsByDate(state.date,{includeDeleted:false});
    const duplicate=potentialDuplicate(base,records);
    if(duplicate&&showDuplicateWarning(duplicate,continueAfter))return;
  }

  markSaving();
  await putRecord(base);
  await loadDay();
  if(continueAfter)openRecordModal(type);
  else{
    closeModal();
    if(isNew||old.status==="pending")showToast("已保存");
  }
}

if(!refuseFraming()){
  init().catch(error=>{
    console.error(error);
    showToast(`应用初始化失败：${error.message||error}`);
  });
}
