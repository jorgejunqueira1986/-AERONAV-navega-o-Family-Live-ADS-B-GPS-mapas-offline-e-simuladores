/* AERONAV RC12.37 — Drive 3D visual update + versioned offline shell */
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
const CACHE='aeronav-jorge-RC12_37_0-drive3d-20261007';
const LOCAL=["./cockpit-lite.js", "./assets/people/mathia-avatar-rc12313.png", "./assets/people/jorge-avatar-rc12313.png", "./index.html", "./manifest.json", "./sw.js", "./family-viewer.html", "./wendler.html", "./family-viewer-preview.html", "./cockpit-audio.js", "./family-call.js", "./angola-offline-fragment.js", "./vendor/pmtiles-3.2.1.js", "./work-status-fragment.js", "./meteo-visual-voo.js", "./meteo-route-phase2.js", "./meteo-altitude-phase3.js", "./diagnostic-recovery.js", "./gps-view-modes.js", "./flight-ops-fragment.js", "./", "./vendor/maplibre-gl-5.24.0.js", "./vendor/maplibre-gl-5.24.0.css", "./vendor/fonts/Noto Sans Regular/0-255.pbf", "./vendor/fonts/Noto Sans Regular/256-511.pbf"];
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

self.addEventListener('install',event=>{
  event.waitUntil(warm().then(result=>{if(!result.localReady)throw new Error('Núcleo offline incompleto; versão anterior preservada.');return self.skipWaiting();}));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE &&
      (k.startsWith('app-nav-')||(k.startsWith('aeronav-')&&!k.startsWith('aeronav-mathia-')&&!k.startsWith('aeronav-wendler-')&&!k.startsWith('aeronav-family-'))))
      .map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

const DRIVE3D_INJECT=`<style id="aeronav-drive3d-style">
#aeronavDrive3dHud{position:absolute;z-index:35;left:max(10px,env(safe-area-inset-left));right:max(10px,env(safe-area-inset-right));top:10px;display:none;align-items:flex-start;justify-content:space-between;gap:10px;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;text-shadow:0 2px 8px #000b}
body.aeronav-drive3d #aeronavDrive3dHud{display:flex}
#aeronavDrive3dHud .d3-left{display:flex;align-items:center;gap:9px;filter:drop-shadow(0 8px 18px #0008)}
#aeronavDrive3dHud .d3-speed{min-width:88px;padding:9px 12px;border-radius:17px;background:#07111de9;border:1px solid #325065;backdrop-filter:blur(12px);display:flex;align-items:baseline;gap:5px}
#aeronavDrive3dHud .d3-speed b{font-size:38px;line-height:1;letter-spacing:-1px}.d3-speed small{font-size:10px;color:#bed0dd;font-weight:800}
#aeronavDrive3dHud .d3-limit{width:54px;height:54px;border-radius:50%;background:#fff;color:#121212;border:6px solid #ec3036;display:grid;place-items:center;font-weight:1000;font-size:19px;box-shadow:0 8px 18px #0008;text-shadow:none}
#aeronavDrive3dHud .d3-turn{margin-left:auto;max-width:min(650px,66vw);min-width:290px;padding:10px 13px;border-radius:17px;background:#07111dec;border:1px solid #325065;backdrop-filter:blur(12px);display:grid;grid-template-columns:54px minmax(0,1fr);gap:11px;align-items:center;filter:drop-shadow(0 8px 20px #0009)}
#aeronavDrive3dHud .d3-arrow{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(180deg,#25a8ff,#0878ff);font-size:35px;font-weight:900}
#aeronavDrive3dHud .d3-copy{min-width:0}.d3-copy b{display:block;font-size:22px;line-height:1.05}.d3-copy strong{display:block;margin-top:3px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.d3-copy small{display:block;margin-top:4px;font-size:10px;color:#9eb7c8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.aeronav-drive3d #mapBadge{display:none!important}
@media(max-width:720px){#aeronavDrive3dHud{left:7px;right:7px;top:7px;gap:6px}#aeronavDrive3dHud .d3-speed{min-width:64px;padding:7px 8px;border-radius:13px}.d3-speed b{font-size:28px!important}.d3-speed small{font-size:8px!important}#aeronavDrive3dHud .d3-limit{width:43px;height:43px;border-width:5px;font-size:15px}#aeronavDrive3dHud .d3-turn{min-width:0;max-width:62vw;padding:7px 9px;border-radius:13px;grid-template-columns:39px minmax(0,1fr);gap:7px}#aeronavDrive3dHud .d3-arrow{width:39px;height:39px;border-radius:10px;font-size:27px}.d3-copy b{font-size:17px!important}.d3-copy strong{font-size:11px!important}.d3-copy small{font-size:8px!important}}
</style><script data-aeronav-drive3d-rc1237>(function(){
'use strict';
if(window.__AERONAV_DRIVE3D_RC1237)return;window.__AERONAV_DRIVE3D_RC1237=true;
function q(s){return document.querySelector(s)}
function active(){var d=q('#modeDrive'),w=q('#modeWalk'),m=q('#screen-map');return !!(d&&d.classList.contains('active')&&!(w&&w.classList.contains('active'))&&m&&m.classList.contains('active'))}
function is2d(){var b=q('[data-drive-view="2d"]');return !!(b&&b.classList.contains('active'))}
function map(){return window.__AERONAV_MAP__||window.aeronavMap||window.mainMap||null}
function clean(v){return String(v==null?'—':v).replace(/<[^>]*>/g,'').trim()||'—'}
function num(v){var m=String(v||'').replace(',','.').match(/-?\d+(?:\.\d+)?/);return m?Math.round(Number(m[0])):'—'}
function glyph(t){t=String(t||'').toLowerCase();if(/retorno|invers|u[- ]?turn/.test(t))return '↶';if(/rotunda|roundabout/.test(t))return '↻';if(/esquer|left/.test(t))return '↖';if(/direit|right/.test(t))return '↗';if(/incorp|merge/.test(t))return '⇧';return '↑'}
function ensureHud(){var h=q('#aeronavDrive3dHud');if(h)return h;var wrap=q('#screen-map .map-wrap');if(!wrap)return null;h=document.createElement('div');h.id='aeronavDrive3dHud';h.innerHTML='<div class="d3-left"><div class="d3-speed"><b id="d3Speed">—</b><small>km/h</small></div><div class="d3-limit" id="d3Limit">—</div></div><div class="d3-turn"><div class="d3-arrow" id="d3Arrow">↑</div><div class="d3-copy"><b id="d3Dist">—</b><strong id="d3Instr">Pronto para conduzir</strong><small id="d3Meta">Selecione um destino</small></div></div>';wrap.appendChild(h);return h}
function hud(){var h=ensureHud();if(!h)return;document.body.classList.toggle('aeronav-drive3d',active());if(!active())return;var speed=q('#gsValue'),card=q('#driveNavCard'),k=card?Array.from(card.querySelectorAll('.drive-nav-kpi')):[];var instr=card&&card.querySelector('h4')?card.querySelector('h4').textContent:'Pronto para conduzir';var dist=k[0]&&k[0].querySelector('strong')?k[0].querySelector('strong').textContent:'—';var dest=k[1]&&k[1].querySelector('strong')?k[1].querySelector('strong').textContent:'Destino';var rest=k[2]&&k[2].querySelector('strong')?k[2].querySelector('strong').textContent:'—';var limit=k[3]&&k[3].querySelector('strong')?k[3].querySelector('strong').textContent:'—';q('#d3Speed').textContent=num(speed?speed.textContent:'—');q('#d3Limit').textContent=num(limit);q('#d3Arrow').textContent=glyph(instr);q('#d3Dist').textContent=clean(dist);q('#d3Instr').textContent=clean(instr);q('#d3Meta').textContent=clean(dest)+' · '+clean(rest)}
function styleRoute(m){try{if(m.getLayer('active-route-halo')){m.setPaintProperty('active-route-halo','line-width',18);m.setPaintProperty('active-route-halo','line-color','#03121b');m.setPaintProperty('active-route-halo','line-opacity',.9)}if(m.getLayer('active-route')){m.setPaintProperty('active-route','line-width',11);m.setPaintProperty('active-route','line-color','#169cff');m.setPaintProperty('active-route','line-opacity',1)}}catch(_){}}
function showBuildings(m){try{var ls=(m.getStyle&&m.getStyle().layers)||[];ls.forEach(function(l){if(l.type==='fill-extrusion'){try{m.setLayoutProperty(l.id,'visibility','visible')}catch(_){}}})}catch(_){}}
function patch(m){if(!m||m.__aeronavDrive37)return;m.__aeronavDrive37=true;try{if(m.setMaxPitch)m.setMaxPitch(75)}catch(_){};var oe=m.easeTo&&m.easeTo.bind(m);if(oe)m.easeTo=function(o,e){var x=Object.assign({},o||{});if(active()&&!is2d()){x.pitch=67;if(!Number.isFinite(Number(x.zoom))||Number(x.zoom)<15.7)x.zoom=Math.max(16.2,Number(m.getZoom?m.getZoom():16.2)||16.2)}return oe(x,e)};}
function tune(){var m=map();if(m){patch(m);if(active()){showBuildings(m);styleRoute(m);if(!is2d()){try{var p=Number(m.getPitch?m.getPitch():0);if(p<61&&m.easeTo)m.easeTo({pitch:67,zoom:Math.max(16.2,Number(m.getZoom?m.getZoom():16.2)||16.2),duration:260})}catch(_){}}}}hud();if(document.title.indexOf('RC12.37')<0)document.title='AERONAV — RC12.37.0'}
window.addEventListener('aeronav:map-ready',function(e){setTimeout(function(){patch((e&&e.detail&&e.detail.map)||map());tune()},80)});window.addEventListener('aeronav:screen-change',function(){setTimeout(tune,80)});window.addEventListener('aeronav:cockpit-change',function(){setTimeout(tune,80)});document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(tune,80)});setInterval(tune,650);setTimeout(tune,250);
})();<\/script>`;

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
    if(!body.includes('data-aeronav-drive3d-rc1237'))body=body.replace(/<\/body>/i,DRIVE3D_INJECT+'</body>');
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
    event.respondWith((async()=>injectAngolaMapsIntoMainNavigation(await shellFirst(req),req))());
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
        release:'RC12.37.0'
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
