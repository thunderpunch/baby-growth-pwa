import {getDay,putDay,getRecord,getRecordsByDate,putRecord} from "./db.js";

const SLEEP_METHODS=["自主入睡","奶睡","抱睡","拍睡","摇睡","其他"];
let editingRecordId=null;
let modalInjectionBusy=false;
let timelineDecorating=false;

function nowISO(){ return new Date().toISOString(); }
function currentDate(){ return document.getElementById("pageDate")?.value || ""; }
function escapeHTML(value=""){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function optionMarkup(selected=""){
  return `<option value="">未记录</option>${SLEEP_METHODS.map(method=>`<option value="${escapeHTML(method)}" ${method===selected?"selected":""}>${escapeHTML(method)}</option>`).join("")}`;
}

async function loadNightSleepMethod(){
  const select=document.getElementById("nightSleepMethod");
  const date=currentDate();
  if(!select || !date) return;
  const day=await getDay(date);
  select.value=day?.nightSleep?.sleepMethod || "";
}

async function persistNightSleepMethod(){
  const select=document.getElementById("nightSleepMethod");
  const date=currentDate();
  if(!select || !date) return;
  const day=await getDay(date);
  if(!day) return;
  day.nightSleep={
    ...(day.nightSleep||{}),
    sleepAt:document.getElementById("nightSleepAt")?.value || day.nightSleep?.sleepAt || "",
    wakeAt:document.getElementById("nightWakeAt")?.value || day.nightSleep?.wakeAt || "",
    sleepMethod:select.value
  };
  day.updatedAt=nowISO();
  await putDay(day);
}

function installNightSleepMethod(){
  const sleepAt=document.getElementById("nightSleepAt");
  const wakeAt=document.getElementById("nightWakeAt");
  if(!sleepAt || !wakeAt || document.getElementById("nightSleepMethod")) return;
  const fields=sleepAt.closest(".fields2");
  if(!fields) return;

  const wrapper=document.createElement("label");
  wrapper.className="form-label";
  wrapper.dataset.sleepMethodNight="1";
  wrapper.innerHTML=`入睡方式<select id="nightSleepMethod">${optionMarkup()}</select>`;
  fields.insertAdjacentElement("afterend",wrapper);

  const select=wrapper.querySelector("select");
  select.addEventListener("change",()=>persistNightSleepMethod().catch(error=>console.warn("Night sleep method save failed",error)));
  const restore=()=>{
    setTimeout(()=>persistNightSleepMethod().catch(error=>console.warn("Night sleep method restore failed",error)),80);
    setTimeout(()=>persistNightSleepMethod().catch(error=>console.warn("Night sleep method restore failed",error)),300);
  };
  sleepAt.addEventListener("change",restore);
  wakeAt.addEventListener("change",restore);
  loadNightSleepMethod().catch(error=>console.warn("Night sleep method load failed",error));
}

function buildModalMethodField(selected=""){
  const label=document.createElement("label");
  label.className="form-label";
  label.id="sleepMethodField";
  label.innerHTML=`入睡方式<div class="optionchips" id="sleepMethodChips">${SLEEP_METHODS.map(method=>`<button type="button" class="optionchip ${method===selected?"active":""}" data-sleep-method="${escapeHTML(method)}">${escapeHTML(method)}</button>`).join("")}</div>`;
  label.querySelectorAll("[data-sleep-method]").forEach(button=>{
    button.addEventListener("click",event=>{
      event.preventDefault();
      const wasActive=button.classList.contains("active");
      label.querySelectorAll("[data-sleep-method]").forEach(item=>item.classList.remove("active"));
      if(!wasActive) button.classList.add("active");
    });
  });
  return label;
}

async function injectModalSleepMethod(){
  if(modalInjectionBusy || document.getElementById("sleepMethodField")) return;
  const modal=document.getElementById("modal");
  if(!modal || modal.classList.contains("hidden")) return;
  if(!document.getElementById("fStart") || !document.getElementById("fEnd")) return;
  const title=document.getElementById("modalTitle")?.textContent || "";
  if(!title.includes("睡眠")) return;

  modalInjectionBusy=true;
  try{
    let selected="";
    if(editingRecordId){
      const record=await getRecord(editingRecordId);
      if(record?.type==="sleep") selected=record.sleepMethod || "";
    }
    const field=buildModalMethodField(selected);
    const note=document.getElementById("fNote")?.closest("label");
    if(note) note.insertAdjacentElement("beforebegin",field);
    else document.getElementById("modalBody")?.appendChild(field);
  }finally{
    modalInjectionBusy=false;
  }
}

function selectedModalMethod(){
  return document.querySelector("#sleepMethodChips .optionchip.active")?.dataset.sleepMethod || "";
}

async function persistSavedSleepMethod(context){
  for(let attempt=0;attempt<10;attempt++){
    await new Promise(resolve=>setTimeout(resolve,60));
    let record=null;

    if(context.editingId){
      record=await getRecord(context.editingId);
    }else{
      const records=await getRecordsByDate(context.date,{includeDeleted:false});
      record=records
        .filter(item=>item.type==="sleep")
        .filter(item=>item.startTime===context.startTime && item.endTime===context.endTime)
        .filter(item=>Date.parse(item.createdAt||0)>=context.startedAt-2000)
        .sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0))[0] || null;
    }

    if(!record || record.type!=="sleep") continue;
    if((record.sleepMethod||"")!==context.method){
      record.sleepMethod=context.method;
      record.updatedAt=nowISO();
      await putRecord(record);
    }
    await decorateTimeline();
    return;
  }
}

function prepareSleepSave(){
  if(!document.getElementById("sleepMethodField")) return;
  const date=currentDate();
  if(!date) return;
  const context={
    date,
    editingId:editingRecordId,
    method:selectedModalMethod(),
    startTime:document.getElementById("fStart")?.value || "",
    endTime:document.getElementById("fEnd")?.value || "",
    startedAt:Date.now()
  };
  editingRecordId=null;
  persistSavedSleepMethod(context).catch(error=>console.warn("Sleep method save failed",error));
}

async function decorateTimeline(){
  if(timelineDecorating) return;
  timelineDecorating=true;
  try{
    const buttons=Array.from(document.querySelectorAll("#timeline [data-edit-id]"));
    for(const button of buttons){
      const row=button.closest(".row");
      const sub=row?.querySelector(".rowsub");
      if(!row || !sub) continue;
      const record=await getRecord(button.dataset.editId);
      if(record?.type!=="sleep") continue;
      if(!sub.dataset.sleepMethodBase) sub.dataset.sleepMethodBase=sub.textContent || "";
      sub.textContent=record.sleepMethod
        ? [sub.dataset.sleepMethodBase,record.sleepMethod].filter(Boolean).join(" · ")
        : sub.dataset.sleepMethodBase;
    }
  }finally{
    timelineDecorating=false;
  }
}

installNightSleepMethod();
decorateTimeline().catch(error=>console.warn("Sleep method timeline decoration failed",error));

const modal=document.getElementById("modal");
if(modal){
  new MutationObserver(()=>injectModalSleepMethod().catch(error=>console.warn("Sleep method modal injection failed",error)))
    .observe(modal,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
}

const timeline=document.getElementById("timeline");
if(timeline){
  new MutationObserver(()=>decorateTimeline().catch(error=>console.warn("Sleep method timeline decoration failed",error)))
    .observe(timeline,{subtree:true,childList:true});
}

document.addEventListener("click",event=>{
  const target=event.target instanceof Element ? event.target : null;
  if(!target) return;

  const edit=target.closest("[data-edit-id]");
  if(edit) editingRecordId=edit.dataset.editId;
  if(target.closest('[data-quick="sleep"], [data-more="sleep"]')) editingRecordId=null;

  if(target.closest("#modalSave, #modalSaveContinue")) prepareSleepSave();
  if(target.closest("#modalCancel,#modalClose")) editingRecordId=null;

  if(target.closest("#prevDay,#nextDay,#todayBtn,[data-history-date]")){
    setTimeout(()=>loadNightSleepMethod().catch(error=>console.warn("Night sleep method refresh failed",error)),100);
  }
},true);

document.getElementById("pageDate")?.addEventListener("change",()=>{
  setTimeout(()=>loadNightSleepMethod().catch(error=>console.warn("Night sleep method refresh failed",error)),100);
});
