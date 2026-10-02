/* AERONAV RC12.32 — Lightweight Diagnostic Hotfix
   Same RC12.31 diagnostics/recovery, without continuous polling or repeated map resize.
*/
(()=>{
'use strict';

const path=(location.pathname||'').toLowerCase();
const role=path.includes('/mathia/')?'mathia':path.includes('/wendler/')?'wendler':'jorge';
if(role!=='jorge')return;

if(window.__AERONAV_DIAGNOSTIC_RC12311)return;
window.__AERONAV_DIAGNOSTIC_RC12311=true;
window.__AERONAV_DIAGNOSTIC_RC1231=true;

const RELEASE='RC12.32';
const CACHE_TOKEN='RC12_32';
const MODULES=[
  {key:'cockpit',label:'Cockpit',flag:'__AERONAV_COCKPIT_LITE__',probe:'cockpitLiteStyles',src:'./cockpit-lite.js?v=RC12.32'},
  {key:'gps',label:'GPS',flag:'__AERONAV_GPS_VIEW_MODES_RC1200',probe:'aeronavGpsViewStyles',src:'./gps-view-modes.js?v=RC12.00'},
  {key:'flight',label:'Flight Ops',flag:'__AERONAV_RC1199',probe:'foCss',src:'./flight-ops-fragment.js?v=RC11.99'},
  {key:'wx1',label:'WX1',flag:'__AERONAV_METEO_VISUAL_RC1210',probe:'aeronavMeteoVisualCss',src:'./meteo-visual-voo.js?v=RC12.10'},
  {key:'wx2',label:'WX2',flag:'__AERONAV_METEO_ROUTE_RC1220',probe:'aeronavRouteWxCss',src:'./meteo-route-phase2.js?v=RC12.20'},
  {key:'wx3',label:'WX3',flag:'__AERONAV_METEO_ALTITUDE_RC1230',probe:'aeronavPhase3Css',src:'./meteo-altitude-phase3.js?v=RC12.30'}
];

let lastSnapshot=null,refreshBusy=false,recoverBusy=false,mapRef=null,lastRefreshAt=0,scanDone=false;
const errors=[];

function safeError(value){
  const s=String(value||'').replace(/\s+/g,' ').trim();
  if(!s)return;
  errors.unshift(new Date().toISOString().slice(11,19)+' '+s);
  if(errors.length>6)errors.length=6;
}
window.addEventListener('error',e=>safeError(e?.message||e?.error?.message),true);
window.addEventListener('unhandledrejection',e=>safeError(e?.reason?.message||e?.reason),true);

function isMapObject(v){
  return !!(v&&typeof v==='object'&&typeof v.getCanvas==='function'&&
    typeof v.getCenter==='function'&&typeof v.resize==='function');
}
function linkMap(m){
  if(!isMapObject(m))return null;
  mapRef=m;
  try{window.__AERONAV_MAP__=m;}catch(_){}
  try{window.aeronavMap=m;}catch(_){}
  try{window.mainMap=m;}catch(_){}
  return m;
}
function findMap(deep=false){
  if(isMapObject(mapRef))return mapRef;
  for(const k of ['__AERONAV_MAP__','aeronavMap','mainMap','map','mapInstance','mapa']){
    try{if(isMapObject(window[k]))return linkMap(window[k]);}catch(_){}
  }
  if(!deep||scanDone)return null;
  scanDone=true;
  try{
    for(const k of Object.getOwnPropertyNames(window)){
      let v;try{v=window[k];}catch(_){continue;}
      if(isMapObject(v))return linkMap(v);
    }
  }catch(_){}
  return null;
}
window.addEventListener('aeronav:map-ready',e=>{
  try{linkMap(e?.detail?.map);renderBadgeOnly();}catch(_){}
});

function moduleState(m){
  const flag=window[m.flag]===true;
  const probe=!!document.getElementById(m.probe);
  return {key:m.key,label:m.label,ok:flag&&probe,flag,probe,src:m.src};
}
function swMessage(type,timeout=2500){
  return new Promise(resolve=>{
    try{
      const ctrl=navigator.serviceWorker?.controller;
      if(!ctrl)return resolve(null);
      const ch=new MessageChannel();
      let done=false;
      const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v||null);};
      const timer=setTimeout(()=>finish(null),timeout);
      ch.port1.onmessage=e=>finish(e.data);
      ctrl.postMessage({type},[ch.port2]);
    }catch(_){resolve(null);}
  });
}
async function collect(deepMap=false){
  const modules=MODULES.map(moduleState);
  const map=findMap(deepMap);
  const swController=!!navigator.serviceWorker?.controller;
  const sw=swController?await swMessage('AERONAV_STATUS',1800):null;
  const cacheVersion=String(sw?.cacheVersion||'');
  return {
    release:RELEASE,
    at:new Date().toISOString(),
    online:navigator.onLine,
    modules,
    maplibre:!!(window.maplibregl&&typeof window.maplibregl.Map==='function'),
    mapLinked:!!map,
    mapCanvas:!!(map&&map.getCanvas?.()),
    swController,
    swReleaseOk:cacheVersion.includes(CACHE_TOKEN),
    cacheVersion,
    localReady:sw?.localReady===true,
    localCount:Number(sw?.localCount||0),
    remoteReady:sw?.remoteReady===true,
    remoteCount:Number(sw?.remoteCount||0),
    errors:[...errors]
  };
}
function allCoreOk(s){
  return !!(s&&s.modules.every(x=>x.ok)&&s.maplibre&&s.mapLinked&&s.swController&&s.swReleaseOk);
}
function quickCoreOk(){
  const modules=MODULES.every(m=>window[m.flag]===true);
  const map=!!findMap(false);
  const ml=!!(window.maplibregl&&typeof window.maplibregl.Map==='function');
  const sw=!!navigator.serviceWorker?.controller;
  return modules&&map&&ml&&sw;
}
function ensureStyle(){
  if(document.getElementById('aeronavDiagCss'))return;
  const s=document.createElement('style');
  s.id='aeronavDiagCss';
  s.textContent=[
    '#aeronavDiagBtn{position:fixed;right:10px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:2147483000;border:1px solid #4b7890;background:#09283a;color:#fff;border-radius:13px;padding:8px 10px;font:900 10px system-ui,-apple-system,sans-serif;box-shadow:0 6px 18px #0006}',
    '#aeronavDiagBtn.ok{border-color:#37d678;color:#a9ffca}#aeronavDiagBtn.bad{border-color:#ff5b67;color:#ffd0d4}#aeronavDiagBtn.warn{border-color:#ffc857;color:#ffe6a0}',
    '#aeronavDiagPanel{position:fixed;z-index:2147483001;right:10px;top:calc(env(safe-area-inset-top,0px) + 48px);width:min(390px,calc(100vw - 20px));max-height:72vh;overflow:auto;background:rgba(4,20,31,.98);border:1px solid #3f7894;border-radius:19px;padding:14px;color:#fff;box-shadow:0 20px 60px #000b;font-family:system-ui,-apple-system,sans-serif}',
    '#aeronavDiagPanel[hidden]{display:none!important}.adHead{display:flex;justify-content:space-between;align-items:center;gap:10px}.adHead b{font-size:14px}.adHead button{border:0;background:#183b4e;color:#fff;border-radius:9px;padding:6px 9px;font-weight:900}',
    '.adSub{font-size:10px;color:#8eb8ca;margin:4px 0 10px}.adRow{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:7px 8px;margin:5px 0;background:#0c2a3b;border-radius:10px;font-size:12px}.adName{font-weight:850}.adGood{color:#55e68c;font-weight:900}.adBad{color:#ff6975;font-weight:900}.adWarn{color:#ffd166;font-weight:900}',
    '.adActions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.adActions button{border:1px solid #3d7794;background:#12384d;color:#fff;border-radius:11px;padding:9px;font-weight:850}.adActions button.primary{background:#0b5b3a;border-color:#35d883}.adActions button.danger{background:#542329;border-color:#ff6975}.adActions button:disabled{opacity:.55}',
    '#adLog{white-space:pre-wrap;background:#061a27;border-radius:10px;padding:8px;margin-top:9px;color:#9ec5d7;font:700 10px/1.35 ui-monospace,SFMono-Regular,monospace;max-height:95px;overflow:auto}'
  ].join('');
  document.head.appendChild(s);
}
function ensureUi(){
  ensureStyle();
  let b=document.getElementById('aeronavDiagBtn');
  if(!b){
    b=document.createElement('button');b.id='aeronavDiagBtn';b.type='button';b.textContent='RC12.32';
    b.addEventListener('click',async()=>{
      const p=document.getElementById('aeronavDiagPanel');if(!p)return;
      const opening=p.hidden;
      p.hidden=!p.hidden;
      if(opening)await refresh(false,true);
    });
    document.body.appendChild(b);
  }
  let p=document.getElementById('aeronavDiagPanel');
  if(!p){
    p=document.createElement('section');p.id='aeronavDiagPanel';p.hidden=true;
    p.innerHTML='<div class="adHead"><b>AERONAV RC12.32 · Diagnóstico</b><button id="adClose">×</button></div>'+
      '<div class="adSub">Modo leve: só verifica quando necessário.</div>'+
      '<div id="adRows"></div>'+
      '<div class="adActions"><button id="adRecover" class="primary">Recuperar agora</button><button id="adRefresh">Atualizar</button><button id="adReload" class="danger">Recarregar limpo</button><button id="adCopy">Copiar diagnóstico</button></div>'+
      '<div id="adLog">Diagnóstico em espera.</div>';
    document.body.appendChild(p);
    document.getElementById('adClose').onclick=()=>p.hidden=true;
    document.getElementById('adRefresh').onclick=()=>refresh(false,true);
    document.getElementById('adRecover').onclick=recover;
    document.getElementById('adReload').onclick=cleanReload;
    document.getElementById('adCopy').onclick=copyDiag;
  }
}
function row(name,ok,text,warn=false){
  const cls=ok?'adGood':(warn?'adWarn':'adBad');
  const icon=ok?'✓':(warn?'⚠':'✕');
  return '<div class="adRow"><span class="adName">'+name+'</span><span class="'+cls+'">'+icon+' '+text+'</span></div>';
}
function render(s){
  ensureUi();
  const rows=[];
  for(const m of s.modules)rows.push(row(m.label,m.ok,m.ok?'carregado':(m.flag?'inicialização incompleta':'não carregou')));
  rows.push(row('MapLibre',s.maplibre,s.maplibre?'carregado':'não carregou'));
  rows.push(row('Ligação ao mapa',s.mapLinked,s.mapLinked?'ligada':'mapa não encontrado'));
  rows.push(row('Service Worker',s.swController,s.swController?'ativo':'sem controlo'));
  rows.push(row('Cache RC12.32',s.swReleaseOk,s.swReleaseOk?(s.localReady?'pronto':'ativo · '+s.localCount+' locais'):(s.cacheVersion||'cache antigo/indisponível'),s.swController&&!s.swReleaseOk));
  rows.push(row('Internet',s.online,s.online?'online':'offline',!s.online));
  document.getElementById('adRows').innerHTML=rows.join('');
  const ok=allCoreOk(s),b=document.getElementById('aeronavDiagBtn');
  b.className=ok?'ok':(s.swController?'warn':'bad');
  b.textContent=ok?'RC12.32 ✓':'RC12.32 !';
  const err=s.errors.length?'\nErros: '+s.errors.slice(0,3).join(' | '):'';
  document.getElementById('adLog').textContent='Cache: '+(s.cacheVersion||'—')+'\nLocal: '+s.localCount+' · Remote: '+s.remoteCount+err;
}
function renderBadgeOnly(){
  ensureUi();
  const b=document.getElementById('aeronavDiagBtn');
  if(!b)return;
  const ok=quickCoreOk();
  b.className=ok?'ok':'warn';
  b.textContent=ok?'RC12.32 ✓':'RC12.32';
}
async function refresh(openBad=false,deepMap=false){
  if(refreshBusy)return lastSnapshot;
  refreshBusy=true;
  try{
    lastSnapshot=await collect(deepMap);
    lastRefreshAt=Date.now();
    render(lastSnapshot);
    if(openBad&&!allCoreOk(lastSnapshot))document.getElementById('aeronavDiagPanel').hidden=false;
    return lastSnapshot;
  }finally{refreshBusy=false;}
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function reloadModule(m){
  if(moduleState(m).ok)return true;
  try{delete window[m.flag];}catch(_){try{window[m.flag]=false;}catch(__){}}
  const url=m.src+(m.src.includes('?')?'&':'?')+'recovery='+Date.now();
  return await new Promise(resolve=>{
    let settled=false;
    const done=v=>{if(settled)return;settled=true;resolve(v);};
    const sc=document.createElement('script');
    sc.src=url;sc.async=false;sc.dataset.aeronavRecovery=RELEASE;
    sc.onload=()=>setTimeout(()=>done(moduleState(m).ok),180);
    sc.onerror=()=>done(false);
    document.body.appendChild(sc);
    setTimeout(()=>done(moduleState(m).ok),5000);
  });
}
async function clearOldCaches(){
  if(!window.caches)return [];
  const keys=await caches.keys(),removed=[];
  for(const k of keys){
    if(k.startsWith('aeronav-jorge-')&&!k.includes(CACHE_TOKEN)){
      try{if(await caches.delete(k))removed.push(k);}catch(_){}
    }
  }
  return removed;
}
async function recover(){
  if(recoverBusy)return;
  recoverBusy=true;
  ensureUi();
  const btn=document.getElementById('adRecover'),log=document.getElementById('adLog');
  btn.disabled=true;log.textContent='Recuperação RC12.32 em curso…';
  try{
    try{const reg=await navigator.serviceWorker?.getRegistration();await reg?.update?.();}catch(e){safeError('SW update: '+(e?.message||e));}
    const removed=await clearOldCaches();
    log.textContent='Caches antigos removidos: '+removed.length+'\nA verificar módulos…';
    for(const m of MODULES){
      if(!moduleState(m).ok){
        const ok=await reloadModule(m);
        log.textContent+='\n'+m.label+': '+(ok?'recuperado ✓':'falhou ✕');
      }
    }
    const m=findMap(true);
    if(m){
      try{m.resize();m.triggerRepaint?.();}catch(_){}
      log.textContent+='\nMapa: ligação recuperada ✓';
    }else log.textContent+='\nMapa: ainda não ligado';
    const warm=await swMessage('WARM_OFFLINE_CACHE',10000);
    if(warm)log.textContent+='\nCache: '+(warm.localReady?'pronto ✓':(warm.localCount+' ficheiros locais'));
    await sleep(350);
    const s=await refresh(false,false);
    log.textContent+='\n'+(allCoreOk(s)?'RC12.32: sistema recuperado ✓':'RC12.32: ainda há itens pendentes.');
  }catch(e){
    safeError(e?.message||e);log.textContent+='\nErro: '+String(e?.message||e);
  }finally{
    recoverBusy=false;btn.disabled=false;
  }
}
function cleanReload(){
  const u=new URL(location.href);
  u.searchParams.set('rc','12.31.1');
  u.searchParams.set('reload',String(Date.now()));
  location.replace(u.toString());
}
async function copyDiag(){
  const s=lastSnapshot||await collect(true);
  const text=JSON.stringify(s,null,2);
  try{await navigator.clipboard.writeText(text);document.getElementById('adLog').textContent='Diagnóstico copiado ✓';}
  catch(_){document.getElementById('adLog').textContent=text;}
}
function foregroundCheck(){
  renderBadgeOnly();
  if(Date.now()-lastRefreshAt>60000)setTimeout(()=>refresh(false,false),900);
}
function start(){
  ensureUi();
  renderBadgeOnly();
  setTimeout(()=>refresh(false,false),1400);
  window.addEventListener('pageshow',foregroundCheck,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)foregroundCheck();},{passive:true});
}
window.__AERONAV_DIAG_API__={refresh,recover,findMap,release:RELEASE};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
