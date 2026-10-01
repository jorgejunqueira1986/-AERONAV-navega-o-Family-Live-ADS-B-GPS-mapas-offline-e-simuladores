/* AERONAV RC11.99 Flight Ops */
(()=>{
'use strict';
if(window.__AERONAV_RC1199)return; window.__AERONAV_RC1199=true;

const path=(location.pathname||'').toLowerCase();
const role=path.includes('/mathia/')?'mathia':path.includes('/wendler/')?'wendler':'jorge';
const client=role!=='jorge';
const FT=3.280839895, KT=1.943844492;
const EVT='__AERONAV_FLIGHT_EVENT__|';
const PHASE='aeronav.flightops.phase.v1', SEEN='aeronav.flightops.seen.'+role;

let mode='', last=null, lastAt=0, gs=0, vs=0, groundAlt=null, tHits=0, lHits=0, approach=false, airborneAt=0;
let famUrl='', famHeaders={}, room='', publishing=false, icaos={dep:'',dest:''}, lastMetarKey='', lastMetarAt=0;

const txt=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
const up=v=>String(v||'').toUpperCase();

function findBtn(label){
  const w=up(label);
  return [...document.querySelectorAll('button,[role="button"],a')].find(e=>{
    const t=up(txt(e)); return t===w||t.endsWith(' '+w)||t.includes(w);
  })||null;
}
function selected(e){
  if(!e)return false;
  return String(e.getAttribute('aria-pressed')||'').toLowerCase()==='true' ||
    /\b(active|selected|current|on)\b/.test(String(e.className||'').toLowerCase()) ||
    String(e.dataset?.active||e.dataset?.selected||'').toLowerCase()==='true';
}
function flightMode(){ return selected(findBtn('VOO')) || mode==='flight'; }
function bindModes(){
  for(const [b,m] of [[findBtn('VOO'),'flight'],[findBtn('CARRO'),'car'],[findBtn('A PÉ')||findBtn('A PE'),'walk']]){
    if(!b||b.dataset.foBound==='1')continue;
    b.dataset.foBound='1'; b.addEventListener('click',()=>mode=m,true);
  }
}
function hav(a,b){
  const R=6371000,r=x=>x*Math.PI/180,p1=r(a.lat),p2=r(b.lat),dp=r(b.lat-a.lat),dl=r(b.lng-a.lng);
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function styles(){
  if(document.getElementById('foCss'))return;
  const s=document.createElement('style'); s.id='foCss'; s.textContent=`
  #foTelemetry{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:10px 16px;position:relative;z-index:4}
  .foTile{background:#142b3b;border:1px solid #2b6987;border-radius:17px;padding:11px 12px;color:#fff;min-height:62px}
  .foLab{font:800 10px system-ui;letter-spacing:.08em;color:#9bd7ef}.foVal{font:800 17px system-ui;margin-top:6px}
  #foMetars{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 16px}.foMet{background:#0b2435;border:1px solid #2b6987;border-radius:16px;padding:12px;color:#fff}
  .foMet h4{margin:0;color:#8bdcff;font:800 12px system-ui}.foMet p{font:700 12px/1.4 ui-monospace,monospace;overflow-wrap:anywhere}
  #foBig{position:fixed;inset:0;z-index:2147483600;background:rgba(0,7,15,.82);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(10px)}
  #foBig>div{width:min(520px,100%);background:#06263b;border:2px solid #45caff;border-radius:28px;padding:28px 20px;text-align:center;color:#fff;box-shadow:0 24px 70px #0008}
  #foBig .emo{font-size:64px}#foBig h2{font:900 30px/1.08 system-ui;margin:12px 0}#foBig p{font:750 18px/1.35 system-ui;color:#dbf2fb}
  #foBig button{margin-top:15px;border:1px solid #49a9cf;background:#0c405d;color:#fff;border-radius:15px;padding:12px 22px;font-weight:800}
  @media(max-width:620px){#foTelemetry{grid-template-columns:1fr 1fr}#foTelemetry .foTile:last-child{grid-column:1/-1}#foMetars{grid-template-columns:1fr}}
  `; document.head.appendChild(s);
}
function dataHost(){
  const d=[...document.querySelectorAll('*')].find(e=>up(txt(e))==='DADOS');
  return d?.parentElement?.parentElement||d?.parentElement||document.querySelector('main')||document.body;
}
function telemetry(){
  if(role!=='jorge'||document.getElementById('foTelemetry'))return;
  const h=dataHost(); if(!h)return;
  const w=document.createElement('div'); w.id='foTelemetry';
  w.innerHTML=`<div class="foTile"><div class="foLab">GROUND SPEED</div><div id="foGS" class="foVal">—</div></div>
  <div class="foTile"><div class="foLab">TRUE AIRSPEED · AUTO</div><div id="foTAS" class="foVal">—</div></div>
  <div class="foTile"><div class="foLab">RATE OF CLIMB/DESCENT</div><div id="foVS" class="foVal">—</div></div>`;
  h.insertAdjacentElement('afterbegin',w);
}
function realTas(){
  for(const k of ['trueAirspeed','true_airspeed','tasKt','tas']){
    try{const v=Number(window[k]); if(Number.isFinite(v)&&v>=0&&v<800)return v;}catch(_){}
  } return NaN;
}
function fmtVs(v){
  const n=Math.round(v/10)*10; if(Math.abs(n)<50)return '0 ft/min · LEVEL';
  return (n>0?'+':'')+n+' ft/min · '+(n>0?'CLIMB':'DESCENT');
}
function updateMetric(labels,val){
  for(const e of [...document.querySelectorAll('*')]){
    if(!labels.includes(up(txt(e))))continue;
    const vals=[...(e.parentElement?.querySelectorAll('div,span,strong,b,p')||[])].filter(x=>x!==e);
    const target=vals.find(x=>/—|[-+]?\d/.test(txt(x))); if(target)target.textContent=val;
  }
}
function updateTelemetry(){
  if(role!=='jorge')return; telemetry();
  const rt=realTas(), est=!Number.isFinite(rt), tas=est?gs:rt;
  const g=Math.round(gs)+' kt', ta=Math.round(tas)+' kt'+(est?' *':''), v=fmtVs(vs);
  if(document.getElementById('foGS'))foGS.textContent=g;
  if(document.getElementById('foTAS'))foTAS.textContent=ta;
  if(document.getElementById('foVS'))foVS.textContent=v;
  updateMetric(['GROUND SPEED','GROUNDSPEED','GS'],g);
  updateMetric(['TRUE AIRSPEED','TAS'],ta);
  updateMetric(['VERTICAL SPEED','V/S','VS','RATE OF CLIMB/DESCENT'],v);
}

const stop=new Set(['CASA','ROTA','MAPA','MAIS','DADOS','VOOS','CARRO','FOLGA','METAR','HOME','WORK']);
const validIcao=x=>/^[A-Z]{4}$/.test(x)&&!stop.has(x);
function findIcaoNear(labels){
  for(const el of [...document.querySelectorAll('label,div,span,p,strong,b,h1,h2,h3,h4')]){
    if(!labels.some(x=>up(txt(el)).includes(x)))continue;
    for(const root of [el.parentElement,el.parentElement?.parentElement].filter(Boolean)){
      for(const v of [...root.querySelectorAll('input,select,textarea,div,span,p,strong,b')].map(x=>up(x.value||txt(x)))){
        const good=(v.match(/\b[A-Z]{4}\b/g)||[]).find(validIcao); if(good)return good;
      }
    }
  } return '';
}
function detectIcaos(){
  let dep=findIcaoNear(['PARTIDA','ORIGEM','DEPARTURE','ORIGIN']);
  let dest=findIcaoNear(['DESTINO','DESTINATION','ARRIVAL']);
  if(!dep||!dest){
    const found=[];
    try{for(let i=0;i<localStorage.length;i++){
      const k=String(localStorage.key(i)||''); if(!/route|rota|flight|voo|trip|viagem/i.test(k))continue;
      for(const m of (up(localStorage.getItem(k)||'').match(/\b[A-Z]{4}\b/g)||[]))if(validIcao(m)&&!found.includes(m))found.push(m);
    }}catch(_){}
    dep=dep||found[0]||''; dest=dest||(found.length>1?found[found.length-1]:'');
  }
  return icaos={dep,dest};
}
async function fetchMetar(icao,id){
  const el=document.getElementById(id); if(el)el.textContent='A carregar '+icao+'…';
  for(const url of [`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icao)}&format=json`,`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icao)}&format=raw`]){
    try{
      const r=await fetch(url,{cache:'no-store'}); if(!r.ok)continue; let raw='';
      if(String(r.headers.get('content-type')||'').includes('json')){
        const j=await r.json(), o=Array.isArray(j)?j[0]:j; raw=String(o?.rawOb||o?.raw_text||o?.metar||'').trim();
      } else raw=(await r.text()).trim();
      if(raw){if(el)el.textContent=raw; return;}
    }catch(_){}
  }
  if(el)el.textContent='METAR indisponível';
}
function metarPanel(){
  if(role!=='jorge')return; const q=detectIcaos(); if(!q.dep&&!q.dest)return;
  let p=document.getElementById('foMetars');
  if(!p){p=document.createElement('div');p.id='foMetars';p.innerHTML=`<div class="foMet"><h4 id="foMD">PARTIDA</h4><p id="foMRD">—</p></div><div class="foMet"><h4 id="foMA">DESTINO</h4><p id="foMRA">—</p></div>`;dataHost()?.appendChild(p);}
  foMD.textContent='PARTIDA · '+(q.dep||'—'); foMA.textContent='DESTINO · '+(q.dest||'—');
  const key=q.dep+'|'+q.dest;
  if(key!==lastMetarKey||Date.now()-lastMetarAt>600000){
    lastMetarKey=key; lastMetarAt=Date.now(); if(q.dep)fetchMetar(q.dep,'foMRD'); if(q.dest)fetchMetar(q.dest,'foMRA');
  }
}

function phase(){try{return JSON.parse(localStorage.getItem(PHASE)||'{"phase":"ground"}').phase==='airborne'?'airborne':'ground';}catch(_){return 'ground';}}
function setPhase(p){try{localStorage.setItem(PHASE,JSON.stringify({phase:p,at:Date.now()}));}catch(_){}}
function place(kind){detectIcaos(); return kind==='takeoff'?(icaos.dep||'origem'):(icaos.dest||'destino');}
function updateState(pos){
  if(role!=='jorge'||!flightMode())return;
  const alt=Number(pos.coords.altitude); if(!Number.isFinite(alt))return;
  if(phase()==='ground'){
    if(groundAlt==null)groundAlt=alt; if(gs<20&&Math.abs(vs)<150)groundAlt=.9*groundAlt+.1*alt;
    const gain=(alt-groundAlt)*FT, ok=(gs>=45&&vs>=120&&gain>=30)||(gs>=65&&gain>=60);
    tHits=ok?tHits+1:Math.max(0,tHits-1);
    if(tHits>=3){setPhase('airborne');airborneAt=Date.now();approach=false;lHits=0;tHits=0;emit('takeoff',place('takeoff'));}
  }else{
    if(vs<-180)approach=true;
    const enough=Date.now()-airborneAt>30000||airborneAt===0;
    const ok=enough&&approach&&((gs>=15&&gs<=155&&Math.abs(vs)<180)||gs<35);
    lHits=ok?lHits+1:Math.max(0,lHits-1);
    if(lHits>=5){setPhase('ground');groundAlt=alt;approach=false;lHits=0;emit('landing',place('landing'));}
  }
}

function words(kind,where){
  const who=role==='wendler'?'PAPÁ':'JORGE';
  return kind==='takeoff'
    ?{emo:'✈️',title:'✈️ '+who+' DESCOLOU',body:'Descolagem confirmada na origem'+(where?' · '+where:'')+'.'}
    :{emo:'🛬',title:'🛬 '+who+' ATERRROU',body:'Aterragem confirmada no destino'+(where?' · '+where:'')+'.'};
}
function big(kind,where){
  if(!client)return; document.getElementById('foBig')?.remove(); const w=words(kind,where),o=document.createElement('div');o.id='foBig';
  o.innerHTML=`<div><div class="emo">${w.emo}</div><h2>${w.title}</h2><p>${w.body}</p><button>OK</button></div>`;
  o.querySelector('button').onclick=()=>o.remove();document.body.appendChild(o);setTimeout(()=>o.remove(),30000);
}
async function systemNotify(kind,where){
  if(!client)return; const w=words(kind,where);
  try{const reg=await navigator.serviceWorker?.ready;if(reg&&Notification.permission==='granted')await reg.showNotification(w.title,{body:w.body,tag:'aeronav-flight-'+kind,renotify:true,requireInteraction:true,vibrate:[250,120,250,120,400],data:{kind:'aeronav-flight-event',event:kind}});}catch(_){}
}
function enc(s){try{const b=new TextEncoder().encode(String(s||''));let x='';for(const n of b)x+=String.fromCharCode(n);return btoa(x).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}catch(_){return '';}}
function dec(s){try{const x=String(s||'').replace(/-/g,'+').replace(/_/g,'/'),p=x+'='.repeat((4-x.length%4)%4);return new TextDecoder().decode(Uint8Array.from(atob(p),c=>c.charCodeAt(0)));}catch(_){return '';}}
function cloneHeaders(h){const o={};try{new Headers(h||{}).forEach((v,k)=>o[k]=v);}catch(_){}return o;}
function capture(url,init,rows){
  try{const p=new URL(url,location.href);if(!/aeronav_locations/i.test(p.pathname))return;famUrl=p.origin+p.pathname;}catch(_){return;}
  const h=cloneHeaders(init?.headers);if(Object.keys(h).length)famHeaders={...famHeaders,...h};
  for(const r of(Array.isArray(rows)?rows:[rows]))if(r?.room_hash){room=String(r.room_hash);break;}
}
async function publish(e){
  if(publishing||!famUrl||!room)return; publishing=true;
  try{
    const h={...famHeaders,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'};
    for(const target of ['mathia','wendler'])await nativeFetch(famUrl+'?on_conflict=room_hash,member_id',{method:'POST',cache:'no-store',headers:h,body:JSON.stringify({
      room_hash:room,member_id:'__aeronav_sys_flight_'+target,display_name:EVT+(target==='mathia'?'m':'w')+'|'+e.kind+'|'+e.id+'|'+enc(e.where),
      sharing:true,lat:null,lon:null,accuracy:null,altitude:null,speed:Math.round(gs),heading:null,transport:'flight-event',flight_number:null,flight_eta:null,updated_at:e.at
    })});
  }catch(_){}finally{publishing=false;}
}
function emit(kind,where){if(role==='jorge')publish({id:'flt_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),kind,where,at:new Date().toISOString()});}
function parseRow(r){
  const n=String(r?.display_name||'');if(!n.startsWith(EVT))return null;const p=n.slice(EVT.length).split('|');if(p.length<4)return null;
  return{target:p[0]==='m'?'mathia':p[0]==='w'?'wendler':'',kind:p[1],id:p[2],where:dec(p.slice(3).join('|'))};
}
function processRows(rows){
  if(!client)return;for(const r of rows||[]){const e=parseRow(r);if(!e||e.target!==role)continue;let s='';try{s=localStorage.getItem(SEEN)||'';}catch(_){}if(s===e.id)continue;try{localStorage.setItem(SEEN,e.id);}catch(_){}big(e.kind,e.where);systemNotify(e.kind,e.where);}
}
const tech=r=>String(r?.display_name||'').startsWith(EVT)||String(r?.member_id||'').startsWith('__aeronav_sys_flight_');

const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const url=typeof input==='string'?input:(input?.url||''),family=/aeronav_locations/i.test(url);
  if(family&&typeof init?.body==='string')try{const b=JSON.parse(init.body);capture(url,init,Array.isArray(b)?b:[b]);}catch(_){}
  const res=await nativeFetch(input,init);
  if(family&&res?.ok)try{
    const p=await res.clone().json(),rows=Array.isArray(p)?p:(p?[p]:[]);capture(url,init,rows);processRows(rows);
    if(Array.isArray(p)){const f=rows.filter(x=>!tech(x));if(f.length!==rows.length){const h=new Headers(res.headers);h.delete('content-length');h.delete('content-encoding');h.set('content-type','application/json; charset=utf-8');return new Response(JSON.stringify(f),{status:res.status,statusText:res.statusText,headers:h});}}
  }catch(_){}
  return res;
};

function onPosition(p){
  const now=Date.now(),lat=Number(p.coords.latitude),lng=Number(p.coords.longitude),alt=Number(p.coords.altitude);let sp=Number(p.coords.speed);
  if(last&&Number.isFinite(lat)&&Number.isFinite(lng)){const dt=(now-lastAt)/1000;if(dt>=1&&dt<=20){
    if(!Number.isFinite(sp)||sp<0)sp=hav(last,{lat,lng})/dt;
    if(Number.isFinite(alt)&&Number.isFinite(last.alt)){const raw=((alt-last.alt)*FT)/(dt/60);if(Math.abs(raw)<10000)vs=vs===0?raw:.72*vs+.28*raw;}
  }}
  if(Number.isFinite(sp)&&sp>=0)gs=Math.min(800,sp*KT);
  last={lat,lng,alt:Number.isFinite(alt)?alt:null};lastAt=now;updateTelemetry();updateState(p);
}
function startGps(){
  try{
    let seen=false;
    const accept=p=>{if(!p?.coords)return;seen=true;onPosition(p);};
    if(window.__AERONAV_LAST_GPS__)accept(window.__AERONAV_LAST_GPS__);
    window.addEventListener('aeronav:gps',e=>accept(e.detail),{passive:true});
    setTimeout(()=>{
      if(seen||window.__AERONAV_GPS_OWNER__)return;
      try{navigator.geolocation?.watchPosition(accept,()=>{},{enableHighAccuracy:true,maximumAge:2000,timeout:15000});}catch(_){}
    },10000);
  }catch(_){}
}
function tick(){bindModes();styles();if(role==='jorge'){telemetry();updateTelemetry();metarPanel();detectIcaos();}}
function start(){styles();bindModes();startGps();tick();setInterval(tick,8000);window.addEventListener('pageshow',tick);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();