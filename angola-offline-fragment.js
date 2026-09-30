/* AERONAV RC11.97 — Angola Offline persistent picker and verified storage.
   This file is injected by sw.js into the main index.html at the PMTiles marker,
   so it executes inside the existing AERONAV application scope. */

  const ANGOLA_RELEASE_BASE='https://github.com/jorgejunqueira1986/-AERONAV-navega-o-Family-Live-ADS-B-GPS-mapas-offline-e-simuladores/releases/download/maps-angola-v1/';
  const ANGOLA_MAP_BOUNDS=[11.4,-18.2,24.2,-4.2];
  const ANGOLA_VECTOR_ID='angola-vector-z0-z15-v1';
  const ANGOLA_VFR_ID='angola-aeronautical-vfr-v1';
  const ANGOLA_TERRAIN_SOURCE_ID='angola-terrain-dem';
  const ANGOLA_VFR_SOURCE_ID='angola-vfr-overlay';
  const ANGOLA_MAP_ASSETS=[
    {id:ANGOLA_VECTOR_ID,kind:'terrestrial',name:'ANGOLA_VECTOR_z0-z15.pmtiles',role:'VECTOR',size:459544235,bounds:ANGOLA_MAP_BOUNDS},
    {id:ANGOLA_VFR_ID,kind:'aviation',name:'ANGOLA_AERONAUTICAL_VFR.pmtiles',role:'VFR',size:303476,bounds:ANGOLA_MAP_BOUNDS},
    {id:'angola-terrain-01-nw-v1',kind:'terrain',name:'ANGOLA_TERRAIN_01_NW.pmtiles',role:'TERRAIN 01 NW',size:500599127,bounds:[11.4,-9.5,17.8,-4.2]},
    {id:'angola-terrain-02-ne-v1',kind:'terrain',name:'ANGOLA_TERRAIN_02_NE.pmtiles',role:'TERRAIN 02 NE',size:556926687,bounds:[17.8,-9.5,24.2,-4.2]},
    {id:'angola-terrain-03-cw-v1',kind:'terrain',name:'ANGOLA_TERRAIN_03_CW.pmtiles',role:'TERRAIN 03 CW',size:298475502,bounds:[11.4,-13.85,17.8,-9.5]},
    {id:'angola-terrain-04-ce-v1',kind:'terrain',name:'ANGOLA_TERRAIN_04_CE.pmtiles',role:'TERRAIN 04 CE',size:368556369,bounds:[17.8,-13.85,24.2,-9.5]},
    {id:'angola-terrain-05-sw-v1',kind:'terrain',name:'ANGOLA_TERRAIN_05_SW.pmtiles',role:'TERRAIN 05 SW',size:323181355,bounds:[11.4,-18.2,17.8,-13.85]},
    {id:'angola-terrain-06-se-v1',kind:'terrain',name:'ANGOLA_TERRAIN_06_SE.pmtiles',role:'TERRAIN 06 SE',size:300850927,bounds:[17.8,-18.2,24.2,-13.85]}
  ].map(x=>({...x,url:ANGOLA_RELEASE_BASE+x.name}));

  function angolaPos(position){
    if(!position)return null;
    const lon=Number(position.lon??position.lng??position.longitude??position.coords?.longitude);
    const lat=Number(position.lat??position.latitude??position.coords?.latitude);
    return Number.isFinite(lon)&&Number.isFinite(lat)?{lon,lat}:null;
  }
  function angolaInside(position,bounds){
    const p=angolaPos(position);if(!p||!Array.isArray(bounds)||bounds.length!==4)return false;
    return p.lon>=bounds[0]&&p.lon<=bounds[2]&&p.lat>=bounds[1]&&p.lat<=bounds[3];
  }
  function angolaAssetByName(name){
    const clean=String(name||'').split('/').pop();
    return ANGOLA_MAP_ASSETS.find(a=>a.name===clean)||null;
  }
  function angolaMb(n){return (Number(n||0)/1024/1024).toFixed(Number(n||0)>100*1024*1024?0:1)+' MB';}

  const angolaImportState={busy:false,message:'',errors:[]};
  let angolaCardRevision=0;
  function angolaProgress(message){
    angolaImportState.message=message;
    const el=document.getElementById('angolaImportProgress');if(el)el.textContent=message;
    const button=document.getElementById('angolaImportBtn');if(button)button.disabled=angolaImportState.busy;
  }
  function angolaTimeout(promise,label,ms=45000){
    let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' demorou demasiado. Tente novamente com o ficheiro em “No meu iPhone”.')),ms);})]).finally(()=>clearTimeout(timer));
  }
  // Keep the input outside every renderable panel. iOS may return from Files
  // after readiness/GPS/network updates have replaced the entire offline screen.
  function angolaFileInput(){
    let input=document.getElementById('angolaPmtilesInput');if(input)return input;
    input=document.createElement('input');input.id='angolaPmtilesInput';input.type='file';
    input.accept='.pmtiles,application/octet-stream';input.multiple=true;input.hidden=true;
    document.body.appendChild(input);
    input.addEventListener('change',async()=>{
      const files=Array.from(input.files||[]);
      if(angolaImportState.busy)return;
      try{await angolaImportSelected(files);}catch(e){angolaProgress('Erro: '+(e.message||e));}
      finally{input.value='';}
    });
    input.addEventListener('cancel',()=>angolaProgress('Seleção cancelada. Pode tentar novamente.'));
    return input;
  }
  async function angolaMapTransaction(mode,action){
    const db=await angolaTimeout(dbOpen(),'Abrir armazenamento');
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('maps',mode);let value,requestError;
      const timer=setTimeout(()=>{try{tx.abort();}catch(_){}reject(new Error('Armazenamento sem resposta. Reabra a aplicação e tente novamente.'));},180000);
      tx.oncomplete=()=>{clearTimeout(timer);resolve(value);};
      tx.onabort=tx.onerror=()=>{clearTimeout(timer);reject(tx.error||requestError||new Error('Gravação cancelada pelo dispositivo.'));};
      try{const req=action(tx.objectStore('maps'));req.onsuccess=()=>{value=req.result;};req.onerror=()=>{requestError=req.error;};}
      catch(e){clearTimeout(timer);try{tx.abort();}catch(_){}reject(e);}
    });}finally{db.close();}
  }
  async function angolaVerifyBlob(blob,size){
    if(!blob||blob.size!==size||size<127)throw new Error('Ficheiro incompleto no armazenamento.');
    const head=new Uint8Array(await angolaTimeout(blob.slice(0,127).arrayBuffer(),'Ler cabeçalho'));
    if(new TextDecoder().decode(head.slice(0,7))!=='PMTiles'||head[7]!==3)throw new Error('Ficheiro inválido: é necessário PMTiles v3.');
    const tail=await angolaTimeout(blob.slice(-1).arrayBuffer(),'Ler fim do ficheiro');
    if(tail.byteLength!==1)throw new Error('Não foi possível ler o fim do ficheiro.');
    return head;
  }
  let angolaReaderPromise=null;
  function angolaLoadReader(){
    if(window.pmtiles)return Promise.resolve();
    if(angolaReaderPromise)return angolaReaderPromise;
    angolaReaderPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='./vendor/pmtiles-3.2.1.js';
      const timer=setTimeout(()=>finish(new Error('Leitor PMTiles indisponível. Abra a aplicação online para atualizar.')),30000);
      function finish(error){clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();}
      script.onload=()=>finish(window.pmtiles?null:new Error('Leitor PMTiles inválido.'));
      script.onerror=()=>finish(new Error('Não foi possível carregar o leitor PMTiles local.'));
      document.head.appendChild(script);
    }).catch(e=>{angolaReaderPromise=null;throw e;});
    return angolaReaderPromise;
  }
  async function angolaSaveFile(file,asset){
    if(!file||!asset)throw new Error('Ficheiro Angola não reconhecido.');
    if(file.size!==asset.size)throw new Error('Tamanho diferente do pacote oficial: esperado '+asset.size+' bytes, recebido '+file.size+'. Termine o download antes de importar.');
    const originalHeader=await angolaVerifyBlob(file,file.size);
    // Importing does not need MapLibre, WebGL, or an external CDN.
    await angolaLoadReader();
    const src=new pmtiles.PMTiles(new pmtiles.FileSource(file));
    const h=await angolaTimeout(src.getHeader(),'Validar PMTiles');
    const meta=await angolaTimeout(src.getMetadata(),'Ler metadados')||{};
    if(asset.kind!=='terrain'&&h.tileType!==1)throw new Error('Este pacote deve conter tiles vetoriais.');
    for(const [offset,length] of [[h.rootDirectoryOffset,h.rootDirectoryLength],[h.jsonMetadataOffset,h.jsonMetadataLength],[h.leafDirectoryOffset,h.leafDirectoryLength],[h.tileDataOffset,h.tileDataLength]]){
      if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>file.size)throw new Error('PMTiles truncado ou inválido.');
    }
    const vectorLayers=(typeof pmtilesVectorLayerIds==='function')?pmtilesVectorLayerIds(meta):((meta.vector_layers||[]).map(v=>v?.id).filter(Boolean));
    const detected=asset.kind==='terrain'?'terrarium-dem':(typeof detectPmtilesSchema==='function'?detectPmtilesSchema(meta):'');
    const rec={id:asset.id,kind:asset.kind,name:asset.name,key:asset.name,size:file.size,
      savedAt:Date.now(),tileType:h.tileType,
      tileFormat:typeof pmtilesTileFormat==='function'?pmtilesTileFormat(h.tileType):String(h.tileType||''),
      bounds:asset.bounds,minZoom:h.minZoom,maxZoom:h.maxZoom,pmtilesSchema:detected,vectorLayers,
      qualityProfile:state.mapQuality,deviceLocal:true,bundle:'angola-offline-v1',sourceUrl:asset.url,
      blob:file.slice(0,file.size,'application/octet-stream')};
    angolaProgress(asset.role+': a gravar '+angolaMb(file.size)+' no dispositivo… Mantenha a aplicação aberta.');
    // A successful put request alone is insufficient: wait for transaction commit.
    await angolaMapTransaction('readwrite',store=>store.put(rec));
    angolaProgress(asset.role+': a verificar leitura do ficheiro guardado…');
    const stored=await angolaMapTransaction('readonly',store=>store.get(asset.id));
    const storedHeader=await angolaVerifyBlob(stored?.blob,file.size);
    if(originalHeader.some((v,i)=>v!==storedHeader[i]))throw new Error('A verificação do ficheiro guardado falhou.');
    return stored;
  }
  async function angolaImportSelected(files){
    const selected=Array.from(files||[]);if(angolaImportState.busy)return;
    if(!selected.length){angolaProgress('Nenhum ficheiro selecionado.');return;}
    angolaImportState.busy=true;angolaImportState.errors=[];let ok=0;
    try{
      for(const file of selected){
        const asset=angolaAssetByName(file.name);
        try{
          if(!asset)throw new Error('Nome não reconhecido: '+file.name);
          angolaProgress(asset.role+': ficheiro recebido; a validar…');
          await angolaSaveFile(file,asset);ok++;
        }catch(e){
          const detail=e.name==='QuotaExceededError'?'Espaço insuficiente para este mapa. Liberte espaço no dispositivo.':(e.message||String(e));
          angolaImportState.errors.push((asset?.role||file.name)+': '+detail);console.warn('AERONAV Angola import',file.name,e);
        }
        await angolaInjectOfflineCard();
      }
    }finally{
      angolaImportState.busy=false;
      angolaProgress(ok+' ficheiro(s) guardado(s) e verificado(s). '+angolaImportState.errors.join(' | '));
      await angolaInjectOfflineCard();
      if(ok&&typeof updateMapMode==='function')Promise.resolve().then(()=>updateMapMode()).catch(e=>console.warn('Angola map refresh',e));
    }
  }

  async function angolaTerrainRecord(position){
    const p=angolaPos(position);if(!p)return null;
    for(const asset of ANGOLA_MAP_ASSETS.filter(a=>a.kind==='terrain')){
      if(!angolaInside(p,asset.bounds))continue;
      const rec=await dbGet('maps',asset.id).catch(()=>null);
      if(rec?.blob)return rec;
    }
    return null;
  }

  async function angolaWaitStyle(timeoutMs=4000){
    if(!state.map)return false;
    try{if(state.map.isStyleLoaded?.())return true;}catch(_){}
    return await new Promise(resolve=>{
      let done=false;
      const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};
      const timer=setTimeout(()=>finish(false),timeoutMs);
      try{state.map.once('style.load',()=>finish(true));}catch(_){finish(false);}
    });
  }

  async function angolaApplyTerrain(){
    if(state.mode!=='drive'||!state.map)return false;
    const rec=await angolaTerrainRecord(state.currentPosition).catch(()=>null);
    if(!rec?.blob)return false;
    await angolaWaitStyle(2500);
    if(!state.map)return false;
    try{
      if(state._angolaTerrainRecordId===rec.id&&state.map.getSource?.(ANGOLA_TERRAIN_SOURCE_ID))return true;
      try{state.map.setTerrain?.(null);}catch(_){}
      try{if(state.map.getSource?.(ANGOLA_TERRAIN_SOURCE_ID))state.map.removeSource(ANGOLA_TERRAIN_SOURCE_ID);}catch(_){}
      const file=rec.blob instanceof File?rec.blob:new File([rec.blob],rec.key||rec.name,{type:'application/octet-stream',lastModified:rec.savedAt||Date.now()});
      const src=new pmtiles.PMTiles(new pmtiles.FileSource(file));
      state.pmtilesProtocol.add(src);
      state.map.addSource(ANGOLA_TERRAIN_SOURCE_ID,{type:'raster-dem',url:`pmtiles://${file.name}`,tileSize:256,encoding:'terrarium',maxzoom:Number.isFinite(rec.maxZoom)?rec.maxZoom:12,attribution:'AERONAV Angola Terrain / Mapterhorn'});
      state.map.setTerrain?.({source:ANGOLA_TERRAIN_SOURCE_ID,exaggeration:1.04});
      state._angolaTerrainRecordId=rec.id;
      return true;
    }catch(e){console.warn('AERONAV Angola terrain',e);return false;}
  }

  function angolaSafeLayerId(s){return String(s||'layer').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,80);}
  async function angolaApplyVfrOverlay(){
    if(state.mode!=='flight'||!state.map)return false;
    const rec=await dbGet('maps',ANGOLA_VFR_ID).catch(()=>null);if(!rec?.blob)return false;
    await angolaWaitStyle(2500);if(!state.map)return false;
    try{
      if(state.map.getSource?.(ANGOLA_VFR_SOURCE_ID))return true;
      const file=rec.blob instanceof File?rec.blob:new File([rec.blob],rec.key||rec.name,{type:'application/octet-stream',lastModified:rec.savedAt||Date.now()});
      const src=new pmtiles.PMTiles(new pmtiles.FileSource(file));
      state.pmtilesProtocol.add(src);
      let layers=Array.isArray(rec.vectorLayers)?rec.vectorLayers.filter(Boolean):[];
      if(!layers.length){try{const meta=await src.getMetadata()||{};layers=(meta.vector_layers||[]).map(v=>v?.id).filter(Boolean);}catch(_){}}
      state.map.addSource(ANGOLA_VFR_SOURCE_ID,{type:'vector',url:`pmtiles://${file.name}`,attribution:'AERONAV Angola VFR'});
      layers.forEach((sourceLayer,i)=>{
        const base=`angola-vfr-${i}-${angolaSafeLayerId(sourceLayer)}`;
        const defs=[
          {id:base+'-fill',type:'fill',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#1f88c9','fill-opacity':0.08}},
          {id:base+'-line',type:'line',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#46b3e6','line-width':['interpolate',['linear'],['zoom'],4,0.8,10,1.5,16,2.4],'line-opacity':0.9}},
          {id:base+'-point',type:'circle',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#f5b942','circle-radius':['interpolate',['linear'],['zoom'],4,2.5,12,4.5,18,6],'circle-stroke-color':'#071725','circle-stroke-width':1}}
        ];
        defs.forEach(d=>{try{if(!state.map.getLayer?.(d.id))state.map.addLayer({...d,source:ANGOLA_VFR_SOURCE_ID,'source-layer':sourceLayer});}catch(_){}});
      });
      return true;
    }catch(e){console.warn('AERONAV Angola VFR',e);return false;}
  }

  async function angolaUseOfflineBaseIfNeeded(){
    const offline=state.net==='offline'||!navigator.onLine;
    const p=angolaPos(state.currentPosition);
    if(!offline||(p&&!angolaInside(p,ANGOLA_MAP_BOUNDS)))return false;
    const vector=await dbGet('maps',ANGOLA_VECTOR_ID).catch(()=>null);
    if(!vector?.blob)return false;
    if(state.offlineMapRecord?.id!==vector.id||state.currentMapStyle!=='offline'){
      state.offlineMapRecord=vector;
      await ensureMapStack(true);
      await useOfflinePmtiles(vector);
      await angolaWaitStyle(3500);
    }
    if(state.mode==='flight')await angolaApplyVfrOverlay();
    else if(state.mode==='drive')await angolaApplyTerrain();
    return true;
  }

  async function angolaStatus(){
    const result=[];
    for(const asset of ANGOLA_MAP_ASSETS){
      let installed=false;
      try{const rec=await angolaMapTransaction('readonly',store=>store.get(asset.id));if(rec?.blob){await angolaVerifyBlob(rec.blob,asset.size);installed=true;}}catch(e){console.warn('Angola status',asset.role,e);}
      result.push({...asset,installed});
    }
    return result;
  }

  async function angolaInjectOfflineCard(){
    const title=Array.from(document.querySelectorAll('h2')).find(el=>/Centro Offline/i.test(el.textContent||''));
    const panel=title?.closest('.panel-page');const cards=panel?.querySelector('.cards');if(!cards)return;
    angolaFileInput();
    const revision=++angolaCardRevision;
    const status=await angolaStatus();const ready=status.filter(x=>x.installed).length;
    if(revision!==angolaCardRevision||!cards.isConnected)return;
    document.getElementById('angolaOfflineCard')?.remove();
    const card=document.createElement('div');card.className='card';card.id='angolaOfflineCard';
    card.innerHTML=`<div class="page-head"><div><h3>🇦🇴 Angola Offline</h3><p>RC11.97 · Importação verificada no dispositivo.</p></div><span class="badge ${ready===8?'ok':'info'}">${ready}/8</span></div>
      <div class="sub">VECTOR para mapa base, VFR para VOO e 6 blocos de terreno para relevo offline. Os ficheiros grandes ficam no dispositivo, não dentro do GitHub Pages.</div>
      <div class="list" style="margin-top:10px">${status.map(a=>`<div class="list-item"><div class="item-icon">${a.kind==='aviation'?'✈':a.kind==='terrain'?'⛰':'🗺️'}</div><div class="item-main"><strong>${a.role}</strong><small>${a.name} · ${angolaMb(a.size)}</small></div><span class="badge ${a.installed?'ok':'info'}">${a.installed?'PRONTO':'FALTA'}</span></div>`).join('')}</div>
      <div id="angolaImportProgress" role="status" aria-live="polite" style="margin-top:10px;overflow-wrap:anywhere"></div>
      <div class="btn-row" style="margin-top:12px"><button class="primary-btn" id="angolaImportBtn">Importar ficheiros PMTiles</button>${ready?'<button class="secondary-btn" id="angolaOpenBtn">Usar Angola Offline</button>':''}</div>
      <div class="notice good" style="margin-top:10px">Também deixei os campos VOO e CONDUÇÃO abaixo apontados automaticamente para o Release oficial do GitHub.</div>`;
    cards.insertBefore(card,cards.firstChild);
    const av=document.querySelector('#aviationPmtilesUrl');if(av&&!av.value)av.value=ANGOLA_MAP_ASSETS.find(a=>a.id===ANGOLA_VFR_ID).url;
    const tr=document.querySelector('#terrestrialPmtilesUrl');if(tr&&!tr.value)tr.value=ANGOLA_MAP_ASSETS.find(a=>a.id===ANGOLA_VECTOR_ID).url;
    angolaProgress(angolaImportState.message);
    card.querySelector('#angolaImportBtn')?.addEventListener('click',()=>{
      if(angolaImportState.busy)return;
      angolaProgress('Selecione os PMTiles e toque em Abrir. A aguardar os ficheiros…');
      angolaFileInput().click();
    });
    card.querySelector('#angolaOpenBtn')?.addEventListener('click',async()=>{
      state.net='offline';localStorage.setItem('aeronav.net','offline');
      try{syncSegments();}catch(_){}
      try{setTab('map');}catch(_){}
      await angolaUseOfflineBaseIfNeeded();
    });
  }

  window.AERONAV_ANGOLA_MAPS={version:'maps-angola-v1',releaseBase:ANGOLA_RELEASE_BASE,assets:ANGOLA_MAP_ASSETS.map(({blob,...x})=>x)};

  queueMicrotask(()=>{
    try{
      const originalRenderOfflineScreen=renderOfflineScreen;
      renderOfflineScreen=function(...args){
        const out=originalRenderOfflineScreen.apply(this,args);
        Promise.resolve(out).finally(()=>setTimeout(()=>angolaInjectOfflineCard().catch(()=>{}),0));
        return out;
      };
    }catch(e){console.warn('AERONAV Angola render hook',e);}
    try{
      const originalUpdateMapMode=updateMapMode;
      updateMapMode=async function(...args){
        try{if(await angolaUseOfflineBaseIfNeeded())return true;}catch(e){console.warn('AERONAV Angola offline base',e);}
        const out=await originalUpdateMapMode.apply(this,args);
        try{if(state.mode==='flight')await angolaApplyVfrOverlay();else if(state.mode==='drive'&&(state.net==='offline'||state.currentMapStyle==='offline'))await angolaApplyTerrain();}catch(_){}
        return out;
      };
    }catch(e){console.warn('AERONAV Angola map hook',e);}
    setTimeout(()=>angolaInjectOfflineCard().catch(()=>{}),500);
    setInterval(()=>{
      if(document.visibilityState!=='visible')return;
      if(state.mode==='drive'&&(state.net==='offline'||state.currentMapStyle==='offline'))angolaApplyTerrain().catch(()=>{});
      else if(state.mode==='flight')angolaApplyVfrOverlay().catch(()=>{});
    },8000);
  });
