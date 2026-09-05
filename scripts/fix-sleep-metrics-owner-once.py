from pathlib import Path

ROOT=Path('.')

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')
def replace_once(path,old,new,label):
    text=read(path)
    count=text.count(old)
    if count!=1:
        raise RuntimeError(f'{label}: expected 1 occurrence in {path}, got {count}')
    write(path,text.replace(old,new,1))

def append_after(path,marker,addition,label):
    text=read(path)
    if addition.strip() in text: return
    if marker not in text:
        raise RuntimeError(f'{label}: marker missing in {path}')
    write(path,text.replace(marker,marker+addition,1))

# 1) Static metric shell. app.js must never transiently render a wrong sleep summary.
replace_once('index.html',
'''        <div id="metrics" class="metrics"></div>''',
'''        <div id="metrics" class="metrics">
          <div class="metric" data-metric-owner="sleep"><b id="metricNapCountValue">—</b><small>小睡</small></div>
          <div class="metric" data-metric-owner="sleep"><b id="metricNapTotalValue">—</b><small id="metricNapTotalLabel">小睡总计</small></div>
          <div class="metric" data-metric-owner="app"><b id="metricMilkTotalValue">—</b><small>已确认奶量</small></div>
          <div class="metric" data-metric-owner="sleep"><b id="metricEarlyWakeValue">—</b><small>疑似早醒</small></div>
          <div class="metric" data-metric-owner="app"><b id="metricPendingCountValue">0 条</b><small>待确认模板</small></div>
        </div>''',
'static metric ownership shell')

# 2) app.js only updates app-owned metrics; sleep cells are reset but never computed here.
replace_once('app.js',
'''async function changeDate(dateKey,followsToday=false){
  state.date=dateKey;
  $("pageDate").value=dateKey;
  await loadDay();
  if(followsToday)state.lastToday=dateKey;
}''',
'''async function changeDate(dateKey,followsToday=false){
  state.date=dateKey;
  $("pageDate").value=dateKey;
  resetSleepMetricPlaceholders();
  await loadDay();
  if(followsToday)state.lastToday=dateKey;
}''',
'reset sleep metrics before date load')

replace_once('app.js',
'''function confirmed(records){return records.filter(record=>record.status==="confirmed"&&!record.deleted);}
function pending(records){return records.filter(record=>record.status==="pending"&&!record.deleted);}
function renderMetrics(records){
  const live=confirmed(records),templates=pending(records);
  const sleeps=live.filter(record=>record.type==="sleep");
  const sleepMinutes=sleeps.reduce((sum,record)=>sum+(durationMinutes(record.startTime,record.endTime)||0),0);
  const milkTotal=live.filter(record=>record.type==="milk").reduce((sum,record)=>sum+(Number(record.amount)||0),0);
  const wakes=live.filter(record=>record.type==="wake");
  const suspected=wakes
    .filter(record=>record.result==="no_resleep"||(minutesOf(record.wakeTime)!=null&&minutesOf(record.wakeTime)<330))
    .sort((a,b)=>(a.wakeTime||"").localeCompare(b.wakeTime||""))[0];

  $("metrics").innerHTML=`
    <div class="metric"><b>${sleeps.length} 觉</b><small>小睡</small></div>
    <div class="metric"><b>${sleepMinutes?fmtDuration(sleepMinutes):"—"}</b><small>小睡总计</small></div>
    <div class="metric"><b>${milkTotal?`${milkTotal}ml`:"—"}</b><small>已确认奶量</small></div>
    <div class="metric"><b>${suspected?.wakeTime||"—"}</b><small>疑似早醒</small></div>
    <div class="metric"><b>${templates.length} 条</b><small>待确认模板</small></div>`;
}''',
'''function confirmed(records){return records.filter(record=>record.status==="confirmed"&&!record.deleted);}
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
}''',
'app metrics ownership split')

replace_once('app.js',
'''${["稀","糊状","成形","偏硬","水样","其它"].map(value=>`<button type="button" class="optionchip ${value===item.stoolForm?"active":""}" data-choice="${value}">${value}</button>`).join("")}''',
'''${["水样","稀","糊状","较稠","成形","偏硬","其它"].map(value=>`<button type="button" class="optionchip ${value===item.stoolForm?"active":""}" data-choice="${value}">${value}</button>`).join("")}''',
'add clearer thick stool state')

# 3) Sleep is the sole writer of sleep metric values. No positional patching / observer race.
replace_once('sleep-v3.js',
'''let modalState=null;
let refreshTimer=null;
let editingWakeId=null;''',
'''let modalState=null;
let refreshTimer=null;
let refreshRevision=0;
let editingWakeId=null;''',
'add sleep refresh revision')

replace_once('sleep-v3.js',
'''function patchMetrics(pageDate,a){
  const metrics=$("metrics");if(!metrics)return;
  const items=Array.from(metrics.querySelectorAll(".metric"));if(items.length<4)return;
  const napMin=a.naps.reduce((s,r)=>s+(duration(r)||0),0);
  const set=(el,sel,text)=>{const n=el.querySelector(sel);if(n&&n.textContent!==text)n.textContent=text;};
  set(items[0],"b",`${a.naps.length} 觉`);set(items[0],"small","小睡");
  set(items[1],"b",napMin?fmtDuration(napMin):"—");set(items[1],"small",a.uncertain.length?`小睡总计 · ${a.uncertain.length}段待判断`:"小睡总计");
  set(items[3],"b",a.wakeEarly?.wakeTime||a.inferredEarly||"—");set(items[3],"small","疑似早醒");
}''',
'''function renderSleepMetrics(a){
  const napMin=a.naps.reduce((s,r)=>s+(duration(r)||0),0);
  setText($("metricNapCountValue"),`${a.naps.length} 觉`);
  setText($("metricNapTotalValue"),napMin?fmtDuration(napMin):"—");
  setText($("metricNapTotalLabel"),a.uncertain.length?`小睡总计 · ${a.uncertain.length}段待判断`:"小睡总计");
  setText($("metricEarlyWakeValue"),a.wakeEarly?.wakeTime||a.inferredEarly||"—");
  $("metrics")?.removeAttribute("aria-busy");
}''',
'render sleep metrics by stable IDs')

replace_once('sleep-v3.js',
'''function refreshAppDay(){
  const pageDate=$("pageDate"),metrics=$("metrics");
  let renderObserver=null,observerTimeout=null;
  if(metrics&&typeof MutationObserver!=="undefined"){
    renderObserver=new MutationObserver(()=>{
      renderObserver.disconnect();
      if(observerTimeout)clearTimeout(observerTimeout);
      scheduleRefresh(0);
    });
    renderObserver.observe(metrics,{childList:true});
    observerTimeout=setTimeout(()=>renderObserver?.disconnect(),1500);
  }
  if(pageDate)pageDate.dispatchEvent(new Event("change",{bubbles:true}));
  scheduleRefresh(80);
}''',
'''function refreshAppDay(){
  const pageDate=$("pageDate");
  if(pageDate)pageDate.dispatchEvent(new Event("change",{bubbles:true}));
  scheduleRefresh(0);
}''',
'remove metrics render observer race')

replace_once('sleep-v3.js',
'''function scheduleRefresh(delay=40){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refreshAll().catch(e=>console.warn("Sleep V3 refresh failed",e)),delay);}
async function refreshAll(){
  const pageDate=$("pageDate")?.value||dateKey(new Date());
  const analysis=await analysisForDate(pageDate);
  renderNightCard(pageDate,analysis);
  patchMetrics(pageDate,analysis);
}''',
'''function scheduleRefresh(delay=40){
  const revision=++refreshRevision;
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>refreshAll(revision).catch(e=>console.warn("Sleep V3 refresh failed",e)),delay);
}
async function refreshAll(revision){
  const pageDate=$("pageDate")?.value||dateKey(new Date());
  const analysis=await analysisForDate(pageDate);
  if(revision!==refreshRevision||pageDate!==($("pageDate")?.value||dateKey(new Date())))return;
  renderNightCard(pageDate,analysis);
  renderSleepMetrics(analysis);
}''',
'guard stale sleep refreshes')

# 4) Regression contract.
write('tests/sleep-metrics-owner.test.mjs', r'''import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [index,app,sleep,schema]=await Promise.all([
  readFile(path.join(root,"index.html"),"utf8"),
  readFile(path.join(root,"app.js"),"utf8"),
  readFile(path.join(root,"sleep-v3.js"),"utf8"),
  readFile(path.join(root,"JSON_DATA_SCHEMA.md"),"utf8")
]);

for(const id of ["metricNapCountValue","metricNapTotalValue","metricNapTotalLabel","metricEarlyWakeValue","metricMilkTotalValue","metricPendingCountValue"]){
  assert.match(index,new RegExp(`id=["']${id}["']`),`${id} must exist statically in index.html`);
}
assert.match(index,/data-metric-owner="sleep"/,"sleep metric ownership must be explicit in the static shell");
assert.match(index,/data-metric-owner="app"/,"app metric ownership must be explicit in the static shell");

const renderMetrics=app.match(/function renderMetrics\(records\)\{[\s\S]*?\n\}/)?.[0]||"";
assert.ok(renderMetrics,"renderMetrics must exist");
assert.doesNotMatch(renderMetrics,/record\.type==="sleep"|sleepMinutes|suspected|wakeTime/,"app.js must not calculate sleep/early-wake metrics");
assert.doesNotMatch(renderMetrics,/metrics.*innerHTML|\$\("metrics"\)\.innerHTML/,"app.js must not replace the metric shell");
assert.match(app,/resetSleepMetricPlaceholders\(\);[\s\S]*?await loadDay\(\)/,"date changes must clear stale sleep values before async loading");

assert.match(sleep,/function renderSleepMetrics\(a\)/,"Sleep owner must render sleep metrics");
assert.match(sleep,/metricNapCountValue/,"Sleep owner must address stable nap metric IDs");
assert.match(sleep,/metricEarlyWakeValue/,"Sleep owner must address stable early-wake metric ID");
assert.doesNotMatch(sleep,/querySelectorAll\("\.metric"\)/,"Sleep metrics must not depend on positional metric order");
const refreshAppDay=sleep.match(/function refreshAppDay\(\)\{[\s\S]*?\n\}/)?.[0]||"";
assert.doesNotMatch(refreshAppDay,/MutationObserver|renderObserver|observerTimeout/,"sleep save refresh must not race app rendering through a metrics observer");
assert.match(sleep,/let refreshRevision=0/,"sleep refreshes need a generation token");
assert.match(sleep,/revision!==refreshRevision/,"stale date analyses must not overwrite the current date");

assert.match(app,/\["水样","稀","糊状","较稠","成形","偏硬","其它"\]/,"stool consistency choices should form a clear soft-to-hard sequence");
assert.match(schema,/水样.*稀.*糊状.*较稠.*成形.*偏硬/s,"JSON schema docs must describe the current stoolForm vocabulary");

console.log("sleep metric ownership regressions passed");
''')

replace_once('scripts/verify.mjs',
'''runTest("sleep environment temperature regressions","tests/sleep-environment.test.mjs");''',
'''runTest("sleep environment temperature regressions","tests/sleep-environment.test.mjs");
runTest("sleep metric ownership regressions","tests/sleep-metrics-owner.test.mjs");''',
'wire sleep metric regression')

# 5) Durable docs.
replace_once('AGENTS.md',
'''- 夜间主睡（包括 Good Morning 完成的 `nightAnchor`）不能计入首页“小睡觉数 / 小睡总计”；保存睡眠后最终 projection 必须覆盖通用记录摘要，不能因为异步渲染顺序短暂显示错误统计。''',
'''- 夜间主睡（包括 Good Morning 完成的 `nightAnchor`）不能计入首页“小睡觉数 / 小睡总计”。首页睡眠指标只有 `sleep-v3.js` 一个 writer；`app.js` 只更新奶量 / 待确认等非睡眠指标，不得先渲染一份“所有 sleep 都算小睡”的临时结果，也不得用 MutationObserver/延迟覆盖来修正。切日期时先清空旧睡眠指标，旧日期异步分析返回后不得覆盖新日期。''',
'AGENTS sleep metric owner rule')
append_after('AGENTS.md',
'''- History 与 Profile 对“严格白天小睡”的判断必须复用 canonical 纯函数，不能复制两套分类逻辑。''',
'''\n- 尿布 `stoolForm` 当前录入词汇按稀到硬保持连续：`水样 / 稀 / 糊状 / 较稠 / 成形 / 偏硬 / 其它`；“较稠”表示仍未成形但明显比普通糊状更厚。''',
'AGENTS stool vocabulary')

append_after('ARCHITECTURE.md',
'''- Sleep 分类不依赖人工维护的 Profile“通常放床时间”。''',
'''\n- Today `#metrics` 是 `index.html` 的静态壳：`sleep-v3.js` 独占小睡数、小睡总计、疑似早醒三个值；`app.js` 只写奶量与待确认数。禁止重新引入“app 先错算、Sleep 再覆盖”的双 writer。\n- Sleep refresh 使用 generation token 丢弃过期日期查询结果；保存后的刷新不依赖 metrics `MutationObserver`。''',
'ARCHITECTURE sleep metric ownership')

replace_once('JSON_DATA_SCHEMA.md',
'''- `diaper`：`diaperType`, `urineAmount`, `stoolAmount`, `stoolColor`, `stoolForm`, `note`''',
'''- `diaper`：`diaperType`, `urineAmount`, `stoolAmount`, `stoolColor`, `stoolForm`, `note`。当前 UI 的 `stoolForm` 词汇为 `水样 / 稀 / 糊状 / 较稠 / 成形 / 偏硬 / 其它`；其中“较稠”表示仍未成形但明显比普通糊状更厚。历史已有字符串原样保留。''',
'document stool form vocabulary')

append_after('TESTING.md',
'''- Sleep 分类不得重新依赖手填 Profile bedtime；''',
'''\n- Today 小睡 / 疑似早醒指标只能由 Sleep owner 写入；`app.js` 不得计算或整段替换这些指标。日期切换必须先清旧值，过期 Sleep 异步查询不得回写当前日期，保存睡眠不得依赖 metrics `MutationObserver` 修正竞态；\n- 尿布性状需保留从 `水样 → 稀 → 糊状 → 较稠 → 成形 → 偏硬` 的连续词汇，旧值不迁移；''',
'TESTING sleep metrics and stool regression')
