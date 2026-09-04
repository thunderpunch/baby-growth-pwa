import {readFile,writeFile,unlink} from "node:fs/promises";

async function edit(path,transform){
  const before=await readFile(path,"utf8");
  const after=transform(before);
  if(after===before)throw new Error(`No change applied to ${path}`);
  await writeFile(path,after);
}
function replaceOne(text,find,replacement,label){
  const count=text.split(find).length-1;
  if(count!==1)throw new Error(`${label}: expected 1 occurrence, got ${count}`);
  return text.replace(find,replacement);
}
function replaceRegex(text,regex,replacement,label){
  const matches=[...text.matchAll(new RegExp(regex.source,regex.flags.includes("g")?regex.flags:regex.flags+"g"))];
  if(matches.length!==1)throw new Error(`${label}: expected 1 regex match, got ${matches.length}`);
  return text.replace(regex,replacement);
}

await edit("index.html",text=>replaceRegex(text,
  /          <h3 class="section-gap">成长阶段<\/h3>[\s\S]*?          <div class="btnrow profile-save-row">/,
`          <h3 class="section-gap">当前阶段</h3>
          <div class="sectiondesc">只维护无法从日常记录可靠推断的长期背景；近期作息会由记录自动汇总。</div>

          <div class="phase-box">
            <label>当前饮食阶段</label>
            <div id="dietStage" class="optionchips">
              <button type="button" class="optionchip active" data-diet-stage="辅食">辅食阶段</button>
              <button type="button" class="optionchip" data-diet-stage="正餐">正餐阶段</button>
            </div>
          </div>

          <div class="fields2 section-gap">
            <label>长期喂养方式
              <select id="feedingMode">
                <option value="">请选择</option>
                <option value="母乳为主">母乳为主</option>
                <option value="配方奶为主">配方奶为主</option>
                <option value="混合喂养">混合喂养</option>
                <option value="其它/不固定">其它 / 不固定</option>
              </select>
            </label>
            <label>平日主要照护者<input id="weekdayCaregiver" type="text" placeholder="例如：爷爷奶奶"></label>
            <label>周末主要照护者<input id="weekendCaregiver" type="text" placeholder="例如：父母"></label>
          </div>

          <label class="section-gap">长期睡眠环境
            <textarea id="sleepEnvironment" placeholder="例如：同房婴儿床、遮光、白噪音"></textarea>
          </label>

          <label class="section-gap">当前主要问题
            <textarea id="mainIssue" placeholder="例如：最近连续多天凌晨4点左右醒后很难重新入睡"></textarea>
          </label>

          <div class="profile-insights-shell">
            <div class="profile-insights-head"><b>近期规律</b><small>最近14天 · 从已确认睡眠自动推导，无需手填</small></div>
            <div id="profileInsights"></div>
          </div>

          <div class="btnrow profile-save-row">`,"replace profile form")));

await edit("app.js",text=>{
  text=replaceOne(text,
    'import {ensureRecordTemplates,templateSourceLabel} from "./record-templates.js";',
    'import {ensureRecordTemplates,templateSourceLabel} from "./record-templates.js";\nimport {renderProfileInsights} from "./profile-insights.js";',
    "add profile insights import");
  text=replaceOne(text,"  await loadProfileUI();\n  renderModuleSettings();","  await loadProfileUI(false);\n  renderModuleSettings();","defer insights on initial Today boot");
  text=replaceRegex(text,/  qsa\("\[data-profile-mode\]"\)\.forEach\(button=>button\.onclick=\(\)=>\{[\s\S]*?  \}\);\n/,"","remove profile tabs");
  text=replaceOne(text,'  if(name==="profile")void loadProfileUI();','  if(name==="profile")void loadProfileUI(true);',"load insights on profile open");
  text=replaceRegex(text,
    /async function loadProfileUI\(\)\{[\s\S]*?\n\}\nfunction profileFormValue\(\)\{[\s\S]*?\n\}\nasync function saveProfile/,
`async function loadProfileUI(includeInsights=false){
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
    $("profileVersionInfo").innerHTML=\`当前档案：<b>V\${escapeHTML(profile.version)}</b> · 从 <b>\${escapeHTML(profile.effectiveFrom)}</b> 起生效。近期规律由实际记录自动计算，不需要维护“典型小睡”等重复信息。\`;
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
async function saveProfile`,"replace profile controller");
  text=text.replaceAll("await loadProfileUI();","await loadProfileUI(true);");
  text=replaceOne(text,
    '<div class="smallnote">例如 3 觉稳定变 2 觉、辅食正式过渡到正餐、长期照护方式发生变化。只是填错内容请不要创建新阶段。</div>',
    '<div class="smallnote">例如辅食正式过渡到正餐，或长期喂养方式、主要照护者、睡眠环境发生变化。小睡次数和通常入睡时间会从记录自动推导，不需要为了它们单独建阶段。只是填错内容请不要创建新阶段。</div>',
    "update new stage guidance");
  for(const forbidden of ["weekdayBedtime","weekdayLatency","weekdayNaps","weekendBedtime","weekendLatency","weekendNaps","data-profile-mode"]){
    if(text.includes(forbidden))throw new Error(`app.js still contains obsolete profile token ${forbidden}`);
  }
  return text;
});

await edit("sleep-v3.js",text=>{
  text=replaceOne(text,
    'import {getRecord,getRecordsByDate,getRecordsInRange,putRecord,getSetting,getProfile} from "./db.js";',
    'import {getRecord,getRecordsByDate,getRecordsInRange,putRecord} from "./db.js";',
    "remove profile dependency from sleep");
  text=replaceRegex(text,/async function profileBedtimeMinutes\(\)\{[\s\S]*?\n\}\nfunction circularDistance\(a,b\)\{[^\n]*\}\n/,"","remove manual bedtime heuristic helpers");
  text=replaceOne(text,"function basicClassify(r,bedtimeMin=null){","function basicClassify(r){","simplify sleep classifier");
  text=replaceRegex(text,/\n  if\(bedtimeMin!=null&&sm!=null&&circularDistance\(sm,bedtimeMin\)<=120&&mins>=180\)return \{kind:"night",confidence:\.9\};/,"","remove manual bedtime classification");
  text=replaceOne(text,
`  const [previous,current,bedtime]=await Promise.all([
    getRecordsByDate(previousDate,{includeDeleted:false}),
    getRecordsByDate(pageDate,{includeDeleted:false}),
    profileBedtimeMinutes()
  ]);`,
`  const [previous,current]=await Promise.all([
    getRecordsByDate(previousDate,{includeDeleted:false}),
    getRecordsByDate(pageDate,{includeDeleted:false})
  ]);`,"remove bedtime lookup from analysis");
  text=text.replaceAll("basicClassify(r,bedtime)","basicClassify(r)");
  if(/profileBedtimeMinutes|bedtimeMin|getProfile|getSetting/.test(text))throw new Error("sleep-v3 still depends on manual profile bedtime");
  return text;
});

await edit("data-io-v3.js",text=>replaceRegex(text,
  /  const profileRows=\[\["版本"[^\n]*\n  payload\.profileVersions\.forEach\(p=>profileRows\.push\([^\n]*\n/,
`  const profileRows=[["版本","生效日期","宝宝名","出生日期","性别","饮食阶段","喂养方式","平日主要照护者","周末主要照护者","睡眠环境","当前主要问题"]];
  payload.profileVersions.forEach(p=>profileRows.push([\`V\${p.version}\`,p.effectiveFrom,p.base?.name||"",p.base?.birthDate||"",p.base?.sex||"",p.stage?.dietStage||"",p.stage?.feedingMode||"",p.stage?.caregivers?.weekday||p.stage?.weekday?.caregiver||"",p.stage?.caregivers?.weekend||p.stage?.weekend?.caregiver||"",p.stage?.sleepEnvironment||"",p.stage?.mainIssue||""]));
`,"update profile Excel fields")));

await writeFile("tests/profile-contract.test.mjs",`import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [html,app,sleep,dataIo,babyName,guard]=await Promise.all([
  "index.html","app.js","sleep-v3.js","data-io-v3.js","baby-name.js","profile-save-guard.js"
].map(file=>readFile(path.join(root,file),"utf8")));
for(const id of ["feedingMode","weekdayCaregiver","weekendCaregiver","sleepEnvironment","mainIssue","profileInsights"]){
  assert.match(html,new RegExp(\`id=["']\${id}["']\`),\`streamlined profile field missing: \${id}\`);
}
for(const obsolete of ["weekdayBedtime","weekdayLatency","weekdayNaps","weekendBedtime","weekendLatency","weekendNaps","data-profile-mode","settlingMethod"]){
  assert.doesNotMatch(html,new RegExp(obsolete),\`obsolete manual profile input must stay removed: \${obsolete}\`);
  assert.doesNotMatch(app,new RegExp(obsolete),\`app must not save obsolete profile field: \${obsolete}\`);
}
assert.match(app,/caregivers:\{[\s\S]*weekday:[\s\S]*weekend:/,"current profile must store caregiver background explicitly");
assert.match(app,/stage\.caregivers\?\.weekday\|\|stage\.weekday\?\.caregiver/,"old profile caregiver history must remain readable");
assert.match(app,/renderProfileInsights\(\$\("profileInsights"\),localDateKey\(new Date\(\)\)\)/,"Profile view must render derived recent patterns");
assert.doesNotMatch(sleep,/profileBedtimeMinutes|getProfile|getSetting|bedtimeMin/,"sleep classification must not depend on a manually maintained bedtime profile");
assert.match(dataIo,/平日主要照护者.*周末主要照护者.*睡眠环境/,"Excel profile sheet must reflect current long-term profile fields");
assert.doesNotMatch(babyName,/settlingMethod|profileLongTermContext|persistDraftProfileExtras/,"baby-name module must not remain a second profile context owner");
assert.match(guard,/#feedingMode/);
assert.doesNotMatch(guard,/weekdayBedtime|weekdayLatency|weekdayNaps|settlingMethod/);
console.log("profile structure contracts passed");
`);

await edit("scripts/verify.mjs",text=>replaceOne(text,
  'runTest("record template policy regressions","tests/record-templates.test.mjs");',
  'runTest("record template policy regressions","tests/record-templates.test.mjs");\nrunTest("profile structure contracts","tests/profile-contract.test.mjs");\nrunTest("profile insight regressions","tests/profile-insights.test.mjs");',
  "register profile regressions"));

await unlink("scripts/apply-profile-slim-once.mjs");
await unlink(".github/workflows/profile-refactor-once.yml");
console.log("Profile refactor applied and one-time patch files removed.");
