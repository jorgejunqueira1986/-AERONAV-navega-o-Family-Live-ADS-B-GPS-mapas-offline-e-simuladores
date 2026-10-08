/* AERONAV RC12.37.15 — authentic photo angle overlays for TAAG B777-300ER only.
   Static photographs are transparent; cockpit is a mask on the actual live map.
   The previous 3D engine remains active for Orbit 360 and all other aircraft. */
(()=>{
  'use strict';
  if(window.__AERONAV_PHOTO_ANGLES_3715__)return;
  window.__AERONAV_PHOTO_ANGLES_3715__=true;
  if(/\/(?:mathia|wendler|family)(?:\/|\.html|$)/i.test(location.pathname||''))return;
  const rootPath='./assets/flight-angle-renders/b777300/';
  const PICTURE={behind:'behind.webp',left:'left.webp',right:'right.webp',top:'top.webp',inclined:'inclined.webp',cockpit:'cockpit_live.webp'};
  const $=s=>document.querySelector(s);
  let layer=null,image=null,lastFile='',lastActive=false,lastError='';
  const aircraft=()=>localStorage.getItem('aeronav.aircraftPref')||'c152';
  const state=()=>{try{return window.AERONAVFlightCamera?.status?.()||{};}catch(_){return {};}};
  function ensure(){
    const wrap=$('#screen-map .map-wrap');if(!wrap)return false;
    if(!$('#aeronavPhotoAngleStyle3715')){
      const style=document.createElement('style');style.id='aeronavPhotoAngleStyle3715';
      style.textContent=`
        #aeronavPhotoAngleLayer3715{position:absolute;inset:0;display:none;z-index:29;overflow:hidden;pointer-events:none}
        body.aeronav-photo-angle-on #aeronavPhotoAngleLayer3715{display:block}
        #aeronavPhotoAngleImage3715{position:absolute;left:50%;top:51%;transform:translate(-50%,-50%);
          width:min(84%,680px);height:auto;max-height:72%;object-fit:contain;display:block;pointer-events:none;
          -webkit-user-select:none;user-select:none}
        body.aeronav-photo-angle-cockpit #aeronavPhotoAngleImage3715{inset:0;left:0;top:0;
          width:100%;height:100%;max-height:none;transform:none;object-fit:fill}
        body.aeronav-photo-angle-on #aeronavAircraftPerspectiveCanvas,
        body.aeronav-photo-angle-on #aircraftPerspectiveHint3714,
        body.aeronav-photo-angle-on #aircraftPerspectiveCockpit3714,
        body.aeronav-photo-angle-on #flightCameraAircraft,
        body.aeronav-photo-angle-on #aeronavRearAircraft,
        body.aeronav-photo-angle-on #cockpitLite,
        body.aeronav-photo-angle-on .position-marker.flight{display:none!important}
        body.aeronav-photo-angle-cockpit #flightCameraBadge{display:none!important}
      `;document.head.appendChild(style);
    }
    if(!layer||!layer.isConnected){
      layer=document.createElement('div');layer.id='aeronavPhotoAngleLayer3715';
      image=new Image();image.id='aeronavPhotoAngleImage3715';image.alt='Avião TAAG 777-300ER';
      image.draggable=false;
      image.addEventListener('error',()=>{lastError='Imagem TAAG não encontrada: '+lastFile;setActive(false);});
      image.addEventListener('load',()=>{lastError='';});
      layer.appendChild(image);wrap.appendChild(layer);
    }
    return true;
  }
  function setActive(on,cockpit=false){
    document.body.classList.toggle('aeronav-photo-angle-on',!!on);
    document.body.classList.toggle('aeronav-photo-angle-cockpit',!!on&&!!cockpit);
    lastActive=!!on;
  }
  function sync(){
    const s=state(),preset=String(s.preset||'behind');
    const active=!!s.active&&aircraft()==='b777300'&&!!PICTURE[preset]&&
       $('#screen-map')?.classList.contains('active');
    if(!active){setActive(false);return;}
    if(!ensure())return;
    const source=rootPath+PICTURE[preset];
    // Show new asset only when its URL differs, avoiding repeated network requests.
    if(lastFile!==source){lastFile=source;image.src=source;}
    setActive(true,preset==='cockpit');
  }
  for(const name of ['aeronav:camera-change','aeronav:screen-change','aeronav:map-ready','pageshow']){
    window.addEventListener(name,()=>setTimeout(sync,40));
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(sync,80);});
  document.addEventListener('change',e=>{if(e.target?.matches?.('#addonAircraft'))setTimeout(sync,150);});
  setInterval(sync,600);
  setTimeout(sync,500);
  window.AERONAVPhotoAngleRenderer={release:'RC12.37.15',sync,status:()=>({release:'RC12.37.15',active:lastActive,
      aircraft:aircraft(),preset:state().preset||'behind',image:lastFile,error:lastError,
      orbitRenderer:'GLB',liveMapBehindCockpit:true})};
})();
