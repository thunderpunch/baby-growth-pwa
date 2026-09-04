import {readFile,writeFile,unlink} from "node:fs/promises";

async function edit(path,fn){
  const before=await readFile(path,"utf8");
  const after=fn(before);
  if(after===before)throw new Error(`No change applied to ${path}`);
  await writeFile(path,after);
}
function replaceRequired(text,oldValue,newValue,label){
  const count=text.split(oldValue).length-1;
  if(count!==1)throw new Error(`${label}: expected 1 occurrence, got ${count}`);
  return text.replace(oldValue,newValue);
}
function replaceRegexRequired(text,regex,replacement,label){
  let count=0;
  const after=text.replace(regex,(...args)=>{count++;return typeof replacement==="function"?replacement(...args):replacement;});
  if(count!==1)throw new Error(`${label}: expected 1 match, got ${count}`);
  return after;
}

await edit("app.js",text=>replaceRequired(
  text,
  'if(includeInsights)await renderProfileInsights($("profileInsights"),localDateKey(new Date());',
  'if(includeInsights)await renderProfileInsights($("profileInsights"),localDateKey(new Date()));',
  "fix Profile insight call syntax"
));

await edit("sleep-v3.js",text=>{
  text=replaceRequired(text,"function inferredNightForDate(records,pageDate,bedtimeMin){","function inferredNightForDate(records,pageDate){","remove obsolete bedtime parameter");
  text=replaceRequired(text,'.filter(r=>basicClassify(r,bedtimeMin).kind==="night")','.filter(r=>basicClassify(r).kind==="night")',"remove manual bedtime classification input");
  text=replaceRequired(text,"const inferred=anchor?[]:inferredNightForDate(records,pageDate,bedtime);","const inferred=anchor?[]:inferredNightForDate(records,pageDate);","remove undefined bedtime variable");
  return text;
});

await edit("index.html",text=>{
  text=replaceRequired(text,
    '          <div class="sectiondesc">如果之前填错了，直接修正当前信息即可。</div>\n          <div class="fields2">',
    '          <div class="sectiondesc">如果之前填错了，直接修正当前信息即可。</div>\n          <label class="baby-name-field">宝宝名<input id="babyName" type="text" maxlength="40" autocomplete="off" placeholder="例如：小满"></label>\n          <div class="fields2">',
    "make baby name static"
  );
  text=replaceRequired(text,
`          <div class="fields2 section-gap">
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
          </div>`,
`          <label class="section-gap">长期喂养方式
            <select id="feedingMode">
              <option value="">请选择</option>
              <option value="母乳为主">母乳为主</option>
              <option value="配方奶为主">配方奶为主</option>
              <option value="混合喂养">混合喂养</option>
              <option value="其它/不固定">其它 / 不固定</option>
            </select>
          </label>
          <div class="fields2 section-gap">
            <label>平日主要照护者<input id="weekdayCaregiver" type="text" placeholder="例如：爷爷奶奶"></label>
            <label>周末主要照护者<input id="weekendCaregiver" type="text" placeholder="例如：父母"></label>
          </div>`,
    "align caregiver fields"
  );
  text=replaceRequired(text,'<button id="correctProfileBtn" class="secondary">修正当前信息</button>','<button id="correctProfileBtn" class="secondary">保存当前档案</button>',"make save label static");
  text=replaceRequired(text,'基础资料、成长阶段和记录设置分开管理。只有会改变一段时期分析背景的变化，才需要进入新阶段。','基础资料、长期背景和记录设置分开管理。可从实际记录推导的近期作息无需重复填写。',"update profile subtitle");
  return text;
});

await edit("styles.css",text=>replaceRegexRequired(
  text,
  /\.segment\{[^}]*\}\.segment button\{[^}]*\}\.segment button\.active\{[^}]*\}/,
  "",
  "remove obsolete profile segment styles"
));

await edit("large-text.css",text=>{
  const before=text;
  text=text.replace('.large-text .segment button,\n','');
  text=text.replace('.large-text .segment,\n.large-text .display-choice','.large-text .display-choice');
  if(text===before)throw new Error("large-text.css: obsolete segment styles not found");
  return text;
});

await edit("sw.js",text=>{
  text=text.replace(/const CACHE_NAME="[^"]+";/,'const CACHE_NAME="baby-growth-pwa-v1.4.4-profile-insights";');
  text=replaceRequired(
    text,
    '"./record-model.js","./record-templates.js","./sleep-v3.js","./sleep-v3.css","./timeline-v3.js",',
    '"./record-model.js","./record-templates.js","./profile-insights.js","./profile-insights.css","./sleep-v3.js","./sleep-v3.css","./timeline-v3.js",',
    "cache Profile insight module"
  );
  return text;
});

await unlink("scripts/finalize-profile-refactor-once.mjs");
await unlink(".github/workflows/finalize-profile-refactor-once.yml");
console.log("Final Profile refactor cleanup applied.");
