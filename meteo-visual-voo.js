/* AERONAV RC12.10 — Meteo Visual VOO
   Live weather model at aircraft position:
   WIND / RAIN / CLOUD / WX.
   Animated overlays are data-driven visualisations, not radar imagery.
*/
(()=>{
  'use strict';
  if(window.__AERONAV_METEO_VISUAL_RC1210)return;
  window.__AERONAV_METEO_VISUAL_RC1210=true;

  const path=(location.pathname||'').toLowerCase();
  const role=path.includes('/mathia/')?'mathia':path.includes('/wendler/')?'wendler':'jorge';
  if(role!=='jorge')return;

  const PREF_KEY='aeronav.meteo.visual.prefs.v1';
  const DATA_KEY='aeronav.meteo.visual.last.v1';
  const FETCH_MS=10*60*1000;
  const MOVE_REFRESH_M=50000;

  let map=null;
  let mapHost=null;
  let canvas=null;
  let ctx=null;
  let raf=0;
  let running=false;
  let lastFrame=0;
  let lastPos=null;
  let lastFetchPos=null;
  let lastFetchAt=0;

  let wx={
    windSpeed:0,
    windDir:0,
    windGust:0,
    precipitation:0,
    rain:0,
    showers:0,
    cloud:0,
    temp:null,
    code:0,
    time:''
  };

  let prefs={wx:true,wind:true,rain:true,cloud:true};

  const windParticles=[];
  const rainDrops=[];
  const cloudBlobs=[];

  const $=s=>document.querySelector(s);
  const all=s=>[...document.querySelectorAll(s)];
  const text=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
  const upper=v=>String(v||'').toUpperCase();

  function loadPrefs(){
    try{
      const p=JSON.parse(localStorage.getItem(PREF_KEY)||'null');
      if(p&&typeof p==='object')prefs={...prefs,...p};
    }catch(_){}
  }

  function savePrefs(){
    try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}catch(_){}
  }

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
      typeof v.getCenter==='function'&&typeof v.project==='function');
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
    if($('#aeronavMeteoVisualCss'))return;
    const s=document.createElement('style');
    s.id='aeronavMeteoVisualCss';
    s.textContent=`
      #aeronavWxCanvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:9}
      #aeronavWxToolbar{position:absolute;left:12px;top:132px;z-index:15;display:flex;flex-direction:column;gap:7px;pointer-events:auto}
      .aeronavWxBtn{min-width:62px;border:1px solid rgba(87,196,239,.58);background:rgba(3,27,44,.9);color:#d9f5ff;border-radius:12px;padding:8px 9px;font:800 10px system-ui,-apple-system,sans-serif;letter-spacing:.05em;box-shadow:0 6px 18px rgba(0,0,0,.3)}
      .aeronavWxBtn.on{background:rgba(4,84,123,.94);border-color:#6bddff;color:#fff;box-shadow:0 0 15px rgba(74,206,255,.35)}
      #aeronavWxPanel{position:absolute;right:12px;top:185px;z-index:15;width:min(210px,44vw);background:rgba(3,22,36,.91);border:1px solid rgba(88,202,243,.62);border-radius:14px;padding:10px;color:#fff;box-shadow:0 10px 26px rgba(0,0,0,.35);pointer-events:none}
      #aeronavWxPanel .wxTitle{font:900 11px system-ui,-apple-system,sans-serif;color:#8edfff;letter-spacing:.08em;margin-bottom:7px}
      #aeronavWxPanel .wxRow{display:flex;justify-content:space-between;gap:8px;font:750 11px/1.45 system-ui,-apple-system,sans-serif}
      #aeronavWxPanel .wxRow span:first-child{color:#a5cbdc}
      #aeronavWxPanel .wxFoot{font:700 9px/1.3 system-ui,-apple-system,sans-serif;color:#8eabb8;margin-top:7px}
      #aeronavWxLegend{position:absolute;right:12px;bottom:92px;z-index:15;display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;max-width:65%;pointer-events:none}
      .wxChip{background:rgba(3,22,36,.88);border:1px solid rgba(88,202,243,.45);border-radius:999px;padding:5px 8px;color:#e4f8ff;font:800 9px system-ui,-apple-system,sans-serif}
      @media(max-width:620px){
        #aeronavWxToolbar{top:146px;left:8px;gap:6px}
        .aeronavWxBtn{min-width:55px;padding:7px 7px;font-size:9px}
        #aeronavWxPanel{top:146px;right:8px;width:min(195px,49vw)}
      }
    `;
    document.head.appendChild(s);
  }

  function ensureHost(){
    const m=findMap();
    const c=m?.getCanvas?.();
    if(!c)return null;
    const parent=c.parentElement;
    if(!parent)return null;
    if(getComputedStyle(parent).position==='static')parent.style.position='relative';
    mapHost=parent;
    return parent;
  }

  function resizeCanvas(){
    if(!canvas||!mapHost)return;
    const r=mapHost.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(r.width*dpr));
    const h=Math.max(1,Math.round(r.height*dpr));
    if(canvas.width!==w||canvas.height!==h){
      canvas.width=w;canvas.height=h;
      canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';
      ctx=canvas.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
      seedParticles(r.width,r.height);
    }
  }

  function ensureUi(){
    ensureStyle();
    const host=ensureHost();
    if(!host)return;

    if(!canvas||canvas.parentElement!==host){
      canvas?.remove();
      canvas=document.createElement('canvas');
      canvas.id='aeronavWxCanvas';
      host.appendChild(canvas);
      resizeCanvas();
    }

    let bar=$('#aeronavWxToolbar');
    if(!bar||bar.parentElement!==host){
      bar?.remove();
      bar=document.createElement('div');
      bar.id='aeronavWxToolbar';
      bar.innerHTML=`
        <button class="aeronavWxBtn" data-wx="wx">WX</button>
        <button class="aeronavWxBtn" data-wx="wind">WIND</button>
        <button class="aeronavWxBtn" data-wx="rain">RAIN</button>
        <button class="aeronavWxBtn" data-wx="cloud">CLOUD</button>`;
      host.appendChild(bar);

      for(const b of bar.querySelectorAll('button')){
        b.addEventListener('click',()=>{
          const k=b.dataset.wx;
          prefs[k]=!prefs[k];
          if(k==='wx'&&!prefs.wx){
            prefs.wind=false;prefs.rain=false;prefs.cloud=false;
          }else if(k==='wx'&&prefs.wx){
            prefs.wind=true;prefs.rain=true;prefs.cloud=true;
          }else if(k!=='wx'){
            prefs.wx=prefs.wind||prefs.rain||prefs.cloud;
          }
          savePrefs();paintButtons();updatePanelVisibility();
        });
      }
    }

    let panel=$('#aeronavWxPanel');
    if(!panel||panel.parentElement!==host){
      panel?.remove();
      panel=document.createElement('div');
      panel.id='aeronavWxPanel';
      panel.innerHTML=`
        <div class="wxTitle">WX · CONDIÇÕES ACTUAIS</div>
        <div class="wxRow"><span>Vento</span><strong id="wxWind">—</strong></div>
        <div class="wxRow"><span>Rajada</span><strong id="wxGust">—</strong></div>
        <div class="wxRow"><span>Chuva</span><strong id="wxRain">—</strong></div>
        <div class="wxRow"><span>Nuvens</span><strong id="wxCloud">—</strong></div>
        <div class="wxRow"><span>Temperatura</span><strong id="wxTemp">—</strong></div>
        <div class="wxRow"><span>Condição</span><strong id="wxCond">—</strong></div>
        <div class="wxFoot" id="wxUpdated">Modelo meteorológico · aguardando posição</div>`;
      host.appendChild(panel);
    }

    let legend=$('#aeronavWxLegend');
    if(!legend||legend.parentElement!==host){
      legend?.remove();
      legend=document.createElement('div');
      legend.id='aeronavWxLegend';
      legend.innerHTML=`
        <span class="wxChip" id="wxWindChip">WIND —</span>
        <span class="wxChip" id="wxCloudChip">CLOUD —</span>
        <span class="wxChip" id="wxRainChip">RAIN —</span>`;
      host.appendChild(legend);
    }

    paintButtons();
    updatePanel();
    updatePanelVisibility();
  }

  function paintButtons(){
    for(const b of all('#aeronavWxToolbar .aeronavWxBtn')){
      b.classList.toggle('on',!!prefs[b.dataset.wx]);
    }
  }

  function updatePanelVisibility(){
    const show=isFlightMode();
    const toolbar=$('#aeronavWxToolbar'),panel=$('#aeronavWxPanel'),legend=$('#aeronavWxLegend');
    if(toolbar)toolbar.style.display=show?'flex':'none';
    if(panel)panel.style.display=show&&prefs.wx?'block':'none';
    if(legend)legend.style.display=show&&prefs.wx?'flex':'none';
    if(canvas)canvas.style.display=show&&prefs.wx?'block':'none';
    if(show&&prefs.wx)startAnimation();else stopAnimation();
  }

  function weatherLabel(code){
    code=Number(code)||0;
    if(code===0)return 'Céu limpo';
    if([1,2,3].includes(code))return 'Nublado';
    if([45,48].includes(code))return 'Nevoeiro';
    if(code>=51&&code<=67)return 'Chuva/chuvisco';
    if(code>=71&&code<=77)return 'Neve';
    if(code>=80&&code<=82)return 'Aguaceiros';
    if(code>=85&&code<=86)return 'Aguaceiros de neve';
    if(code>=95)return 'Trovoada';
    return 'Variável';
  }

  function updatePanel(){
    const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
    set('#wxWind',Math.round(wx.windDir)+'° / '+Math.round(wx.windSpeed)+' kt');
    set('#wxGust',Math.round(wx.windGust)+' kt');
    set('#wxRain',(wx.precipitation||0).toFixed(1)+' mm/h');
    set('#wxCloud',Math.round(wx.cloud)+'%');
    set('#wxTemp',wx.temp==null?'—':Math.round(wx.temp)+' °C');
    set('#wxCond',weatherLabel(wx.code));
    set('#wxUpdated',wx.time?'Actualizado '+wx.time+' · modelo Open-Meteo':'Modelo meteorológico · aguardando dados');
    set('#wxWindChip','WIND '+Math.round(wx.windDir)+'°/'+Math.round(wx.windSpeed)+'KT');
    set('#wxCloudChip','CLOUD '+Math.round(wx.cloud)+'%');
    set('#wxRainChip','RAIN '+(wx.precipitation||0).toFixed(1)+'MM/H');
  }

  function distanceM(a,b){
    if(!a||!b)return Infinity;
    const R=6371000,rad=x=>x*Math.PI/180;
    const p1=rad(a.lat),p2=rad(b.lat),dp=rad(b.lat-a.lat),dl=rad(b.lng-a.lng);
    const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }

  async function fetchWeather(pos,force=false){
    if(!pos)return;
    if(!force&&Date.now()-lastFetchAt<FETCH_MS&&distanceM(pos,lastFetchPos)<MOVE_REFRESH_M)return;

    const params=new URLSearchParams({
      latitude:String(pos.lat),
      longitude:String(pos.lng),
      current:'temperature_2m,precipitation,rain,showers,cloud_cover,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit:'kn',
      timezone:'auto'
    });

    try{
      const res=await fetch('https://api.open-meteo.com/v1/forecast?'+params.toString(),{cache:'no-store'});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      const cur=data?.current||{};

      wx={
        windSpeed:Number(cur.wind_speed_10m)||0,
        windDir:Number(cur.wind_direction_10m)||0,
        windGust:Number(cur.wind_gusts_10m)||0,
        precipitation:Number(cur.precipitation)||0,
        rain:Number(cur.rain)||0,
        showers:Number(cur.showers)||0,
        cloud:Number(cur.cloud_cover)||0,
        temp:Number.isFinite(Number(cur.temperature_2m))?Number(cur.temperature_2m):null,
        code:Number(cur.weather_code)||0,
        time:String(cur.time||'')
      };

      lastFetchPos={...pos};
      lastFetchAt=Date.now();

      try{localStorage.setItem(DATA_KEY,JSON.stringify({wx,pos,lastFetchAt}));}catch(_){}
      updatePanel();
      reseedForWeather();
    }catch(_){
      try{
        const cached=JSON.parse(localStorage.getItem(DATA_KEY)||'null');
        if(cached?.wx){
          wx=cached.wx;
          updatePanel();
          reseedForWeather();
        }
      }catch(__){}
    }
  }

  function seedParticles(w,h){
    windParticles.length=0;rainDrops.length=0;cloudBlobs.length=0;

    for(let i=0;i<90;i++){
      windParticles.push({
        x:Math.random()*w,y:Math.random()*h,
        life:Math.random(),len:8+Math.random()*22
      });
    }

    for(let i=0;i<140;i++){
      rainDrops.push({
        x:Math.random()*w,y:Math.random()*h,
        len:7+Math.random()*14,speed:.55+Math.random()*.9
      });
    }

    for(let i=0;i<16;i++){
      cloudBlobs.push({
        x:Math.random()*w,y:Math.random()*h,
        rx:70+Math.random()*150,ry:28+Math.random()*70,
        speed:.03+Math.random()*.06,phase:Math.random()*Math.PI*2
      });
    }
  }

  function reseedForWeather(){
    if(mapHost){
      const r=mapHost.getBoundingClientRect();
      seedParticles(r.width,r.height);
    }
  }

  function drawClouds(g,w,h,dt){
    if(!prefs.cloud||wx.cloud<4)return;
    const cover=Math.max(0,Math.min(100,wx.cloud))/100;
    g.save();
    g.globalCompositeOperation='source-over';
    for(let i=0;i<cloudBlobs.length;i++){
      const c=cloudBlobs[i];
      c.x+=c.speed*dt*(1+wx.windSpeed/20);
      if(c.x-c.rx>w)c.x=-c.rx;
      const alpha=(.015+.09*cover)*(0.55+0.45*Math.sin(c.phase+i));
      const grad=g.createRadialGradient(c.x,c.y,5,c.x,c.y,c.rx);
      grad.addColorStop(0,'rgba(235,245,255,'+Math.min(.24,alpha*2.2)+')');
      grad.addColorStop(1,'rgba(225,238,248,0)');
      g.fillStyle=grad;
      g.beginPath();
      g.ellipse(c.x,c.y,c.rx,c.ry,0,0,Math.PI*2);
      g.fill();
    }
    g.restore();
  }

  function drawWind(g,w,h,dt){
    if(!prefs.wind||wx.windSpeed<1)return;

    // Meteorological direction is where wind comes FROM.
    // Move particles toward dir+180.
    const rad=(wx.windDir+180)*Math.PI/180;
    const dx=Math.sin(rad),dy=-Math.cos(rad);
    const speed=0.025*Math.max(5,wx.windSpeed);

    g.save();
    g.lineWidth=1.25;
    g.strokeStyle='rgba(112,220,255,.62)';

    const count=Math.min(windParticles.length,Math.round(30+wx.windSpeed*1.8));
    for(let i=0;i<count;i++){
      const p=windParticles[i];
      p.x+=dx*speed*dt;
      p.y+=dy*speed*dt;
      p.life+=dt*.00016;

      if(p.x<-30||p.x>w+30||p.y<-30||p.y>h+30||p.life>1){
        p.x=Math.random()*w;p.y=Math.random()*h;p.life=0;
      }

      g.globalAlpha=.25+.55*(1-p.life);
      g.beginPath();
      g.moveTo(p.x,p.y);
      g.lineTo(p.x-dx*p.len,p.y-dy*p.len);
      g.stroke();
    }
    g.restore();
  }

  function drawRain(g,w,h,dt){
    if(!prefs.rain)return;
    const amount=Math.max(wx.precipitation||0,wx.rain||0,wx.showers||0);
    if(amount<0.05)return;

    const intensity=Math.min(1,amount/8);
    const count=Math.min(rainDrops.length,Math.round(18+intensity*120));

    g.save();
    g.strokeStyle='rgba(74,174,255,.72)';
    g.lineWidth=1.3+intensity*1.2;

    for(let i=0;i<count;i++){
      const p=rainDrops[i];
      p.y+=p.speed*dt*(.22+intensity*.65);
      p.x-=p.speed*dt*.08;

      if(p.y>h+20||p.x<-20){
        p.y=-20-Math.random()*h*.15;
        p.x=Math.random()*(w+50);
      }

      g.globalAlpha=.25+.6*intensity;
      g.beginPath();
      g.moveTo(p.x,p.y);
      g.lineTo(p.x-4-p.len*.18,p.y+p.len);
      g.stroke();
    }

    g.restore();
  }

  let lastLightning=0;
  function drawThunder(g,w,h,now){
    if(!prefs.rain||Number(wx.code)<95)return;
    if(now-lastLightning<3500+Math.random()*5500)return;
    lastLightning=now;

    g.save();
    g.fillStyle='rgba(220,240,255,.18)';
    g.fillRect(0,0,w,h);
    g.restore();
  }

  function frame(now){
    if(!running)return;
    if(!lastFrame)lastFrame=now;
    const dt=Math.min(60,now-lastFrame||16);
    lastFrame=now;

    resizeCanvas();
    const r=mapHost?.getBoundingClientRect();
    if(ctx&&r){
      ctx.clearRect(0,0,r.width,r.height);
      drawClouds(ctx,r.width,r.height,dt);
      drawWind(ctx,r.width,r.height,dt);
      drawRain(ctx,r.width,r.height,dt);
      drawThunder(ctx,r.width,r.height,now);
    }

    raf=requestAnimationFrame(frame);
  }

  function startAnimation(){
    if(running)return;
    running=true;
    lastFrame=0;
    raf=requestAnimationFrame(frame);
  }

  function stopAnimation(){
    running=false;
    if(raf)cancelAnimationFrame(raf);
    raf=0;
    if(ctx&&mapHost){
      const r=mapHost.getBoundingClientRect();
      ctx.clearRect(0,0,r.width,r.height);
    }
  }

  function onPosition(position){
    const lat=Number(position?.coords?.latitude);
    const lng=Number(position?.coords?.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
    lastPos={lat,lng};
    fetchWeather(lastPos,false);
  }

  function startGps(){
    try{
      navigator.geolocation?.watchPosition(
        onPosition,
        ()=>{},
        {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
      );
    }catch(_){}
  }

  function tick(){
    ensureUi();
    updatePanelVisibility();
    if(lastPos)fetchWeather(lastPos,false);
  }

  function start(){
    loadPrefs();
    ensureStyle();
    ensureUi();
    startGps();

    try{
      const cached=JSON.parse(localStorage.getItem(DATA_KEY)||'null');
      if(cached?.wx){
        wx=cached.wx;
        updatePanel();
      }
    }catch(_){}

    tick();
    setInterval(tick,2000);
    window.addEventListener('resize',resizeCanvas);
    window.addEventListener('pageshow',()=>setTimeout(tick,300));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(tick,300);});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
