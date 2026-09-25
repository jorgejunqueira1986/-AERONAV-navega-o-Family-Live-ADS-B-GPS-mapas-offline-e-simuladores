/* AERONAV — RC11.20 Family Flight Handover · GPS ↔ ADS-B + Takeoff/Landing Alerts
   Policy:
   - App shell + exact runtime libraries: cached for offline use.
   - Navigation requests: network-first, cached fallback.
   - Dynamic/API/data requests: network-only (never stale from SW cache).
   This prevents live GPS-family, ADS-B, weather and other feeds from being
   silently served from an old service-worker cache. */
const CACHE='aeronav-RC11_20-flight-handover-20260925-1';
const LOCAL=[
  './',
  './index.html',
  './family-viewer.html',
  './family/index.html',
  './family/family-call.js',
  './family/family-manifest.json',
  './family-viewer-preview.html',
  './family-manifest.json',
  './cockpit-audio.js',
  './family-call.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/aeronav-hero.jpg',
  './assets/people/jorge-avatar.jpeg',
  './assets/people/mathia-avatar.jpeg',
  './assets/aircraft/cessna-152.png',
  './assets/aircraft/taag-dash8-q400.png',
  './assets/aircraft/taag-a220-300.png',
  './assets/aircraft/taag-b787-9.png',
  './assets/aircraft/taag-b787-10.png',
  './assets/aircraft/taag-b777-300er.png',
  './assets/vehicles/toyota-yaris-ld-37-23-fm.png'
];
const REMOTE=[
  'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js',
  'https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/livekit-client@2.22.3/dist/livekit-client.umd.min.js'
];
const REMOTE_SET=new Set(REMOTE);
const LOCAL_PATHS=new Set(LOCAL.map(x=>new URL(x,self.location.href).pathname));

async function fetchTimed(input,init={},timeoutMs=10000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(input,{...init,signal:controller.signal});}
  finally{clearTimeout(timer);}
}

async function putSafe(cache,request,response){
  if(!response || (!response.ok && response.type!=='opaque')) return;
  try{ await cache.put(request,response.clone()); }catch(_){ /* quota/CORS: ignore */ }
}

async function warm(){
  const c=await caches.open(CACHE);
  const localResults=await Promise.all(LOCAL.map(async u=>{
    try{const r=await fetchTimed(u,{cache:'reload'},6000);if(r.ok){await c.put(u,r.clone());return 1;}}catch(_){ }
    return 0;
  }));
  const remoteResults=await Promise.all(REMOTE.map(async u=>{
    try{const r=await fetchTimed(u,{cache:'reload',mode:'cors'},12000);if(r.ok){await c.put(u,r.clone());return 1;}}catch(_){ }
    return 0;
  }));
  const local=localResults.reduce((a,b)=>a+b,0), remote=remoteResults.reduce((a,b)=>a+b,0);
  return {
    shellReady:!!(await c.match('./index.html')),
    localReady:local===LOCAL.length,
    localCount:local,
    remoteReady:remote===REMOTE.length,
    remoteCount:remote
  };
}

async function cacheFirst(request){
  const c=await caches.open(CACHE);
  const hit=await c.match(request,{ignoreSearch:false});
  if(hit) return hit;
  const r=await fetchTimed(request,{},12000);
  await putSafe(c,request,r);
  return r;
}

async function networkFirst(request){
  const c=await caches.open(CACHE);
  try{
    const r=await fetchTimed(request,{},5000);
    await putSafe(c,request,r);
    return r;
  }catch(err){
    const url=new URL(request.url);
    const exact=await c.match(request,{ignoreSearch:false}) || await c.match(url.pathname==='/'?'./index.html':url.pathname.replace(/^\//,'./'));
    if(exact) return exact;
    const familyPath=/\/family\/?(?:index\.html)?$/.test(url.pathname);
    const fallback=await c.match(familyPath?'./family/index.html':'./index.html');
    if(fallback) return fallback;
    throw err;
  }
}

self.addEventListener('install',event=>{
  event.waitUntil(warm().then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE && (k.startsWith('app-nav-')||k.startsWith('aeronav-'))).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.protocol!=='http:' && url.protocol!=='https:') return;

  // Browser navigations need a cached shell fallback when offline.
  if(req.mode==='navigate'){
    event.respondWith(networkFirst(req));
    return;
  }

  // Only these exact CDN runtime files are intentionally cached cross-origin.
  if(REMOTE_SET.has(req.url)){
    event.respondWith(cacheFirst(req));
    return;
  }

  // Keep the local app shell fresh while retaining an offline fallback.
  if(url.origin===self.location.origin && LOCAL_PATHS.has(url.pathname)){
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else is live/dynamic or potentially very large (API JSON,
  // weather, ADS-B, Supabase Family, tiles, PMTiles/PDF downloads, etc.).
  // Do not place it in the service-worker cache.
  event.respondWith(fetch(req));
});

self.addEventListener('message',event=>{
  const port=event.ports&&event.ports[0];
  if(!port) return;
  if(event.data?.type==='AERONAV_STATUS'){
    caches.open(CACHE).then(async c=>{
      let remote=0,local=0;
      for(const u of REMOTE){if(await c.match(u))remote++;}
      for(const u of LOCAL){if(await c.match(u))local++;}
      port.postMessage({
        shellReady:!!(await c.match('./index.html')),
        localReady:local===LOCAL.length,
        localCount:local,
        remoteReady:remote===REMOTE.length,
        remoteCount:remote,
        cacheVersion:CACHE
      });
    });
  }else if(event.data?.type==='WARM_OFFLINE_CACHE'){
    warm().then(x=>port.postMessage(x)).catch(err=>port.postMessage({error:String(err?.message||err)}));
  }
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const all=await clients.matchAll({type:'window',includeUncontrolled:true});
    const family=all.find(c=>/\/family\/?(?:index\.html)?(?:[?#].*)?$/.test(new URL(c.url).pathname));
    if(family){try{await family.focus();return;}catch(_){}}
    try{await clients.openWindow(new URL('./family/',self.location.href).href);}catch(_){}
  })());
});
