const RELOAD_GUARD_KEY = "baby-growth-pwa-sw-reload";
let controllerRefreshStarted = false;

function clearReloadGuardLater(){
  setTimeout(()=>{
    try{ sessionStorage.removeItem(RELOAD_GUARD_KEY); }catch{}
  },1800);
}

function reloadOnceAfterControllerChange(){
  if(controllerRefreshStarted) return;
  controllerRefreshStarted = true;

  try{
    if(sessionStorage.getItem(RELOAD_GUARD_KEY)==="1") return;
    sessionStorage.setItem(RELOAD_GUARD_KEY,"1");
  }catch{}

  window.location.reload();
}

async function requestFreshServiceWorker(){
  if(!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange",reloadOnceAfterControllerChange);

  try{
    const registration = await navigator.serviceWorker.register("./sw.js",{
      updateViaCache:"none"
    });

    // Explicitly ask the browser to check sw.js on every app start.
    // Offline failures are harmless because the active worker and caches remain available.
    try{ await registration.update(); }catch{}

    if(registration.waiting){
      registration.waiting.postMessage({type:"SKIP_WAITING"});
    }

    registration.addEventListener("updatefound",()=>{
      const installing = registration.installing;
      if(!installing) return;
      installing.addEventListener("statechange",()=>{
        if(installing.state==="installed" && navigator.serviceWorker.controller){
          installing.postMessage({type:"SKIP_WAITING"});
        }
      });
    });
  }catch(error){
    console.warn("PWA update check failed",error);
  }
}

clearReloadGuardLater();

if(document.readyState==="complete"){
  requestFreshServiceWorker();
}else{
  window.addEventListener("load",requestFreshServiceWorker,{once:true});
}
