/* AERONAV RC12.00 — GPS Visual Modes: VOO / CARRO / A PÉ */
(()=>{
  'use strict';
  if(window.__AERONAV_GPS_VIEW_MODES_RC1200)return;
  window.__AERONAV_GPS_VIEW_MODES_RC1200=true;

  const path=(location.pathname||'').toLowerCase();
  const role=path.includes('/mathia/')?'mathia':path.includes('/wendler/')?'wendler':'jorge';
  if(role!=='jorge')return;

  const KEY='aeronav.gps.visual.mode.v1';
  let mode=localStorage.getItem(KEY)||'car';
  let map=null;
  let lastHeading=0;
  let lastPos=null;
  let lastUserMapInteraction=0;
  let hookedMap=null;
  let tickBusy=false;

  const $=s=>document.querySelector(s);
  const all=s=>[...document.querySelectorAll(s)];
  const text=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
  const upper=v=>String(v||'').toUpperCase();

  function findButton(label){
    const w=upper(label);
    return all('button,[role="button"],a').find(el=>{
      const t=upper(text(el));
      return t===w||t.endsWith(' '+w)||t.includes(w);
    })||null;
  }

  function isMapObject(v){
    return !!(v&&typeof v==='object'&&typeof v.easeTo==='function'&&
      typeof v.getCanvas==='function'&&typeof v.getCenter==='function'&&
      typeof v.getZoom==='function'&&typeof v.getPitch==='function');
  }

  function findMap(){
    if(isMapObject(map))return map;
    const names=['map','mainMap','aeronavMap','mapInstance','mapa'];
    for(const k of names){
      try{if(isMapObject(window[k])){map=window[k];return map;}}catch(_){}
    }
    try{
      for(const k of Object.getOwnPropertyNames(window)){
        let v;try{v=window[k];}catch(_){continue;}
        if(isMapObject(v)){map=v;return map;}
      }
    }catch(_){}
    return null;
  }

  function ensureStyles(){
    if($('#aeronavGpsViewStyles'))return;
    const s=document.createElement('style');
    s.id='aeronavGpsViewStyles';
    s.textContent=`
      .aeronav-view-active{box-shadow:inset 0 0 0 2px rgba(255,255,255,.42),0 0 18px rgba(40,207,255,.22)!important}
      #aeronavFlightHud{position:absolute;inset:0;z-index:12;pointer-events:none;font-family:system-ui,-apple-system,sans-serif;color:#fff}
      .aeronavFlightTop{position:absolute;top:10px;left:10px;right:10px;display:grid;grid-template-columns:1.15fr .8fr .8fr 1.5fr;gap:7px}
      .aeronavHudCell{background:rgba(1,18,32,.83);border:1px solid rgba(69,185,235,.58);border-radius:12px;padding:8px 9px;min-width:0;box-shadow:0 6px 18px rgba(0,0,0,.28)}
      .aeronavHudK{font-size:9px;font-weight:800;letter-spacing:.08em;color:#8cdcff;white-space:nowrap}
      .aeronavHudV{font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
      .aeronavFlightCompass{position:absolute;right:14px;top:86px;width:84px;height:84px;border-radius:50%;background:rgba(1,18,32,.88);border:2px solid rgba(132,222,255,.82);box-shadow:0 8px 24px rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center}
      .aeronavFlightCompass:before{content:'N';position:absolute;top:5px;font-size:10px;font-weight:900;color:#9fe3ff}
      .aeronavFlightCompass .deg{font-size:22px;font-weight:900}
      .aeronavFlightCompass .hdg{position:absolute;bottom:9px;font-size:9px;font-weight:800;color:#9edaf2}
      #aeronavRearAircraft{position:absolute;left:50%;top:66%;transform:translate(-50%,-50%);width:min(44vw,320px);filter:drop-shadow(0 12px 12px rgba(0,0,0,.55))}
      .aeronavFlightBottom{position:absolute;left:8px;right:8px;bottom:10px;display:grid;grid-template-columns:repeat(5,1fr);gap:5px}
      .aeronavFlightBottom .aeronavHudCell{text-align:center;padding:7px 5px}
      .aeronavFlightBottom .aeronavHudV{font-size:13px}
      #aeronavViewBadge{position:absolute;left:12px;top:88px;background:rgba(1,18,32,.86);border:1px solid rgba(69,185,235,.58);border-radius:999px;padding:7px 10px;color:#8fe2ff;font:800 10px system-ui,-apple-system,sans-serif;letter-spacing:.08em;z-index:13;pointer-events:none}
      @media(max-width:620px){
        .aeronavFlightTop{grid-template-columns:1fr 1fr;right:105px}
        .aeronavFlightTop .aeronavHudCell:nth-child(4){grid-column:1/-1}
        .aeronavFlightCompass{top:12px;width:78px;height:78px}
        #aeronavRearAircraft{width:min(58vw,280px);top:67%}
        .aeronavFlightBottom{grid-template-columns:repeat(3,1fr)}
        .aeronavFlightBottom .aeronavHudCell:nth-child(4),.aeronavFlightBottom .aeronavHudCell:nth-child(5){display:none}
      }
    `;
    document.head.appendChild(s);
  }

  function mapHost(){
    const m=findMap();
    const canvas=m?.getCanvas?.();
    if(!canvas)return null;
    const parent=canvas.parentElement;
    if(parent&&getComputedStyle(parent).position==='static')parent.style.position='relative';
    return parent;
  }

  function planeSvg(){
    return `
    <svg id="aeronavRearAircraft" viewBox="0 0 520 250" aria-hidden="true">
      <defs>
        <linearGradient id="fuse" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset=".72" stop-color="#e8edf1"/>
          <stop offset="1" stop-color="#aeb7bf"/>
        </linearGradient>
        <linearGradient id="redtail" x1="0" x2="1">
          <stop offset="0" stop-color="#9b0000"/>
          <stop offset=".45" stop-color="#ef1e24"/>
          <stop offset="1" stop-color="#ff7c1b"/>
        </linearGradient>
      </defs>
      <ellipse cx="260" cy="215" rx="165" ry="18" fill="rgba(0,0,0,.25)"/>
      <path d="M252 28 C238 62 230 93 228 121 L81 155 12 184 24 195 221 174 224 201 150 218 158 227 242 218 260 236 278 218 362 227 370 218 296 201 299 174 496 195 508 184 439 155 292 121 C290 93 282 62 268 28 Z" fill="url(#fuse)" stroke="#818d96" stroke-width="3"/>
      <path d="M252 31 C245 58 242 82 242 110 L260 103 278 110 C278 82 275 58 268 31 L260 7 Z" fill="url(#redtail)"/>
      <path d="M227 122 L81 155 12 184 24 195 221 174 Z" fill="#f7fafc" opacity=".97"/>
      <path d="M293 122 L439 155 508 184 496 195 299 174 Z" fill="#f7fafc" opacity=".97"/>
      <path d="M253 49 C256 80 257 125 257 215" fill="none" stroke="#e71920" stroke-width="9" opacity=".9"/>
      <path d="M267 49 C264 80 263 125 263 215" fill="none" stroke="#ff7b16" stroke-width="5" opacity=".82"/>
      <ellipse cx="188" cy="166" rx="24" ry="16" fill="#303a42"/><ellipse cx="332" cy="166" rx="24" ry="16" fill="#303a42"/>
      <ellipse cx="188" cy="166" rx="15" ry="10" fill="#10171b"/><ellipse cx="332" cy="166" rx="15" ry="10" fill="#10171b"/>
      <text x="343" y="152" fill="#bf1017" font-size="16" font-weight="900" transform="rotate(6 343 152)">TAAG</text>
    </svg>`;
  }

  function ensureHud(){
    const host=mapHost();
    if(!host)return null;
    let hud=$('#aeronavFlightHud');
    if(hud&&hud.parentElement!==host)hud.remove();
    hud=$('#aeronavFlightHud');
    if(!hud){
      hud=document.createElement('div');
      hud.id='aeronavFlightHud';
      hud.innerHTML=`
        <div class="aeronavFlightTop">
          <div class="aeronavHudCell"><div class="aeronavHudK">AERONAVE</div><div class="aeronavHudV" id="aeronavHudAircraft">D2-TAK · TAAG</div></div>
          <div class="aeronavHudCell"><div class="aeronavHudK">ALTITUDE</div><div class="aeronavHudV" id="aeronavHudAlt">—</div></div>
          <div class="aeronavHudCell"><div class="aeronavHudK">V/S</div><div class="aeronavHudV" id="aeronavHudVs">—</div></div>
          <div class="aeronavHudCell"><div class="aeronavHudK">ROTA</div><div class="aeronavHudV" id="aeronavHudRoute">— → —</div></div>
        </div>
        <div class="aeronavFlightCompass"><div class="deg" id="aeronavHudHdg">000°</div><div class="hdg">HDG</div></div>
        ${planeSvg()}
        <div class="aeronavFlightBottom">
          <div class="aeronavHudCell"><div class="aeronavHudK">GROUND SPEED</div><div class="aeronavHudV" id="aeronavHudGs">—</div></div>
          <div class="aeronavHudCell"><div class="aeronavHudK">TRUE AIRSPEED</div><div class="aeronavHudV" id="aeronavHudTas">—</div></div>
          <div class="aeronavHudCell"><div class="aeronavHudK">DISTÂNCIA</div><div class="aeronavHudV" id="aeronavHudDtg">—</div></div>
          <div class="aeronavHudCell"><div class="aeronavHudK">TEMPO RESTANTE</div><div class="aeronavHudV" id="aeronavHudEte">—</div></div>
          <div class="aeronavHudCell"><div class="aeronavHudK">ETA</div><div class="aeronavHudV" id="aeronavHudEta">—</div></div>
        </div>`;
      host.appendChild(hud);
    }
    return hud;
  }

  function ensureViewBadge(){
    const host=mapHost();if(!host)return null;
    let b=$('#aeronavViewBadge');
    if(!b){b=document.createElement('div');b.id='aeronavViewBadge';host.appendChild(b);}
    return b;
  }

  function firstValue(labels){
    for(const el of all('*')){
      if(!labels.includes(upper(text(el))))continue;
      const root=el.parentElement;
      if(!root)continue;
      const vals=[...root.querySelectorAll('div,span,strong,b,p')].filter(x=>x!==el);
      const v=vals.map(text).find(x=>x&&x!=='—'&&x!==labels[0]);
      if(v)return v;
    }
    return '—';
  }

  function routePair(){
    const body=upper(document.body?.innerText||'');
    const matches=[...(body.matchAll(/\b[A-Z]{4}\b/g))].map(x=>x[0]);
    const stop=new Set(['CASA','ROTA','MAPA','MAIS','DADOS','VOOS','CARRO','FOLGA','METAR','HOME','WORK']);
    const list=[...new Set(matches.filter(x=>!stop.has(x)))];
    return list.length>=2?list[0]+' → '+list[list.length-1]:'— → —';
  }

  function aircraftLabel(){
    const body=upper(document.body?.innerText||'');
    const reg=body.match(/\bD2-[A-Z0-9]{3}\b/);
    if(reg)return reg[0]+' · TAAG';
    return 'D2-TAK · TAAG';
  }

  function updateHud(){
    if(window.__AERONAV_COCKPIT_LITE__||mode!=='flight')return;
    ensureHud();

    const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
    set('#aeronavHudAircraft',aircraftLabel());
    set('#aeronavHudAlt',firstValue(['ALTITUDE']));
    set('#aeronavHudVs',firstValue(['RATE OF CLIMB/DESCENT','VERTICAL SPEED','V/S','VS']));
    set('#aeronavHudRoute',routePair());
    set('#aeronavHudGs',firstValue(['GROUND SPEED','GROUNDSPEED','GS']));
    set('#aeronavHudTas',firstValue(['TRUE AIRSPEED','TAS']));
    set('#aeronavHudDtg',firstValue(['DTG','DISTÂNCIA','DISTANCIA']));
    set('#aeronavHudEte',firstValue(['ETE','TEMPO RESTANTE']));
    set('#aeronavHudEta',firstValue(['ETA','ETA (ZULU)']));

    const hdg=Math.round((lastHeading||0)+360)%360;
    set('#aeronavHudHdg',String(hdg).padStart(3,'0')+'°');
  }

  function setButtons(){
    const pairs=[[findButton('VOO'),'flight'],[findButton('CARRO'),'car'],[findButton('A PÉ')||findButton('A PE'),'walk']];
    for(const [b,m] of pairs){
      if(!b)continue;
      b.classList.toggle('aeronav-view-active',m===mode);
      if(b.dataset.aeronavViewBound!=='1'){
        b.dataset.aeronavViewBound='1';
        b.addEventListener('click',()=>{
          mode=m;
          try{localStorage.setItem(KEY,mode);}catch(_){}
          setButtons();
          renderMode(true);
        },true);
      }
    }
  }

  function hookMapInteractions(m){
    if(!m||hookedMap===m)return;
    hookedMap=m;
    for(const ev of ['dragstart','zoomstart','rotatestart','pitchstart']){
      try{m.on(ev,()=>{lastUserMapInteraction=Date.now();});}catch(_){}
    }
  }

  function cameraForMode(force=false){
    if(mode==='flight'&&window.__AERONAV_FLIGHT_CAMERA_DIRECTOR_ACTIVE__)return;
    const m=findMap();if(!m)return;
    hookMapInteractions(m);

    if(!force&&Date.now()-lastUserMapInteraction<9000)return;

    const center=lastPos?[lastPos.lng,lastPos.lat]:m.getCenter();
    let target;

    if(mode==='flight'){
      const zoom=Math.min(Math.max(Number(m.getZoom?.()||5),5.2),8.6);
      target={center,zoom,pitch:62,bearing:lastHeading||Number(m.getBearing?.()||0),duration:850,padding:{top:70,bottom:150,left:10,right:10}};
    }else if(mode==='car'){
      const zoom=Math.max(Number(m.getZoom?.()||14),15.5);
      target={center,zoom:Math.min(18,zoom),pitch:58,bearing:lastHeading||Number(m.getBearing?.()||0),duration:650,padding:{top:60,bottom:170,left:10,right:10}};
    }else{
      const zoom=Math.max(Number(m.getZoom?.()||15),17.2);
      target={center,zoom:Math.min(19,zoom),pitch:42,bearing:lastHeading||Number(m.getBearing?.()||0),duration:650,padding:{top:45,bottom:135,left:10,right:10}};
    }

    if(mode==='flight'&&Number.isFinite(window.__AERONAV_COCKPIT_PITCH__)){target.pitch=window.__AERONAV_COCKPIT_PITCH__;target.padding={top:55,bottom:70,left:10,right:10};}
    if(localStorage.getItem('aeronav.map.autozoom')==='0')delete target.zoom;
    try{m.easeTo(target);}catch(_){}
  }

  function renderMode(forceCamera=false){
    ensureStyles();
    setButtons();

    const hud=ensureHud();
    const badge=ensureViewBadge();

    if(mode==='flight'){
      if(hud)hud.style.display='block';
      if(badge){badge.style.display='block';badge.textContent='✈ VOO · AÉREO 3D';}
      updateHud();
    }else if(mode==='car'){
      if(hud)hud.style.display='none';
      if(badge){badge.style.display='block';badge.textContent='🚗 CARRO · TERRESTRE';}
    }else{
      if(hud)hud.style.display='none';
      if(badge){badge.style.display='block';badge.textContent='🚶 A PÉ · TERRESTRE';}
    }

    cameraForMode(forceCamera);
  }

  function onPosition(pos){
    const lat=Number(pos?.coords?.latitude),lng=Number(pos?.coords?.longitude);
    const heading=pos?.coords?.heading==null?NaN:Number(pos.coords.heading);
    if(Number.isFinite(lat)&&Number.isFinite(lng))lastPos={lat,lng};
    if(Number.isFinite(heading)&&heading>=0)lastHeading=heading;
    cameraForMode(false);
    updateHud();
  }

  function startGps(){
    const accept=p=>{if(p?.coords)onPosition(p);};
    if(window.__AERONAV_LAST_GPS__)accept(window.__AERONAV_LAST_GPS__);
    window.addEventListener('aeronav:gps',e=>accept(e.detail),{passive:true});
    if(window.__AERONAV_GPS_OWNER__)return;
    try{navigator.geolocation?.watchPosition(p=>{
      window.__AERONAV_LAST_GPS__=p;
      window.dispatchEvent(new CustomEvent('aeronav:gps',{detail:p}));
    },()=>{},{enableHighAccuracy:true,maximumAge:1500,timeout:15000});}catch(_){}
  }

  function tick(){
    if(tickBusy)return;
    tickBusy=true;
    try{
      findMap();
      setButtons();
      renderMode(false);
      updateHud();
    }finally{
      tickBusy=false;
    }
  }

  function start(){
    ensureStyles();
    setButtons();
    startGps();
    setTimeout(()=>renderMode(true),600);
    setInterval(tick,5000);
    window.addEventListener('pageshow',()=>setTimeout(()=>renderMode(true),350));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>renderMode(true),350);});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
