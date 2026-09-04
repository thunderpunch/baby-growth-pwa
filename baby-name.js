import {getSetting,getProfile} from "./db.js";

const MAX_NAME_LENGTH=40;
let nameInput=null;
let savedName="";
let toastObserver=null;
let titleObserver=null;

function ensureStyles(){
  if(document.querySelector('link[data-baby-name-style]'))return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL("./baby-name.css",import.meta.url).href;
  link.dataset.babyNameStyle="1";
  document.head.appendChild(link);
}
function clean(value){return String(value||"").trim().slice(0,MAX_NAME_LENGTH);}
function localDateKey(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function weekdayCN(dateKey){
  const date=new Date(`${dateKey}T12:00:00`);
  return ["周日","周一","周二","周三","周四","周五","周六"][date.getDay()];
}
function ensureNameField(){
  const existing=document.getElementById("babyName");
  if(existing){nameInput=existing;return existing;}
  const birthDate=document.getElementById("birthDate"),baseFields=birthDate?.closest(".fields2");
  if(!baseFields)return null;
  const label=document.createElement("label");
  label.className="baby-name-field";
  label.appendChild(document.createTextNode("宝宝名"));
  const input=document.createElement("input");
  input.id="babyName";
  input.type="text";
  input.maxLength=MAX_NAME_LENGTH;
  input.autocomplete="off";
  input.placeholder="例如：小满";
  label.appendChild(input);
  baseFields.insertAdjacentElement("beforebegin",label);
  nameInput=input;
  return input;
}
async function readCurrentProfile(){
  const id=await getSetting("currentProfileId");
  return id?getProfile(id):null;
}
function updateDayTitle(){
  const title=document.getElementById("dayRecordTitle"),pageDate=document.getElementById("pageDate")?.value;
  if(!title||!pageDate)return;
  const today=localDateKey(new Date()),name=clean(savedName);
  let expected="";
  if(pageDate===today)expected=name?`${name}的记录`:"今天的记录";
  else{
    const [,month,day]=pageDate.split("-").map(Number);
    expected=name?`${name} · ${month}月${day}日 ${weekdayCN(pageDate)}的记录`:`${month}月${day}日 ${weekdayCN(pageDate)}的记录`;
  }
  if(title.textContent!==expected)title.textContent=expected;
}
async function loadSavedName(){
  ensureNameField();
  const profile=await readCurrentProfile();
  savedName=clean(profile?.base?.name||"");
  if(nameInput&&document.activeElement!==nameInput)nameInput.value=savedName;
  updateDayTitle();
}
function bindToastObserver(){
  const toastText=document.getElementById("toastText");
  if(!toastText||toastObserver)return;
  toastObserver=new MutationObserver(()=>{
    const text=toastText.textContent||"";
    if(text.includes("档案已保存")||text.includes("已创建新的成长阶段")||text.includes("导入完成")){
      setTimeout(()=>loadSavedName().catch(error=>console.warn("Baby name reload failed",error)),0);
    }
  });
  toastObserver.observe(toastText,{childList:true,subtree:true,characterData:true});
}
function bindTitleObserver(){
  const title=document.getElementById("dayRecordTitle");
  if(!title||titleObserver)return;
  titleObserver=new MutationObserver(updateDayTitle);
  titleObserver.observe(title,{childList:true,subtree:true,characterData:true});
}
function bindNavigationRefresh(){
  document.addEventListener("click",event=>{
    const profile=event.target instanceof Element?event.target.closest('.nav button[data-view="profile"]'):null;
    if(profile)setTimeout(()=>loadSavedName().catch(error=>console.warn("Baby name load failed",error)),80);
  });
}
async function init(){
  ensureStyles();
  ensureNameField();
  bindToastObserver();
  bindTitleObserver();
  bindNavigationRefresh();
  await loadSavedName();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>init().catch(console.warn),{once:true});
else init().catch(console.warn);
