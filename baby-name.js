import {getSetting,getProfile,putProfile} from "./db.js";

const MAX_NAME_LENGTH=40;
let nameInput=null;
let draftName="";
let currentSavedName="";
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

function safeName(value){
  return String(value||"").trim().slice(0,MAX_NAME_LENGTH);
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

function ensureNameField(){
  if(nameInput?.isConnected) return nameInput;

  const existing=document.getElementById("babyName");
  if(existing){
    nameInput=existing;
    return nameInput;
  }

  const birthDate=document.getElementById("birthDate");
  const baseFields=birthDate?.closest(".fields2");
  if(!baseFields) return null;

  const label=document.createElement("label");
  label.className="baby-name-field";
  label.appendChild(document.createTextNode("宝宝名"));

  const input=document.createElement("input");
  input.id="babyName";
  input.type="text";
  input.maxLength=MAX_NAME_LENGTH;
  input.autocomplete="off";
  input.placeholder="例如：小满";
  input.addEventListener("input",()=>{
    draftName=input.value;
  });

  label.appendChild(input);
  baseFields.insertAdjacentElement("beforebegin",label);
  nameInput=input;
  return input;
}

function updateDayTitle(){
  const title=document.getElementById("dayRecordTitle");
  const pageDate=document.getElementById("pageDate")?.value;
  if(!title || !pageDate) return;

  const today=localDateKey(new Date());
  const name=safeName(currentSavedName);
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

async function loadCurrentName(){
  const input=ensureNameField();
  const profile=await readCurrentProfile();
  const name=safeName(profile?.base?.name||"");

  currentSavedName=name;
  draftName=name;
  if(input && document.activeElement!==input) input.value=name;
  updateDayTitle();
}

async function persistDraftName(){
  const profile=await readCurrentProfile();
  if(!profile) return;

  const name=safeName(draftName);
  if(profile.base?.name!==name){
    await putProfile({
      ...profile,
      base:{...(profile.base||{}),name},
      updatedAt:new Date().toISOString()
    });
  }

  currentSavedName=name;
  if(nameInput) nameInput.value=name;
  updateDayTitle();
}

function bindToastObserver(){
  const toastText=document.getElementById("toastText");
  if(!toastText || toastObserver) return;

  toastObserver=new MutationObserver(()=>{
    const text=toastText.textContent||"";
    if(text.includes("档案已保存") || text.includes("已创建新的成长阶段")){
      setTimeout(()=>persistDraftName().catch(error=>console.warn("Baby name save failed",error)),0);
    }else if(text.includes("导入完成")){
      setTimeout(()=>loadCurrentName().catch(error=>console.warn("Baby name reload failed",error)),0);
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
      setTimeout(()=>loadCurrentName().catch(error=>console.warn("Baby name load failed",error)),80);
    }
  },false);
}

async function initBabyName(){
  ensureStyles();
  ensureNameField();
  bindToastObserver();
  bindTitleObserver();
  bindNavigationRefresh();
  await loadCurrentName();
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",()=>{
    initBabyName().catch(error=>console.warn("Baby name init failed",error));
  },{once:true});
}else{
  initBabyName().catch(error=>console.warn("Baby name init failed",error));
}
