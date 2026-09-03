import {getSetting,getProfile,putProfile} from "./db.js";

const MAX_NAME_LENGTH=40;
const MAX_CONTEXT_LENGTH=300;
let fields={};
let draft={name:"",feedingMode:"",sleepEnvironment:"",settlingMethod:""};
let saved={...draft};
let toastObserver=null;
let titleObserver=null;

function ensureStyles(){
  if(document.querySelector('link[data-baby-name-style]')) return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL("./baby-name.css",import.meta.url).href;
  link.dataset.babyNameStyle="1";
  document.head.appendChild(link);
}

function clean(value,max){
  return String(value||"").trim().slice(0,max);
}

function localDateKey(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function weekdayCN(dateKey){
  const d=new Date(`${dateKey}T12:00:00`);
  return ["周日","周一","周二","周三","周四","周五","周六"][d.getDay()];
}

function createTextInput(id,placeholder,maxLength,onInput){
  const input=document.createElement("input");
  input.id=id;
  input.type="text";
  input.maxLength=maxLength;
  input.autocomplete="off";
  input.placeholder=placeholder;
  input.addEventListener("input",onInput);
  return input;
}

function ensureNameField(){
  const existing=document.getElementById("babyName");
  if(existing){ fields.name=existing; return existing; }

  const birthDate=document.getElementById("birthDate");
  const baseFields=birthDate?.closest(".fields2");
  if(!baseFields) return null;

  const label=document.createElement("label");
  label.className="baby-name-field";
  label.appendChild(document.createTextNode("宝宝名"));

  const input=createTextInput("babyName","例如：小满",MAX_NAME_LENGTH,()=>{draft.name=input.value;});
  label.appendChild(input);
  baseFields.insertAdjacentElement("beforebegin",label);
  fields.name=input;
  return input;
}

function contextField(labelText,id,placeholder,key){
  const label=document.createElement("label");
  label.appendChild(document.createTextNode(labelText));
  const input=createTextInput(id,placeholder,MAX_CONTEXT_LENGTH,()=>{draft[key]=input.value;});
  label.appendChild(input);
  fields[key]=input;
  return label;
}

function ensureContextFields(){
  const existing=document.getElementById("profileLongTermContext");
  if(existing){
    fields.feedingMode=document.getElementById("feedingMode");
    fields.sleepEnvironment=document.getElementById("sleepEnvironment");
    fields.settlingMethod=document.getElementById("settlingMethod");
    return existing;
  }

  const dietStage=document.getElementById("dietStage");
  const dietBox=dietStage?.closest(".phase-box");
  if(!dietBox) return null;

  const block=document.createElement("div");
  block.id="profileLongTermContext";
  block.className="profile-context-block";

  const title=document.createElement("div");
  title.className="profile-context-title";
  title.textContent="长期背景";

  const desc=document.createElement("div");
  desc.className="sectiondesc";
  desc.textContent="持续一段时期的喂养与睡眠习惯。长期改变时可创建新的成长阶段。";

  const grid=document.createElement("div");
  grid.className="fields2 profile-context-fields";
  grid.append(
    contextField("喂养方式","feedingMode","例如：配方奶为主 / 混合喂养 / 母乳亲喂","feedingMode"),
    contextField("睡眠环境","sleepEnvironment","例如：同房婴儿床 / 遮光 / 白噪音","sleepEnvironment"),
    contextField("常用哄睡方式","settlingMethod","例如：抱哄后放床 / 拍睡 / 奶睡","settlingMethod")
  );

  block.append(title,desc,grid);
  dietBox.insertAdjacentElement("beforebegin",block);
  return block;
}

function updateDayTitle(){
  const title=document.getElementById("dayRecordTitle");
  const pageDate=document.getElementById("pageDate")?.value;
  if(!title || !pageDate) return;

  const today=localDateKey(new Date());
  const name=clean(saved.name,MAX_NAME_LENGTH);
  let expected="";

  if(pageDate===today){
    expected=name ? `${name}的记录` : "今天的记录";
  }else{
    const [,month,day]=pageDate.split("-").map(Number);
    expected=name
      ? `${name} · ${month}月${day}日 ${weekdayCN(pageDate)}的记录`
      : `${month}月${day}日 ${weekdayCN(pageDate)}的记录`;
  }

  if(title.textContent!==expected) title.textContent=expected;
}

async function readCurrentProfile(){
  const id=await getSetting("currentProfileId");
  if(!id) return null;
  return getProfile(id);
}

function setFieldValues(values){
  for(const [key,value] of Object.entries(values)){
    if(fields[key] && document.activeElement!==fields[key]) fields[key].value=value;
  }
}

async function loadCurrentProfileExtras(){
  ensureNameField();
  ensureContextFields();
  const profile=await readCurrentProfile();

  const values={
    name:clean(profile?.base?.name||"",MAX_NAME_LENGTH),
    feedingMode:clean(profile?.stage?.feedingMode||"",MAX_CONTEXT_LENGTH),
    sleepEnvironment:clean(profile?.stage?.sleepEnvironment||"",MAX_CONTEXT_LENGTH),
    settlingMethod:clean(profile?.stage?.settlingMethod||"",MAX_CONTEXT_LENGTH)
  };

  saved={...values};
  draft={...values};
  setFieldValues(values);
  updateDayTitle();
}

async function persistDraftProfileExtras(){
  const profile=await readCurrentProfile();
  if(!profile) return;

  const values={
    name:clean(draft.name,MAX_NAME_LENGTH),
    feedingMode:clean(draft.feedingMode,MAX_CONTEXT_LENGTH),
    sleepEnvironment:clean(draft.sleepEnvironment,MAX_CONTEXT_LENGTH),
    settlingMethod:clean(draft.settlingMethod,MAX_CONTEXT_LENGTH)
  };

  const changed=
    profile.base?.name!==values.name ||
    profile.stage?.feedingMode!==values.feedingMode ||
    profile.stage?.sleepEnvironment!==values.sleepEnvironment ||
    profile.stage?.settlingMethod!==values.settlingMethod;

  if(changed){
    await putProfile({
      ...profile,
      base:{...(profile.base||{}),name:values.name},
      stage:{
        ...(profile.stage||{}),
        feedingMode:values.feedingMode,
        sleepEnvironment:values.sleepEnvironment,
        settlingMethod:values.settlingMethod
      },
      updatedAt:new Date().toISOString()
    });
  }

  saved={...values};
  draft={...values};
  setFieldValues(values);
  updateDayTitle();
}

function bindToastObserver(){
  const toastText=document.getElementById("toastText");
  if(!toastText || toastObserver) return;

  toastObserver=new MutationObserver(()=>{
    const text=toastText.textContent||"";
    if(text.includes("档案已保存") || text.includes("已创建新的成长阶段")){
      setTimeout(()=>persistDraftProfileExtras().catch(error=>console.warn("Profile extras save failed",error)),0);
    }else if(text.includes("导入完成")){
      setTimeout(()=>loadCurrentProfileExtras().catch(error=>console.warn("Profile extras reload failed",error)),0);
    }
  });
  toastObserver.observe(toastText,{childList:true,subtree:true,characterData:true});
}

function bindTitleObserver(){
  const title=document.getElementById("dayRecordTitle");
  if(!title || titleObserver) return;
  titleObserver=new MutationObserver(updateDayTitle);
  titleObserver.observe(title,{childList:true,subtree:true,characterData:true});
}

function bindNavigationRefresh(){
  document.addEventListener("click",event=>{
    const nav=event.target instanceof Element
      ? event.target.closest('.nav button[data-view="profile"]')
      : null;
    if(nav){
      setTimeout(()=>loadCurrentProfileExtras().catch(error=>console.warn("Profile extras load failed",error)),80);
    }
  },false);
}

async function initProfileExtras(){
  ensureStyles();
  ensureNameField();
  ensureContextFields();
  bindToastObserver();
  bindTitleObserver();
  bindNavigationRefresh();
  await loadCurrentProfileExtras();
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",()=>{
    initProfileExtras().catch(error=>console.warn("Profile extras init failed",error));
  },{once:true});
}else{
  initProfileExtras().catch(error=>console.warn("Profile extras init failed",error));
}
