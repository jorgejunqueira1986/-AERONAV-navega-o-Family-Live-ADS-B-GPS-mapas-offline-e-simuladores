/* AERONAV — RC11.83 Secure Luanda Photo 3D proxy + RC11.82 hybrid + RC11.81 offline fallback
   Policy:
   - App shell + exact runtime libraries: cached for offline use.
   - Navigation requests: network-first, cached fallback.
   - Dynamic/API/data requests: network-only (never stale from SW cache).
   - Owner HTML receives the small secure Photo 3D proxy bridge at runtime.
   This prevents the Google Map Tiles key from ever being stored in the browser. */
const CACHE='aeronav-jorge-RC11_83-luanda-photo3d-secure-proxy-20260929-1';
const LOCAL=[
  './','./index.html','./manifest.json','./sw.js','./photo3d-proxy.js','./family-viewer.html','./wendler.html','./family-viewer-preview.html','./cockpit-audio.js','./family-call.js','./icons/icon-192.png','./icons/icon-512.png','./assets/aeronav-hero.jpg','./assets/people/jorge-avatar.jpeg','./assets/people/mathia-avatar.jpeg','./assets/people/jorge-avatar-3d.png','./assets/people/mathia-avatar-3d.png','./assets/aircraft/cessna-152.png','./assets/aircraft/taag-dash8-q400.png','./assets/aircraft/taag-a220-300.png','./assets/aircraft/taag-b787-9.png','./assets/aircraft/taag-b787-10.png','./assets/aircraft/taag-b777-300er.png','./assets/aircraft/traffic-generic.png','./assets/vehicles/toyota-yaris-ld-37-23-fm.png'
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
  try{ await cache.put(request,response.clone()); }catch(_){ }
}

function isChildPath(pathname){
  return /\/mathia\//.test(pathname)||/\/wendler\//.test(pathname)||/\/family\/?(?:index\.html)?$/.test(pathname)||/\/family-viewer(?:-preview)?\.html$/.test(pathname)||/\/wendler\.html$/.test(pathname);
}

async function injectOwnerPhoto3DBridge(request,response){
  try{
    if(!response || !response.ok) return response;
    const url=new URL(request.url);
    if(url.origin!==self.location.origin || isChildPath(url.pathname)) return response;
    const ct=response.headers.get('Content-Type')||'';
    if(!/text\/html/i.test(ct) && request.mode!=='navigate' && !/\/index\.html$/.test(url.pathname)) return response;
    let html=await response.text();
    if(!html.includes('data-aeronav-photo3d-proxy="RC11.83"')){
      const tag='<script data-aeronav-photo3d-proxy="RC11.83" src="./photo3d-proxy.js?v=11.83"></script>';
      html=html.includes('</body>')?html.replace('</body>',tag+'</body>'):html+tag;
    }
    const headers=new Headers(response.headers);
    headers.delete('Content-Length');headers.delete('Content-Encoding');
    headers.set('Cache-Control','no-cache');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }catch(_){return response;}
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
  return {shellReady:!!(await c.match('./index.html')),localReady:local===LOCAL.length,localCount:local,remoteReady:remote===REMOTE.length,remoteCount:remote};
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
    return await injectOwnerPhoto3DBridge(request,r.clone());
  }catch(err){
    const url=new URL(request.url);
    const exact=await c.match(request,{ignoreSearch:false}) || await c.match(url.pathname==='/'?'./index.html':url.pathname.replace(/^\//,'./'));
    if(exact) return await injectOwnerPhoto3DBridge(request,exact.clone());
    const familyPath=/\/family\/?(?:index\.html)?$/.test(url.pathname);
    const wendlerPath=/\/wendler\/?(?:index\.html)?$/.test(url.pathname)||/\/wendler\.html$/.test(url.pathname);
    const fallback=await c.match(wendlerPath?'./wendler.html':familyPath?'./family-viewer.html':'./index.html');
    if(fallback) return await injectOwnerPhoto3DBridge(request,fallback.clone());
    throw err;
  }
}

self.addEventListener('install',event=>{
  event.waitUntil(warm().then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE && (k.startsWith('app-nav-')||(k.startsWith('aeronav-')&&!k.startsWith('aeronav-mathia-')&&!k.startsWith('aeronav-wendler-')))).map(k=>caches.delete(k)));
    await self.clients.claim();
    // Reload only the main owner app once so the newly active SW can inject the proxy bridge.
    const all=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of all){
      try{
        const u=new URL(client.url);
        if(u.origin===self.location.origin && !isChildPath(u.pathname)) await client.navigate(client.url);
      }catch(_){ }
    }
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.protocol!=='http:' && url.protocol!=='https:') return;
  const p=url.pathname;
  if(/\/mathia\//.test(p)||/\/wendler\//.test(p)) return;

  if(req.mode==='navigate'){
    event.respondWith(networkFirst(req));
    return;
  }
  if(REMOTE_SET.has(req.url)){
    event.respondWith(cacheFirst(req));
    return;
  }
  if(url.origin===self.location.origin && LOCAL_PATHS.has(url.pathname)){
    event.respondWith(networkFirst(req));
    return;
  }
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
      port.postMessage({shellReady:!!(await c.match('./index.html')),localReady:local===LOCAL.length,localCount:local,remoteReady:remote===REMOTE.length,remoteCount:remote,cacheVersion:CACHE,photo3dProxy:true});
    });
  }else if(event.data?.type==='WARM_OFFLINE_CACHE'){
    warm().then(x=>port.postMessage(x)).catch(err=>port.postMessage({error:String(err?.message||err)}));
  }
});

self.addEventListener('notificationclick',event=>{
  const data=event.notification?.data||{};event.notification.close();
  event.waitUntil((async()=>{
    const all=await clients.matchAll({type:'window',includeUncontrolled:true});
    if(data.type==='active-route'){
      const main=all.find(c=>!/\/family\/?(?:index\.html)?$/.test(new URL(c.url).pathname)&&!/\/wendler(?:\/index\.html|\.html)?$/.test(new URL(c.url).pathname));
      if(main){try{await main.focus();main.postMessage?.({type:'AERONAV_OPEN_ACTIVE_ROUTE'});return;}catch(_){}}
      try{await clients.openWindow(new URL('./index.html',self.location.href).href);}catch(_){}return;
    }
    const family=all.find(c=>/\/family\/?(?:index\.html)?(?:[?#].*)?$/.test(new URL(c.url).pathname));
    if(family){try{await family.focus();return;}catch(_){}}
    try{await clients.openWindow(new URL('./mathia/',self.location.href).href);}catch(_){}
  })());
});
