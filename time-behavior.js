const TIME_STEP_MINUTES = 5;
const TIME_STEP_SECONDS = TIME_STEP_MINUTES * 60;
let inputCounter = 0;
let activeInput = null;
let picker = null;
let hourSelect = null;
let minuteSelect = null;
let pickerValue = null;
let syncTimer = null;

function ensureTimePickerStyles(){
  if(document.querySelector('link[data-time-picker-style]')) return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=new URL('./time-picker.css',import.meta.url).href;
  link.dataset.timePickerStyle='1';
  document.head.appendChild(link);
}

function isTimeInput(el){
  return el instanceof HTMLInputElement && el.type === 'time';
}

function isValidTime(value){
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '');
}

function toMinutes(value){
  if(!isValidTime(value)) return null;
  const [hour,minute]=value.split(':').map(Number);
  return hour*60+minute;
}

function fromMinutes(total){
  const normalized=((total%1440)+1440)%1440;
  const hour=Math.floor(normalized/60);
  const minute=normalized%60;
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

function normalizeToStep(value){
  const total=toMinutes(value);
  if(total==null) return '';
  const rounded=Math.round(total/TIME_STEP_MINUTES)*TIME_STEP_MINUTES;
  return fromMinutes(rounded);
}

function roundedNowValue(){
  const now=new Date();
  const total=now.getHours()*60+now.getMinutes();
  return fromMinutes(Math.round(total/TIME_STEP_MINUTES)*TIME_STEP_MINUTES);
}

function pairedTimeInput(input){
  const group=input.closest('.fields2');
  if(!group) return null;
  const inputs=Array.from(group.querySelectorAll('input[type="time"]'));
  if(inputs.length!==2) return null;
  const other=inputs.find(item=>item!==input);
  return other && isValidTime(other.value) ? other : null;
}

function displayButtonFor(input){
  if(!input?.id) return null;
  return document.querySelector(`[data-time-display-for="${CSS.escape(input.id)}"]`);
}

function syncDisplay(input){
  const button=displayButtonFor(input);
  if(!button) return;
  const value=isValidTime(input.value) ? input.value : '';
  button.textContent=value || '选择时间';
  button.classList.toggle('empty',!value);
  button.setAttribute('aria-label',value ? `已选择 ${value}，点按修改时间` : '选择时间');
}

function syncAllDisplays(){
  document.querySelectorAll('input[type="time"][data-time-ui-enhanced="true"]').forEach(syncDisplay);
}

function prepareTimeInput(input){
  if(!isTimeInput(input)) return;
  input.step=String(TIME_STEP_SECONDS);

  if(input.dataset.timeUiEnhanced==='true'){
    syncDisplay(input);
    return;
  }

  if(!input.id){
    inputCounter+=1;
    input.id=`timeInput${inputCounter}`;
  }

  input.dataset.timeUiEnhanced='true';
  input.classList.add('native-time-hidden');
  input.tabIndex=-1;
  input.setAttribute('aria-hidden','true');

  const button=document.createElement('button');
  button.type='button';
  button.className='time-display-btn';
  button.dataset.timeDisplayFor=input.id;
  button.addEventListener('click',()=>openPicker(input));
  input.insertAdjacentElement('beforebegin',button);
  syncDisplay(input);
}

function prepareTimeInputs(root=document){
  if(root instanceof Element && isTimeInput(root)) prepareTimeInput(root);
  root.querySelectorAll?.('input[type="time"]').forEach(prepareTimeInput);
}

function createOption(value,label){
  const option=document.createElement('option');
  option.value=value;
  option.textContent=label;
  return option;
}

function createPicker(){
  if(picker) return picker;

  const overlay=document.createElement('div');
  overlay.className='time-picker-overlay';
  overlay.hidden=true;
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','选择时间');

  const sheet=document.createElement('div');
  sheet.className='time-picker-sheet';
  overlay.appendChild(sheet);

  const head=document.createElement('div');
  head.className='time-picker-head';
  sheet.appendChild(head);

  const heading=document.createElement('div');
  heading.className='time-picker-heading';
  const small=document.createElement('small');
  small.textContent='选择时间';
  pickerValue=document.createElement('b');
  pickerValue.textContent='--:--';
  heading.append(small,pickerValue);
  head.appendChild(heading);

  const close=document.createElement('button');
  close.type='button';
  close.className='time-picker-close';
  close.textContent='×';
  close.setAttribute('aria-label','取消选择时间');
  close.addEventListener('click',closePicker);
  head.appendChild(close);

  const fields=document.createElement('div');
  fields.className='time-picker-fields';
  sheet.appendChild(fields);

  const hourField=document.createElement('label');
  hourField.className='time-picker-field';
  const hourLabel=document.createElement('span');
  hourLabel.textContent='小时';
  const hourWrap=document.createElement('div');
  hourWrap.className='time-picker-select-wrap';
  hourSelect=document.createElement('select');
  hourSelect.className='time-picker-select';
  hourSelect.setAttribute('aria-label','小时');
  for(let h=0;h<24;h++) hourSelect.appendChild(createOption(String(h),`${String(h).padStart(2,'0')} 时`));
  hourWrap.appendChild(hourSelect);
  hourField.append(hourLabel,hourWrap);
  fields.appendChild(hourField);

  const minuteField=document.createElement('label');
  minuteField.className='time-picker-field';
  const minuteLabel=document.createElement('span');
  minuteLabel.textContent='分钟';
  const minuteWrap=document.createElement('div');
  minuteWrap.className='time-picker-select-wrap';
  minuteSelect=document.createElement('select');
  minuteSelect.className='time-picker-select';
  minuteSelect.setAttribute('aria-label','分钟，5分钟一档');
  for(let m=0;m<60;m+=TIME_STEP_MINUTES) minuteSelect.appendChild(createOption(String(m),`${String(m).padStart(2,'0')} 分`));
  minuteWrap.appendChild(minuteSelect);
  minuteField.append(minuteLabel,minuteWrap);
  fields.appendChild(minuteField);

  const note=document.createElement('div');
  note.className='time-picker-note';
  note.textContent='分钟固定按 5 分钟一档；打开空白的连续时间时，会先定位到另一项的时间。';
  sheet.appendChild(note);

  const actions=document.createElement('div');
  actions.className='time-picker-actions';
  sheet.appendChild(actions);

  const clear=document.createElement('button');
  clear.type='button';
  clear.className='time-picker-clear';
  clear.textContent='清空';
  clear.addEventListener('click',()=>commitValue(''));

  const now=document.createElement('button');
  now.type='button';
  now.className='time-picker-now';
  now.textContent='现在';
  now.addEventListener('click',()=>setPickerValue(roundedNowValue()));

  const confirm=document.createElement('button');
  confirm.type='button';
  confirm.className='time-picker-confirm';
  confirm.textContent='确定';
  confirm.addEventListener('click',()=>commitValue(selectedPickerValue()));

  actions.append(clear,now,confirm);

  hourSelect.addEventListener('change',syncPickerPreview);
  minuteSelect.addEventListener('change',syncPickerPreview);
  overlay.addEventListener('click',event=>{
    if(event.target===overlay) closePicker();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && !overlay.hidden) closePicker();
  });

  document.body.appendChild(overlay);
  picker=overlay;
  return picker;
}

function setPickerValue(value){
  const normalized=normalizeToStep(value) || roundedNowValue();
  const [hour,minute]=normalized.split(':').map(Number);
  hourSelect.value=String(hour);
  minuteSelect.value=String(minute);
  syncPickerPreview();
}

function selectedPickerValue(){
  if(!hourSelect || !minuteSelect) return '';
  return `${String(Number(hourSelect.value)).padStart(2,'0')}:${String(Number(minuteSelect.value)).padStart(2,'0')}`;
}

function syncPickerPreview(){
  if(pickerValue) pickerValue.textContent=selectedPickerValue();
}

function openPicker(input){
  if(!isTimeInput(input)) return;
  createPicker();
  activeInput=input;

  const pair=pairedTimeInput(input);
  const seed=isValidTime(input.value)
    ? input.value
    : (pair?.value || roundedNowValue());

  setPickerValue(seed);
  picker.hidden=false;
  document.body.classList.add('time-picker-open');
  setTimeout(()=>hourSelect?.focus(),0);
}

function closePicker(){
  if(!picker) return;
  picker.hidden=true;
  document.body.classList.remove('time-picker-open');
  activeInput=null;
}

function commitValue(value){
  if(!activeInput) return closePicker();
  const input=activeInput;
  input.value=value ? normalizeToStep(value) : '';
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  syncDisplay(input);
  closePicker();
}

function timeInputForNowButton(button){
  const targetId=button.dataset.nowTarget || button.dataset.now;
  if(!targetId) return null;
  const input=document.getElementById(targetId);
  return isTimeInput(input) ? input : null;
}

function fillRoundedNow(button,event){
  const input=timeInputForNowButton(button);
  if(!input) return false;

  event.preventDefault();
  event.stopImmediatePropagation();
  prepareTimeInput(input);
  input.value=roundedNowValue();
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  syncDisplay(input);
  return true;
}

function normalizeChangedInput(input){
  if(!isTimeInput(input) || !isValidTime(input.value)) return;
  const normalized=normalizeToStep(input.value);
  if(normalized && normalized!==input.value) input.value=normalized;
  syncDisplay(input);
}

function bindTimeBehavior(){
  ensureTimePickerStyles();
  prepareTimeInputs(document);

  document.addEventListener('input',event=>{
    if(isTimeInput(event.target)) syncDisplay(event.target);
  },true);

  document.addEventListener('change',event=>{
    if(isTimeInput(event.target)) normalizeChangedInput(event.target);
  },true);

  document.addEventListener('click',event=>{
    const button=event.target instanceof Element ? event.target.closest('.now-btn') : null;
    if(button) fillRoundedNow(button,event);
  },true);

  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node instanceof Element) prepareTimeInputs(node);
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});

  // app.js occasionally assigns input.value directly after asynchronous data loads.
  // A light sync keeps the visible button aligned with the underlying data field.
  syncTimer=setInterval(syncAllDisplays,1000);
  window.addEventListener('pagehide',()=>clearInterval(syncTimer),{once:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') syncAllDisplays();
  });
  setTimeout(syncAllDisplays,250);
  setTimeout(syncAllDisplays,800);
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',bindTimeBehavior,{once:true});
}else{
  bindTimeBehavior();
}
