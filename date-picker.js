const DATE_INPUT_SELECTOR='input[type="date"]';
const CLEARABLE_IDS=new Set(["birthDate"]);
const CALENDAR_CELLS=42;
const enhanced=new WeakMap();
let overlay=null;
let panel=null;
let titleNode=null;
let gridNode=null;
let clearButton=null;
let todayButton=null;
let prevButton=null;
let nextButton=null;
let activeInput=null;
let viewYear=0;
let viewMonth=0;
let touchStart=null;
let suppressGridClickUntil=0;

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
  const input=activeInput;
  input.value=value;
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
  syncTrigger(input);
  closePicker({returnFocus:true});
}
function dateAllowed(input,value){
  if(input.min&&value<input.min)return false;
  if(input.max&&value>input.max)return false;
  return true;
}
function monthBounds(year,month){
  const last=new Date(year,month+1,0,12,0,0,0).getDate();
  return {
    start:`${year}-${pad2(month+1)}-01`,
    end:`${year}-${pad2(month+1)}-${pad2(last)}`
  };
}
function monthHasAllowedDate(input,year,month){
  const {start,end}=monthBounds(year,month);
  if(input.min&&end<input.min)return false;
  if(input.max&&start>input.max)return false;
  return true;
}
function shiftedMonth(delta){
  const date=new Date(viewYear,viewMonth+delta,1,12,0,0,0);
  return {year:date.getFullYear(),month:date.getMonth()};
}
function renderCalendar(){
  if(!activeInput||!gridNode||!titleNode)return;
  titleNode.textContent=`${viewYear}年${viewMonth+1}月`;
  gridNode.replaceChildren();
  const selected=activeInput.value;
  const today=localDateKey(new Date());
  const first=new Date(viewYear,viewMonth,1,12,0,0,0);
  const mondayOffset=(first.getDay()+6)%7;
  const gridStart=new Date(viewYear,viewMonth,1-mondayOffset,12,0,0,0);

  for(let i=0;i<CALENDAR_CELLS;i++){
    const date=new Date(gridStart);
    date.setDate(gridStart.getDate()+i);
    const value=localDateKey(date);
    const button=document.createElement("button");
    button.type="button";
    button.className="custom-date-day";
    button.textContent=String(date.getDate());
    button.dataset.date=value;
    button.setAttribute("aria-label",`${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`);
    button.disabled=!dateAllowed(activeInput,value);
    if(date.getFullYear()!==viewYear||date.getMonth()!==viewMonth)button.classList.add("is-outside-month");
    if(value===today)button.classList.add("is-today");
    if(value===selected)button.classList.add("is-selected");
    gridNode.appendChild(button);
  }

  if(clearButton)clearButton.hidden=!CLEARABLE_IDS.has(activeInput.id);
  if(todayButton)todayButton.disabled=!dateAllowed(activeInput,today);
  const prev=shiftedMonth(-1),next=shiftedMonth(1);
  if(prevButton)prevButton.disabled=!monthHasAllowedDate(activeInput,prev.year,prev.month);
  if(nextButton)nextButton.disabled=!monthHasAllowedDate(activeInput,next.year,next.month);
}
function moveMonth(delta){
  if(!activeInput)return;
  const next=shiftedMonth(delta);
  if(!monthHasAllowedDate(activeInput,next.year,next.month))return;
  viewYear=next.year;
  viewMonth=next.month;
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
        <b class="custom-date-title" aria-live="polite"></b>
        <button type="button" class="custom-date-month-btn" data-date-next aria-label="下个月">›</button>
      </div>
      <div class="custom-date-weekdays" aria-hidden="true">
        <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
      </div>
      <div class="custom-date-grid" aria-label="日期"></div>
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
  todayButton=overlay.querySelector("[data-date-today]");
  prevButton=overlay.querySelector("[data-date-prev]");
  nextButton=overlay.querySelector("[data-date-next]");
  prevButton?.addEventListener("click",()=>moveMonth(-1));
  nextButton?.addEventListener("click",()=>moveMonth(1));
  overlay.querySelector("[data-date-cancel]")?.addEventListener("click",()=>closePicker({returnFocus:true}));
  clearButton?.addEventListener("click",()=>commitValue(""));
  todayButton?.addEventListener("click",()=>{
    const today=localDateKey(new Date());
    if(activeInput&&dateAllowed(activeInput,today))commitValue(today);
  });
  gridNode?.addEventListener("click",event=>{
    if(performance.now()<suppressGridClickUntil)return;
    const target=event.target instanceof Element?event.target.closest(".custom-date-day[data-date]"):null;
    if(!(target instanceof HTMLButtonElement)||target.disabled)return;
    commitValue(target.dataset.date||"");
  });
  gridNode?.addEventListener("touchstart",event=>{
    if(event.touches.length!==1){touchStart=null;return;}
    const touch=event.touches[0];
    touchStart={x:touch.clientX,y:touch.clientY};
  },{passive:true});
  gridNode?.addEventListener("touchend",event=>{
    if(!touchStart||event.changedTouches.length!==1){touchStart=null;return;}
    const touch=event.changedTouches[0];
    const dx=touch.clientX-touchStart.x,dy=touch.clientY-touchStart.y;
    touchStart=null;
    if(Math.abs(dx)<48||Math.abs(dx)<=Math.abs(dy)*1.2)return;
    suppressGridClickUntil=performance.now()+350;
    moveMonth(dx<0?1:-1);
  },{passive:true});
  overlay.addEventListener("click",event=>{
    if(event.target===overlay)closePicker({returnFocus:true});
  });
  panel?.addEventListener("click",event=>event.stopPropagation());
  document.addEventListener("keydown",event=>{
    if(overlay?.hidden)return;
    if(event.key==="Escape")closePicker({returnFocus:true});
    else if(event.key==="PageUp"){event.preventDefault();moveMonth(-1);}
    else if(event.key==="PageDown"){event.preventDefault();moveMonth(1);}
  });
}
function openPicker(input){
  ensurePicker();
  if(activeInput&&activeInput!==input)enhanced.get(activeInput)?.setAttribute("aria-expanded","false");
  activeInput=input;
  const base=parseDateKey(input.value)||new Date();
  viewYear=base.getFullYear();
  viewMonth=base.getMonth();
  renderCalendar();
  overlay.hidden=false;
  enhanced.get(input)?.setAttribute("aria-expanded","true");
  document.body.classList.add("custom-date-open");
  requestAnimationFrame(()=>panel?.querySelector(".is-selected,.is-today,.custom-date-day:not(:disabled)")?.focus());
}
function closePicker({returnFocus=false}={}){
  if(!overlay)return;
  const input=activeInput;
  overlay.hidden=true;
  document.body.classList.remove("custom-date-open");
  activeInput=null;
  touchStart=null;
  if(input){
    const trigger=enhanced.get(input);
    trigger?.setAttribute("aria-expanded","false");
    if(returnFocus)requestAnimationFrame(()=>trigger?.focus({preventScroll:true}));
  }
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
  trigger.setAttribute("aria-haspopup","dialog");
  trigger.setAttribute("aria-expanded","false");
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
