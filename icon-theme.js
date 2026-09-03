import {getSetting,getProfile} from "./db.js";

const VARIANTS={female:"girl",male:"boy"};
const CACHE_KEY="baby-growth-icon-sex";
const SVG_NS="http://www.w3.org/2000/svg";
let appliedVariant="";
let toastObserver=null;

function cleanSex(sex){ return sex==="female" || sex==="male" ? sex : ""; }
function cachedSex(){ try{return cleanSex(localStorage.getItem(CACHE_KEY)||"");}catch{return "";} }
function saveCachedSex(sex){
  try{
    const value=cleanSex(sex);
    if(value) localStorage.setItem(CACHE_KEY,value); else localStorage.removeItem(CACHE_KEY);
  }catch{}
}
function variantForSex(sex){ return VARIANTS[cleanSex(sex)] || "neutral"; }
function iconUrl(variant){
  return variant==="neutral" ? "./icons/baby-neutral-approved.svg" : `./icons/baby-${variant}-approved.svg`;
}
function manifestUrl(variant){ return variant==="neutral" ? "./manifest.webmanifest" : `./manifest-${variant}.webmanifest`; }

function profileIconMarkup(variant){
  const base='<path d="M12 5.2c-2.9 0-4.9 2.1-5.1 5.3-1.2-.3-2.1.5-2.1 1.7 0 1.3 1 2.1 2.3 1.7.7 3 2.4 4.7 4.9 4.7s4.2-1.7 4.9-4.7c1.3.4 2.3-.4 2.3-1.7 0-1.2-.9-2-2.1-1.7-.2-3.2-2.2-5.3-5.1-5.3Z"/>';
  const girl='<path d="M14.7 5.7c-.8-.9-1.7-1.2-2.2-.6-.5.6-.2 1.5.8 2.1l1.4-1.5Zm.3.1c.9-.8 1.9-.9 2.3-.2.4.7 0 1.5-1 1.9L15 5.8Z"/><circle cx="14.9" cy="6" r=".65"/>';
  const boy='<path d="M10.9 5.3c.2-1.4 1.4-2.3 2.5-1.7 1 .5 1.1 1.8.3 2.4-.6.5-1.6.3-1.8-.4"/>';
  return base+(variant==="girl"?girl:variant==="boy"?boy:"");
}

function ensureStyle(){
  if(document.querySelector('link[data-baby-icon-theme]')) return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL("./icon-theme.css",import.meta.url).href;
  link.dataset.babyIconTheme="1";
  document.head.appendChild(link);
}

function ensureProfileIcon(profileButton){
  if(!profileButton) return null;
  let svg=document.getElementById("profileTabIcon");
  if(!svg){
    const old=profileButton.querySelector("svg");
    svg=document.createElementNS(SVG_NS,"svg");
    svg.id="profileTabIcon";
    svg.setAttribute("viewBox","0 0 24 24");
    svg.setAttribute("aria-hidden","true");
    svg.setAttribute("fill","none");
    svg.setAttribute("stroke","currentColor");
    svg.setAttribute("stroke-width","1.8");
    svg.setAttribute("stroke-linecap","round");
    svg.setAttribute("stroke-linejoin","round");
    if(old) old.replaceWith(svg); else profileButton.prepend(svg);
  }
  return svg;
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
  const profile=ensureProfileIcon(profileButton);

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
  const variant=variantForSex(sex);
  const targets=ensureTargets();
  if(!force && appliedVariant===variant && targets.brand?.src) return;
  appliedVariant=variant;
  document.documentElement.dataset.babyIconVariant=variant;

  const src=iconUrl(variant);
  if(targets.brand) targets.brand.src=src;
  if(targets.profile){
    targets.profile.dataset.variant=variant;
    targets.profile.innerHTML=profileIconMarkup(variant);
  }
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
