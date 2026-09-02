function ensureInteractionStyles(){
  if(document.querySelector('link[data-interaction-guard]')) return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=new URL('./interaction-guard.css',import.meta.url).href;
  link.dataset.interactionGuard='1';
  document.head.appendChild(link);
}

function lockViewport(){
  let meta=document.querySelector('meta[name="viewport"]');
  if(!meta){
    meta=document.createElement('meta');
    meta.name='viewport';
    document.head.appendChild(meta);
  }
  meta.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
}

function preventGesture(event){
  event.preventDefault();
}

function bindGestureGuard(){
  ensureInteractionStyles();
  lockViewport();

  ['gesturestart','gesturechange','gestureend'].forEach(type=>{
    document.addEventListener(type,preventGesture,{passive:false});
  });

  document.addEventListener('touchmove',event=>{
    if(event.touches?.length>1) event.preventDefault();
  },{passive:false});
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',bindGestureGuard,{once:true});
}else{
  bindGestureGuard();
}
