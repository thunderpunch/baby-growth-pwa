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

    // Check the worker script immediately on app boot rather than waiting for window.load.
    // This shortens the period in which an already-open installation can still be controlled
    // by an older cache policy.
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
void requestFreshServiceWorker();
