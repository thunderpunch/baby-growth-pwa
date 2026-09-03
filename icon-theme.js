import {getSetting,getProfile} from "./db.js";

const VARIANTS={female:"girl",male:"boy"};
const CACHE_KEY="baby-growth-icon-sex";
let appliedVariant="";
let toastObserver=null;

function cleanSex(sex){ return sex==="female" || sex==="male" ? sex : ""; }
function cachedSex(){
  try{ return cleanSex(localStorage.getItem(CACHE_KEY)||""); }catch{ return ""; }
}
function saveCachedSex(sex){
  try{
    const value=cleanSex(sex);
    if(value) localStorage.setItem(CACHE_KEY,value);
    else localStorage.removeItem(CACHE_KEY);
  }catch{}
}
function variantForSex(sex){ return VARIANTS[sex] || "neutral"; }
function iconUrl(variant){
  return variant==="neutral" ? "./icons/baby-neutral.svg" : `./icons/baby-${variant}-approved.svg`;
}
function manifestUrl(variant){ return variant==="neutral" ? "./manifest.webmanifest" : `./manifest-${variant}.webmanifest`; }

function ensureStyle(){
  if(document.querySelector('link[data-baby-icon-theme]')) return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL("./icon-theme.css",import.meta.url).href;
  link.dataset.babyIconTheme="1";
  document.head.appendChild(link);
}

function ensureTargets(){
  const logo=document.querySelector(".logo");
  let brand=document.getElementById("brandBabyIcon");
  if(logo && !brand){
    brand=document.createElement("img");
    brand.id="brandBabyIcon";
    brand.alt="";
    brand.setAttribute("aria-hidden","true");
    logo.replaceChildren(brand);
  }

  const profileButton=document.querySelector('.nav button[data-view="profile"]');
  let profile=document.getElementById("profileTabIcon");
  if(profileButton && !profile){
    profile=document.createElement("img");
    profile.id="profileTabIcon";
    profile.alt="";
    profile.setAttribute("aria-hidden","true");
    const oldIcon=profileButton.querySelector("svg");
    if(oldIcon) oldIcon.replaceWith(profile);
    else profileButton.prepend(profile);
  }

  let favicon=document.getElementById("babyFavicon") || document.querySelector('link[rel="icon"]');
  if(!favicon){
    favicon=document.createElement("link");
    favicon.id="babyFavicon";
    favicon.rel="icon";
    document.head.appendChild(favicon);
  }
  favicon.type="image/svg+xml";

  const apple=document.getElementById("babyAppleTouchIcon") || document.querySelector('link[rel="apple-touch-icon"]');
  const manifest=document.getElementById("babyManifest") || document.querySelector('link[rel="manifest"]');
  return {brand,profile,favicon,apple,manifest};
}

function applyVariantFromSex(sex,{force=false}={}){
  const variant=variantForSex(cleanSex(sex));
  const targets=ensureTargets();
  if(!force && appliedVariant===variant && targets.brand?.src) return;
  appliedVariant=variant;
  document.documentElement.dataset.babyIconVariant=variant;
  const src=iconUrl(variant);
  if(targets.brand) targets.brand.src=src;
  if(targets.profile) targets.profile.src=src;
  if(targets.favicon) targets.favicon.href=src;
  if(targets.apple) targets.apple.href=src;
  if(targets.manifest) targets.manifest.href=manifestUrl(variant);
}

async function savedSex(){
  const id=await getSetting("currentProfileId","");
  if(!id) return "";
  const profile=await getProfile(id);
  return cleanSex(profile?.base?.sex || "");
}

async function syncSavedVariant(){
  const sex=await savedSex();
  saveCachedSex(sex);
  applyVariantFromSex(sex,{force:true});
}

function bindSexPreview(){
  const select=document.getElementById("sex");
  if(!select || select.dataset.iconThemeBound==="1") return;
  select.dataset.iconThemeBound="1";
  select.addEventListener("change",()=>applyVariantFromSex(select.value,{force:true}));
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
      bindSexPreview();
      syncSavedVariant().catch(error=>console.warn("Baby icon foreground refresh failed",error));
    }
  });
}

function applyFirstFrame(){
  ensureStyle();
  applyVariantFromSex(cachedSex(),{force:true});
}

async function initBabyIconTheme(){
  applyFirstFrame();
  bindSexPreview();
  bindSavedRefresh();
  await syncSavedVariant();
}

try{ applyFirstFrame(); }catch(error){ console.warn("Baby icon first-frame apply failed",error); }

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",()=>initBabyIconTheme().catch(error=>console.warn("Baby icon theme init failed",error)),{once:true});
}else{
  initBabyIconTheme().catch(error=>console.warn("Baby icon theme init failed",error));
}
