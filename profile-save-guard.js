const PROFILE_FIELD_SELECTOR = [
  "#birthDate", "#sex",
  "#weekdayBedtime", "#weekdayLatency", "#weekdayNaps", "#weekdayCaregiver",
  "#weekendBedtime", "#weekendLatency", "#weekendNaps", "#weekendCaregiver",
  "#mainIssue"
].join(",");

let profileDirty = false;
let saveAckTimer = null;

function ensureProfileSaveStatus(){
  const saveBtn = document.getElementById("correctProfileBtn");
  if(!saveBtn) return null;
  saveBtn.textContent = "保存当前档案";

  let status = document.getElementById("profileSaveStatus");
  if(status) return status;

  status = document.createElement("div");
  status.id = "profileSaveStatus";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.style.marginTop = "8px";
  status.style.minHeight = "22px";
  status.style.fontSize = "13px";
  status.style.fontWeight = "800";
  status.style.color = "#7e7687";

  const row = saveBtn.closest(".btnrow") || saveBtn.parentElement;
  row?.insertAdjacentElement("afterend", status);
  return status;
}

function setProfileStatus(text, tone="muted"){
  const status = ensureProfileSaveStatus();
  if(!status) return;
  status.textContent = text;
  status.style.color = tone === "dirty"
    ? "#c8668d"
    : tone === "saved"
      ? "#5f8f7d"
      : "#7e7687";
}

function markProfileDirty(){
  profileDirty = true;
  clearTimeout(saveAckTimer);
  setProfileStatus("● 有未保存的修改", "dirty");
}

function markProfileSaved(){
  profileDirty = false;
  clearTimeout(saveAckTimer);
  setProfileStatus("✓ 已保存", "saved");
}

function markProfileSaving(){
  if(!profileDirty) return;
  setProfileStatus("正在保存…");
  clearTimeout(saveAckTimer);
  saveAckTimer = setTimeout(()=>{
    if(profileDirty) setProfileStatus("● 有未保存的修改，请再次保存", "dirty");
  }, 3000);
}

function bindProfileDirtyTracking(){
  ensureProfileSaveStatus();

  document.addEventListener("input", event=>{
    if(event.target instanceof Element && event.target.matches(PROFILE_FIELD_SELECTOR)){
      markProfileDirty();
    }
  });

  document.addEventListener("change", event=>{
    if(event.target instanceof Element && event.target.matches(PROFILE_FIELD_SELECTOR)){
      markProfileDirty();
    }
  });

  document.addEventListener("click", event=>{
    const target = event.target instanceof Element ? event.target : null;
    if(!target) return;

    if(target.closest("[data-diet-stage]")){
      markProfileDirty();
      return;
    }

    if(target.closest("#correctProfileBtn")){
      markProfileSaving();
      return;
    }

    const navButton = target.closest(".nav button[data-view]");
    if(
      navButton &&
      navButton.dataset.view !== "profile" &&
      profileDirty &&
      document.getElementById("profileView")?.classList.contains("active")
    ){
      const leave = window.confirm("档案还有未保存的修改。确定离开并放弃这些修改吗？");
      if(!leave){
        event.preventDefault();
        event.stopImmediatePropagation();
      }else{
        profileDirty = false;
      }
    }
  }, true);

  window.addEventListener("beforeunload", event=>{
    if(!profileDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  const toastText = document.getElementById("toastText");
  if(toastText){
    const observer = new MutationObserver(()=>{
      const text = toastText.textContent || "";
      if(text.includes("档案已保存") || text.includes("已创建新的成长阶段")){
        markProfileSaved();
      }
    });
    observer.observe(toastText,{childList:true,subtree:true,characterData:true});
  }

  setProfileStatus("修改后请点“保存当前档案”");
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded",bindProfileDirtyTracking,{once:true});
}else{
  bindProfileDirtyTracking();
}
