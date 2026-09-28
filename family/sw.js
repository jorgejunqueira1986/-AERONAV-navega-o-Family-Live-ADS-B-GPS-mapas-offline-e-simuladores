/* AERONAV Family RC11.62 — isolated collective profile */
const CACHE='aeronav-family-RC11_62-20260928-1';
const CORE=['./','./index.html','./manifest.json','./family-call.js','./icon-192.png','./icon-512.png'];
async function warm(){const c=await caches.open(CACHE);for(const u of CORE){try{const r=await fetch(u,{cache:'reload'});if(r.ok)await c.put(u,r.clone())}catch(_){}}}
self.addEventListener('install',e=>e.waitUntil(warm().then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k.startsWith('aeronav-family-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;if(r.mode==='navigate'){e.respondWith(fetch(r).then(async res=>{const c=await caches.open(CACHE);if(res.ok)await c.put('./index.html',res.clone());return res}).catch(()=>caches.match('./index.html')));return}const paths=new Set(CORE.map(x=>new URL(x,self.location.href).pathname));if(paths.has(u.pathname))e.respondWith(fetch(r).then(async res=>{const c=await caches.open(CACHE);if(res.ok)await c.put(r,res.clone());return res}).catch(()=>caches.match(r)))});
