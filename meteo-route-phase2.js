/* AERONAV RC12.20 — Meteo Visual VOO Phase 2
   Route-weather sampling + animated weather cells along the active flight route.
   This is an informational visualisation of model data, not onboard weather radar.
*/
(()=>{
  'use strict';
  if(window.__AERONAV_METEO_ROUTE_RC1220)return;
  window.__AERONAV_METEO_ROUTE_RC1220=true;

  const path=(location.pathname||'').toLowerCase();
  const role=path.includes('/mathia/')?'mathia':path.includes('/wendler/')?'wendler':'jorge';
  if(role!=='jorge')return;

  const CACHE_KEY='aeronav.meteo.route.phase2.v1';
  const SAMPLE_COUNT=7;
  const REFRESH_MS=15*60*1000;

  let map=null;
  let host=null;
  let canvas=null;
  let ctx=null;
  const PERF_FRAME_MS=125; // RC12.31.2: 8 FPS
  let raf=0;
  let running=false;
  let lastFrame=0;

  let routeCoords=[];
  let routeSignature='';
  let lastFetchAt=0;
  let samples=[];
  let fetchBusy=false;

  const $=s=>document.querySelector(s);
  const all=s=>[...document.querySelectorAll(s)];
  const text=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
  const upper=v=>String(v||'').toUpperCase();

  function isFlightMode(){
    const voo=all('button,[role="button"],a').find(e=>{
      const t=upper(text(e));
      return t==='VOO'||t.endsWith(' VOO')||t.includes('✈ VOO')||t.includes('✈️ VOO');
    });
    if(!voo)return false;
    const aria=String(voo.getAttribute('aria-pressed')||'').toLowerCase();
    const cls=String(voo.className||'').toLowerCase();
    const data=String(voo.dataset?.active||voo.dataset?.selected||'').toLowerCase();
    return aria==='true'||data==='true'||/\b(active|selected|current|on|aeronav-view-active)\b/.test(cls);
  }

  function isMapObject(v){
    return !!(v&&typeof v==='object'&&typeof v.getCanvas==='function'&&
      typeof v.getStyle==='function'&&typeof v.getSource==='function'&&
      typeof v.project==='function');
  }

  function findMap(){
    if(isMapObject(map))return map;
    for(const k of ['map','mainMap','aeronavMap','mapInstance','mapa']){
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

  function ensureStyle(){
    if($('#aeronavRouteWxCss'))return;
    const s=document.createElement('style');
    s.id='aeronavRouteWxCss';
    s.textContent=`
      #aeronavRouteWxCanvas{position:absolute;inset:0;width:100%;height:100%;z-index:10;pointer-events:none}
      #aeronavRouteWxSummary{position:absolute;left:50%;bottom:88px;transform:translateX(-50%);z-index:16;min-width:min(560px,82vw);max-width:90vw;background:rgba(2,21,35,.92);border:1px solid rgba(94,204,245,.65);border-radius:15px;padding:9px 12px;color:#fff;box-shadow:0 10px 28px rgba(0,0,0,.36);pointer-events:none}
      #aeronavRouteWxSummary .rwTitle{font:900 10px system-ui,-apple-system,sans-serif;color:#8fe0ff;letter-spacing:.09em;margin-bottom:6px}
      #aeronavRouteWxSummary .rwGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
      #aeronavRouteWxSummary .rwCell{background:rgba(11,45,65,.72);border-radius:9px;padding:6px 7px;text-align:center}
      #aeronavRouteWxSummary .rwK{font:800 8px system-ui,-apple-system,sans-serif;color:#9dc6d7;letter-spacing:.05em}
      #aeronavRouteWxSummary .rwV{font:900 11px system-ui,-apple-system,sans-serif;margin-top:3px}
      #aeronavRouteWxAlert{margin-top:6px;font:800 10px/1.35 system-ui,-apple-system,sans-serif;color:#f4fbff}
      .routeWxBadge{position:absolute;transform:translate(-50%,-50%);z-index:14;pointer-events:none;background:rgba(2,22,36,.86);border:1px solid rgba(108,214,255,.62);border-radius:10px;padding:4px 6px;color:#e8fbff;font:800 8px system-ui,-apple-system,sans-serif;white-space:nowrap;box-shadow:0 5px 14px rgba(0,0,0,.28)}
      @media(max-width:620px){
        #aeronavRouteWxSummary{bottom:86px;min-width:88vw}
        #aeronavRouteWxSummary .rwGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
    `;
    document.head.appendChild(s);
  }

  function ensureHost(){
    const m=findMap();
    const c=m?.getCanvas?.();
    if(!c)return null;
    const p=c.parentElement;
    if(!p)return null;
    if(getComputedStyle(p).position==='static')p.style.position='relative';
    host=p;
    return p;
  }

  function ensureCanvas(){
    ensureStyle();
    const p=ensureHost();
    if(!p)return false;

    if(!canvas||canvas.parentElement!==p){
      canvas?.remove();
      canvas=document.createElement('canvas');
      canvas.id='aeronavRouteWxCanvas';
      p.appendChild(canvas);
      ctx=canvas.getContext('2d');
    }

    resizeCanvas();
    return true;
  }

  function resizeCanvas(){
    if(!canvas||!host)return;
    const r=host.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio||1,1.25);
    const w=Math.max(1,Math.round(r.width*dpr));
    const h=Math.max(1,Math.round(r.height*dpr));
    if(canvas.width!==w||canvas.height!==h){
      canvas.width=w;canvas.height=h;
      canvas.style.width=r.width+'px';
      canvas.style.height=r.height+'px';
    }
    if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function routeSourceName(id){
    return /(route|rota|direction|navigation|nav[-_]?route|trip|itinerary|journey|flight|airway)/i.test(String(id||''));
  }

  function sourceData(source){
    if(!source)return null;
    try{if(source._data&&typeof source._data==='object')return source._data;}catch(_){}
    try{
      const s=source.serialize?.();
      if(s?.data&&typeof s.data==='object')return s.data;
    }catch(_){}
    return null;
  }

  function lineCoordsFromGeojson(data,out=[]){
    if(!data||out.length>5000)return out;
    const t=data.type;

    if(t==='LineString'&&Array.isArray(data.coordinates)){
      for(const c of data.coordinates){
        if(Array.isArray(c)&&Number.isFinite(Number(c[0]))&&Number.isFinite(Number(c[1]))){
          out.push([Number(c[0]),Number(c[1])]);
        }
      }
      return out;
    }

    if(t==='MultiLineString'&&Array.isArray(data.coordinates)){
      for(const line of data.coordinates){
        lineCoordsFromGeojson({type:'LineString',coordinates:line},out);
      }
      return out;
    }

    if(t==='Feature'){
      lineCoordsFromGeojson(data.geometry,out);
      return out;
    }

    if(t==='FeatureCollection'&&Array.isArray(data.features)){
      for(const f of data.features)lineCoordsFromGeojson(f,out);
    }

    return out;
  }

  function activeRouteCoords(){
    const m=findMap();
    if(!m)return [];

    let best=[];
    let bestScore=-1;

    try{
      const style=m.getStyle?.();
      const ids=Object.keys(style?.sources||{});

      for(const id of ids){
        const src=m.getSource?.(id);
        const data=sourceData(src);
        if(!data)continue;

        const coords=lineCoordsFromGeojson(data,[]);
        if(coords.length<2)continue;

        let score=coords.length;
        if(routeSourceName(id))score+=5000;

        if(score>bestScore){
          best=coords;
          bestScore=score;
        }
      }
    }catch(_){}

    // Fallback: currently active route data kept by the app.
    if(best.length<2){
      const candidates=[];
      try{
        if(typeof state!=='undefined'){
          if(state?.currentRoute)candidates.push(state.currentRoute);
          if(state?.activeRoute)candidates.push(state.activeRoute);
        }
      }catch(_){}
      try{
        if(typeof cfg!=='undefined'){
          if(cfg?.ownRoute)candidates.push(cfg.ownRoute);
          if(cfg?.currentRoute)candidates.push(cfg.currentRoute);
          if(cfg?.activeRoute)candidates.push(cfg.activeRoute);
        }
      }catch(_){}

      for(const c of candidates){
        const coords=lineCoordsFromGeojson(c,[]);
        if(coords.length>best.length)best=coords;
      }
    }

    return best;
  }

  function signature(coords){
    if(!coords.length)return '';
    const first=coords[0],mid=coords[Math.floor(coords.length/2)],last=coords[coords.length-1];
    return [coords.length,first,mid,last].flat().map(v=>Number(v).toFixed(4)).join('|');
  }

  function sampleRoute(coords,count=SAMPLE_COUNT){
    if(coords.length<2)return [];
    if(coords.length<=count)return coords.map(c=>({lng:c[0],lat:c[1]}));

    const out=[];
    for(let i=0;i<count;i++){
      const idx=Math.round(i*(coords.length-1)/(count-1));
      const c=coords[idx];
      out.push({lng:c[0],lat:c[1]});
    }
    return out;
  }

  async function fetchPointWeather(point,index,total){
    const params=new URLSearchParams({
      latitude:String(point.lat),
      longitude:String(point.lng),
      current:'temperature_2m,precipitation,rain,showers,cloud_cover,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit:'kn',
      timezone:'auto'
    });

    const res=await fetch('https://api.open-meteo.com/v1/forecast?'+params.toString(),{cache:'no-store'});
    if(!res.ok)throw new Error('Weather HTTP '+res.status);

    const j=await res.json();
    const c=j?.current||{};

    return {
      ...point,
      index,
      total,
      wind:Number(c.wind_speed_10m)||0,
      windDir:Number(c.wind_direction_10m)||0,
      gust:Number(c.wind_gusts_10m)||0,
      precip:Number(c.precipitation)||0,
      rain:Number(c.rain)||0,
      showers:Number(c.showers)||0,
      cloud:Number(c.cloud_cover)||0,
      code:Number(c.weather_code)||0,
      temp:Number.isFinite(Number(c.temperature_2m))?Number(c.temperature_2m):null,
      time:String(c.time||'')
    };
  }

  async function refreshRouteWeather(force=false){
    if(fetchBusy)return;
    const coords=activeRouteCoords();
    if(coords.length<2){
      routeCoords=[];
      samples=[];
      updateSummary();
      return;
    }

    const sig=signature(coords);
    const changed=sig!==routeSignature;
    routeCoords=coords;
    routeSignature=sig;

    if(!force&&!changed&&Date.now()-lastFetchAt<REFRESH_MS)return;

    fetchBusy=true;
    try{
      const points=sampleRoute(coords,SAMPLE_COUNT);
      const result=[];

      // Sequential requests reduce bursts on mobile networks.
      for(let i=0;i<points.length;i++){
        try{
          result.push(await fetchPointWeather(points[i],i,points.length));
        }catch(_){}
      }

      if(result.length){
        samples=result;
        lastFetchAt=Date.now();

        try{
          localStorage.setItem(CACHE_KEY,JSON.stringify({
            routeSignature,
            samples,
            lastFetchAt
          }));
        }catch(_){}
      }

      updateSummary();
    }finally{
      fetchBusy=false;
    }
  }

  function weatherLabel(code){
    code=Number(code)||0;
    if(code===0)return 'LIMPO';
    if([1,2,3].includes(code))return 'NUVENS';
    if([45,48].includes(code))return 'NEVOEIRO';
    if(code>=51&&code<=67)return 'CHUVA';
    if(code>=80&&code<=82)return 'AGUACEIROS';
    if(code>=95)return 'TROVOADA';
    return 'WX';
  }

  function routeAssessment(){
    if(!samples.length)return {text:'Sem dados de rota',severity:0};

    const thunder=samples.some(s=>s.code>=95);
    const maxPrecip=Math.max(...samples.map(s=>s.precip||0));
    const maxGust=Math.max(...samples.map(s=>s.gust||0));
    const maxCloud=Math.max(...samples.map(s=>s.cloud||0));

    const notes=[];
    let severity=0;

    if(thunder){
      notes.push('trovoada indicada pelo modelo');
      severity=Math.max(severity,3);
    }
    if(maxPrecip>=2){
      notes.push('precipitação ≥ '+maxPrecip.toFixed(1)+' mm/h');
      severity=Math.max(severity,2);
    }else if(maxPrecip>=0.2){
      notes.push('precipitação até '+maxPrecip.toFixed(1)+' mm/h');
      severity=Math.max(severity,1);
    }
    if(maxGust>=30){
      notes.push('rajadas até '+Math.round(maxGust)+' kt');
      severity=Math.max(severity,2);
    }
    if(maxCloud>=85){
      notes.push('cobertura de nuvens até '+Math.round(maxCloud)+'%');
      severity=Math.max(severity,1);
    }

    return {
      severity,
      text:notes.length?notes.join(' · '):'Sem condição significativa pelos limiares da visualização'
    };
  }

  function ensureSummary(){
    const p=ensureHost();
    if(!p)return null;

    let box=$('#aeronavRouteWxSummary');
    if(!box||box.parentElement!==p){
      box?.remove();
      box=document.createElement('div');
      box.id='aeronavRouteWxSummary';
      box.innerHTML=`
        <div class="rwTitle">WX ROUTE · FASE 2</div>
        <div class="rwGrid">
          <div class="rwCell"><div class="rwK">PONTOS</div><div class="rwV" id="rwPoints">—</div></div>
          <div class="rwCell"><div class="rwK">MAX RAIN</div><div class="rwV" id="rwRain">—</div></div>
          <div class="rwCell"><div class="rwK">MAX GUST</div><div class="rwV" id="rwGust">—</div></div>
          <div class="rwCell"><div class="rwK">MAX CLOUD</div><div class="rwV" id="rwCloud">—</div></div>
        </div>
        <div id="aeronavRouteWxAlert">Aguardando rota activa…</div>`;
      p.appendChild(box);
    }
    return box;
  }

  function updateSummary(){
    const box=ensureSummary();
    if(!box)return;

    box.style.display=isFlightMode()?'block':'none';

    const set=(id,val)=>{
      const el=$(id);
      if(el)el.textContent=val;
    };

    if(!samples.length){
      set('#rwPoints','0');
      set('#rwRain','—');
      set('#rwGust','—');
      set('#rwCloud','—');
      set('#aeronavRouteWxAlert',routeCoords.length?'A recolher meteorologia da rota…':'Aguardando rota activa…');
      return;
    }

    set('#rwPoints',String(samples.length));
    set('#rwRain',Math.max(...samples.map(s=>s.precip||0)).toFixed(1)+' mm/h');
    set('#rwGust',Math.round(Math.max(...samples.map(s=>s.gust||0)))+' kt');
    set('#rwCloud',Math.round(Math.max(...samples.map(s=>s.cloud||0)))+'%');

    const a=routeAssessment();
    set('#aeronavRouteWxAlert',a.text);
  }

  function drawCloudCell(g,x,y,s,time){
    if(s.cloud<15)return;
    const p=Math.max(0,Math.min(1,s.cloud/100));
    const wobble=Math.sin(time*.00035+s.index)*6;

    g.save();
    g.globalAlpha=.05+.22*p;

    const grad=g.createRadialGradient(x,y+wobble,4,x,y+wobble,55+70*p);
    grad.addColorStop(0,'rgba(238,247,255,.95)');
    grad.addColorStop(1,'rgba(222,238,248,0)');

    g.fillStyle=grad;
    g.beginPath();
    g.ellipse(x,y+wobble,55+65*p,23+34*p,0,0,Math.PI*2);
    g.fill();
    g.restore();
  }

  function drawRainCell(g,x,y,s,time){
    const amount=Math.max(s.precip||0,s.rain||0,s.showers||0);
    if(amount<0.05)return;

    const intensity=Math.min(1,amount/8);
    const count=Math.round(5+intensity*20);

    g.save();
    g.strokeStyle='rgba(70,171,255,.78)';
    g.lineWidth=1+intensity*1.3;

    for(let i=0;i<count;i++){
      const phase=(time*.18+i*19+s.index*31)%120;
      const dx=(i%7-3)*7;
      const yy=y-35+phase*.6;

      g.globalAlpha=.25+.55*intensity;
      g.beginPath();
      g.moveTo(x+dx,yy);
      g.lineTo(x+dx-4,yy+11+intensity*8);
      g.stroke();
    }
    g.restore();
  }

  function drawWindCell(g,x,y,s,time){
    if(s.wind<1)return;

    const angle=(s.windDir+180)*Math.PI/180;
    const dx=Math.sin(angle),dy=-Math.cos(angle);
    const count=Math.min(10,3+Math.round(s.wind/8));

    g.save();
    g.strokeStyle='rgba(112,222,255,.85)';
    g.lineWidth=1.4;

    for(let i=0;i<count;i++){
      const phase=((time*.03+i*33+s.index*21)%90)-45;
      const px=x+dx*phase+(i-count/2)*(-dy)*4;
      const py=y+dy*phase+(i-count/2)*(dx)*4;
      const len=10+Math.min(20,s.wind*.35);

      g.globalAlpha=.35+.45*(i/count);
      g.beginPath();
      g.moveTo(px,py);
      g.lineTo(px-dx*len,py-dy*len);
      g.stroke();
    }

    g.restore();
  }

  function drawThunder(g,x,y,s,time){
    if(s.code<95)return;
    const flash=Math.sin(time*.013+s.index*2.4);
    if(flash<.91)return;

    g.save();
    g.strokeStyle='rgba(255,245,173,.9)';
    g.lineWidth=2;
    g.beginPath();
    g.moveTo(x,y-28);
    g.lineTo(x-7,y-10);
    g.lineTo(x+2,y-10);
    g.lineTo(x-6,y+12);
    g.stroke();
    g.restore();
  }

  function removeBadges(){
    for(const b of all('.routeWxBadge'))b.remove();
  }

  function drawBadges(projected){
    removeBadges();
    if(!host||!isFlightMode())return;

    for(const item of projected){
      const s=item.sample;
      // Keep only a few labels so map remains readable.
      if(s.index!==0&&s.index!==s.total-1&&s.index%2!==1)continue;

      const b=document.createElement('div');
      b.className='routeWxBadge';
      b.style.left=item.x+'px';
      b.style.top=(item.y-42)+'px';
      b.textContent=weatherLabel(s.code)+' · '+Math.round(s.wind)+'KT · '+Math.round(s.cloud)+'%';
      host.appendChild(b);
    }
  }

  let lastBadgeAt=0;

  function frame(now){
    if(!running)return;
    if(document.hidden){running=false;raf=0;return;}
    if(!lastFrame)lastFrame=now;
    lastFrame=now;

    resizeCanvas();

    const rect=host?.getBoundingClientRect();
    const m=findMap();

    if(ctx&&rect&&m){
      ctx.clearRect(0,0,rect.width,rect.height);

      const projected=[];

      for(const s of samples){
        let p;
        try{p=m.project([s.lng,s.lat]);}catch(_){continue;}
        if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;

        projected.push({x:p.x,y:p.y,sample:s});

        drawCloudCell(ctx,p.x,p.y,s,now);
        drawRainCell(ctx,p.x,p.y,s,now);
        drawWindCell(ctx,p.x,p.y,s,now);
        drawThunder(ctx,p.x,p.y,s,now);
      }

      if(now-lastBadgeAt>1000){
        drawBadges(projected);
        lastBadgeAt=now;
      }
    }

    raf=setTimeout(()=>frame(performance.now()),PERF_FRAME_MS);
  }

  function startAnimation(){
    if(running)return;
    running=true;
    lastFrame=0;
    raf=setTimeout(()=>frame(performance.now()),PERF_FRAME_MS);
  }

  function stopAnimation(){
    running=false;
    if(raf)clearTimeout(raf);
    raf=0;
    removeBadges();
    if(ctx&&host){
      const r=host.getBoundingClientRect();
      ctx.clearRect(0,0,r.width,r.height);
    }
  }

  function restoreCache(){
    try{
      const c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(c?.samples&&Array.isArray(c.samples)){
        samples=c.samples;
        routeSignature=String(c.routeSignature||'');
        lastFetchAt=Number(c.lastFetchAt)||0;
      }
    }catch(_){}
  }

  function tick(){
    ensureCanvas();
    updateSummary();

    if(isFlightMode()){
      startAnimation();
      refreshRouteWeather(false);
    }else{
      stopAnimation();
    }
  }

  function start(){
    restoreCache();
    ensureStyle();
    ensureCanvas();
    ensureSummary();
    tick();

    setInterval(tick,10000);
    window.addEventListener('resize',resizeCanvas);
    window.addEventListener('pageshow',()=>setTimeout(()=>refreshRouteWeather(true),400));
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden)setTimeout(()=>refreshRouteWeather(false),400);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
