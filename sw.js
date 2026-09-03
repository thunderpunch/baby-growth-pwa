const CACHE_NAME="baby-growth-pwa-v1.2.5-independent-sleep-actions";
const APP_SHELL=[
  "./","./index.html","./styles.css","./styles-base.css","./layout-fix.css?v=1.1.8","./app.js","./export-ipad.js","./profile-save-guard.js","./baby-name.js","./baby-name.css","./time-behavior.js","./time-picker.css","./recent-milk-template.js","./update-coordinator.js","./gesture-guard.js","./remote-quick-config.js","./icon-theme.js","./icon-theme.css","./migration-v2.js","./sleep-v3.js","./sleep-v3.css","./sleep-ui-bridge.js","./json-import-v2.js","./export-v2.js","./export-v2.css","./home-config.json","./interaction-guard.css","./db.js","./manifest.webmanifest","./manifest-girl.webmanifest","./manifest-boy.webmanifest",
  "./icons/baby-neutral-approved.svg","./icons/baby-girl-approved.svg","./icons/baby-boy-approved.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-icon.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING") self.skipWaiting();
});

async function putInCurrentCache(request,response){
  if(!response || !response.ok) return;
  const cache=await caches.open(CACHE_NAME);
  await cache.put(request,response.clone());
}

async function navigationFallback(request){
  const exact=await caches.match(request,{ignoreSearch:true});
  if(exact) return exact;
  return (await caches.match("./index.html")) || (await caches.match("./"));
}

async function networkFirst(request){
  try{
    const response=await fetch(request,{cache:"no-store"});
    await putInCurrentCache(request,response);
    return response;
  }catch(error){
    const cached=request.mode==="navigate"
      ? await navigationFallback(request)
      : await caches.match(request,{ignoreSearch:false});
    if(cached) return cached;
    throw error;
  }
}

async function cacheFirst(request){
  const cached=await caches.match(request);
  if(cached) return cached;
  const response=await fetch(request);
  await putInCurrentCache(request,response);
  return response;
}

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;

  const destination=event.request.destination;
  const remoteConfig=url.pathname.endsWith("/home-config.json");
  const themedBabyIcon=/\/icons\/baby-(?:neutral-approved|girl-approved|boy-approved)\.svg$/i.test(url.pathname);
  const codeOrPage = event.request.mode==="navigate" ||
    ["script","style","worker","manifest"].includes(destination) ||
    /\.(?:html|js|css|webmanifest)$/i.test(url.pathname);

  event.respondWith(remoteConfig || themedBabyIcon || codeOrPage ? networkFirst(event.request) : cacheFirst(event.request));
});
