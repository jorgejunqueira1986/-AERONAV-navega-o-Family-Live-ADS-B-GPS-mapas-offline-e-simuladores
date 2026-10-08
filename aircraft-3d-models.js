/* AERONAV RC12.37.12 — TAAG 3D aircraft views. */
(() => {
  'use strict';
  if (window.__AERONAV_AIRCRAFT_3D_RC12378__) return;
  window.__AERONAV_AIRCRAFT_3D_RC12378__ = true;
  if (/\/(?:mathia|wendler|family)(?:\/|\.html|$)/i.test(location.pathname || '')) return;

  const MODELS = {
    c152:{name:'Cessna 152',url:'./assets/aircraft3d/c152.glb',range:34,minPx:82},
    c172:{name:'Cessna 172',url:'./assets/aircraft3d/c172.glb',range:38,minPx:84},
    q400:{name:'De Havilland Dash 8 Q400',url:'./assets/aircraft3d/q400.glb',range:95,minPx:92},
    b7377:{name:'Boeing 737-700',url:'./assets/aircraft3d/b7377.glb',range:105,minPx:96},
    a2203:{name:'Airbus A220-300',url:'./assets/aircraft3d/a2203.glb',range:112,minPx:96},
    b777300:{name:'Boeing 777-300ER',url:'./assets/aircraft3d/b777300.glb',range:210,minPx:108},
    b7879:{name:'Boeing 787-9',url:'./assets/aircraft3d/b7879.glb',range:185,minPx:106},
    b78710:{name:'Boeing 787-10',url:'./assets/aircraft3d/b78710.glb',range:198,minPx:108}
  };

  const CAMERA={
    behind:{offset:180,pitch:-24,range:1.12},
    left:{offset:-105,pitch:-18,range:1.08},
    right:{offset:105,pitch:-18,range:1.08},
    top:{offset:180,pitch:-82,range:1.18},
    inclined:{offset:145,pitch:-32,range:1.00},
    orbit:{offset:180,pitch:-22,range:1.10}
  };

  const runtime={model:null,modelId:'',loading:false,error:'',active:false,orbit:0,lastUpdate:0};

  const selectedId=()=>{const id=localStorage.getItem('aeronav.aircraftPref')||'c152';return MODELS[id]?id:'c152';};
  const cameraStatus=()=>{try{return window.AERONAVFlightCamera?.status?.()||{};}catch(_){return {};}};
  const photoStatus=()=>{try{return window.AERONAVPhoto3DRenderer?.status?.()||{};}catch(_){return {};}};
  const viewer=()=>{try{return window.AERONAVPhoto3DRenderer?.viewer?.()||null;}catch(_){return null;}};
  const snapshot=()=>{try{return window.AERONAVCockpit?.snapshot?.()||{};}catch(_){return {};}};

  function position(){
    const g=window.__AERONAV_LAST_GPS__;
    let lat=Number(g?.coords?.latitude),lon=Number(g?.coords?.longitude),alt=Number(g?.coords?.altitude);
    const s=snapshot();
    if(!Number.isFinite(alt)&&Number.isFinite(Number(s.alt)))alt=Number(s.alt)/3.280839895;
    if(!Number.isFinite(lat)||!Number.isFinite(lon)){
      try{const m=window.__AERONAV_MAP__||window.aeronavMap||window.mainMap||window.map,c=m?.getCenter?.();lat=Number(c?.lat);lon=Number(c?.lng);}catch(_){}
    }
    if(!Number.isFinite(alt))alt=120;
    return{lat,lon,alt};
  }

  function heading(){
    const s=Number(snapshot()?.heading);if(Number.isFinite(s))return(s+360)%360;
    const g=Number(window.__AERONAV_LAST_GPS__?.coords?.heading);if(Number.isFinite(g)&&g>=0)return g%360;
    try{const m=window.__AERONAV_MAP__||window.aeronavMap||window.mainMap||window.map;return(Number(m?.getBearing?.()||0)+360)%360;}catch(_){return 0;}
  }

  function preset(){const p=cameraStatus().preset||'behind';return p==='cockpit'?null:p;}

  function shouldRun(){
    const p=photoStatus(),c=cameraStatus();
    return !!(p.enabled&&p.ready&&c.active&&preset()&&document.querySelector('#screen-map')?.classList.contains('active')&&localStorage.getItem('aeronav.mode')==='flight');
  }

  function ensureStyle(){
    if(document.getElementById('aircraft3dStyle'))return;
    const st=document.createElement('style');st.id='aircraft3dStyle';
    st.textContent='body.aeronav-aircraft-3d-on #flightCameraAircraft{display:none!important}#aircraft3dBadge{position:absolute;z-index:33;right:12px;top:92px;display:none;padding:6px 9px;border-radius:999px;background:#07131de8;border:1px solid #31566e;color:#dff6ff;font:900 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:none}body.aeronav-aircraft-3d-on #aircraft3dBadge{display:block}';
    document.head.appendChild(st);
    const wrap=document.querySelector('#screen-map .map-wrap');
    if(wrap&&!document.getElementById('aircraft3dBadge')){const b=document.createElement('div');b.id='aircraft3dBadge';wrap.appendChild(b);}
  }

  function override(on){window.__AERONAV_3D_AIRCRAFT_CAMERA_OVERRIDE__=!!on;}

  async function loadModel(id){
    const v=viewer(),C=window.Cesium;if(!v||!C||!MODELS[id]||runtime.loading)return false;
    if(runtime.model&&runtime.modelId===id)return true;
    runtime.loading=true;runtime.error='';
    try{
      if(runtime.model){try{v.scene.primitives.remove(runtime.model);}catch(_){}runtime.model=null;runtime.modelId='';}
      const p=position();if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))throw new Error('posição indisponível');
      const matrix=C.Transforms.headingPitchRollToFixedFrame(C.Cartesian3.fromDegrees(p.lon,p.lat,p.alt),new C.HeadingPitchRoll(C.Math.toRadians(heading()),0,0));
      const cfg=MODELS[id];
      const model=await C.Model.fromGltfAsync({url:cfg.url,modelMatrix:matrix,minimumPixelSize:cfg.minPx,maximumScale:20000});
      v.scene.primitives.add(model);runtime.model=model;runtime.modelId=id;v.scene.requestRender?.();return true;
    }catch(e){runtime.error=String(e?.message||e||'erro 3D');return false;}
    finally{runtime.loading=false;}
  }

  function updateModel(){
    const v=viewer(),C=window.Cesium;if(!v||!C||!runtime.model)return;
    const p=position();if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))return;
    runtime.model.modelMatrix=C.Transforms.headingPitchRollToFixedFrame(C.Cartesian3.fromDegrees(p.lon,p.lat,p.alt),new C.HeadingPitchRoll(C.Math.toRadians(heading()),0,0));
    runtime.model.show=true;
  }

  function updateCamera(){
    const v=viewer(),C=window.Cesium;if(!v||!C||!runtime.model)return;
    const pr=preset(),cam=CAMERA[pr]||CAMERA.behind,p=position();if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))return;
    const cfg=MODELS[runtime.modelId]||MODELS.c152,h=heading();
    let off=cam.offset;if(pr==='orbit'){runtime.orbit=(runtime.orbit+2.4)%360;off=180+runtime.orbit;}else runtime.orbit=0;
    const target=C.Cartesian3.fromDegrees(p.lon,p.lat,p.alt);
    v.camera.lookAt(target,new C.HeadingPitchRange(C.Math.toRadians((h+off+360)%360),C.Math.toRadians(cam.pitch),cfg.range*cam.range));
    v.scene.requestRender?.();
  }

  async function activate(){
    ensureStyle();if(!shouldRun()){deactivate();return false;}
    const id=selectedId();if(!runtime.model||runtime.modelId!==id){if(!await loadModel(id))return false;}
    runtime.active=true;override(true);document.body.classList.add('aeronav-aircraft-3d-on');
    const b=document.getElementById('aircraft3dBadge');if(b)b.textContent=`3D · ${MODELS[id].name} · ${String(cameraStatus().preset||'behind').toUpperCase()}`;
    updateModel();updateCamera();return true;
  }

  function deactivate(){
    if(!runtime.active&&!window.__AERONAV_3D_AIRCRAFT_CAMERA_OVERRIDE__)return;
    runtime.active=false;override(false);document.body.classList.remove('aeronav-aircraft-3d-on');
    if(runtime.model)runtime.model.show=false;
    const v=viewer(),C=window.Cesium;try{if(v&&C)v.camera.lookAtTransform(C.Matrix4.IDENTITY);}catch(_){}
    setTimeout(()=>{try{window.AERONAVPhoto3DRenderer?.sync?.();}catch(_){}},40);
  }

  async function tick(){
    const now=performance.now();if(now-runtime.lastUpdate<120)return;runtime.lastUpdate=now;
    if(!shouldRun()){deactivate();return;}
    const id=selectedId();if(!runtime.model||runtime.modelId!==id||!runtime.active){await activate();return;}
    updateModel();updateCamera();
    const b=document.getElementById('aircraft3dBadge');if(b)b.textContent=`3D · ${MODELS[id].name} · ${String(cameraStatus().preset||'behind').toUpperCase()}`;
  }

  window.AERONAV3DAircraft={
    release:'RC12.37.12',activate,deactivate,sync:tick,
    models:()=>Object.fromEntries(Object.entries(MODELS).map(([k,v])=>[k,{name:v.name,url:v.url}])),
    status:()=>({release:'RC12.37.12',active:runtime.active,loading:runtime.loading,error:runtime.error,aircraft:selectedId(),aircraftName:MODELS[selectedId()].name,modelLoaded:!!runtime.model,modelId:runtime.modelId,preset:preset()})
  };

  ensureStyle();
  ['aeronav:camera-change','aeronav:map-ready','aeronav:screen-change','pageshow'].forEach(ev=>window.addEventListener(ev,()=>setTimeout(tick,80)));
  document.addEventListener('change',e=>{if(e.target?.matches?.('#addonAircraft'))setTimeout(tick,120);},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)deactivate();else setTimeout(tick,100);});
  setInterval(tick,140);setTimeout(tick,900);
})();
