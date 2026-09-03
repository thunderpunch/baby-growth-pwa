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
  // Chubby cranium, small lower face and softly protruding ears read more clearly as a baby at 24px.
  const base='<path d="M12 5.05c-3.05 0-5.12 2.25-5.35 5.48-1.34-.35-2.42.54-2.42 1.88 0 1.42 1.16 2.34 2.58 1.82.7 2.95 2.6 4.62 5.19 4.62s4.49-1.67 5.19-4.62c1.42.52 2.58-.4 2.58-1.82 0-1.34-1.08-2.23-2.42-1.88C17.12 7.3 15.05 5.05 12 5.05Z"/>';
  const neutral='<path d="M11.15 5.18c-.4-.78-.08-1.63.73-1.95.86-.34 1.67.2 1.68.98.01.72-.59 1.2-1.2 1.11"/>';
  const girl='<path d="M14.25 5.2c-.72-.86-1.65-1.09-2.14-.48-.48.6-.1 1.44.86 1.92l1.28-1.44Zm.42.12c.94-.73 1.94-.72 2.28.02.34.75-.19 1.47-1.18 1.79l-1.1-1.81Z"/><circle cx="14.48" cy="5.46" r=".58"/>';
  const boy='<path d="M10.85 5.15c-.34-1.02.34-2.05 1.4-2.12 1.12-.07 1.87.96 1.46 1.85-.35.76-1.42 1.02-2 .37"/>';
  return base+(variant==="girl"?girl:variant==="boy"?boy:neutral);
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
