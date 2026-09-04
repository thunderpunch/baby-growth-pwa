// Progressive boot: keep the static/default UI visible and hydrate it in place.
// Start render-critical styles immediately so feature modules do not introduce late CSS requests.
document.documentElement.classList.add("app-ready");

function ensureStylesheet(href,dataAttr,dataValue="1"){
  if(document.querySelector(`link[${dataAttr}]`))return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL(href,import.meta.url).href;
  link.setAttribute(dataAttr,dataValue);
  document.head.appendChild(link);
}

ensureStylesheet("./layout-fix.css?v=1.1.8","data-tablet-layout","1.1.8");
ensureStylesheet("./sleep-v3.css","data-sleep-v3-style");
ensureStylesheet("./icon-theme.css","data-baby-icon-theme");
ensureStylesheet("./baby-name.css","data-baby-name-style");
ensureStylesheet("./time-picker.css","data-time-picker-style");
ensureStylesheet("./date-picker.css","data-date-picker-style");
ensureStylesheet("./large-text.css","data-large-text-style");
ensureStylesheet("./interaction-guard.css","data-interaction-guard");

let dataIoPromise=null;
function loadDataIo(){
  return dataIoPromise||(dataIoPromise=import("./data-io-v3.js").catch(error=>{
    dataIoPromise=null;
    throw error;
  }));
}

try{
  // Independent boot helpers download, parse and initialize in parallel.
  const bootModules=[
    import("./icon-theme.js"),
    import("./profile-save-guard.js"),
    import("./baby-name.js"),
    import("./time-behavior.js"),
    import("./date-picker.js"),
    import("./update-coordinator.js"),
    import("./gesture-guard.js"),
    import("./remote-quick-config.js"),
    import("./history.js")
  ];
  await Promise.all(bootModules);

  // The Today DOM already contains the final sleep-action layout, so no runtime DOM bridge is needed.
  await Promise.all([
    import("./sleep-v3.js"),
    import("./timeline-v3.js")
  ]);

  // Data import/export is not part of Today first paint. Load it when the browser is idle,
  // but force it immediately if the user opens the Data tab first.
  document.addEventListener("click",event=>{
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest('.nav button[data-view="data"]'))loadDataIo().catch(error=>console.error("Data IO boot failed",error));
  },{capture:true});

  if("requestIdleCallback" in window){
    requestIdleCallback(()=>loadDataIo().catch(error=>console.error("Data IO idle boot failed",error)),{timeout:2500});
  }else{
    setTimeout(()=>loadDataIo().catch(error=>console.error("Data IO idle boot failed",error)),1200);
  }
}catch(error){
  console.error("App feature boot failed",error);
}