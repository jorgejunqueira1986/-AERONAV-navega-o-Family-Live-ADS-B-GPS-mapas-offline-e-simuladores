/* AERONAV RC12.37.16 — approved TAAG B777-300ER rear silhouette and live cockpit navigation.
   The transparent cockpit windows reveal the existing moving map. The central display
   is an independent top-down aircraft/route inset without a second GPS or map instance.
   All other aircraft and the 360-degree orbit preserve the installed GLB engine. */
(()=>{
  'use strict';
  if(window.__AERONAV_PHOTO_ANGLES_3715__)return;
  window.__AERONAV_PHOTO_ANGLES_3715__=true;
  if(/\/(?:mathia|wendler|family)(?:\/|\.html|$)/i.test(location.pathname||''))return;
  const ROOT='./assets/flight-angle-renders/b777300/';
  const PICTURES={
    behind:'behind_rc123716.webp',
    left:'left.webp',right:'right.webp',top:'top.webp',inclined:'inclined.webp',
    cockpit:'cockpit_rc123716.webp'
  };
  const $=selector=>document.querySelector(selector);
  const state={layer:null,img:null,nav:null,navCtx:null,topImg:null,topLoaded:false,
    lastUrl:'',active:false,error:'',lastNavAt:0};
  const aircraft=()=>localStorage.getItem('aeronav.aircraftPref')||'c152';
  function flightCamera(){try{return window.AERONAVFlightCamera?.status?.()||{};}catch(_){return {};}}
  const flightMap=()=>[window.__AERONAV_MAP__,window.aeronavMap,window.mainMap,window.map]
    .find(m=>m&&typeof m.getCenter==='function'&&typeof m.project==='function')||null;

  function ensure(){
    const wrap=$('#screen-map .map-wrap');if(!wrap)return false;
    if(!$('#aeronavPhotoAngleStyle3716')){
      const style=document.createElement('style');style.id='aeronavPhotoAngleStyle3716';
      style.textContent=`
        #aeronavPhotoAngleLayer3716{position:absolute;inset:0;display:none;z-index:29;overflow:hidden;pointer-events:none}
        body.aeronav-photo-angle-on #aeronavPhotoAngleLayer3716{display:block}
        #aeronavPhotoAngleImage3716{position:absolute;left:50%;top:51%;transform:translate(-50%,-50%);
          width:min(84%,680px);height:auto;max-height:72%;object-fit:contain;pointer-events:none}
        body.aeronav-photo-angle-cockpit #aeronavPhotoAngleImage3716{inset:0;left:0;top:0;
          transform:none;width:100%;height:100%;max-height:none;object-fit:fill}
        #cockpitCenterNavDisplay3716{position:absolute;z-index:2;left:38.9%;top:49.25%;
          width:23.3%;height:13.65%;border-radius:1.5%;border:1px solid #182b35;
          box-shadow:inset 0 0 2px #000a;display:none;pointer-events:none;object-fit:fill}
        body.aeronav-photo-angle-cockpit #cockpitCenterNavDisplay3716{display:block}
        body.aeronav-photo-angle-on #aeronavAircraftPerspectiveCanvas,
        body.aeronav-photo-angle-on #aircraftPerspectiveHint3714,
        body.aeronav-photo-angle-on #aircraftPerspectiveCockpit3714,
        body.aeronav-photo-angle-on #flightCameraAircraft,
        body.aeronav-photo-angle-on #aeronavRearAircraft,
        body.aeronav-photo-angle-on #cockpitLite,
        body.aeronav-photo-angle-on .position-marker.flight{display:none!important}
        body.aeronav-photo-angle-cockpit #flightCameraBadge{display:none!important}
      `;
      document.head.appendChild(style);
    }
    if(!state.layer||!state.layer.isConnected){
      state.layer=document.createElement('div');state.layer.id='aeronavPhotoAngleLayer3716';
      state.img=new Image();state.img.id='aeronavPhotoAngleImage3716';
      state.img.alt='Aeronave TAAG Boeing 777-300ER';state.img.draggable=false;
      state.img.addEventListener('error',()=>{state.error='Falha ao carregar imagem '+state.lastUrl;setActive(false);});
      state.img.addEventListener('load',()=>{state.error='';});
      state.nav=document.createElement('canvas');state.nav.id='cockpitCenterNavDisplay3716';
      state.nav.setAttribute('aria-label','Display de navegação: aeronave vista de cima e rota ativa');
      state.navCtx=state.nav.getContext('2d',{alpha:false});
      state.layer.append(state.img,state.nav);wrap.appendChild(state.layer);
      state.topImg=new Image();state.topImg.onload=()=>{state.topLoaded=true;drawNav(true);};
      state.topImg.onerror=()=>{state.topLoaded=false;};
      state.topImg.src=ROOT+'top.webp';
    }
    return true;
  }
  function setActive(active,cockpit=false){
    state.active=!!active;
    document.body.classList.toggle('aeronav-photo-angle-on',!!active);
    document.body.classList.toggle('aeronav-photo-angle-cockpit',!!active&&!!cockpit);
  }
  function sync(){
    const cam=flightCamera(),preset=String(cam.preset||'behind');
    const active=!!cam.active&&aircraft()==='b777300'&&!!PICTURES[preset]&&
      $('#screen-map')?.classList.contains('active');
    if(!active){setActive(false);return;}
    if(!ensure())return;
    const url=ROOT+PICTURES[preset];
    if(state.lastUrl!==url){state.lastUrl=url;state.img.src=url;}
    setActive(true,preset==='cockpit');
    if(preset==='cockpit')drawNav(false);
  }
  function position(map){
    const gps=window.__AERONAV_LAST_GPS__;
    const lat=Number(gps?.coords?.latitude),lon=Number(gps?.coords?.longitude);
    const time=Number(gps?.timestamp||0);
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180&&
       time>0&&Date.now()-time<120000)return{lat,lon,gps:true};
    const c=map?.getCenter?.();
    if(Number.isFinite(Number(c?.lat))&&Number.isFinite(Number(c?.lng)))
      return{lat:Number(c.lat),lon:Number(c.lng),gps:false};
    return null;
  }
  function activeRoute(map){
    try{
      const src=map?.getSource?.('active-route');
      const data=src?._data||src?._options?.data||map?.getStyle?.()?.sources?.['active-route']?.data;
      const geometry=data?.geometry||data?.features?.[0]?.geometry;
      if(geometry?.type==='LineString')return geometry.coordinates;
      if(geometry?.type==='MultiLineString')return geometry.coordinates.flat();
    }catch(_){}
    return [];
  }
  function resizeNav(){
    const canvas=state.nav;
    const rect=canvas.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return null;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.min(740,Math.max(160,Math.round(rect.width*dpr)));
    const h=Math.min(510,Math.max(120,Math.round(rect.height*dpr)));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    return{w,h};
  }
  function drawNav(force=false){
    if(!state.active||!document.body.classList.contains('aeronav-photo-angle-cockpit')||
       document.hidden||!state.navCtx)return;
    const now=Date.now();if(!force&&now-state.lastNavAt<500)return;
    state.lastNavAt=now;
    const size=resizeNav();if(!size)return;
    const {w,h}=size,ctx=state.navCtx,map=flightMap(),p=position(map);
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#082b3e';ctx.fillRect(0,0,w,h);
    const mapCanvas=map?.getCanvas?.();
    const canvasRect=mapCanvas?.getBoundingClientRect?.();
    let centerMapX=0,centerMapY=0,scaleX=1,scaleY=1;
    // Reuse the main map's already-rendered canvas. This keeps the inset offline
    // and avoids an expensive second MapLibre / GPS / network request.
    if(mapCanvas&&canvasRect?.width&&canvasRect?.height){
      const center=p?map.project([p.lon,p.lat]):{x:canvasRect.width/2,y:canvasRect.height/2};
      centerMapX=center.x;centerMapY=center.y;
      const cropW=Math.min(canvasRect.width,Math.max(220,canvasRect.width*0.43));
      const cropH=cropW*(h/w);
      scaleX=w/cropW;scaleY=h/cropH;
      try{
        const ratioX=mapCanvas.width/canvasRect.width,ratioY=mapCanvas.height/canvasRect.height;
        ctx.drawImage(mapCanvas,(center.x-cropW/2)*ratioX,(center.y-cropH/2)*ratioY,
          cropW*ratioX,cropH*ratioY,0,0,w,h);
      }catch(_){}
    }
    if(map&&p){
      const route=activeRoute(map);
      if(route.length>1){
        ctx.save();ctx.beginPath();let plotted=0;
        // The projected line is relative to the aircraft: it slides as GPS moves.
        const stride=Math.max(1,Math.ceil(route.length/300));
        for(let i=0;i<route.length;i+=stride){
          const coord=route[i];if(!Array.isArray(coord)||coord.length<2)continue;
          try{
            const point=map.project(coord);
            const x=(point.x-centerMapX)*scaleX+w/2,y=(point.y-centerMapY)*scaleY+h/2;
            if(!plotted++)ctx.moveTo(x,y);else ctx.lineTo(x,y);
          }catch(_){}
        }
        if(plotted>1){ctx.strokeStyle='#031521';ctx.lineWidth=Math.max(4,w*.023);ctx.stroke();
          ctx.strokeStyle='#13e0fc';ctx.lineWidth=Math.max(2,w*.013);ctx.stroke();}
        ctx.restore();
      }
    }
    ctx.save();ctx.translate(w/2,h/2);
    const snapshot=window.AERONAVCockpit?.snapshot?.()||{};
    const heading=Number(snapshot.heading);
    const bearing=Number(map?.getBearing?.()||0);
    // North-up navigation symbology: top-view aircraft rotates, map stays untouched.
    if(Number.isFinite(heading))ctx.rotate((heading-bearing)*Math.PI/180);
    if(state.topLoaded&&state.topImg?.naturalWidth){
      const iw=Math.min(w*.44,h*.60),ih=iw*state.topImg.naturalHeight/state.topImg.naturalWidth;
      ctx.shadowColor='#000b';ctx.shadowBlur=5;
      ctx.drawImage(state.topImg,-iw/2,-ih/2,iw,ih);
    }else{
      ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-h*.22);ctx.lineTo(w*.065,h*.12);
      ctx.lineTo(0,h*.055);ctx.lineTo(-w*.065,h*.12);ctx.closePath();ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle='#062033dd';ctx.fillRect(0,0,w,Math.max(20,h*.18));
    ctx.fillStyle='#a7efff';ctx.font=`700 ${Math.max(10,Math.round(w*.055))}px system-ui`;
    ctx.textBaseline='middle';
    const label=p?(p.gps?'POSIÇÃO GPS':'POSIÇÃO MAPA'):'SEM POSIÇÃO';
    ctx.fillText(label,7,Math.max(10,h*.09));
    ctx.textAlign='right';ctx.fillText(activeRoute(map).length?'ROTA ATIVA':'SEM ROTA',w-7,Math.max(10,h*.09));
    ctx.textAlign='left';
  }
  window.addEventListener('aeronav:camera-change',()=>setTimeout(sync,35));
  for(const name of ['aeronav:screen-change','aeronav:map-ready','pageshow'])
    window.addEventListener(name,()=>setTimeout(sync,65));
  window.addEventListener('aeronav:gps',()=>{if(state.active)drawNav(true);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(sync,75);});
  document.addEventListener('change',e=>{if(e.target?.matches?.('#addonAircraft'))setTimeout(sync,90);});
  setInterval(()=>{sync();drawNav(false);},600);
  setTimeout(sync,350);
  window.AERONAVPhotoAngleRenderer={release:'RC12.37.16',sync,refreshNav:()=>drawNav(true),
    status:()=>({release:'RC12.37.16',active:state.active,
      aircraft:aircraft(),preset:flightCamera().preset||'behind',image:state.lastUrl,
      error:state.error,liveCockpitWindows:true,centralNav:true,
      orbitRenderer:'GLB',mapCameraUnchanged:true})};
})();
