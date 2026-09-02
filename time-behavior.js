const TIME_STEP_SECONDS = 5 * 60;

function isTimeInput(el){
  return el instanceof HTMLInputElement && el.type === "time";
}

function isValidTime(value){
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || "");
}

function prepareTimeInput(input){
  if(!isTimeInput(input)) return;
  input.step = String(TIME_STEP_SECONDS);
  input.dataset.fiveMinuteStep = "true";
}

function prepareTimeInputs(root=document){
  if(root instanceof Element && isTimeInput(root)) prepareTimeInput(root);
  root.querySelectorAll?.('input[type="time"]').forEach(prepareTimeInput);
}

function pairedTimeInput(input){
  const group = input.closest(".fields2");
  if(!group) return null;
  const inputs = Array.from(group.querySelectorAll('input[type="time"]'));
  if(inputs.length !== 2) return null;
  const other = inputs.find(item => item !== input);
  return other && isValidTime(other.value) ? other : null;
}

function seedFromPair(input){
  if(!isTimeInput(input) || input.value || input.dataset.timePairSeed) return;
  const other = pairedTimeInput(input);
  if(!other) return;

  input.value = other.value;
  input.dataset.timePairSeed = other.value;
  input.dataset.timePairTouched = "false";
}

function markPairTouched(input){
  if(!isTimeInput(input) || !input.dataset.timePairSeed) return;
  input.dataset.timePairTouched = "true";
}

function clearPairSeedState(input){
  delete input.dataset.timePairSeed;
  delete input.dataset.timePairTouched;
}

function rollbackUnusedPairSeed(input){
  if(!isTimeInput(input) || !input.dataset.timePairSeed) return;
  if(input.dataset.timePairTouched !== "true") input.value = "";
  clearPairSeedState(input);
}

function roundedNowValue(){
  const now = new Date();
  let hour = now.getHours();
  let minute = Math.round(now.getMinutes() / 5) * 5;
  if(minute >= 60){
    minute = 0;
    hour = (hour + 1) % 24;
  }
  return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}

function timeInputForNowButton(button){
  const targetId = button.dataset.nowTarget || button.dataset.now;
  if(!targetId) return null;
  const input = document.getElementById(targetId);
  return isTimeInput(input) ? input : null;
}

function fillRoundedNow(button,event){
  const input = timeInputForNowButton(button);
  if(!input) return false;

  event.preventDefault();
  event.stopImmediatePropagation();
  prepareTimeInput(input);
  clearPairSeedState(input);
  input.value = roundedNowValue();
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
  return true;
}

function bindTimeBehavior(){
  prepareTimeInputs(document);

  document.addEventListener("pointerdown",event=>{
    const input = event.target instanceof Element ? event.target.closest('input[type="time"]') : null;
    if(input) seedFromPair(input);
  },true);

  document.addEventListener("focusin",event=>{
    if(isTimeInput(event.target)) seedFromPair(event.target);
  },true);

  document.addEventListener("input",event=>{
    if(isTimeInput(event.target)) markPairTouched(event.target);
  },true);

  document.addEventListener("change",event=>{
    if(isTimeInput(event.target)) markPairTouched(event.target);
  },true);

  document.addEventListener("focusout",event=>{
    if(!isTimeInput(event.target)) return;
    const input = event.target;
    setTimeout(()=>rollbackUnusedPairSeed(input),80);
  },true);

  document.addEventListener("click",event=>{
    const button = event.target instanceof Element ? event.target.closest(".now-btn") : null;
    if(button) fillRoundedNow(button,event);
  },true);

  const observer = new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node instanceof Element) prepareTimeInputs(node);
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded",bindTimeBehavior,{once:true});
}else{
  bindTimeBehavior();
}
