const DATE_INPUT_SELECTOR='input[type="date"]';
const CLEARABLE_IDS=new Set(["birthDate"]);
const enhanced=new WeakMap();
let overlay=null;
let panel=null;
let titleNode=null;
let gridNode=null;
let clearButton=null;
let activeInput=null;
let viewYear=0;
let viewMonth=0;

function pad2(n){return String(n).padStart(2,"0");}
function localDateKey(date){return `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`;}
function parseDateKey(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return null;
  const [y,m,d]=value.split("-").map(Number);
  const date=new Date(y,m-1,d,12,0,0,0);
  if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)return null;
  return date;
}
function formatTrigger(input){
  const date=parseDateKey(input.value);
  if(!date)return "选择日期";
  if(input.id==="pageDate")return `${date.getMonth()+1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`;
}
function syncTrigger(input){
  const trigger=enhanced.get(input);
  if(!trigger)return;
  const text=formatTrigger(input);
  if(trigger.textContent!==text)trigger.textContent=text;
  trigger.classList.toggle("is-empty",!input.value);
  if(trigger.dataset.value!==(input.value||""))trigger.dataset.value=input.value||"";
}
function syncAll(){
  document.querySelectorAll(DATE_INPUT_SELECTOR).forEach(input=>{
    if(input instanceof HTMLInputElement){
      enhanceInput(input);
      syncTrigger(input);
    }
  });
}
function commitValue(value){
  if(!activeInput)return;
  activeInput.value=value;
  activeInput.dispatchEvent(new Event("input",{bubbles:true}));
  activeInput.dispatchEvent(new Event("change",{bubbles:true}));
  syncTrigger(activeInput);
  closePicker();
}
function dateAllowed(input,value){
  if(input.min&&value<input.min)return false;
  if(input.max&&value>input.max)return false;
  return true;
}
function renderCalendar(){
  if(!activeInput||!gridNode||!titleNode)return;
  titleNode.textContent=`${viewYear}年${viewMonth+1}月`;
  gridNode.replaceChildren();
  const selected=activeInput.value;
  const today=localDateKey(new Date());
  const first=new Date(viewYear,viewMonth,1,12,0,0,0);
  const mondayOffset=(first.getDay()+6)%7;
  const daysInMonth=new Date(viewYear,viewMonth+1,0,12,0,0,0).getDate();

  for(let i=0;i<mondayOffset;i++){
    const blank=document.createElement("span");
    blank.className="custom-date-blank";
    gridNode.appendChild(blank);
  }

  for(let day=1;day<=daysInMonth;day++){
    const value=`${viewYear}-${pad2(viewMonth+1)}-${pad2(day)}`;
    const button=document.createElement("button");
    button.type="button";
    button.className="custom-date-day";
    button.textContent=String(day);
    button.dataset.date=value;
    button.disabled=!dateAllowed(activeInput,value);
    if(value===today)button.classList.add("is-today");
    if(value===selected)button.classList.add("is-selected");
    button.addEventListener("click",()=>commitValue(value));
    gridNode.appendChild(button);
  }

  if(clearButton)clearButton.hidden=!CLEARABLE_IDS.has(activeInput.id);
}
function moveMonth(delta){
  const date=new Date(viewYear,viewMonth+delta,1,12,0,0,0);
  viewYear=date.getFullYear();
  viewMonth=date.getMonth();
  renderCalendar();
}
function ensurePicker(){
  if(overlay)return;
  overlay=document.createElement("div");
  overlay.className="custom-date-overlay";
  overlay.hidden=true;
  overlay.innerHTML=`
    <div class="custom-date-panel" role="dialog" aria-modal="true" aria-label="选择日期">
      <div class="custom-date-head">
        <button type="button" class="custom-date-month-btn" data-date-prev aria-label="上个月">‹</button>
        <b class="custom-date-title"></b>
        <button type="button" class="custom-date-month-btn" data-date-next aria-label="下个月">›</button>
      </div>
      <div class="custom-date-weekdays" aria-hidden="true">
        <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
      </div>
      <div class="custom-date-grid"></div>
      <div class="custom-date-actions">
        <button type="button" class="secondary" data-date-cancel>取消</button>
        <button type="button" class="secondary" data-date-clear hidden>清除</button>
        <button type="button" class="primary" data-date-today>今天</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  panel=overlay.querySelector(".custom-date-panel");
  titleNode=overlay.querySelector(".custom-date-title");
  gridNode=overlay.querySelector(".custom-date-grid");
  clearButton=overlay.querySelector("[data-date-clear]");
  overlay.querySelector("[data-date-prev]")?.addEventListener("click",()=>moveMonth(-1));
  overlay.querySelector("[data-date-next]")?.addEventListener("click",()=>moveMonth(1));
  overlay.querySelector("[data-date-cancel]")?.addEventListener("click",closePicker);
  clearButton?.addEventListener("click",()=>commitValue(""));
  overlay.querySelector("[data-date-today]")?.addEventListener("click",()=>{
    const today=localDateKey(new Date());
    if(activeInput&&dateAllowed(activeInput,today))commitValue(today);
  });
  overlay.addEventListener("click",event=>{
    if(event.target===overlay)closePicker();
  });
  panel?.addEventListener("click",event=>event.stopPropagation());
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!overlay?.hidden)closePicker();
  });
}
function openPicker(input){
  ensurePicker();
  activeInput=input;
  const base=parseDateKey(input.value)||new Date();
  viewYear=base.getFullYear();
  viewMonth=base.getMonth();
  renderCalendar();
  overlay.hidden=false;
  document.body.classList.add("custom-date-open");
  requestAnimationFrame(()=>panel?.querySelector(".is-selected,.is-today,.custom-date-day:not(:disabled)")?.focus());
}
function closePicker(){
  if(!overlay)return;
  overlay.hidden=true;
  document.body.classList.remove("custom-date-open");
  activeInput=null;
}
function enhanceInput(input){
  if(enhanced.has(input))return;
  input.dataset.customDateHidden="1";
  input.tabIndex=-1;
  input.setAttribute("aria-hidden","true");
  const trigger=document.createElement("button");
  trigger.type="button";
  trigger.className="custom-date-trigger"+(input.id==="pageDate"?" custom-date-trigger-compact":"");
  trigger.setAttribute("aria-label",input.id==="pageDate"?"选择记录日期":"选择日期");
  trigger.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    openPicker(input);
  });
  input.insertAdjacentElement("afterend",trigger);
  enhanced.set(input,trigger);
  input.addEventListener("input",()=>syncTrigger(input));
  input.addEventListener("change",()=>syncTrigger(input));
  syncTrigger(input);
}
function bind(){
  ensurePicker();
  syncAll();
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(!(node instanceof Element))continue;
        if(node.matches?.(DATE_INPUT_SELECTOR)&&node instanceof HTMLInputElement)enhanceInput(node);
        node.querySelectorAll?.(DATE_INPUT_SELECTOR).forEach(el=>{if(el instanceof HTMLInputElement)enhanceInput(el);});
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener("click",()=>{
    setTimeout(syncAll,0);
    setTimeout(syncAll,180);
  },true);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")syncAll();});
  window.addEventListener("pageshow",syncAll);
  setTimeout(syncAll,450);
  setTimeout(syncAll,1200);
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
