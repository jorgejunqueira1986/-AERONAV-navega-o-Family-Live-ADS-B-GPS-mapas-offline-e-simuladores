/* AERONAV RC12.30 — Meteo Altitude Phase 3
   Wind aloft + estimated turbulence/icing/convection potential along active route.
   INFORMATIONAL ONLY: model-derived visualisation, not operational weather radar/SIGMET.
*/
(()=>{
  'use strict';
  if(window.__AERONAV_METEO_ALTITUDE_RC1230)return;
  window.__AERONAV_METEO_ALTITUDE_RC1230=true;

  const path=(location.pathname||'').toLowerCase();
  const role=path.includes('/mathia/')?'mathia':path.includes('/wendler/')?'wendler':'jorge';
  if(role!=='jorge')return;

  const PREF='aeronav.meteo.phase3.level.v1';
  const CACHE='aeronav.meteo.phase3.cache.v1';
  const REFRESH_MS=20*60*1000;
  const SAMPLE_COUNT=5;

  const LEVELS=[
    {key:'AUTO',fl:null,p:null},
    {key:'FL050',fl:50,p:850},
    {key:'FL100',fl:100,p:700},
    {key:'FL180',fl:180,p:500},
    {key:'FL240',fl:240,p:400},
    {key:'FL300',fl:300,p:300},
    {key:'FL340',fl:340,p:250},
    {key:'FL390',fl:390,p:200}
  ];
  const PRESSURES=[850,700,500,400,300,250,200];

  let levelKey=localStorage.getItem(PREF)||'AUTO';
  if(!LEVELS.some(x=>x.key===levelKey))levelKey='AUTO';

  let map=null,host=null,canvas=null,ctx=null;
  let routeCoords=[],routeSig='',samples=[];
  let lastFetchAt=0,fetchBusy=false;
  const PERF_FRAME_MS=125; // RC12.31.2: 8 FPS
  let raf=0,running=false,lastFrame=0;
  let gpsAltitudeFt=null;
  let lastAutoP=250;

  const $=s=>document.querySelector(s);
  const all=s=>[...document.querySelectorAll(s)];
  const tx=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
  const up=v=>String(v||'').toUpperCase();

  function isFlightMode(){
    const voo=all('button,[role="button"],a').find(e=>{
      const t=up(tx(e));
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
    if($('#aeronavPhase3Css'))return;
    const s=document.createElement('style');
    s.id='aeronavPhase3Css';
    s.textContent=`
      #aeronavPhase3Canvas{position:absolute;inset:0;width:100%;height:100%;z-index:11;pointer-events:none}
      #aeronavPhase3Control{position:absolute;left:12px;top:318px;z-index:18;pointer-events:auto}
      #aeronavPhase3Level{border:1px solid rgba(133,219,255,.72);background:rgba(2,28,45,.94);color:#fff;border-radius:12px;padding:9px 10px;font:900 10px system-ui,-apple-system,sans-serif;letter-spacing:.05em;box-shadow:0 7px 20px rgba(0,0,0,.32)}
      #aeronavPhase3Panel{position:absolute;right:12px;bottom:170px;z-index:18;width:min(250px,48vw);background:rgba(2,20,34,.93);border:1px solid rgba(102,210,250,.68);border-radius:14px;padding:10px;color:#fff;box-shadow:0 10px 28px rgba(0,0,0,.38);pointer-events:none}
      #aeronavPhase3Panel .p3Title{font:900 10px system-ui,-apple-system,sans-serif;color:#92e2ff;letter-spacing:.08em;margin-bottom:7px}
      #aeronavPhase3Panel .p3Level{font:950 18px system-ui,-apple-system,sans-serif;margin-bottom:7px}
      #aeronavPhase3Panel .p3Row{display:flex;justify-content:space-between;gap:8px;font:750 10px/1.5 system-ui,-apple-system,sans-serif}
      #aeronavPhase3Panel .p3Row span{color:#9dc6d8}
      #aeronavPhase3Panel .p3Risks{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:8px}
      .p3Risk{border-radius:8px;background:rgba(14,47,65,.76);padding:6px 4px;text-align:center}
      .p3Risk .k{font:800 7px system-ui,-apple-system,sans-serif;color:#9dc6d8}
      .p3Risk .v{font:950 10px system-ui,-apple-system,sans-serif;margin-top:2px}
      #aeronavPhase3Panel .p3Foot{font:700 8px/1.3 system-ui,-apple-system,sans-serif;color:#809eaa;margin-top:7px}
      .p3Badge{position:absolute;z-index:17;transform:translate(-50%,-50%);pointer-events:none;background:rgba(2,22,36,.89);border:1px solid rgba(115,219,255,.66);border-radius:9px;padding:4px 6px;color:#f1fbff;font:850 8px system-ui,-apple-system,sans-serif;white-space:nowrap;box-shadow:0 5px 14px rgba(0,0,0,.3)}
      @media(max-width:620px){
        #aeronavPhase3Control{left:8px;top:330px}
        #aeronavPhase3Panel{right:8px;bottom:176px;width:min(232px,52vw)}
      }
    `;
    document.head.appendChild(s);
  }

  function ensureHost(){
    const m=findMap(),c=m?.getCanvas?.();
    if(!c)return null;
    const p=c.parentElement;
    if(!p)return null;
    if(getComputedStyle(p).position==='static')p.style.position='relative';
    host=p;
    return p;
  }

  function ensureUi(){
    ensureStyle();
    const p=ensureHost();
    if(!p)return false;

    if(!canvas||canvas.parentElement!==p){
      canvas?.remove();
      canvas=document.createElement('canvas');
      canvas.id='aeronavPhase3Canvas';
      p.appendChild(canvas);
      ctx=canvas.getContext('2d');
    }
    resizeCanvas();

    let ctl=$('#aeronavPhase3Control');
    if(!ctl||ctl.parentElement!==p){
      ctl?.remove();
      ctl=document.createElement('div');
      ctl.id='aeronavPhase3Control';
      ctl.innerHTML='<button id="aeronavPhase3Level">FL WX · AUTO</button>';
      p.appendChild(ctl);
      $('#aeronavPhase3Level')?.addEventListener('click',cycleLevel);
    }

    let panel=$('#aeronavPhase3Panel');
    if(!panel||panel.parentElement!==p){
      panel?.remove();
      panel=document.createElement('div');
      panel.id='aeronavPhase3Panel';
      panel.innerHTML=`
        <div class="p3Title">WX ALTITUDE · FASE 3</div>
        <div class="p3Level" id="p3LevelText">AUTO</div>
        <div class="p3Row"><span>Vento em altitude</span><strong id="p3Wind">—</strong></div>
        <div class="p3Row"><span>Temperatura</span><strong id="p3Temp">—</strong></div>
        <div class="p3Row"><span>Humidade</span><strong id="p3Rh">—</strong></div>
        <div class="p3Row"><span>Freezing level</span><strong id="p3Freeze">—</strong></div>
        <div class="p3Row"><span>CAPE</span><strong id="p3Cape">—</strong></div>
        <div class="p3Row"><span>Forecast</span><strong id="p3Forecast">—</strong></div>
        <div class="p3Risks">
          <div class="p3Risk"><div class="k">TURB POT.</div><div class="v" id="p3Turb">—</div></div>
          <div class="p3Risk"><div class="k">ICING POT.</div><div class="v" id="p3Icing">—</div></div>
          <div class="p3Risk"><div class="k">CONVECT.</div><div class="v" id="p3Conv">—</div></div>
        </div>
        <div class="p3Foot">Estimativas de modelo. Não substitui SIGMET, METAR/TAF, radar de bordo ou despacho operacional.</div>`;
      p.appendChild(panel);
    }

    updateControl();
    updatePanel();
    updateVisibility();
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

  function cycleLevel(){
    const i=LEVELS.findIndex(x=>x.key===levelKey);
    levelKey=LEVELS[(i+1)%LEVELS.length].key;
    try{localStorage.setItem(PREF,levelKey);}catch(_){}
    updateControl();
    lastFetchAt=0;
    refresh(true);
  }

  function currentAltitudeFt(){
    // First prefer app telemetry values.
    for(const label of ['ALTITUDE','ALT']){
      for(const el of all('div,span,strong,b,p')){
        if(up(tx(el))!==label)continue;
        const root=el.parentElement;
        if(!root)continue;
        const vals=[...root.querySelectorAll('div,span,strong,b,p')].filter(x=>x!==el).map(tx);
        for(const v of vals){
          const fl=v.match(/\bFL\s*(\d{2,3})\b/i);
          if(fl)return Number(fl[1])*100;
          const ft=v.match(/(-?[\d,.]+)\s*(?:FT|FEET|PÉS|PES)\b/i);
          if(ft){
            const n=Number(ft[1].replace(/,/g,''));
            if(Number.isFinite(n))return n;
          }
        }
      }
    }
    if(Number.isFinite(gpsAltitudeFt))return gpsAltitudeFt;
    return null;
  }

  function nearestPressureForFt(ft){
    if(!Number.isFinite(ft))return lastAutoP||250;
    const approx=[
      {p:850,ft:5000},
      {p:700,ft:10000},
      {p:500,ft:18000},
      {p:400,ft:24000},
      {p:300,ft:30000},
      {p:250,ft:34000},
      {p:200,ft:39000}
    ];
    approx.sort((a,b)=>Math.abs(a.ft-ft)-Math.abs(b.ft-ft));
    lastAutoP=approx[0].p;
    return lastAutoP;
  }

  function selectedPressure(){
    const cfg=LEVELS.find(x=>x.key===levelKey)||LEVELS[0];
    if(cfg.p)return cfg.p;
    return nearestPressureForFt(currentAltitudeFt());
  }

  function pressureLabel(p){
    const item=LEVELS.find(x=>x.p===p);
    return (levelKey==='AUTO'?'AUTO · ':'')+(item?.key||p+' hPa')+' · '+p+' hPa';
  }

  function updateControl(){
    const b=$('#aeronavPhase3Level');
    if(b)b.textContent='FL WX · '+levelKey;
  }

  function updateVisibility(){
    const show=isFlightMode();
    for(const id of ['#aeronavPhase3Control','#aeronavPhase3Panel','#aeronavPhase3Canvas']){
      const e=$(id);
      if(e)e.style.display=show?'block':'none';
    }
    if(show)startAnimation();else stopAnimation();
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

  function lineCoords(data,out=[]){
    if(!data||out.length>5000)return out;
    if(data.type==='LineString'&&Array.isArray(data.coordinates)){
      for(const c of data.coordinates){
        if(Array.isArray(c)&&Number.isFinite(Number(c[0]))&&Number.isFinite(Number(c[1]))){
          out.push([Number(c[0]),Number(c[1])]);
        }
      }
    }else if(data.type==='MultiLineString'&&Array.isArray(data.coordinates)){
      for(const line of data.coordinates)lineCoords({type:'LineString',coordinates:line},out);
    }else if(data.type==='Feature'){
      lineCoords(data.geometry,out);
    }else if(data.type==='FeatureCollection'&&Array.isArray(data.features)){
      for(const f of data.features)lineCoords(f,out);
    }
    return out;
  }

  function activeRoute(){
    const m=findMap();
    if(!m)return [];
    let best=[],bestScore=-1;
    try{
      const ids=Object.keys(m.getStyle?.()?.sources||{});
      for(const id of ids){
        const data=sourceData(m.getSource?.(id));
        if(!data)continue;
        const c=lineCoords(data,[]);
        if(c.length<2)continue;
        let score=c.length+(routeSourceName(id)?5000:0);
        if(score>bestScore){bestScore=score;best=c;}
      }
    }catch(_){}
    return best;
  }

  function signature(coords,p){
    if(!coords.length)return '';
    const a=coords[0],m=coords[Math.floor(coords.length/2)],z=coords[coords.length-1];
    return [p,coords.length,a,m,z].flat().map(v=>Number(v).toFixed(4)).join('|');
  }

  function sampleRoute(coords,count=SAMPLE_COUNT){
    if(coords.length<2)return [];
    const out=[];
    for(let i=0;i<count;i++){
      const idx=Math.round(i*(coords.length-1)/(count-1));
      const c=coords[idx];
      out.push({lng:c[0],lat:c[1],fraction:i/(count-1),index:i,total:count});
    }
    return out;
  }

  function findETEHours(){
    const labels=['ETE','TEMPO RESTANTE'];
    for(const el of all('div,span,strong,b,p')){
      if(!labels.includes(up(tx(el))))continue;
      const root=el.parentElement;
      if(!root)continue;
      const vals=[...root.querySelectorAll('div,span,strong,b,p')].filter(x=>x!==el).map(tx);
      for(const v of vals){
        const hm=v.match(/\b(\d{1,2}):(\d{2})\b/);
        if(hm)return Number(hm[1])+Number(hm[2])/60;
        const hrs=v.match(/([\d.]+)\s*(?:H|HR|HRS|HORAS?)\b/i);
        if(hrs)return Number(hrs[1]);
      }
    }
    return null;
  }

  function adjacentPressures(p){
    const idx=PRESSURES.indexOf(p);
    const low=PRESSURES[Math.max(0,idx-1)];
    const high=PRESSURES[Math.min(PRESSURES.length-1,idx+1)];
    return [...new Set([low,p,high])];
  }

  function varsForPressure(p){
    const ps=adjacentPressures(p);
    const vars=['cape','freezing_level_height','precipitation','weather_code'];
    for(const q of ps){
      vars.push(
        `temperature_${q}hPa`,
        `relative_humidity_${q}hPa`,
        `cloud_cover_${q}hPa`,
        `wind_speed_${q}hPa`,
        `wind_direction_${q}hPa`,
        `geopotential_height_${q}hPa`
      );
    }
    return vars;
  }

  function nearestTimeIndex(times,targetMs){
    let best=0,bd=Infinity;
    for(let i=0;i<times.length;i++){
      const t=Date.parse(times[i]+'Z');
      if(!Number.isFinite(t))continue;
      const d=Math.abs(t-targetMs);
      if(d<bd){bd=d;best=i;}
    }
    return best;
  }

  function get(arr,i){
    const v=Number(arr?.[i]);
    return Number.isFinite(v)?v:null;
  }

  function uv(speed,dirDeg){
    if(!Number.isFinite(speed)||!Number.isFinite(dirDeg))return {u:0,v:0};
    const r=dirDeg*Math.PI/180;
    return {u:-speed*Math.sin(r),v:-speed*Math.cos(r)};
  }

  function vectorDiff(a,b){
    const du=a.u-b.u,dv=a.v-b.v;
    return Math.sqrt(du*du+dv*dv);
  }

  function riskLabel(n){
    return n>=3?'HIGH':n>=2?'MOD':n>=1?'LOW':'MIN';
  }

  function evaluateRisk(point,p,ps){
    const t=point[`temperature_${p}hPa`];
    const rh=point[`relative_humidity_${p}hPa`];
    const cc=point[`cloud_cover_${p}hPa`];

    // Icing potential heuristic: sub-zero/moist/cloudy environment.
    let icing=0;
    if(Number.isFinite(t)&&Number.isFinite(rh)){
      if(t<=2&&t>=-20&&rh>=75)icing=1;
      if(t<=0&&t>=-18&&rh>=85&&(cc||0)>=50)icing=2;
      if(t<=-2&&t>=-15&&rh>=92&&(cc||0)>=70)icing=3;
    }

    // Turbulence potential heuristic from vector wind shear around selected pressure level.
    let shear=0;
    if(ps.length>=2){
      const p0=ps[0],p1=ps[ps.length-1];
      const a=uv(point[`wind_speed_${p0}hPa`],point[`wind_direction_${p0}hPa`]);
      const b=uv(point[`wind_speed_${p1}hPa`],point[`wind_direction_${p1}hPa`]);
      shear=vectorDiff(a,b);
    }
    let turb=shear>=35?3:shear>=22?2:shear>=12?1:0;

    // Convection from CAPE and thunderstorm weather code.
    const cape=Number(point.cape)||0;
    const code=Number(point.weather_code)||0;
    let conv=code>=95?3:cape>=1800?3:cape>=800?2:cape>=250?1:0;
    if(conv>=2)turb=Math.max(turb,2);

    return {icing,turb,conv,shear};
  }

  async function fetchPoint(pt,p,eteH){
    const vars=varsForPressure(p);
    const params=new URLSearchParams({
      latitude:String(pt.lat),
      longitude:String(pt.lng),
      hourly:vars.join(','),
      wind_speed_unit:'kn',
      timezone:'UTC',
      forecast_hours:'24'
    });

    const res=await fetch('https://api.open-meteo.com/v1/forecast?'+params.toString(),{cache:'no-store'});
    if(!res.ok)throw new Error('WX altitude HTTP '+res.status);
    const j=await res.json();
    const h=j?.hourly||{};
    const times=Array.isArray(h.time)?h.time:[];
    if(!times.length)throw new Error('No hourly weather');

    const target=Date.now()+(Number.isFinite(eteH)?eteH*pt.fraction*3600000:0);
    const i=nearestTimeIndex(times,target);

    const out={...pt,forecastTime:times[i],pressure:p};
    for(const v of vars)out[v]=get(h[v],i);

    const ps=adjacentPressures(p);
    out.risk=evaluateRisk(out,p,ps);
    return out;
  }

  async function refresh(force=false){
    if(fetchBusy)return;
    const coords=activeRoute();
    const p=selectedPressure();

    if(coords.length<2){
      routeCoords=[];
      samples=[];
      updatePanel();
      return;
    }

    const sig=signature(coords,p);
    const changed=sig!==routeSig;
    routeCoords=coords;
    routeSig=sig;

    if(!force&&!changed&&Date.now()-lastFetchAt<REFRESH_MS)return;

    fetchBusy=true;
    try{
      const pts=sampleRoute(coords,SAMPLE_COUNT);
      const ete=findETEHours();
      const out=[];

      for(const pt of pts){
        try{out.push(await fetchPoint(pt,p,ete));}catch(_){}
      }

      if(out.length){
        samples=out;
        lastFetchAt=Date.now();
        try{
          localStorage.setItem(CACHE,JSON.stringify({levelKey,routeSig,samples,lastFetchAt}));
        }catch(_){}
      }
      updatePanel();
    }finally{
      fetchBusy=false;
    }
  }

  function maxima(){
    if(!samples.length)return null;
    const p=selectedPressure();
    const winds=samples.map(s=>s[`wind_speed_${p}hPa`]||0);
    const temps=samples.map(s=>s[`temperature_${p}hPa`]).filter(Number.isFinite);
    const rhs=samples.map(s=>s[`relative_humidity_${p}hPa`]).filter(Number.isFinite);
    const freezes=samples.map(s=>s.freezing_level_height).filter(Number.isFinite);
    const capes=samples.map(s=>s.cape||0);
    return {
      wind:Math.max(...winds),
      temp:temps.length?temps[Math.floor(temps.length/2)]:null,
      rh:rhs.length?Math.max(...rhs):null,
      freeze:freezes.length?Math.round(freezes.reduce((a,b)=>a+b,0)/freezes.length):null,
      cape:Math.max(...capes),
      turb:Math.max(...samples.map(s=>s.risk?.turb||0)),
      icing:Math.max(...samples.map(s=>s.risk?.icing||0)),
      conv:Math.max(...samples.map(s=>s.risk?.conv||0)),
      time:samples[Math.floor(samples.length/2)]?.forecastTime||''
    };
  }

  function updatePanel(){
    updateControl();
    const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
    const p=selectedPressure();
    set('#p3LevelText',pressureLabel(p));

    const m=maxima();
    if(!m){
      set('#p3Wind','—');set('#p3Temp','—');set('#p3Rh','—');
      set('#p3Freeze','—');set('#p3Cape','—');set('#p3Forecast','—');
      set('#p3Turb','—');set('#p3Icing','—');set('#p3Conv','—');
      return;
    }

    set('#p3Wind',Math.round(m.wind)+' kt');
    set('#p3Temp',m.temp==null?'—':Math.round(m.temp)+' °C');
    set('#p3Rh',m.rh==null?'—':Math.round(m.rh)+'%');
    set('#p3Freeze',m.freeze==null?'—':Math.round(m.freeze*3.28084)+' ft');
    set('#p3Cape',Math.round(m.cape)+' J/kg');
    set('#p3Forecast',m.time?m.time.slice(11,16)+'Z':'—');
    set('#p3Turb',riskLabel(m.turb));
    set('#p3Icing',riskLabel(m.icing));
    set('#p3Conv',riskLabel(m.conv));
  }

  function arrow(g,x,y,dir,speed,time){
    const toward=(dir+180)*Math.PI/180;
    const pulse=1+.08*Math.sin(time*.004+x);
    const len=(18+Math.min(24,speed*.45))*pulse;
    const dx=Math.sin(toward),dy=-Math.cos(toward);
    const x2=x+dx*len,y2=y+dy*len;

    g.save();
    g.strokeStyle='rgba(110,226,255,.9)';
    g.fillStyle='rgba(110,226,255,.9)';
    g.lineWidth=2;
    g.beginPath();g.moveTo(x-dx*len*.35,y-dy*len*.35);g.lineTo(x2,y2);g.stroke();

    const a=Math.atan2(y2-y,x2-x);
    g.beginPath();
    g.moveTo(x2,y2);
    g.lineTo(x2-8*Math.cos(a-.45),y2-8*Math.sin(a-.45));
    g.lineTo(x2-8*Math.cos(a+.45),y2-8*Math.sin(a+.45));
    g.closePath();g.fill();
    g.restore();
  }

  function riskHalo(g,x,y,risk,time){
    const max=Math.max(risk?.turb||0,risk?.icing||0,risk?.conv||0);
    if(max<1)return;

    const pulse=.5+.5*Math.sin(time*.004+x*.01);
    const r=17+max*7+pulse*4;

    g.save();
    g.globalAlpha=.10+.06*max;
    g.fillStyle=max>=3?'rgba(255,86,86,.75)':max>=2?'rgba(255,180,72,.72)':'rgba(255,232,110,.65)';
    g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
    g.restore();
  }

  function removeBadges(){
    for(const b of all('.p3Badge'))b.remove();
  }

  function drawBadge(x,y,s,p){
    if(!host)return;
    const b=document.createElement('div');
    b.className='p3Badge';
    b.style.left=x+'px';
    b.style.top=(y+38)+'px';

    const bits=[];
    if((s.risk?.turb||0)>=2)bits.push('TURB '+riskLabel(s.risk.turb));
    if((s.risk?.icing||0)>=2)bits.push('ICE '+riskLabel(s.risk.icing));
    if((s.risk?.conv||0)>=2)bits.push('CB '+riskLabel(s.risk.conv));
    if(!bits.length)bits.push(Math.round(s[`wind_speed_${p}hPa`]||0)+'KT');

    b.textContent=bits.join(' · ');
    host.appendChild(b);
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
    const p=selectedPressure();

    if(ctx&&rect&&m){
      ctx.clearRect(0,0,rect.width,rect.height);
      const projected=[];

      for(const s of samples){
        let pt;
        try{pt=m.project([s.lng,s.lat]);}catch(_){continue;}
        if(!pt||!Number.isFinite(pt.x)||!Number.isFinite(pt.y))continue;

        const speed=Number(s[`wind_speed_${p}hPa`])||0;
        const dir=Number(s[`wind_direction_${p}hPa`])||0;

        riskHalo(ctx,pt.x,pt.y,s.risk,now);
        arrow(ctx,pt.x,pt.y,dir,speed,now);
        projected.push({x:pt.x,y:pt.y,s});
      }

      if(now-lastBadgeAt>1200){
        removeBadges();
        for(const item of projected){
          if(item.s.index===0||item.s.index===item.s.total-1||item.s.index===2){
            drawBadge(item.x,item.y,item.s,p);
          }
        }
        lastBadgeAt=now;
      }
    }

    raf=setTimeout(()=>frame(performance.now()),PERF_FRAME_MS);
  }

  function startAnimation(){
    if(running)return;
    running=true;lastFrame=0;
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

  function restore(){
    try{
      const c=JSON.parse(localStorage.getItem(CACHE)||'null');
      if(c?.samples&&Array.isArray(c.samples)){
        samples=c.samples;
        routeSig=String(c.routeSig||'');
        lastFetchAt=Number(c.lastFetchAt)||0;
      }
    }catch(_){}
  }

  function startGps(){
  try{
    const accept=p=>{
      const m=Number(p?.coords?.altitude);
      if(Number.isFinite(m))gpsAltitudeFt=m*3.28084;
      if(levelKey==='AUTO')updatePanel();
    };
    if(window.__AERONAV_LAST_GPS__)accept(window.__AERONAV_LAST_GPS__);
    window.addEventListener('aeronav:gps',e=>accept(e.detail),{passive:true});
  }catch(_){}
}

  function tick(){
    ensureUi();
    updateVisibility();
    if(isFlightMode())refresh(false);
  }

  function start(){
    restore();
    ensureStyle();
    ensureUi();
    startGps();
    tick();
    setInterval(tick,10000);
    window.addEventListener('resize',resizeCanvas);
    window.addEventListener('pageshow',()=>setTimeout(()=>refresh(true),500));
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden)setTimeout(()=>refresh(false),500);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
