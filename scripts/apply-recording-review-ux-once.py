from pathlib import Path
import re

ROOT=Path('.')

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')
def replace_once(path,old,new,label):
    text=read(path)
    count=text.count(old)
    if count!=1: raise RuntimeError(f'{label}: expected 1 occurrence in {path}, got {count}')
    write(path,text.replace(old,new,1))
def append_once(path,marker,addition,label):
    text=read(path)
    if addition.strip() in text: return
    if marker not in text: raise RuntimeError(f'{label}: marker missing in {path}')
    write(path,text.replace(marker,marker+addition,1))

# Pure record-entry helper shared by app dialogs and Sleep recent-context UI.
write('record-entry-utils.js', r'''function clockMinutes(value){
  if(!/^\d{2}:\d{2}$/.test(value||""))return null;
  const [hour,minute]=value.split(":").map(Number);
  return hour*60+minute;
}
export function recordEntryClock(record){
  return record?.time||record?.wakeTime||record?.startTime||record?.temporal?.occurred?.time||record?.temporal?.wake?.time||record?.temporal?.start?.time||"";
}
export function recentConfirmed(records,type,{excludeId="",limit=3}={}){
  return (records||[])
    .filter(record=>record?.type===type&&record.status==="confirmed"&&!record.deleted&&record.id!==excludeId)
    .sort((a,b)=>{
      const clock=recordEntryClock(b).localeCompare(recordEntryClock(a));
      if(clock)return clock;
      return String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||""));
    })
    .slice(0,Math.max(0,limit));
}
export function entryPreview(record,{dietStage="饮食"}={}){
  const time=recordEntryClock(record)||"—";
  if(record?.type==="milk")return {time,main:record.amount?`${record.amount}ml`:"吃奶",sub:record.feedType||""};
  if(record?.type==="diet")return {time,main:[record.dietType||dietStage,record.content].filter(Boolean).join(" · ")||dietStage,sub:record.amount||""};
  if(record?.type==="diaper")return {time,main:`换尿布 · ${record.diaperType||"未选择"}`,sub:[record.stoolColor,record.stoolForm,record.stoolAmount&&`便量${record.stoolAmount}`,record.urineAmount&&`尿量${record.urineAmount}`].filter(Boolean).join(" · ")};
  return {time,main:record?.type||"记录",sub:""};
}
function closeInTime(a,b,maxMinutes){
  const x=clockMinutes(recordEntryClock(a)),y=clockMinutes(recordEntryClock(b));
  if(x==null||y==null)return false;
  const delta=Math.abs(x-y);
  return Math.min(delta,1440-delta)<=maxMinutes;
}
function sameText(a,b){
  const x=String(a||"").trim().toLowerCase(),y=String(b||"").trim().toLowerCase();
  return !x||!y||x===y;
}
export function potentialDuplicate(candidate,records){
  if(!candidate||!["milk","diet","diaper"].includes(candidate.type))return null;
  const peers=(records||[]).filter(record=>record?.type===candidate.type&&record.status==="confirmed"&&!record.deleted&&record.id!==candidate.id&&record.date===candidate.date);
  for(const record of peers){
    if(candidate.type==="milk"){
      if(!closeInTime(candidate,record,20)||!sameText(candidate.feedType,record.feedType))continue;
      const a=Number(candidate.amount),b=Number(record.amount);
      if(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)>20)continue;
      return record;
    }
    if(candidate.type==="diet"){
      if(!closeInTime(candidate,record,20))continue;
      if(!sameText(candidate.dietType,record.dietType)||!sameText(candidate.content,record.content))continue;
      return record;
    }
    if(candidate.type==="diaper"){
      if(closeInTime(candidate,record,15)&&sameText(candidate.diaperType,record.diaperType))return record;
    }
  }
  return null;
}
''')

# Canonical strict daytime-nap predicate: one owner shared by Profile and History.
replace_once('record-model.js',
'''export function sleepLocalRange(record){
  const start=temporalNode(record,"start"),end=temporalNode(record,"end");
  return {startDate:start?.date||"",startTime:start?.time||"",endDate:end?.date||"",endTime:end?.time||""};
}
export function wakeLocalRange(record){''',
'''export function sleepLocalRange(record){
  const start=temporalNode(record,"start"),end=temporalNode(record,"end");
  return {startDate:start?.date||"",startTime:start?.time||"",endDate:end?.date||"",endTime:end?.time||""};
}
export function isStrictDayNap(record){
  if(record?.type!=="sleep"||record.nightAnchor)return false;
  const duration=recordDurationMinutes(record),range=sleepLocalRange(record);
  if(!Number.isFinite(duration)||duration<10||duration>210||!range.startDate||range.startDate!==range.endDate)return false;
  const toMinutes=value=>{if(!validClock(value))return null;const [hour,minute]=value.split(":").map(Number);return hour*60+minute;};
  const start=toMinutes(range.startTime),end=toMinutes(range.endTime);
  return start!=null&&end!=null&&start>=5*60&&end<=21*60;
}
export function wakeLocalRange(record){''', 'add shared strict nap classifier')

replace_once('profile-insights.js',
'import {recordDurationMinutes,shiftDateKey,sleepLocalRange} from "./record-model.js";',
'import {isStrictDayNap,recordDurationMinutes,shiftDateKey,sleepLocalRange} from "./record-model.js";',
'profile insights imports shared nap classifier')
text=read('profile-insights.js')
text,n=re.subn(r'function strictDayNap\(record\)\{.*?\n\}\nfunction topMethod', 'function topMethod', text, count=1, flags=re.S)
if n!=1: raise RuntimeError('remove profile-local strictDayNap failed')
text=text.replace('if(strictDayNap(record)){','if(isStrictDayNap(record)){')
write('profile-insights.js',text)

# App: recent same-type context, duplicate hint, and collapsible day-details state.
replace_once('app.js',
'import {ensureRecordTemplates,templateSourceLabel} from "./record-templates.js";\nimport {renderProfileInsights} from "./profile-insights.js";',
'import {ensureRecordTemplates,templateSourceLabel} from "./record-templates.js";\nimport {entryPreview,potentialDuplicate,recentConfirmed} from "./record-entry-utils.js";\nimport {renderProfileInsights} from "./profile-insights.js";',
'app import record entry helper')
replace_once('app.js',
'''  const templates=pending(live);
  if(templates.length){''',
'''  const templates=pending(live);
  const detail=$("dayDetails"),count=$("timelineCount");
  if(count)count.textContent=`${live.length} 条${templates.length?` · ${templates.length} 待确认`:""}`;
  if(detail){
    const sameDate=detail.dataset.date===state.date;
    if(!sameDate)detail.open=templates.length>0;
    else if(templates.length)detail.open=true;
    detail.dataset.date=state.date;
  }
  if(templates.length){''','day details state')
replace_once('app.js',
'''function timeField(id,label,value=""){
  return `<label>${label}<div class="time-row"><input id="${id}" type="time" value="${escapeHTML(value)}"><button type="button" class="now-btn" data-now="${id}">现在</button></div></label>`;
}
async function openRecordModal(type,record=null){''',
'''function timeField(id,label,value=""){
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
async function openRecordModal(type,record=null){''','add recent record markup')
replace_once('app.js',
'''  }else{
    return;
  }
  openModal(title,body,{type,record:item});
}''',
'''  }else{
    return;
  }
  if(["milk","diet","diaper"].includes(type)){
    const dayRecords=await getRecordsByDate(state.date,{includeDeleted:false});
    body=`${recentEntryMarkup(type,dayRecords,item.id||"")}${body}<div id="recordDuplicateWarning" class="record-duplicate-warning hidden"></div>`;
  }
  openModal(title,body,{type,record:item});
}''','inject recent context into frequent dialogs')
replace_once('app.js',
'''function enhanceModal(){
  qsa("[data-now]").forEach(button=>button.onclick=()=>fillNow($(button.dataset.now)));
  qsa(".optionchips").forEach(group=>{''',
'''function enhanceModal(){
  qsa("[data-now]").forEach(button=>button.onclick=()=>fillNow($(button.dataset.now)));
  qsa("[data-recent-edit-id]").forEach(button=>button.onclick=event=>{event.preventDefault();void editRecord(button.dataset.recentEditId);});
  qsa(".optionchips").forEach(group=>{''','bind recent edit actions')
replace_once('app.js',
'''async function saveModal(continueAfter){
  if(state.modal?.onSave){''',
'''function showDuplicateWarning(existing,continueAfter){
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
  if(state.modal?.onSave){''','add duplicate warning UI')
replace_once('app.js',
'''  }else{
    return closeModal();
  }

  markSaving();''',
'''  }else{
    return closeModal();
  }

  if(!state.modal.duplicateAccepted&&["milk","diet","diaper"].includes(type)){
    const records=await getRecordsByDate(state.date,{includeDeleted:false});
    const duplicate=potentialDuplicate(base,records);
    if(duplicate&&showDuplicateWarning(duplicate,continueAfter))return;
  }

  markSaving();''','run duplicate check before save')

# Sleep: show recent ordinary sleep context; overlap logic remains the duplicate authority.
replace_once('sleep-v3.js',
'import {getRecord,getRecordsByDate,getRecordsInRange,putRecord} from "./db.js";',
'import {getRecord,getRecordsByDate,getRecordsInRange,putRecord} from "./db.js";\nimport {recentConfirmed} from "./record-entry-utils.js";',
'sleep import recent helper')
replace_once('sleep-v3.js',
'''function showModal(html){const m=ensureModal();m.innerHTML=html;m.classList.remove("hidden");bindMethodChoices(m);}
function hideModal(){''',
'''function bindRecentSleep(root){
  root.querySelectorAll("[data-sleep-v3-recent-edit]").forEach(button=>button.onclick=async event=>{
    event.preventDefault();
    const record=await getRecord(button.dataset.sleepV3RecentEdit);
    if(record)await openSleep(record);
  });
}
function showModal(html){const m=ensureModal();m.innerHTML=html;m.classList.remove("hidden");bindMethodChoices(m);bindRecentSleep(m);}
function hideModal(){''','bind recent sleep edit')
replace_once('sleep-v3.js',
'''function noteField(value=""){return `<label>备注<input id="sleepV3Note" type="text" value="${esc(value)}" placeholder="可选"></label>`;}
async function openSleep(record=null){
  const pageDate=$("pageDate")?.value||dateKey(new Date());
  modalState={kind:"sleep",record,pageDate};
  showModal(modalShell(record?.id?"修改睡眠":"记录睡眠",
    `<div class="sleep-v3-pair">''',
'''function noteField(value=""){return `<label>备注<input id="sleepV3Note" type="text" value="${esc(value)}" placeholder="可选"></label>`;}
function recentSleepMarkup(records,currentId=""){
  const ordinary=(records||[]).filter(record=>record.type==="sleep"&&record.status==="confirmed"&&!record.deleted&&!record.nightAnchor);
  const recent=recentConfirmed(ordinary,"sleep",{excludeId:currentId,limit:3});
  if(!ordinary.length||!recent.length)return "";
  return `<section class="sleep-v3-recent"><div><b>今天已记录 ${ordinary.length} 段睡眠</b><small>补录前可以先确认一下</small></div>${recent.map(item=>`<button type="button" data-sleep-v3-recent-edit="${esc(item.id)}"><time>${esc(tpart(item.startDateTime)||"—")}</time><span>${esc(tpart(item.startDateTime)||"?")}～${esc(tpart(item.endDateTime)||"?")} · ${esc(fmtDuration(duration(item)))}</span><em>修改</em></button>`).join("")}</section>`;
}
async function openSleep(record=null){
  const pageDate=$("pageDate")?.value||dateKey(new Date()),records=await getRecordsByDate(pageDate,{includeDeleted:false}),recentMarkup=recentSleepMarkup(records,record?.id||"");
  modalState={kind:"sleep",record,pageDate};
  showModal(modalShell(record?.id?"修改睡眠":"记录睡眠",
    `${recentMarkup}<div class="sleep-v3-pair">''','add recent sleep context')

# Today: native collapsible details. Pending templates auto-open through app.js.
replace_once('index.html',
'''        <div class="card timeline-card">
          <div class="timeline-head">
            <div><b>当天流水</b> <small id="timelineSub"></small></div>
            <small>待确认 ≠ 已记录</small>
          </div>
          <div id="pendingSummary" class="pending-summary hidden"></div>
          <div id="timeline" class="timeline"></div>
          <div class="demo-note">只有已确认记录会进入统计和导出分析；待确认模板仅用于减少重复录入。</div>
        </div>''',
'''        <details id="dayDetails" class="card timeline-card day-details">
          <summary class="timeline-head">
            <div><b>当天详情</b> <small id="timelineSub"></small></div>
            <small id="timelineCount">查看完整记录</small>
          </summary>
          <div id="pendingSummary" class="pending-summary hidden"></div>
          <div id="timeline" class="timeline"></div>
          <div class="demo-note">完整流水主要用于当天复盘；待确认模板未确认前不计入正式统计和导出分析。</div>
        </details>''','collapse today timeline into day details')

# History: richer daily summary, no separate last-occurrence query.
replace_once('history.js',
'import {shiftDateKey,validDateKey} from "./record-model.js";',
'import {isStrictDayNap,occurredLocal,recordDurationMinutes,shiftDateKey,validDateKey,wakeLocalRange} from "./record-model.js";',
'history imports summary helpers')
replace_once('history.js',
'''function hasDayContext(day){
  return !!((day?.context?.tags||[]).length||day?.context?.note||day?.nightSleep?.sleepAt||day?.nightSleep?.wakeAt);
}''',
'''function hasDayContext(day){
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
}''','add history day summary')
old_render='''function renderCard(date,records,day){
  const confirmed=records.filter(r=>r.status==="confirmed");
  const pending=records.filter(r=>r.status==="pending").length;
  const sleeps=confirmed.filter(r=>r.type==="sleep").length;
  const milk=confirmed.filter(r=>r.type==="milk").reduce((sum,r)=>sum+(Number(r.amount)||0),0);
  const diapers=confirmed.filter(r=>r.type==="diaper").length;
  const context=hasDayContext(day)?`<span class="history-context-mark">有备注</span>`:"";
  const pendingText=pending?`<span class="history-pending-mark">${pending} 条待确认</span>`:"";
  return `<article class="history-card">
    <div class="history-top">
      <div><b>${historyDateLabel(date)}</b></div>
      <button type="button" class="secondary" data-history-date="${escapeHTML(date)}">查看</button>
    </div>
    <div class="history-card-meta"><span>${confirmed.length} 条记录</span>${pendingText}${context}</div>
    <div class="hstats">
      <div class="hstat"><b>${sleeps}段</b><small>睡眠</small></div>
      <div class="hstat"><b>${milk?`${milk}ml`:"—"}</b><small>奶量</small></div>
      <div class="hstat"><b>${diapers}次</b><small>尿布</small></div>
    </div>
  </article>`;
}'''
new_render='''function renderCard(date,records,day){
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
}'''
replace_once('history.js',old_render,new_render,'replace history card summary')

# Visuals for Today details and record recent context.
append_once('styles.css','/* Timeline. */\n',r'''
.day-details>summary{list-style:none;cursor:pointer;user-select:none}.day-details>summary::-webkit-details-marker{display:none}.day-details>summary:after{content:"⌄";font-size:19px;color:#897e8c;transition:transform .16s ease}.day-details[open]>summary:after{transform:rotate(180deg)}.day-details:not([open]) .timeline-head{border-bottom:0}.record-recent{margin:0 0 14px;padding:12px;border:1px solid #e9e2e9;border-radius:14px;background:#fbf9fb}.record-recent-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px}.record-recent-title b{display:block;font-size:15px}.record-recent-title small{display:block;margin-top:2px;color:var(--ui-muted);font-size:12px}.record-recent-title>span{font-size:12px;color:var(--ui-muted);white-space:nowrap}.record-recent-list{display:grid}.record-recent-item{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:9px;align-items:center;width:100%;min-height:48px;padding:8px 2px;border:0;border-top:1px dashed #e8e0e8;background:transparent;text-align:left}.record-recent-item time{font-weight:850;color:#5e5562}.record-recent-item span{min-width:0}.record-recent-item b{display:block;font-size:14px;white-space:normal}.record-recent-item small{display:block;margin-top:2px;color:var(--ui-muted);font-size:12px;white-space:normal}.record-recent-item em{font-style:normal;color:var(--primary-strong);font-size:13px;font-weight:850}.record-duplicate-warning{margin-top:14px;padding:13px;border:1px solid #efd4ad;border-radius:13px;background:#fff8ec}.record-duplicate-warning>b{display:block}.record-duplicate-warning>span{display:block;margin-top:4px;color:#7d633e;font-size:13px;line-height:1.5}.record-duplicate-warning>div{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
''','record entry UI styles')

append_once('sleep-v3.css','',r'''
.sleep-v3-recent{display:grid;gap:0;margin-bottom:14px;padding:11px 12px;border:1px solid #e9e2ea;border-radius:13px;background:#fbf9fc}.sleep-v3-recent>div{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding-bottom:6px}.sleep-v3-recent>div b{font-size:14px}.sleep-v3-recent>div small{font-size:12px;color:#857b89}.sleep-v3-recent>button{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:8px;align-items:center;min-height:46px;padding:8px 2px;border:0;border-top:1px dashed #e8e0e9;background:transparent;text-align:left}.sleep-v3-recent time{font-weight:800;color:#5e5563}.sleep-v3-recent span{font-size:13px;white-space:normal}.sleep-v3-recent em{font-style:normal;color:#bd6389;font-size:13px;font-weight:850}
''','sleep recent styles')

# History-specific richer card layout owns its own responsive behavior.
write('history.css', r'''.history-browser{display:flex;align-items:center;gap:10px;padding:8px;margin:12px 0 14px;border:1px solid #ebe4ed;border-radius:16px;background:linear-gradient(180deg,#fbf9fc,#f7f4f8);box-shadow:0 5px 18px rgba(72,52,79,.045)}.history-recent{height:42px;padding:0 15px;border:1px solid transparent;border-radius:11px;background:transparent;color:#746a78;font-weight:700;white-space:nowrap}.history-recent.active{background:#fff;border-color:#e8e0ea;color:#4d4352;box-shadow:0 3px 10px rgba(78,61,83,.07)}.history-range-divider{width:1px;height:26px;background:#e9e2eb;flex:0 0 auto}.history-month-nav{display:grid;grid-template-columns:38px minmax(0,190px) 38px;align-items:center;gap:6px;min-width:0}.history-month-nav input{height:42px;min-width:0;padding:0 10px;border:0;border-radius:10px;background:transparent;color:#544b59;font-weight:700}.history-month-nav input:focus{outline:2px solid #e8dce8;outline-offset:0;background:#fff}.history-arrow{height:38px;border:0;border-radius:10px;background:transparent;color:#746a78;font-size:23px;line-height:1}.history-arrow:hover{background:#fff}.history-arrow:active{transform:scale(.96)}.history-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.history-card{padding:15px}.history-top>div{display:grid;gap:2px}.history-card-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:7px;color:#8b828f;font-size:11px}.history-pending-mark,.history-context-mark{padding:4px 7px;border-radius:999px}.history-pending-mark{background:#fff5e9;color:#a06c38}.history-context-mark{background:#f4eff8;color:#7d6589}.history-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:11px}.history-fact{min-width:0;padding:9px 10px;border-radius:10px;background:#fcfafc;border:1px solid #f0ebf1}.history-fact span{display:block;color:#8b828f;font-size:11px}.history-fact b{display:block;margin-top:2px;font-size:14px;line-height:1.35;white-space:normal;overflow-wrap:anywhere}.history-fact-stool{background:#f5faf7;border-color:#e4f0e9}.history-fact-alert{background:#fff7f3;border-color:#f3dfd5}.history-fact-alert b{color:#a65c4d}.history-loading,.history-empty{display:grid;gap:5px;padding:22px 16px;border:1px dashed #e5dde7;border-radius:14px;background:#fbf9fc;color:#817887}.history-empty b{color:#514854}.history-empty span{font-size:12px;line-height:1.5}@media(max-width:820px){.history-grid{grid-template-columns:1fr}}@media(max-width:640px){.history-browser{display:grid;grid-template-columns:auto 1px minmax(0,1fr);gap:7px;padding:7px}.history-recent{padding:0 11px}.history-month-nav{grid-template-columns:34px minmax(0,1fr) 34px;gap:3px}.history-arrow{height:36px}.history-month-nav input{padding:0 6px}.history-card{padding:13px}.history-facts{gap:6px}}
''')

append_once('large-text.css','body.large-text{\n  --base-font:20px;\n  --control-h:56px;\n}\n',r'''
.large-text .record-recent-title b,.large-text .sleep-v3-recent>div b{font-size:18px}.large-text .record-recent-title small,.large-text .record-recent-title>span,.large-text .sleep-v3-recent>div small{font-size:15px}.large-text .record-recent-item,.large-text .sleep-v3-recent>button{min-height:58px}.large-text .record-recent-item b,.large-text .record-recent-item time,.large-text .sleep-v3-recent span,.large-text .sleep-v3-recent time{font-size:17px}.large-text .record-recent-item small,.large-text .record-recent-item em,.large-text .sleep-v3-recent em{font-size:15px}.large-text .record-duplicate-warning>span{font-size:16px}.large-text .history-fact span{font-size:14px}.large-text .history-fact b{font-size:18px}.large-text .history-grid{grid-template-columns:1fr}
''','large text recording styles')

# Offline shell needs the new imported helper.
replace_once('sw.js',
'"./record-model.js","./record-templates.js","./profile-insights.js"',
'"./record-model.js","./record-templates.js","./record-entry-utils.js","./profile-insights.js"',
'cache record entry helper')

# Tests.
write('tests/record-entry-utils.test.mjs', r'''import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {entryPreview,potentialDuplicate,recentConfirmed} from "../record-entry-utils.js";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [app,index,sleep,history]=await Promise.all(["app.js","index.html","sleep-v3.js","history.js"].map(file=>readFile(path.join(root,file),"utf8")));
const milk=(id,time,amount=180,status="confirmed")=>({id,date:"2026-09-04",type:"milk",time,amount,feedType:"配方奶",status,deleted:false});
assert.deepEqual(recentConfirmed([milk("a","08:00"),milk("b","15:20"),milk("c","11:40")],"milk").map(x=>x.id),["b","c","a"],"recent confirmed records must be newest-first");
assert.equal(entryPreview(milk("a","08:00",160)).main,"160ml");
assert.equal(potentialDuplicate(milk("new","15:25",180),[milk("old","15:20",180)])?.id,"old","near-identical milk should warn");
assert.equal(potentialDuplicate(milk("new","15:25",100),[milk("old","15:20",180)]),null,"materially different milk amount should not warn");
const diaper=(id,time,type="便")=>({id,date:"2026-09-04",type:"diaper",time,diaperType:type,status:"confirmed",deleted:false});
assert.equal(potentialDuplicate(diaper("new","12:10"),[diaper("old","12:05")])?.id,"old","near-identical diaper should warn");
assert.match(index,/<details id="dayDetails"[\s\S]*<summary class="timeline-head"/,"Today timeline must be a native collapsible day-detail section");
assert.match(app,/recentEntryMarkup[\s\S]*recordDuplicateWarning/,"frequent record dialogs must surface recent same-type facts and duplicate hint");
assert.match(sleep,/recentSleepMarkup[\s\S]*data-sleep-v3-recent-edit/,"ordinary Sleep must surface recent same-type facts without adding a second overlap detector");
assert.doesNotMatch(history,/最近一次|history-last-occurrence|data-history-last/,"History must not add a separate last-occurrence query UI");
console.log("record entry review UX regressions passed");
''')
replace_once('scripts/verify.mjs',
'runTest("record template policy regressions","tests/record-templates.test.mjs");',
'runTest("record template policy regressions","tests/record-templates.test.mjs");\nrunTest("record entry review UX regressions","tests/record-entry-utils.test.mjs");',
'run record entry tests')

# Extend History regression with real summary behavior.
replace_once('tests/history.test.mjs',
'import {historyDateLabel,monthLabel,monthRange,recentRange,shiftMonthKey,validMonthKey} from "../history.js";',
'import {historyDateLabel,monthLabel,monthRange,recentRange,shiftMonthKey,summarizeHistoryDay,validMonthKey} from "../history.js";',
'history test import summary')
append_once('tests/history.test.mjs',
'assert.doesNotMatch(historySource,/historyJumpDate|data-history-jump|history-date-jump/,"History must not duplicate the global date-jump control");\n',
r'''
const summary=summarizeHistoryDay("2026-09-04",[
  {id:"n",date:"2026-09-04",type:"sleep",status:"confirmed",deleted:false,nightAnchor:true,startDateTime:"2026-09-03T19:30",endDateTime:"2026-09-04T05:30"},
  {id:"nap",date:"2026-09-04",type:"sleep",status:"confirmed",deleted:false,startDateTime:"2026-09-04T10:00",endDateTime:"2026-09-04T11:05"},
  {id:"m1",date:"2026-09-04",type:"milk",status:"confirmed",deleted:false,time:"08:00",amount:"180"},
  {id:"m2",date:"2026-09-04",type:"milk",status:"confirmed",deleted:false,time:"12:00",amount:"160"},
  {id:"d",date:"2026-09-04",type:"diaper",status:"confirmed",deleted:false,time:"12:05",diaperType:"尿 + 便"},
  {id:"food",date:"2026-09-04",type:"diet",status:"confirmed",deleted:false,time:"12:10"},
  {id:"h",date:"2026-09-04",type:"health",status:"confirmed",deleted:false,time:"20:00",temperature:"38.2"}
],null);
assert.equal(summary.nightMinutes,600);
assert.equal(summary.napCount,1);
assert.equal(summary.milkCount,2);
assert.equal(summary.milkTotal,340);
assert.equal(summary.stoolCount,1);
assert.deepEqual(summary.stoolTimes,["12:05"]);
assert.equal(summary.dietCount,1);
assert.equal(summary.maxTemperature,38.2);
assert.doesNotMatch(historySource,/getAllRecords|history-last-occurrence|data-history-last/,"richer history cards must remain range-bounded and must not grow a separate last-occurrence scanner");
''','history summary behavior tests')

# Durable project rules.
replace_once('AGENTS.md',
'- 不允许恢复 `recent-milk-template.js` 那种 DOM 监听 + `getAllRecords()` 全库扫描桥接实现。',
'''- 不允许恢复 `recent-milk-template.js` 那种 DOM 监听 + `getAllRecords()` 全库扫描桥接实现。

### 日常录入确认与历史回看

- 快速记录按钮保持“动作入口”职责，不在按钮里追加动态的今日次数 / 最近时间；图标与名称应保持稳定、易识别。
- 高频补录（吃奶、饮食、换尿布）打开弹窗后，应先展示今天最近最多 3 条同类已确认事实，并允许直接进入已有记录修改；普通睡眠由 Sleep owner 提供同类近期预览。
- 疑似重复只能提醒，不能自动合并或禁止保存。吃奶 / 饮食 / 尿布使用轻量重复提示；Sleep 继续使用自身的重叠检测 / 合并规则，禁止叠第二套冲突算法。
- Today 的整合流水定位为“当天复盘详情”，默认可收起；存在待确认模板时必须自动展开，不能为了弱化流水而隐藏需要处理的事实。
- History 日卡优先承载可帮助回忆的一日摘要：夜睡、小睡、吃奶次数与总量、粑粑次数与时间、饮食、尿布、夜醒、健康异常等；不新增单独“最近一次”查询控件。
- History 与 Profile 对“严格白天小睡”的判断必须复用 canonical 纯函数，不能复制两套分类逻辑。''',
'add recording review UX rules')
replace_once('ARCHITECTURE.md',
'### `timeline-v3.js`\n\n当天流水 projection。',
'''### `record-entry-utils.js`

高频补录上下文与轻量重复提醒的纯函数 owner。

- 只处理同日已确认记录排序 / 简要预览 / 疑似重复启发式；
- 不访问 DOM、不访问 IndexedDB、不自动写入或合并数据；
- Sleep 不使用这里的重复算法，继续由 `sleep-v3.js` 的重叠检测负责。

### `timeline-v3.js`

当天流水 projection。''',
'document record entry helper owner')
replace_once('ARCHITECTURE.md',
'- 每次按日 IndexedDB 查询，不逐行 `getRecord()`。',
'''- 每次按日 IndexedDB 查询，不逐行 `getRecord()`；
- Today 的可见承载是可折叠“当天详情”，流水用于复盘而不是补录前置确认；有待确认模板时由 `app.js` 自动展开。''',
'document day details purpose')
replace_once('ARCHITECTURE.md',
'- 不再提供重复的“跳到日期”控件；具体日期仍通过历史卡进入 Today，并复用全局 `pageDate`；',
'''- 不再提供重复的“跳到日期”控件；具体日期仍通过历史卡进入 Today，并复用全局 `pageDate`；
- 日卡直接提供有意义的一日摘要（夜睡 / 严格小睡 / 奶 / 粑粑 / 饮食 / 尿布 / 夜醒 / 健康），不增加独立“最近一次”扫描入口；''',
'document richer history cards')
replace_once('TESTING.md',
'`tests/record-templates.test.mjs`',
'`tests/record-templates.test.mjs`\n\n`tests/record-entry-utils.test.mjs`',
'list record entry tests')
replace_once('TESTING.md',
'- 奶和饮食模板策略独立，模板生成不得使用 `getAllRecords()` 全历史扫描，也不得恢复 DOM 监听桥；',
'''- 奶和饮食模板策略独立，模板生成不得使用 `getAllRecords()` 全历史扫描，也不得恢复 DOM 监听桥；
- 高频补录弹窗显示最近同类已确认事实，疑似重复只提醒不阻止；Sleep 继续只使用自身重叠冲突 owner；
- Today 流水保持可折叠“当天详情”，待确认存在时自动展开；快速记录按钮不得堆叠动态次数 / 最近时间；
- History 日卡直接展示粑粑次数与时间等一日摘要，并继续使用范围查询；禁止新增独立“最近一次”历史扫描；''',
'document recording UX regression coverage')
replace_once('tests/documentation-contract.test.mjs',
'assert.match(agents,/已退出当前档案 UI[\\s\\S]*通常放床|通常放床[\\s\\S]*已退出当前档案 UI/,"AGENTS.md must preserve removal of redundant manual Profile routines");',
'''assert.match(agents,/已退出当前档案 UI[\\s\\S]*通常放床|通常放床[\\s\\S]*已退出当前档案 UI/,"AGENTS.md must preserve removal of redundant manual Profile routines");
assert.match(agents,/快速记录按钮[\\s\\S]*不在按钮里追加动态的今日次数 \/ 最近时间/,"AGENTS.md must preserve simple quick-entry tiles");
assert.match(agents,/History 日卡[\\s\\S]*粑粑次数与时间[\\s\\S]*不新增单独“最近一次”/,"AGENTS.md must preserve richer History cards without last-occurrence query UI");''',
'lock recording review UX docs')

print('Recording review UX changes applied.')
