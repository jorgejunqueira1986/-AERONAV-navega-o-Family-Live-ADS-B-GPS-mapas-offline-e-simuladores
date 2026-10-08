/* AERONAV RC12.37.19 — iPad PWA safe refresh / network-first navigation */
/* AERONAV RC12.32 — bounded UI work + versioned offline shell */
/* AERONAV RC12.31.2 — Performance Recovery */
/* AERONAV RC12.31 — Diagnostic + Recovery */
/* AERONAV RC12.30 — Meteo Altitude Phase 3 */
/* AERONAV RC12.20 — Meteo Route Phase 2 */
/* AERONAV RC12.10 — Meteo Visual VOO + RC12.00 + RC11.99 */
/* AERONAV RC11.98.7 — Exact address picking */
/* AERONAV — RC11.98 Work/Home avatars + Folga; RC11.97 Angola Offline preserved
   Policy:
   - App shell + exact runtime libraries: cached for offline use.
   - Navigation requests: network-first, cached fallback.
   - Dynamic/API/data requests: network-only (never stale from SW cache).
   This prevents live GPS-family, ADS-B, weather and other feeds from being
   silently served from an old service-worker cache. */
const CACHE='aeronav-jorge-RC12_37_19-autosync-20261008';
const LOCAL=["./flight-angle-photo-renderer.js","./assets/flight-angle-renders/b777300/behind_rc123716.webp","./assets/flight-angle-renders/b777300/cockpit_rc123716.webp","./assets/flight-angle-renders/b777300/behind.webp","./assets/flight-angle-renders/b777300/left.webp","./assets/flight-angle-renders/b777300/right.webp","./assets/flight-angle-renders/b777300/top.webp","./assets/flight-angle-renders/b777300/inclined.webp","./assets/flight-angle-renders/b777300/cockpit_live.webp","./camera-map-behavior.js","./flight-camera-ui-fix.js","./aircraft-3d-models.js","./aircraft-perspective-viewer.js","./assets/aircraft3d/c152.glb","./assets/aircraft3d/c172.glb","./assets/aircraft3d/q400.glb","./assets/aircraft3d/b7377.glb","./assets/aircraft3d/a2203.glb","./assets/aircraft3d/b777300.glb","./assets/aircraft3d/b7879.glb","./assets/aircraft3d/b78710.glb","./aircraft-visual-profiles.js","./flight-camera-director.js","./photo3d-renderer.js","./terrain-photo3d-runtime.js","./photo3d-proxy.js","./drive-core.js","./cockpit-lite.js","./assets/people/mathia-avatar-rc12313.png","./assets/people/jorge-avatar-rc12313.png","./index.html","./manifest.json","./sw.js","./family-viewer.html","./wendler.html","./family-viewer-preview.html","./cockpit-audio.js","./family-call.js","./angola-offline-fragment.js","./vendor/pmtiles-3.2.1.js","./work-status-fragment.js","./meteo-visual-voo.js","./meteo-route-phase2.js","./meteo-altitude-phase3.js","./diagnostic-recovery.js","./gps-view-modes.js","./flight-ops-fragment.js","./","./vendor/maplibre-gl-5.24.0.js","./vendor/maplibre-gl-5.24.0.css","./vendor/fonts/Noto Sans Regular/0-255.pbf","./vendor/fonts/Noto Sans Regular/256-511.pbf"];
const CRITICAL=['./index.html','./sw.js','./flight-angle-photo-renderer.js','./assets/flight-angle-renders/b777300/behind_rc123716.webp','./assets/flight-angle-renders/b777300/cockpit_rc123716.webp'];
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
  try{await cache.put(request,response.clone());}catch(_){}
}

async function warm(){
  const c=await caches.open(CACHE);
  const localResults=await Promise.all(LOCAL.map(async u=>{
    try{
      const r=await fetchTimed(u,{cache:'reload'},6000);
      if(r.ok){await c.put(u,r.clone());return 1;}
    }catch(_){}
    return 0;
  }));
  const remoteResults=await Promise.all(REMOTE.map(async u=>{
    try{
      const r=await fetchTimed(u,{cache:'reload',mode:'cors'},12000);
      if(r.ok){await c.put(u,r.clone());return 1;}
    }catch(_){}
    return 0;
  }));
  const local=localResults.reduce((a,b)=>a+b,0),remote=remoteResults.reduce((a,b)=>a+b,0);
  return {
    shellReady:local===LOCAL.length,
    localReady:local===LOCAL.length,
    localCount:local,
    remoteReady:remote===REMOTE.length,
    remoteCount:remote
  };
}

async function cacheFirst(request){
  const c=await caches.open(CACHE);
  const hit=await c.match(request,{ignoreSearch:false});
  if(hit)return hit;
  const r=await fetchTimed(request,{},12000);
  await putSafe(c,request,r);
  return r;
}

async function shellFirst(request){
  const c=await caches.open(CACHE);
  const url=new URL(request.url);
  const hit=await c.match(url.origin+url.pathname,{ignoreSearch:true});
  if(hit)return hit;
  return networkFirst(request);
}

async function networkFirst(request){
  const c=await caches.open(CACHE);
  try{
    const r=await fetchTimed(request,{cache:'no-store'},8000);
    await putSafe(c,request,r);
    return r;
  }catch(err){
    const url=new URL(request.url);
    const exact=await c.match(request,{ignoreSearch:false}) ||
      await c.match(url.pathname==='/'?'./index.html':url.pathname.replace(/^\//,'./'));
    if(exact)return exact;
    if(request.mode!=='navigate')throw err;
    const familyPath=/\/family\/?(?:index\.html)?$/.test(url.pathname);
    const wendlerPath=/\/wendler\/?(?:index\.html)?$/.test(url.pathname)||/\/wendler\.html$/.test(url.pathname);
    const fallback=await c.match(wendlerPath?'./wendler.html':familyPath?'./family-viewer.html':'./index.html');
    if(fallback)return fallback;
    throw err;
  }
}

/* RC12.37.19: install the next release after five critical files are ready.
   Optional offline fonts, GLB, maps and libraries are warmed after activation.
   Never clear IndexedDB, localStorage or saved PMTiles. */
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    const ok=await Promise.all(CRITICAL.map(async u=>{
      try{
        const r=await fetchTimed(u,{cache:'reload'},15000);
        if(!r.ok)return false;
        await c.put(u,r.clone());return true;
      }catch(_){return false;}
    }));
    if(ok.some(x=>!x))throw new Error('Ficheiros essenciais incompletos; cache antigo preservado.');
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    await self.clients.claim();
    const result=await warm().catch(()=>({localReady:false}));
    // Delete ONLY outdated AERONAV Jorge app-shell caches after a full warmup.
    // Other cache stores (including map packs) and all IndexedDB data are untouched.
    if(result.localReady){
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('aeronav-jorge-RC12_'))
        .map(k=>caches.delete(k)));
    }
  })());
});

async function injectAngolaMapsIntoMainNavigation(response,request){
  const fallback=response?.clone?.()||response;
  try{
    if(!response||!response.ok)return response;
    const url=new URL(request.url),p=url.pathname;
    if(/\/(?:family|mathia|wendler)(?:\/|\.html|$)/i.test(p))return response;
    if(!(p.endsWith('/')||p.endsWith('/index.html')))return response;
    const html=await response.text();
    const marker='  // ---------- PMTiles offline basemap ----------';
    let body=html;
    if(html.includes(marker)&&!html.includes('AERONAV_ANGOLA_INLINE_RC1235_BEGIN')){
      try{
        const c=await caches.open(CACHE);
        const fragUrl=new URL('./angola-offline-fragment.js',self.location.href).href;
        let fr=await c.match(fragUrl)||await c.match('./angola-offline-fragment.js');
        if(!fr){
          fr=await fetchTimed(fragUrl,{cache:'reload'},8000);
          if(fr.ok)await putSafe(c,fragUrl,fr);
        }
        if(fr&&fr.ok){
          const fragment=await fr.text();
          body=html.replace(marker,fragment+'\n'+marker);
        }
      }catch(e){console.warn('AERONAV Angola fragment unavailable',e);}
    }
    const mapBridge='<script data-aeronav-rc1231-mapbridge>(function(){try{if(window.__AERONAV_MAP_BRIDGE_RC1231)return;window.__AERONAV_MAP_BRIDGE_RC1231=true;var wrap=function(){try{var l=window.maplibregl;if(!l||!l.Map||l.Map.__aeronavRc1231)return false;var O=l.Map;class M extends O{constructor(...a){super(...a);try{window.__AERONAV_MAP__=this;window.aeronavMap=this;window.mainMap=this;window.dispatchEvent(new CustomEvent("aeronav:map-ready",{detail:{map:this,release:"RC12.31"}}));}catch(e){}}}M.__aeronavRc1231=true;M.__aeronavOriginal=O;l.Map=M;return true;}catch(e){return false;}};if(!wrap()){var n=0,t=setInterval(function(){if(wrap()||++n>200)clearInterval(t);},5);}}catch(e){}})();<\/script>';
    if(!body.includes('data-aeronav-rc1231-mapbridge')){
      const maplibreScript=/(<script[^>]+src=["'][^"']*maplibre-gl[^"']*\.js[^"']*["'][^>]*><\/script>)/i;
      if(maplibreScript.test(body))body=body.replace(maplibreScript,'$1'+mapBridge);
      else body=body.replace(/<head([^>]*)>/i,m=>m+mapBridge);
    }
    if(!body.includes('work-status-fragment.js'))body=body.replace(/<\/body>/i,'<script src="./work-status-fragment.js?v=RC12.32"></script></body>');
    if(!body.includes('flight-ops-fragment.js'))body=body.replace(/<\/body>/i,'<script src="./flight-ops-fragment.js?v=RC12.32"></script></body>');
    if(!body.includes('gps-view-modes.js'))body=body.replace(/<\/body>/i,'<script src="./gps-view-modes.js?v=RC12.32"></script></body>');
    if(!body.includes('meteo-visual-voo.js'))body=body.replace(/<\/body>/i,'<script src="./meteo-visual-voo.js?v=RC12.32"></script></body>');
    if(!body.includes('meteo-route-phase2.js'))body=body.replace(/<\/body>/i,'<script src="./meteo-route-phase2.js?v=RC12.32"></script></body>');
    if(!body.includes('meteo-altitude-phase3.js'))body=body.replace(/<\/body>/i,'<script src="./meteo-altitude-phase3.js?v=RC12.32"></script></body>');
    if(!body.includes('diagnostic-recovery.js'))body=body.replace(/<\/body>/i,'<script src="./diagnostic-recovery.js?v=RC12.36"></script></body>');
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('content-type','text/html; charset=utf-8');
    return new Response(body,{status:response.status,statusText:response.statusText,headers});
  }catch(e){
    console.warn('AERONAV navigation injection',e);
    return fallback;
  }
}

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.protocol!=='http:'&&url.protocol!=='https:')return;
  const p=url.pathname;
  if(/\/mathia\//.test(p)||/\/wendler\//.test(p))return;

  if(req.mode==='navigate'){
    event.respondWith((async()=>injectAngolaMapsIntoMainNavigation(await networkFirst(req),req))());
    return;
  }
  if(REMOTE_SET.has(req.url)){
    event.respondWith(cacheFirst(req));
    return;
  }
  if(url.origin===self.location.origin&&LOCAL_PATHS.has(url.pathname)){
    event.respondWith(shellFirst(req));
    return;
  }
  event.respondWith(fetch(req));
});

self.addEventListener('message',event=>{
  const port=event.ports&&event.ports[0];
  if(!port)return;
  if(event.data?.type==='AERONAV_STATUS'){
    caches.open(CACHE).then(async c=>{
      let remote=0,local=0;
      for(const u of REMOTE){if(await c.match(u))remote++;}
      for(const u of LOCAL){if(await c.match(u))local++;}
      port.postMessage({
        shellReady:local===LOCAL.length,
        localReady:local===LOCAL.length,
        localCount:local,
        remoteReady:remote===REMOTE.length,
        remoteCount:remote,
        cacheVersion:CACHE,
        release:'RC12.37.19'
      });
    });
  }else if(event.data?.type==='WARM_OFFLINE_CACHE'){
    warm().then(x=>port.postMessage(x)).catch(err=>port.postMessage({error:String(err?.message||err)}));
  }
});

self.addEventListener('notificationclick',event=>{
  const data=event.notification?.data||{};
  event.notification.close();
  event.waitUntil((async()=>{
    const all=await clients.matchAll({type:'window',includeUncontrolled:true});
    if(data.type==='active-route'){
      const main=all.find(c=>!/\/family\/?(?:index\.html)?$/.test(new URL(c.url).pathname)&&
        !/\/wendler(?:\/index\.html|\.html)?$/.test(new URL(c.url).pathname));
      if(main){
        try{await main.focus();main.postMessage?.({type:'AERONAV_OPEN_ACTIVE_ROUTE'});return;}catch(_){}
      }
      try{await clients.openWindow(new URL('./index.html',self.location.href).href);}catch(_){}
      return;
    }
    const family=all.find(c=>/\/family\/?(?:index\.html)?(?:[?#].*)?$/.test(new URL(c.url).pathname));
    if(family){try{await family.focus();return;}catch(_){} }
    try{await clients.openWindow(new URL('./mathia/',self.location.href).href);}catch(_){}
  })());
});
