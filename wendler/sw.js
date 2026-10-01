/* AERONAV RC12.10 — Flight event client preserved */
/* AERONAV RC11.98.7 — Exact address picking */
/* AERONAV RC11.98 — Wendler Work/Home avatar + Jorge Folga viewer */
const CACHE='aeronav-wendler-RC12_10-flight-events-20261001-1';
const CORE=['./','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','../assets/people/wendler-avatar-3d.png','../work-status-fragment.js','../flight-ops-fragment.js'];
async function injectWorkStatus(response){
  if(!response||!response.ok)return response;
  try{
    let html=await response.text();
    if(!html.includes('work-status-fragment.js'))html=html.replace(/<\/body>/i,'<script src="../work-status-fragment.js?v=RC11.98.7"></script></body>');
    if(!html.includes('flight-ops-fragment.js'))html=html.replace(/<\/body>/i,'<script src="../flight-ops-fragment.js?v=RC11.99"></script></body>');
    const h=new Headers(response.headers);
    h.delete('content-length');
    h.delete('content-encoding');
    h.set('content-type','text/html; charset=utf-8');
    return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
  }catch(_){
    return response;
  }
}
async function warm(){const c=await caches.open(CACHE);for(const u of CORE){try{const r=await fetch(u,{cache:'reload'});if(r.ok)await c.put(u,r.clone());}catch(_){}}}
self.addEventListener('install',e=>e.waitUntil(warm().then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('aeronav-wendler-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;if(r.mode==='navigate'){e.respondWith(fetch(r).then(async res=>{const c=await caches.open(CACHE);if(res.ok)await c.put('./index.html',res.clone());return injectWorkStatus(res);}).catch(async()=>injectWorkStatus(await caches.match('./index.html'))));return;}const paths=new Set(CORE.map(x=>new URL(x,self.location.href).pathname));if(paths.has(u.pathname))e.respondWith(fetch(r).then(async res=>{const c=await caches.open(CACHE);if(res.ok)await c.put(r,res.clone());return res;}).catch(()=>caches.match(r)));});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil((async()=>{const all=await clients.matchAll({type:'window',includeUncontrolled:true});if(all[0])return all[0].focus();try{await clients.openWindow(new URL('./index.html',self.location.href).href)}catch(_){}})())});
self.addEventListener('message',e=>{const d=e.data||{};if(d.type==='AERONAV_ROUTE_CANCELLED')e.waitUntil(self.registration.showNotification('Rota cancelada pelo papá',{body:'A rota foi removida automaticamente do mapa.',tag:'aeronav-route-cancelled',renotify:true,requireInteraction:true}));});
