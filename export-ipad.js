import "./profile-save-guard.js";
import "./time-behavior.js";
import "./recent-milk-template.js";
import "./update-coordinator.js";
import "./gesture-guard.js";

const layoutFix=document.createElement("link");
layoutFix.rel="stylesheet";
layoutFix.href=new URL("./layout-fix.css?v=1.1.8",import.meta.url).href;
layoutFix.dataset.tabletLayout="1.1.8";
document.head.appendChild(layoutFix);

function isIPadOS(){
  const ua=navigator.userAgent||"";
  const platform=navigator.platform||"";
  return /iPad/i.test(ua) || (platform==="MacIntel" && navigator.maxTouchPoints>1);
}

if(isIPadOS()){
  const updateCopy=()=>{
    const button=document.getElementById("downloadBtn");
    if(!button) return;
    const note=button.querySelector("span");
    if(note) note.textContent="打开系统分享面板后选择“存储到‘文件’”，可保存到本机或 iCloud Drive。";
  };

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",updateCopy,{once:true});
  }else{
    updateCopy();
  }

  document.addEventListener("click",event=>{
    const target=event.target instanceof Element ? event.target.closest("#downloadBtn") : null;
    if(!target) return;
    const shareButton=document.getElementById("shareBtn");
    if(!shareButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    shareButton.click();
  },true);
}
