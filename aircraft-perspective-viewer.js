/* AERONAV RC12.37.14 — aircraft-only camera presets, local GLB/WebGL, map stays untouched. */
(() => {
  'use strict';
  if (window.__AERONAV_AIRCRAFT_PERSPECTIVES_3714__) return;
  window.__AERONAV_AIRCRAFT_PERSPECTIVES_3714__ = true;
  if (/\/(?:mathia|wendler|family)(?:\/|\.html|$)/i.test(location.pathname || '')) return;

  // No server, photo-3D entitlement or Google tiles are required: these GLBs are
  // stored in the AERONAV offline cache. Never change MapLibre's pitch or bearing.
  const MODELS = {
    c152:['Cessna 152','c152.glb'], c172:['Cessna 172','c172.glb'],
    q400:['Dash 8 Q400','q400.glb'], b7377:['Boeing 737-700','b7377.glb'],
    a2203:['Airbus A220-300','a2203.glb'], b777300:['Boeing 777-300ER','b777300.glb'],
    b7879:['Boeing 787-9','b7879.glb'], b78710:['Boeing 787-10','b78710.glb']
  };
  const PRESETS = ['behind','left','right','top','inclined','orbit','cockpit'];
  const $ = s => document.querySelector(s);
  const runtime = { canvas:null, gl:null, program:null, positions:[], index:-1, color:-1,
    projection:-1, model:null, modelId:'', pendingId:'', loadToken:0, active:false,
    lastDraw:0, orbit:0, lastPreset:'', error:'', lastErrorId:'', status:null,
    contextLost:false, frame:0, label:null, running:false };

  function flightStatus() {
    try { return window.AERONAVFlightCamera?.status?.() || {}; } catch (_) { return {}; }
  }
  function activeNow() {
    const s=flightStatus();
    return !document.hidden && !!s.active && s.enabled!==false &&
      !!$('#screen-map.active') && localStorage.getItem('aeronav.mode')!=='drive' &&
      localStorage.getItem('aeronav.mode')!=='walk';
  }
  function aircraftId() {
    const id=localStorage.getItem('aeronav.aircraftPref') || 'c152';
    return MODELS[id]?id:'c152';
  }
  function preset() {
    const p=flightStatus().preset || 'behind';
    return PRESETS.includes(p)?p:'behind';
  }
  function ensureUI() {
    const wrap=$('#screen-map .map-wrap');
    if (!wrap) return false;
    if (!$('#aircraftPerspectiveStyle3714')) {
      const style=document.createElement('style');
      style.id='aircraftPerspectiveStyle3714';
      style.textContent=`
        #aeronavAircraftPerspectiveCanvas{position:absolute;inset:0;width:100%;height:100%;
          z-index:28;pointer-events:none;display:none;background:transparent}
        body.aeronav-plane-webgl-on #aeronavAircraftPerspectiveCanvas{display:block}
        body.aeronav-plane-webgl-on #flightCameraAircraft,
        body.aeronav-plane-webgl-on #aeronavRearAircraft,
        body.aeronav-plane-webgl-on .position-marker.flight{display:none!important}
        #aircraftPerspectiveHint3714{position:absolute;z-index:34;left:50%;top:48%;
          transform:translate(-50%,-50%);border:1px solid #3d6886;border-radius:10px;
          color:#d9f3ff;background:#071827e8;padding:8px 12px;font:700 11px system-ui;
          text-align:center;pointer-events:none;display:none;max-width:80%}
        body.aeronav-plane-webgl-loading #aircraftPerspectiveHint3714,
        body.aeronav-plane-webgl-error #aircraftPerspectiveHint3714{display:block}
        #aircraftPerspectiveCockpit3714{position:absolute;inset:0;z-index:30;
          pointer-events:none;display:none;border:9px solid #071d2c99;
          border-top:24px solid #071d2c66;border-radius:35px 35px 0 0;
          box-shadow:inset 0 -55px 65px -55px #071d2c}
        body.aeronav-plane-webgl-on.aeronav-plane-cockpit #aircraftPerspectiveCockpit3714{display:block}
      `;
      document.head.appendChild(style);
    }
    if(!runtime.canvas || !runtime.canvas.isConnected) {
      const cv=document.createElement('canvas');
      cv.id='aeronavAircraftPerspectiveCanvas';
      cv.setAttribute('aria-label','Perspetiva tridimensional da aeronave selecionada');
      wrap.appendChild(cv);runtime.canvas=cv;
      cv.addEventListener('webglcontextlost', e=>{
        e.preventDefault();runtime.contextLost=true;runtime.active=false;
        document.body.classList.remove('aeronav-plane-webgl-on');
      });
      cv.addEventListener('webglcontextrestored', ()=>{
        runtime.contextLost=false;runtime.gl=null;runtime.program=null;
        runtime.model=null;runtime.modelId='';runtime.pendingId='';runtime.error='';
      });
    }
    let hint=$('#aircraftPerspectiveHint3714');
    if(!hint){hint=document.createElement('div');hint.id='aircraftPerspectiveHint3714';wrap.appendChild(hint);}
    runtime.label=hint;
    if(!$('#aircraftPerspectiveCockpit3714')){
      const rim=document.createElement('div');rim.id='aircraftPerspectiveCockpit3714';wrap.appendChild(rim);
    }
    return true;
  }
  function shader(gl,type,src) {
    const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('GLSL: '+gl.getShaderInfoLog(sh));
    return sh;
  }
  function initializeGL() {
    if(runtime.gl&&runtime.program)return runtime.gl;
    if(!ensureUI()||runtime.contextLost)return null;
    const gl=runtime.canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,
      premultipliedAlpha:false,preserveDrawingBuffer:false}) ||
      runtime.canvas.getContext('experimental-webgl',{alpha:true,antialias:true,depth:true});
    if(!gl)throw Error('WebGL indisponível neste dispositivo');
    const vert=shader(gl,gl.VERTEX_SHADER,`attribute vec3 aPosition;
      uniform mat4 uProjection;uniform mat4 uView;
      void main(){gl_Position=uProjection*uView*vec4(aPosition,1.0);}`);
    const frag=shader(gl,gl.FRAGMENT_SHADER,`precision mediump float;
      uniform vec4 uColor;void main(){gl_FragColor=uColor;}`);
    const pg=gl.createProgram();gl.attachShader(pg,vert);gl.attachShader(pg,frag);
    gl.linkProgram(pg);
    if(!gl.getProgramParameter(pg,gl.LINK_STATUS))throw Error('Ligação GLSL: '+gl.getProgramInfoLog(pg));
    gl.deleteShader(vert);gl.deleteShader(frag);
    runtime.gl=gl;runtime.program=pg;
    runtime.positions=gl.getAttribLocation(pg,'aPosition');
    runtime.projection=gl.getUniformLocation(pg,'uProjection');
    runtime.view=gl.getUniformLocation(pg,'uView');
    runtime.color=gl.getUniformLocation(pg,'uColor');
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
    return gl;
  }
  function parseGLB(buffer) {
    const dv=new DataView(buffer);
    if(buffer.byteLength<20 || dv.getUint32(0,true)!==0x46546c67 || dv.getUint32(4,true)!==2)
      throw Error('Modelo GLB inválido');
    if(dv.getUint32(8,true)>buffer.byteLength)throw Error('GLB incompleto');
    let off=12,json=null,bin=null;
    while(off+8<=buffer.byteLength){
      const len=dv.getUint32(off,true),type=dv.getUint32(off+4,true);off+=8;
      if(off+len>buffer.byteLength)throw Error('Segmento GLB truncado');
      if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,off,len)));
      if(type===0x004e4942)bin={start:off,size:len};
      off+=len;
    }
    if(!json?.meshes?.length||!bin)throw Error('Modelo GLB sem geometria');
    const meshes=[];let radius=1;
    for(const mesh of json.meshes){for(const prim of mesh.primitives||[]){
      if(prim.mode!==undefined&&prim.mode!==4)continue;
      const posAcc=json.accessors[prim.attributes?.POSITION],idxAcc=json.accessors[prim.indices];
      if(!posAcc||!idxAcc||posAcc.type!=='VEC3'||posAcc.componentType!==5126||
        idxAcc.type!=='SCALAR'||![5123,5125].includes(idxAcc.componentType))continue;
      const posView=json.bufferViews[posAcc.bufferView],idxView=json.bufferViews[idxAcc.bufferView];
      if(!posView||!idxView||posView.byteStride||idxView.byteStride||
        (posView.buffer??0)!==0||(idxView.buffer??0)!==0)continue;
      const po=bin.start+(posView.byteOffset||0)+(posAcc.byteOffset||0);
      const io=bin.start+(idxView.byteOffset||0)+(idxAcc.byteOffset||0);
      const npos=posAcc.count*12,nidx=idxAcc.count*(idxAcc.componentType===5125?4:2);
      if(po<bin.start||io<bin.start||po+npos>bin.start+bin.size||io+nidx>bin.start+bin.size)throw Error('Acesso GLB inválido');
      // Copy to aligned buffers. Supplied AERONAV assets have independent array/index views.
      const xyz=new Float32Array(buffer.slice(po,po+npos));
      const indices=idxAcc.componentType===5125?
        new Uint32Array(buffer.slice(io,io+nidx)):
        new Uint16Array(buffer.slice(io,io+nidx));
      if(indices instanceof Uint32Array)throw Error('Modelo exige extensão WebGL de índices de 32 bits');
      for(let j=0;j<xyz.length;j+=3)radius=Math.max(radius,Math.hypot(xyz[j],xyz[j+1],xyz[j+2]));
      const material=json.materials?.[prim.material]||{};
      const rgba=material.pbrMetallicRoughness?.baseColorFactor||[.94,.96,1,1];
      meshes.push({xyz,indices,color:rgba.slice(0,4)});
    }}
    if(!meshes.length)throw Error('Modelo sem triângulos compatíveis');
    return{meshes,radius};
  }
  function disposeGPU() {
    const gl=runtime.gl;
    if(gl&&runtime.model)for(const part of runtime.model.parts){
      try{gl.deleteBuffer(part.vertex);gl.deleteBuffer(part.index);}catch(_){}
    }
    runtime.model=null;runtime.modelId='';
  }
  function uploadModel(parsed) {
    const gl=runtime.gl;disposeGPU();
    const parts=parsed.meshes.map(part=>{
      const vertex=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertex);
      gl.bufferData(gl.ARRAY_BUFFER,part.xyz,gl.STATIC_DRAW);
      const index=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,part.indices,gl.STATIC_DRAW);
      return {vertex,index,count:part.indices.length,color:part.color};
    });
    runtime.model={parts,radius:parsed.radius};
  }
  async function loadModel(id) {
    if(runtime.pendingId===id||runtime.modelId===id)return;
    runtime.pendingId=id;const token=++runtime.loadToken;
    runtime.error='';runtime.label.textContent='A carregar modelo 3D: '+MODELS[id][0];
    document.body.classList.add('aeronav-plane-webgl-loading');
    try{
      const response=await fetch('./assets/aircraft3d/'+MODELS[id][1]);
      if(!response.ok)throw Error('Modelo não encontrado (HTTP '+response.status+')');
      const parsed=parseGLB(await response.arrayBuffer());
      if(token!==runtime.loadToken)return;
      initializeGL();uploadModel(parsed);runtime.modelId=id;runtime.error='';
    }catch(e){
      if(token===runtime.loadToken){runtime.error=String(e?.message||e);runtime.lastErrorId=id;}
    }finally{
      if(token===runtime.loadToken){runtime.pendingId='';document.body.classList.remove('aeronav-plane-webgl-loading');}
    }
  }
  const normalize=v=>{const len=Math.hypot(...v)||1;return v.map(x=>x/len);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function viewMatrix(eye,target,up){
    const z=normalize(eye.map((v,i)=>v-target[i]));
    let x=normalize(cross(up,z));
    if(Math.hypot(...cross(up,z))<.00001)x=[0,1,0];
    const y=cross(z,x);
    return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,
      x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
  }
  function perspective(fov,aspect,near,far){
    const f=1/Math.tan(fov/2),d=1/(near-far);
    return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*d,-1,
      0,0,2*far*near*d,0]);
  }
  function cameraFor(p,radius,aspect,time){
    // Nose points +X, wings span +/-Y, fin +Z in the supplied GLBs.
    const d=radius*(aspect<.75?5.1:aspect<1.15?4.3:3.5);
    const h=d*.28;
    if(p==='behind')return{eye:[-d,0,h],target:[0,0,0],up:[0,0,1]};
    if(p==='left')return{eye:[-d*.07,-d,h],target:[0,0,0],up:[0,0,1]};
    if(p==='right')return{eye:[-d*.07,d,h],target:[0,0,0],up:[0,0,1]};
    if(p==='top')return{eye:[0,0,d],target:[0,0,0],up:[1,0,0]};
    if(p==='inclined')return{eye:[-d*.76,-d*.65,d*.59],target:[0,0,0],up:[0,0,1]};
    if(p==='orbit'){
      const a=time*.00027;
      return{eye:[-Math.cos(a)*d,Math.sin(a)*d,h],target:[0,0,0],up:[0,0,1]};
    }
    // Cockpit = simulated camera at the front looking over the nose; GLB has no interior mesh.
    return{eye:[radius*.64,0,radius*.12],target:[radius*3.5,0,radius*.1],up:[0,0,1]};
  }
  function render(now){
    const gl=runtime.gl,m=runtime.model,c=runtime.canvas;
    if(!gl||!m||!c)return;
    const size=c.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.6);
    const w=Math.max(1,Math.round(size.width*dpr)),h=Math.max(1,Math.round(size.height*dpr));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
    gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const p=preset(),cam=cameraFor(p,m.radius,w/h,now);
    gl.useProgram(runtime.program);
    gl.uniformMatrix4fv(runtime.projection,false,perspective(48*Math.PI/180,w/h,.05,m.radius*40));
    gl.uniformMatrix4fv(runtime.view,false,viewMatrix(cam.eye,cam.target,cam.up));
    gl.enableVertexAttribArray(runtime.positions);
    for(const part of m.parts){
      gl.bindBuffer(gl.ARRAY_BUFFER,part.vertex);
      gl.vertexAttribPointer(runtime.positions,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,part.index);
      gl.uniform4fv(runtime.color,part.color);
      gl.drawElements(gl.TRIANGLES,part.count,gl.UNSIGNED_SHORT,0);
    }
  }
  function tick(now){
    runtime.frame=requestAnimationFrame(tick);
    if(now-runtime.lastDraw<32)return;
    runtime.lastDraw=now;
    if(!ensureUI()||!activeNow()){
      runtime.active=false;document.body.classList.remove('aeronav-plane-webgl-on','aeronav-plane-cockpit','aeronav-plane-webgl-loading','aeronav-plane-webgl-error');
      return;
    }
    const id=aircraftId();
    if(runtime.modelId!==id){
      if(!runtime.pendingId && runtime.lastErrorId!==id){
        try{initializeGL();loadModel(id);}catch(e){runtime.error=String(e?.message||e);runtime.lastErrorId=id;}
      }
      runtime.active=false;document.body.classList.remove('aeronav-plane-webgl-on');
      document.body.classList.toggle('aeronav-plane-webgl-error',!!runtime.error);
      if(runtime.error&&runtime.label)runtime.label.textContent='Vista 3D indisponível: '+runtime.error;
      return;
    }
    if(runtime.contextLost||!runtime.model)return;
    runtime.active=true;
    document.body.classList.add('aeronav-plane-webgl-on');
    document.body.classList.remove('aeronav-plane-webgl-error');
    document.body.classList.toggle('aeronav-plane-cockpit',preset()==='cockpit');
    try{render(now);}catch(e){runtime.error=String(e?.message||e);runtime.active=false;
      runtime.lastErrorId=id;document.body.classList.remove('aeronav-plane-webgl-on');}
  }
  window.AERONAVAircraftPerspective={
    release:'RC12.37.14',
    status:()=>({release:'RC12.37.14',active:runtime.active,ready:!!runtime.model,
      aircraft:runtime.modelId||aircraftId(),preset:preset(),error:runtime.error,
      offlineModels:true,mapCameraUnchanged:true}),
    retry:()=>{runtime.lastErrorId='';runtime.error='';disposeGPU();}
  };
  function start(){if(runtime.running)return;runtime.running=true;ensureUI();runtime.frame=requestAnimationFrame(tick);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
