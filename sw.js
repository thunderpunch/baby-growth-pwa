const CACHE_NAME="baby-growth-pwa-v1.4.3-ui-template-sync";
const APP_SHELL=[
  "./","./index.html","./styles.css","./styles-base.css","./layout-fix.css?v=1.1.8","./app.js","./export-ipad.js",
  "./profile-save-guard.js","./baby-name.js","./baby-name.css","./time-behavior.js","./time-picker.css","./date-picker.js","./date-picker.css","./large-text.css",
  "./update-coordinator.js","./gesture-guard.js","./remote-quick-config.js","./icon-theme.js","./icon-theme.css",
  "./record-model.js","./record-templates.js","./sleep-v3.js","./sleep-v3.css","./timeline-v3.js",
  "./history.js","./history.css","./data-io-v3.js","./export-v2.css","./home-config.json","./interaction-guard.css","./db.js",
  "./manifest.webmanifest","./manifest-girl.webmanifest","./manifest-boy.webmanifest",
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
    // Revalidate mutable application code on every online load. `no-cache` still allows
    // conditional HTTP caching (ETag/304) while preventing a stale browser response from
    // defeating the Service Worker freshness policy.
    const response=await fetch(request,{cache:"no-cache"});
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

  const navigation=event.request.mode==="navigate";
  const remoteConfig=url.pathname.endsWith("/home-config.json");
  const mutableCode=["script","style","manifest"].includes(event.request.destination);

  // Mutable application code always revalidates online and falls back to Cache Storage offline.
  // Icons and other stable assets remain cache-first for fast repeat loads.
  event.respondWith(navigation || remoteConfig || mutableCode
    ? networkFirst(event.request)
    : cacheFirst(event.request));
});
