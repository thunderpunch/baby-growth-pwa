import {getSetting,getProfile} from "./db.js";

const VARIANTS={female:"girl",male:"boy"};
let appliedVariant="";
let toastObserver=null;

function variantForSex(sex){ return VARIANTS[sex] || "neutral"; }
function iconUrl(variant){ return `./icons/baby-${variant}.svg`; }
function manifestUrl(variant){ return variant==="neutral" ? "./manifest.webmanifest" : `./manifest-${variant}.webmanifest`; }

function applyVariantFromSex(sex){
  const variant=variantForSex(sex);
  if(appliedVariant===variant) return;
  appliedVariant=variant;
  document.documentElement.dataset.babyIconVariant=variant;

  const src=iconUrl(variant);
  const brand=document.getElementById("brandBabyIcon");
  const profile=document.getElementById("profileTabIcon");
  const favicon=document.getElementById("babyFavicon") || document.querySelector('link[rel="icon"]');
  const apple=document.getElementById("babyAppleTouchIcon") || document.querySelector('link[rel="apple-touch-icon"]');
  const manifest=document.getElementById("babyManifest") || document.querySelector('link[rel="manifest"]');

  if(brand) brand.src=src;
  if(profile) profile.src=src;
  if(favicon) favicon.href=src;
  if(apple) apple.href=src;
  if(manifest) manifest.href=manifestUrl(variant);
}

async function savedSex(){
  const id=await getSetting("currentProfileId","");
  if(!id) return "";
  const profile=await getProfile(id);
  return profile?.base?.sex || "";
}

async function syncSavedVariant(){
  applyVariantFromSex(await savedSex());
}

function bindSexPreview(){
  const select=document.getElementById("sex");
  if(!select) return;
  select.addEventListener("change",()=>applyVariantFromSex(select.value));
}

function bindSavedRefresh(){
  const toastText=document.getElementById("toastText");
  if(toastText && !toastObserver){
    toastObserver=new MutationObserver(()=>{
      const text=toastText.textContent || "";
      if(text.includes("档案已保存") || text.includes("已创建新的成长阶段") || text.includes("导入完成")){
        setTimeout(()=>syncSavedVariant().catch(error=>console.warn("Baby icon refresh failed",error)),80);
      }
    });
    toastObserver.observe(toastText,{childList:true,subtree:true,characterData:true});
  }

  document.addEventListener("click",event=>{
    const target=event.target instanceof Element ? event.target : null;
    const nav=target?.closest('.nav button[data-view]');
    if(!nav || nav.dataset.view==="profile") return;
    setTimeout(()=>{
      if(!document.getElementById("profileView")?.classList.contains("active")){
        syncSavedVariant().catch(error=>console.warn("Baby icon revert failed",error));
      }
    },120);
  },false);

  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"){
      syncSavedVariant().catch(error=>console.warn("Baby icon foreground refresh failed",error));
    }
  });
}

async function initBabyIconTheme(){
  bindSexPreview();
  bindSavedRefresh();
  await syncSavedVariant();
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",()=>initBabyIconTheme().catch(error=>console.warn("Baby icon theme init failed",error)),{once:true});
}else{
  initBabyIconTheme().catch(error=>console.warn("Baby icon theme init failed",error));
}
