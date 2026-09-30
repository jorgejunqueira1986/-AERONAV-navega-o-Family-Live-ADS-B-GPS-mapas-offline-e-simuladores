/* AERONAV RC11.98.2 - Saved Addresses + Work/Home commute + Jorge Folga UI.
   Preserves RC11.98.1 and RC11.97 Angola Offline.
   - Saved address list: tap map, name + category, edit/delete/recenter.
   - Casa/Trabalho saved coordinates improve commute detection.
   - Folga is placed below CARRO with the same visual style, never over the map.
   - Work commute has priority and automatically turns Folga off when it starts. */
(()=>{
  'use strict';
  if(window.__AERONAV_WORK_STATUS_RC1198)return;
  window.__AERONAV_WORK_STATUS_RC1198=true;

  const path=(location.pathname||'').toLowerCase();
  const role=path.includes('/mathia/')?'mathia':path.includes('/wendler/')?'wendler':'jorge';
  const root=role==='jorge'?'./':'../';

  const assets={
    car:new URL(root+'assets/vehicles/work-car-avatar.png',location.href).href,
    jorgeFolga:new URL(root+'assets/people/jorge-folga-avatar.png',location.href).href
  };

  const available={car:false,jorgeFolga:false};
  const remoteMode=new Map();
  let applying=false;
  let lastRoad=false;

  const ADDRESS_KEY='aeronav.saved.addresses.'+role+'.v1';
  let addressPickMode=false;
  let pendingPoint=null;
  let lastCommute=false;
  let folgaButtonRef=null;

  function loadAddresses(){
    try{
      const v=JSON.parse(localStorage.getItem(ADDRESS_KEY)||'[]');
      return Array.isArray(v)?v:[];
    }catch(_){return [];}
  }

  function saveAddresses(list){
    try{
      localStorage.setItem(ADDRESS_KEY,JSON.stringify(list||[]));
      window.dispatchEvent(new CustomEvent('aeronav:addresses-changed',{detail:{role,addresses:list||[]}}));
    }catch(_){}
  }

  function normCategory(v){
    const s=String(v||'Outro').trim().toLowerCase();
    if(s==='casa'||s==='home')return 'Casa';
    if(s==='trabalho'||s==='work'||s==='emprego')return 'Trabalho';
    if(s==='aeroporto'||s==='airport')return 'Aeroporto';
    if(s==='hotel')return 'Hotel';
    if(s==='escola'||s==='school')return 'Escola';
    return 'Outro';
  }

  function haversineM(a,b){
    const R=6371000,toRad=x=>x*Math.PI/180;
    const p1=toRad(Number(a.lat)),p2=toRad(Number(b.lat));
    const dp=toRad(Number(b.lat)-Number(a.lat));
    const dl=toRad(Number(b.lng)-Number(a.lng));
    const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }

  function collectCoords(value,out,depth){
    if(!value||depth>7||out.length>2500)return;
    if(Array.isArray(value)){
      if(value.length>=2 && typeof value[0]==='number' && typeof value[1]==='number'){
        const x=Number(value[0]),y=Number(value[1]);
        if(Math.abs(x)<=180&&Math.abs(y)<=90)out.push({lng:x,lat:y});
      }
      for(const v of value)collectCoords(v,out,depth+1);
      return;
    }
    if(typeof value!=='object')return;
    const lat=value.lat??value.latitude;
    const lng=value.lng??value.lon??value.long??value.longitude;
    if(Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))){
      const p={lat:Number(lat),lng:Number(lng)};
      if(Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180)out.push(p);
    }
    for(const k of Object.keys(value)){
      if(/time|date|speed|alt|accuracy|heading|bearing/i.test(k))continue;
      try{collectCoords(value[k],out,depth+1);}catch(_){}
      if(out.length>2500)break;
    }
  }

  function routeCandidates(){
    const out=[];
    const seen=new Set();
    const add=v=>{
      if(!v||typeof v!=='object')return;
      try{
        const sig=JSON.stringify(v).slice(0,600);
        if(seen.has(sig))return;
        seen.add(sig);
      }catch(_){}
      out.push(v);
    };
    add(getRoute());
    const stores=[localStorage,sessionStorage];
    for(const store of stores){
      try{
        for(let i=0;i<store.length;i++){
          const k=store.key(i)||'';
          if(!/route|rota|trip|nav|journey|viagem/i.test(k))continue;
          const raw=store.getItem(k);
          if(!raw||raw.length<2||raw.length>3000000)continue;
          try{add(JSON.parse(raw));}catch(_){}
        }
      }catch(_){}
    }
    return out;
  }

  function savedCommuteByCoords(){
    const addresses=loadAddresses();
    const homes=addresses.filter(a=>normCategory(a.category)==='Casa');
    const works=addresses.filter(a=>normCategory(a.category)==='Trabalho');
    if(!homes.length||!works.length)return false;

    for(const r of routeCandidates()){
      const pts=[];
      collectCoords(r,pts,0);
      if(pts.length<2)continue;
      const nearHome=pts.some(p=>homes.some(a=>haversineM(p,a)<=500));
      const nearWork=pts.some(p=>works.some(a=>haversineM(p,a)<=500));
      if(nearHome&&nearWork)return true;
    }
    return false;
  }

  function checkAsset(url,key){
    const img=new Image();
    img.onload=()=>{available[key]=true;applyAvatars();};
    img.onerror=()=>{available[key]=false;};
    img.src=url+(url.includes('?')?'&':'?')+'v=RC11.98.2';
  }

  checkAsset(assets.car,'car');
  checkAsset(assets.jorgeFolga,'jorgeFolga');

  function getRoute(){
    try{
      if(typeof state!=='undefined'&&state){
        return state.currentRoute||state.activeRoute||null;
      }
    }catch(_){}
    try{
      if(typeof cfg!=='undefined'&&cfg){
        return cfg.ownRoute||cfg.currentRoute||cfg.activeRoute||null;
      }
    }catch(_){}
    return null;
  }

  function roadRouteActive(){
    const r=getRoute();
    if(!r)return false;

    const kind=String(r.kind||r.mode||r.transport||r.travelMode||'').toLowerCase();
    if(kind){
      return /road|car|drive|driving|carro|condu/.test(kind) &&
             !/flight|voo|walk|foot|ped/.test(kind);
    }

    const txt=JSON.stringify(r).toLowerCase();
    return /carro|condu|drive|driving|road/.test(txt) &&
           !/flight|voo/.test(txt);
  }

  function commuteRouteActive(){
    for(const r of routeCandidates()){
      if(!r)continue;
      let txt='';
      try{txt=JSON.stringify(r).toLowerCase();}catch(_){}
      const road=/road|car|drive|driving|carro|condu/.test(txt)&&!/flight|voo|walk|foot|ped/.test(txt);
      const named=/trabalho|work|emprego|office|escrit[oó]rio|casa|home|resid[eê]ncia/.test(txt);
      if(road&&named)return true;
    }
    return savedCommuteByCoords();
  }

  function isFolga(){
    return role==='jorge' &&
           localStorage.getItem('aeronav.jorge.folga')==='1';
  }

  function localMode(){
    if(commuteRouteActive())return 'car';
    if(isFolga())return 'folga';
    return 'person';
  }

  function setFolga(on){
    try{localStorage.setItem('aeronav.jorge.folga',on?'1':'0');}catch(_){}
    paintFolgaButton();
    applyAvatars();
    try{
      window.dispatchEvent(new CustomEvent('aeronav:work-status',{
        detail:{role:'jorge',mode:on?'folga':'person'}
      }));
    }catch(_){}
  }

  function paintFolgaButton(){
    const b=folgaButtonRef||document.getElementById('aeronavFolgaBtn');
    if(!b)return;
    const on=isFolga();
    b.textContent=on?'🏖️ FOLGA ✓':'🏖️ FOLGA';
    b.setAttribute('aria-pressed',on?'true':'false');
  }

  function findModeButton(label){
    const wanted=String(label).trim().toUpperCase();
    return [...document.querySelectorAll('button,[role="button"],a')].find(el=>{
      const t=String(el.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
      return t===wanted||t.endsWith(' '+wanted)||t.includes(wanted);
    })||null;
  }

  function cloneModeButton(source,id,text){
    const b=source.cloneNode(false);
    b.id=id;
    b.removeAttribute('href');
    b.removeAttribute('onclick');
    b.removeAttribute('data-action');
    b.type='button';
    b.textContent=text;
    b.style.position='relative';
    b.style.inset='auto';
    b.style.margin='0';
    b.style.width='100%';
    b.style.minWidth='0';
    b.style.maxWidth='none';
    b.style.transform='none';
    return b;
  }

  function injectHeaderControls(){
    if(role!=='jorge')return;

    const old=document.getElementById('aeronavFolgaBtn');
    if(old&&old.dataset.aeronavHeaderControl!=='1')old.remove();

    if(document.getElementById('aeronavSecondaryModeRow')){
      folgaButtonRef=document.getElementById('aeronavFolgaBtn');
      paintFolgaButton();
      return;
    }

    const car=findModeButton('CARRO');
    const voo=findModeButton('VOO')||car;
    if(!car||!car.parentElement)return;

    const row=car.parentElement;
    const holder=document.createElement('div');
    holder.id='aeronavSecondaryModeRow';
    holder.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:8px 0 10px;width:100%;align-items:stretch;';

    const addresses=cloneModeButton(voo,'aeronavAddressesBtn','📍 ENDEREÇOS');
    addresses.dataset.aeronavHeaderControl='1';
    addresses.addEventListener('click',openAddressPanel);

    const folga=cloneModeButton(car,'aeronavFolgaBtn','🏖️ FOLGA');
    folga.dataset.aeronavHeaderControl='1';
    folga.addEventListener('click',()=>{
      if(commuteRouteActive())return;
      setFolga(!isFolga());
    });

    const blank=document.createElement('div');
    blank.setAttribute('aria-hidden','true');

    holder.append(addresses,folga,blank);
    row.insertAdjacentElement('afterend',holder);

    folgaButtonRef=folga;
    paintFolgaButton();
  }

  function ensureAddressStyles(){
    if(document.getElementById('aeronavAddressStyles'))return;
    const s=document.createElement('style');
    s.id='aeronavAddressStyles';
    s.textContent=`
      #aeronavAddressOverlay{position:fixed;inset:0;z-index:2147483500;background:rgba(0,10,20,.74);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;padding:16px env(safe-area-inset-right,16px) calc(16px + env(safe-area-inset-bottom,0px)) env(safe-area-inset-left,16px)}
      #aeronavAddressPanel{width:min(680px,100%);max-height:82vh;overflow:auto;background:#071b2a;border:1px solid #245a78;border-radius:22px;padding:16px;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif}
      #aeronavAddressPanel h2{margin:0;font-size:20px}
      .aeronavAddrTop{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
      .aeronavAddrBtn{border:1px solid #2e6c8c;background:#0c3148;color:#fff;border-radius:14px;padding:11px 13px;font-weight:750;font-size:14px}
      .aeronavAddrPrimary{background:#0b8dcc;border-color:#47c7ff}
      .aeronavAddrDanger{background:#401923;border-color:#a54b61}
      .aeronavAddrList{display:grid;gap:9px;margin-top:12px}
      .aeronavAddrItem{background:#0a2538;border:1px solid #214e68;border-radius:16px;padding:12px}
      .aeronavAddrName{font-weight:800;font-size:16px}
      .aeronavAddrMeta{opacity:.72;font-size:12px;margin-top:3px}
      .aeronavAddrActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
      #aeronavAddressEditor label{display:block;font-size:12px;opacity:.8;margin:10px 0 5px}
      #aeronavAddressEditor input,#aeronavAddressEditor select{width:100%;box-sizing:border-box;border:1px solid #315e77;border-radius:12px;background:#061722;color:#fff;padding:12px;font-size:16px}
      #aeronavAddressPickToast{position:fixed;z-index:2147483600;left:50%;top:calc(18px + env(safe-area-inset-top,0px));transform:translateX(-50%);max-width:92vw;background:#07283c;color:#fff;border:1px solid #39a9dc;border-radius:999px;padding:10px 16px;font:750 14px system-ui,-apple-system,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.35)}
    `;
    document.head.appendChild(s);
  }

  function closeAddressPanel(){
    document.getElementById('aeronavAddressOverlay')?.remove();
  }

  function startAddressPick(){
    closeAddressPanel();
    addressPickMode=true;
    document.getElementById('aeronavAddressPickToast')?.remove();
    const t=document.createElement('div');
    t.id='aeronavAddressPickToast';
    t.textContent='📍 Toque no ponto exato do mapa que quer guardar';
    document.body.appendChild(t);
  }

  function openAddressEditor(point,existing){
    ensureAddressStyles();
    pendingPoint={lat:Number(point.lat),lng:Number(point.lng)};
    closeAddressPanel();

    const overlay=document.createElement('div');
    overlay.id='aeronavAddressOverlay';
    const panel=document.createElement('div');
    panel.id='aeronavAddressPanel';
    panel.innerHTML=`
      <div class="aeronavAddrTop"><h2>${existing?'Editar endereço':'Guardar endereço'}</h2><button class="aeronavAddrBtn" data-close>✕</button></div>
      <div id="aeronavAddressEditor">
        <label>Nome</label>
        <input id="aeronavAddrNameInput" maxlength="60" placeholder="Ex.: Casa, Trabalho TAAG, Hotel..." value="">
        <label>Categoria</label>
        <select id="aeronavAddrCategoryInput">
          <option>Casa</option><option>Trabalho</option><option>Aeroporto</option><option>Hotel</option><option>Escola</option><option>Outro</option>
        </select>
        <div class="aeronavAddrMeta" style="margin-top:10px">${pendingPoint.lat.toFixed(6)}, ${pendingPoint.lng.toFixed(6)}</div>
        <div class="aeronavAddrActions" style="margin-top:14px">
          <button class="aeronavAddrBtn aeronavAddrPrimary" data-save>Guardar</button>
          <button class="aeronavAddrBtn" data-cancel>Cancelar</button>
        </div>
      </div>`;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const nameInput=panel.querySelector('#aeronavAddrNameInput');
    const catInput=panel.querySelector('#aeronavAddrCategoryInput');
    if(existing){
      nameInput.value=existing.name||'';
      catInput.value=normCategory(existing.category);
    }

    panel.querySelector('[data-close]').onclick=closeAddressPanel;
    panel.querySelector('[data-cancel]').onclick=openAddressPanel;
    panel.querySelector('[data-save]').onclick=()=>{
      const name=String(nameInput.value||'').trim();
      if(!name){nameInput.focus();return;}
      const list=loadAddresses();
      const item={
        id:existing?.id||('addr_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)),
        name,
        category:normCategory(catInput.value),
        lat:pendingPoint.lat,
        lng:pendingPoint.lng,
        updatedAt:new Date().toISOString()
      };
      const idx=list.findIndex(x=>x.id===item.id);
      if(idx>=0)list[idx]=item;else list.push(item);
      saveAddresses(list);
      openAddressPanel();
    };
  }

  function findMapInstance(){
    try{
      for(const k of Object.getOwnPropertyNames(window)){
        let v;
        try{v=window[k];}catch(_){continue;}
        if(v&&typeof v==='object'&&typeof v.flyTo==='function'&&typeof v.getCenter==='function'){
          return v;
        }
      }
    }catch(_){}
    return null;
  }

  function mapFlyToAddress(a){
    const m=findMapInstance();
    if(m){
      try{
        const z=Math.max(Number(m.getZoom?.()||0),16);
        m.flyTo({center:[Number(a.lng),Number(a.lat)],zoom:z});
      }catch(_){}
    }
    try{window.dispatchEvent(new CustomEvent('aeronav:address-selected',{detail:a}));}catch(_){}
    closeAddressPanel();
  }

  function openAddressPanel(){
    ensureAddressStyles();
    closeAddressPanel();

    const overlay=document.createElement('div');
    overlay.id='aeronavAddressOverlay';
    const panel=document.createElement('div');
    panel.id='aeronavAddressPanel';

    const list=loadAddresses();
    panel.innerHTML=`
      <div class="aeronavAddrTop"><h2>📍 Endereços guardados</h2><button class="aeronavAddrBtn" data-close>✕</button></div>
      <button class="aeronavAddrBtn aeronavAddrPrimary" data-pick>＋ Guardar ponto do mapa</button>
      <div class="aeronavAddrList"></div>`;

    const listEl=panel.querySelector('.aeronavAddrList');
    if(!list.length){
      const empty=document.createElement('div');
      empty.className='aeronavAddrItem';
      empty.innerHTML='<div class="aeronavAddrName">Ainda não há endereços</div><div class="aeronavAddrMeta">Toque em “Guardar ponto do mapa” e depois no local exato.</div>';
      listEl.appendChild(empty);
    }else{
      for(const a of list){
        const item=document.createElement('div');
        item.className='aeronavAddrItem';
        const safeName=String(a.name||'Endereço').replace(/[<>&"]/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
        item.innerHTML=`
          <div class="aeronavAddrName">${safeName}</div>
          <div class="aeronavAddrMeta">${normCategory(a.category)} · ${Number(a.lat).toFixed(6)}, ${Number(a.lng).toFixed(6)}</div>
          <div class="aeronavAddrActions">
            <button class="aeronavAddrBtn" data-go>Ver no mapa</button>
            <button class="aeronavAddrBtn" data-edit>Editar</button>
            <button class="aeronavAddrBtn aeronavAddrDanger" data-del>Apagar</button>
          </div>`;
        item.querySelector('[data-go]').onclick=()=>mapFlyToAddress(a);
        item.querySelector('[data-edit]').onclick=()=>openAddressEditor(a,a);
        item.querySelector('[data-del]').onclick=()=>{
          saveAddresses(loadAddresses().filter(x=>x.id!==a.id));
          openAddressPanel();
        };
        listEl.appendChild(item);
      }
    }

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    panel.querySelector('[data-close]').onclick=closeAddressPanel;
    panel.querySelector('[data-pick]').onclick=startAddressPick;
  }

  function consumeMapClick(lngLat){
    if(!addressPickMode||!lngLat)return;
    const lat=Number(lngLat.lat),lng=Number(lngLat.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
    addressPickMode=false;
    document.getElementById('aeronavAddressPickToast')?.remove();
    openAddressEditor({lat,lng},null);
  }

  function installMapClickHook(){
    try{
      const proto=window.maplibregl?.Map?.prototype;
      if(!proto)return false;
      if(proto.__aeronavAddressHook)return true;
      const nativeFire=proto.fire;
      proto.fire=function(type,data){
        try{
          const eventType=typeof type==='string'?type:type?.type;
          const payload=typeof type==='string'?data:type;
          if(eventType==='click'&&addressPickMode&&payload?.lngLat){
            setTimeout(()=>consumeMapClick(payload.lngLat),0);
          }
        }catch(_){}
        return nativeFire.apply(this,arguments);
      };
      proto.__aeronavAddressHook=true;
      return true;
    }catch(_){return false;}
  }

  function elementText(el){
    let out='';
    let n=el;
    for(let i=0;n&&i<4;i++,n=n.parentElement){
      out+=' '+(n.id||'');
      out+=' '+(typeof n.className==='string'?n.className:'');
      out+=' '+(n.getAttribute?.('aria-label')||'');
      out+=' '+(n.getAttribute?.('title')||'');
      if(i<2)out+=' '+String(n.textContent||'').slice(0,120);
    }
    return out.toLowerCase();
  }

  function sourceOf(el){
    if(el.tagName==='IMG')return el.currentSrc||el.src||'';
    const bg=el.style?.backgroundImage||getComputedStyle(el).backgroundImage||'';
    const m=bg.match(/url\(["']?(.*?)["']?\)/i);
    return m?m[1]:'';
  }

  function identity(el,src){
    const hay=(src+' '+elementText(el)).toLowerCase();
    if(/jorge/.test(hay))return 'jorge';
    if(/mathia/.test(hay))return 'mathia';
    if(/wendler|wendy/.test(hay))return 'wendler';
    return '';
  }

  function desiredMode(id){
    if(id===role)return localMode();
    const rm=remoteMode.get(id);
    if(rm)return rm;
    return 'person';
  }

  function saveStyle(el,prop,key){
    if(el.dataset[key]!==undefined)return;
    el.dataset[key]=el.style.getPropertyValue(prop)||'';
    el.dataset[key+'Priority']=el.style.getPropertyPriority(prop)||'';
  }

  function restoreStyle(el,prop,key){
    if(el.dataset[key]===undefined)return;

    const value=el.dataset[key];
    const priority=el.dataset[key+'Priority']||'';

    if(value)el.style.setProperty(prop,value,priority);
    else el.style.removeProperty(prop);

    delete el.dataset[key];
    delete el.dataset[key+'Priority'];
  }

  function lockImgBox(el){
    if(el.dataset.aeronavBoxLocked==='1')return;

    const r=el.getBoundingClientRect();
    const w=Math.round(r.width);
    const h=Math.round(r.height);

    saveStyle(el,'width','aeronavOriginalWidth');
    saveStyle(el,'height','aeronavOriginalHeight');
    saveStyle(el,'max-width','aeronavOriginalMaxWidth');
    saveStyle(el,'max-height','aeronavOriginalMaxHeight');
    saveStyle(el,'object-fit','aeronavOriginalObjectFit');
    saveStyle(el,'object-position','aeronavOriginalObjectPosition');

    if(w>=12&&h>=12&&w<=220&&h<=260){
      el.style.setProperty('width',w+'px','important');
      el.style.setProperty('height',h+'px','important');
      el.style.setProperty('max-width',w+'px','important');
      el.style.setProperty('max-height',h+'px','important');
    }else{
      el.style.setProperty('width','64px','important');
      el.style.setProperty('height','64px','important');
      el.style.setProperty('max-width','64px','important');
      el.style.setProperty('max-height','64px','important');
    }

    el.style.setProperty('object-fit','contain','important');
    el.style.setProperty('object-position','center','important');
    el.dataset.aeronavBoxLocked='1';
  }

  function unlockImgBox(el){
    if(el.dataset.aeronavBoxLocked!=='1')return;

    restoreStyle(el,'width','aeronavOriginalWidth');
    restoreStyle(el,'height','aeronavOriginalHeight');
    restoreStyle(el,'max-width','aeronavOriginalMaxWidth');
    restoreStyle(el,'max-height','aeronavOriginalMaxHeight');
    restoreStyle(el,'object-fit','aeronavOriginalObjectFit');
    restoreStyle(el,'object-position','aeronavOriginalObjectPosition');

    delete el.dataset.aeronavBoxLocked;
  }

  function setImg(el,url){
    if(!el.dataset.aeronavOriginalSrc){
      el.dataset.aeronavOriginalSrc=el.currentSrc||el.src||'';
    }
    lockImgBox(el);
    if(el.src!==url)el.src=url;
  }

  function restoreImg(el){
    const orig=el.dataset.aeronavOriginalSrc;
    if(orig&&el.src!==orig)el.src=orig;
    delete el.dataset.aeronavOriginalSrc;
    unlockImgBox(el);
  }

  function setBg(el,url){
    if(!el.dataset.aeronavOriginalBg){
      el.dataset.aeronavOriginalBg=
        el.style.backgroundImage||
        getComputedStyle(el).backgroundImage||
        '';
    }

    el.style.backgroundImage='url("'+url+'")';
    el.style.backgroundSize='contain';
    el.style.backgroundRepeat='no-repeat';
    el.style.backgroundPosition='center';
  }

  function restoreBg(el){
    if(el.dataset.aeronavOriginalBg!==undefined &&
       el.dataset.aeronavOriginalBg!==''){
      el.style.backgroundImage=el.dataset.aeronavOriginalBg;
    }
    delete el.dataset.aeronavOriginalBg;
  }

  function applyOne(el){
    const src=sourceOf(el);
    if(!src)return;

    const id=identity(el,src);
    const isCar=/work-car-avatar|toyota-yaris|vehicle|car-avatar/i.test(src);

    if(!id&&!isCar)return;

    const mode=id
      ?desiredMode(id)
      :(isCar&&localMode()==='car'?'car':'person');

    if(mode==='folga'&&id==='jorge'&&available.jorgeFolga){
      if(el.tagName==='IMG')setImg(el,assets.jorgeFolga);
      else setBg(el,assets.jorgeFolga);
      return;
    }

    if(mode==='car'&&available.car&&(id==='jorge'||id==='mathia'||isCar)){
      if(el.tagName==='IMG')setImg(el,assets.car);
      else setBg(el,assets.car);
      return;
    }

    if(el.tagName==='IMG')restoreImg(el);
    else restoreBg(el);
  }

  function applyAvatars(){
    if(applying)return;
    applying=true;

    try{
      document.querySelectorAll('img').forEach(applyOne);
      document.querySelectorAll(
        '[style*="background"],.maplibregl-marker,.marker,.avatar'
      ).forEach(applyOne);
    }catch(_){}
    finally{
      applying=false;
    }
  }

  function readLocations(data){
    if(!Array.isArray(data))return;

    for(const m of data){
      const n=String(m?.display_name||m?.name||'').trim().toLowerCase();

      const id=
        n.includes('jorge')?'jorge':
        n.includes('mathia')?'mathia':
        n.includes('wendler')||n.includes('wendy')?'wendler':'';

      if(!id)continue;

      const tr=String(m?.transport||'').toLowerCase();
      remoteMode.set(
        id,
        tr==='folga'?'folga':
        tr==='work-car'?'car':
        'person'
      );
    }

    applyAvatars();
  }

  const nativeFetch=window.fetch.bind(window);

  window.fetch=async function(input,init){
    let nextInit=init;

    try{
      const url=typeof input==='string'?input:(input?.url||'');
      const locations=/aeronav_locations/i.test(url);

      if(
        locations &&
        init?.body &&
        typeof init.body==='string' &&
        /POST|PATCH|PUT/i.test(String(init.method||'POST'))
      ){
        let body=JSON.parse(init.body);
        let changed=false;
        const rows=Array.isArray(body)?body:[body];

        for(const row of rows){
          const n=String(row?.display_name||'').toLowerCase();

          const mine=
            (role==='jorge'&&n.includes('jorge'))||
            (role==='mathia'&&n.includes('mathia'));

          if(!mine)continue;

          const mode=localMode();

          if(mode==='folga'){
            row.transport='folga';
            changed=true;
          }else if(mode==='car'){
            row.transport='work-car';
            changed=true;
          }
        }

        if(changed){
          nextInit={
            ...init,
            body:JSON.stringify(Array.isArray(body)?rows:rows[0])
          };
        }
      }

      const res=await nativeFetch(input,nextInit);

      if(locations&&res?.ok){
        res.clone().json().then(readLocations).catch(()=>{});
      }

      return res;
    }catch(_){
      return nativeFetch(input,init);
    }
  };

  const observer=new MutationObserver(applyAvatars);

  function tick(){
    const nowRoad=commuteRouteActive();

    if(nowRoad&&!lastCommute&&role==='jorge'&&isFolga()){
      setFolga(false);
    }
    lastCommute=nowRoad;

    if(nowRoad!==lastRoad){
      lastRoad=nowRoad;
      applyAvatars();
    }

    injectHeaderControls();
    installMapClickHook();
    applyAvatars();
  }

  function start(){
    lastRoad=commuteRouteActive();
    injectFolgaButton();
    applyAvatars();

    try{
      observer.observe(document.documentElement,{
        childList:true,
        subtree:true,
        attributes:true,
        attributeFilter:['src','style','class']
      });
    }catch(_){}

    setInterval(tick,1500);

    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden)tick();
    });

    window.addEventListener('pageshow',tick);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();
