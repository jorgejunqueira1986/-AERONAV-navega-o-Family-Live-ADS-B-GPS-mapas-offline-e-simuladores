/* AERONAV RC11.98.7 - Exact visible-map address picking + Jorge Admin + Family route-cancel sync.
   Preserves RC11.98.4, RC11.98.1 and RC11.97 Angola Offline.
   ADMIN:
   - Jorge chooses whether each saved address is shared with Mathia, Wendler, both or neither.
   - Shared address changes/deletions propagate through the existing Family backend channel.
   - Mathia/Wendler receive shared pins as read-only Jorge addresses.
   ROUTE CANCEL:
   - Jorge cancel -> local route is cleared -> backend cancel event is published.
   - Mathia/Wendler receive the event, clear route state/geometry and get the existing SW notification.
   - Technical sync rows are filtered out before the normal Family UI sees them. */
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
  let avatarObserver=null,avatarTimer=0;
  const avatarObserveOptions={childList:true,subtree:true,attributes:true,attributeFilter:["src"]};
  let lastRoad=false;

  const ADDRESS_KEY='aeronav.saved.addresses.'+role+'.v1';
  let addressPickMode=false;
  let pendingPoint=null;
  let repositionAddress=null;
  let lastCommute=false;
  let folgaButtonRef=null;

  let preferredMap=null;
  const addressMarkers=new Map();
  let routeCancelUntil=0;

  const ADMIN_QUEUE_KEY='aeronav.admin.sync.queue.v1';
  const CANCEL_SEEN_KEY='aeronav.admin.cancel.seen.'+role;
  const ADMIN_ADDR_PREFIX='__AERONAV_ADDR__|';
  const ADMIN_CANCEL_PREFIX='__AERONAV_CANCEL__|';
  let familySyncEndpoint='';
  let familySyncHeaders={};
  let familyRoomHash='';
  let adminFlushBusy=false;
  let lastAdminFlushAt=0;
  const moduleStartedAt=Date.now();

  function shortHash(value){
    let h=2166136261>>>0;
    const s=String(value||'');
    for(let i=0;i<s.length;i++){
      h^=s.charCodeAt(i);
      h=Math.imul(h,16777619)>>>0;
    }
    return h.toString(36).padStart(7,'0').slice(-8);
  }

  function roleCode(r){
    return r==='mathia'?'m':r==='wendler'?'w':'j';
  }

  function codeRole(c){
    return c==='m'?'mathia':c==='w'?'wendler':'jorge';
  }

  function categoryCode(cat){
    switch(normCategory(cat)){
      case 'Casa': return 'H';
      case 'Trabalho': return 'W';
      case 'Aeroporto': return 'A';
      case 'Hotel': return 'T';
      case 'Escola': return 'S';
      default: return 'O';
    }
  }

  function codeCategory(c){
    return c==='H'?'Casa':c==='W'?'Trabalho':c==='A'?'Aeroporto':c==='T'?'Hotel':c==='S'?'Escola':'Outro';
  }

  function encodeText(s){
    try{
      const bytes=new TextEncoder().encode(String(s||''));
      let bin='';
      for(const b of bytes)bin+=String.fromCharCode(b);
      return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }catch(_){return '';}
  }

  function decodeText(s){
    try{
      const raw=String(s||'').replace(/-/g,'+').replace(/_/g,'/');
      const padded=raw+'='.repeat((4-raw.length%4)%4);
      const bin=atob(padded);
      const bytes=Uint8Array.from(bin,ch=>ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }catch(_){return '';}
  }

  function loadAdminQueue(){
    try{
      const q=JSON.parse(localStorage.getItem(ADMIN_QUEUE_KEY)||'[]');
      return Array.isArray(q)?q:[];
    }catch(_){return [];}
  }

  function saveAdminQueue(q){
    try{localStorage.setItem(ADMIN_QUEUE_KEY,JSON.stringify((q||[]).slice(-200)));}catch(_){}
  }

  function enqueueAdminRow(desc){
    if(role!=='jorge'||!desc)return;
    const q=loadAdminQueue();
    const key=String(desc.key||'');
    const next=q.filter(x=>String(x?.key||'')!==key);
    next.push({...desc,queuedAt:new Date().toISOString()});
    saveAdminQueue(next);
    setTimeout(flushAdminQueue,0);
  }

  function technicalAddressName(target,address,deleted=false){
    const idHash=shortHash(address?.id||address?.remoteId||'address');
    const name=encodeText(String(address?.name||'Endereço').slice(0,60));
    return ADMIN_ADDR_PREFIX+
      roleCode(target)+'|'+idHash+'|'+categoryCode(address?.category)+'|'+
      (deleted?'1':'0')+'|'+name;
  }

  function technicalAddressMemberId(target,address){
    return '__aeronav_sys_addr_'+roleCode(target)+'_'+shortHash(address?.id||address?.remoteId||'address');
  }

  function queueAddressUpsert(address,target){
    if(role!=='jorge'||!address||!['mathia','wendler'].includes(target))return;
    enqueueAdminRow({
      key:'addr:'+target+':'+shortHash(address.id),
      kind:'address',
      target,
      deleted:false,
      address:{
        id:address.id,
        name:address.name,
        category:normCategory(address.category),
        lat:Number(address.lat),
        lng:Number(address.lng),
        updatedAt:address.updatedAt||new Date().toISOString()
      }
    });
  }

  function queueAddressDelete(address,target){
    if(role!=='jorge'||!address||!['mathia','wendler'].includes(target))return;
    enqueueAdminRow({
      key:'addr:'+target+':'+shortHash(address.id),
      kind:'address',
      target,
      deleted:true,
      address:{
        id:address.id,
        name:address.name||'Endereço',
        category:normCategory(address.category),
        lat:null,
        lng:null,
        updatedAt:new Date().toISOString()
      }
    });
  }

  function queueRouteCancel(){
    if(role!=='jorge')return;
    const eventId='cancel_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
    const at=new Date().toISOString();
    for(const target of ['mathia','wendler']){
      enqueueAdminRow({
        key:'cancel:'+target,
        kind:'cancel',
        target,
        eventId,
        at
      });
    }
  }

  function cloneHeadersPlain(h){
    const out={};
    try{
      const headers=new Headers(h||{});
      headers.forEach((v,k)=>{out[k]=v;});
    }catch(_){
      try{Object.assign(out,h||{});}catch(_){}
    }
    return out;
  }

  function captureFamilyContext(url,init,rows){
    try{
      const u=new URL(url,location.href);
      if(!/aeronav_locations/i.test(u.pathname))return;
      familySyncEndpoint=u.origin+u.pathname;
    }catch(_){return;}

    const requestHeaders=cloneHeadersPlain(init?.headers);
    if(Object.keys(requestHeaders).length)familySyncHeaders={...familySyncHeaders,...requestHeaders};

    const arr=Array.isArray(rows)?rows:(rows?[rows]:[]);
    for(const row of arr){
      if(row?.room_hash){familyRoomHash=String(row.room_hash);break;}
    }
    if(familySyncEndpoint&&familyRoomHash)setTimeout(flushAdminQueue,0);
  }

  function adminRowFromDescriptor(desc){
    if(!desc||!familyRoomHash)return null;
    if(desc.kind==='address'){
      const a=desc.address||{};
      return {
        room_hash:familyRoomHash,
        member_id:technicalAddressMemberId(desc.target,a),
        display_name:technicalAddressName(desc.target,a,!!desc.deleted),
        sharing:true,
        lat:desc.deleted?null:Number(a.lat),
        lon:desc.deleted?null:Number(a.lng),
        accuracy:null,
        altitude:null,
        speed:null,
        heading:null,
        transport:'admin-address',
        flight_number:null,
        flight_eta:null,
        updated_at:new Date().toISOString()
      };
    }
    if(desc.kind==='cancel'){
      return {
        room_hash:familyRoomHash,
        member_id:'__aeronav_sys_cancel_'+roleCode(desc.target),
        display_name:ADMIN_CANCEL_PREFIX+roleCode(desc.target)+'|'+String(desc.eventId||''),
        sharing:true,
        lat:null,
        lon:null,
        accuracy:null,
        altitude:null,
        speed:null,
        heading:null,
        transport:'admin-route-cancel',
        flight_number:null,
        flight_eta:null,
        updated_at:desc.at||new Date().toISOString()
      };
    }
    return null;
  }

  async function flushAdminQueue(){
    if(role!=='jorge'||adminFlushBusy||!navigator.onLine)return false;
    if(!familySyncEndpoint||!familyRoomHash)return false;
    const q=loadAdminQueue();
    if(!q.length)return true;

    adminFlushBusy=true;
    try{
      const headers={...familySyncHeaders};
      headers['Content-Type']='application/json';
      headers['Prefer']='resolution=merge-duplicates,return=minimal';
      const url=familySyncEndpoint+'?on_conflict=room_hash,member_id';
      const remaining=[];
      for(const desc of q){
        const row=adminRowFromDescriptor(desc);
        if(!row)continue;
        try{
          const r=await nativeFetch(url,{
            method:'POST',
            cache:'no-store',
            headers,
            body:JSON.stringify(row)
          });
          if(!r.ok)remaining.push(desc);
        }catch(_){remaining.push(desc);}
      }
      saveAdminQueue(remaining);
      lastAdminFlushAt=Date.now();
      return !remaining.length;
    }finally{
      adminFlushBusy=false;
    }
  }

  function isAdminTechnicalRow(row){
    const n=String(row?.display_name||'');
    const id=String(row?.member_id||'');
    return n.startsWith(ADMIN_ADDR_PREFIX)||
           n.startsWith(ADMIN_CANCEL_PREFIX)||
           id.startsWith('__aeronav_sys_');
  }

  function parseAdminAddressRow(row){
    const n=String(row?.display_name||'');
    if(!n.startsWith(ADMIN_ADDR_PREFIX))return null;
    const p=n.slice(ADMIN_ADDR_PREFIX.length).split('|');
    if(p.length<5)return null;
    return {
      target:codeRole(p[0]),
      remoteId:'shared_'+p[1],
      category:codeCategory(p[2]),
      deleted:p[3]==='1',
      name:decodeText(p.slice(4).join('|'))||'Endereço',
      lat:row?.lat==null?null:Number(row.lat),
      lng:row?.lon==null?null:Number(row.lon),
      updatedAt:row?.updated_at||new Date().toISOString()
    };
  }

  function applySharedAddressRow(row){
    const a=parseAdminAddressRow(row);
    if(!a||a.target!==role||role==='jorge')return false;
    const list=loadAddresses();
    const idx=list.findIndex(x=>String(x.id)===a.remoteId);
    if(a.deleted){
      if(idx>=0){
        list.splice(idx,1);
        saveAddresses(list);
      }
      return true;
    }
    if(!Number.isFinite(a.lat)||!Number.isFinite(a.lng))return false;
    const item={
      id:a.remoteId,
      name:a.name,
      category:a.category,
      lat:a.lat,
      lng:a.lng,
      updatedAt:a.updatedAt,
      shared:true,
      owner:'jorge',
      readOnly:true
    };
    if(idx>=0){
      const oldTs=Date.parse(list[idx]?.updatedAt||0)||0;
      const newTs=Date.parse(item.updatedAt||0)||0;
      if(newTs>=oldTs)list[idx]=item;
    }else list.push(item);
    saveAddresses(list);
    return true;
  }

  function clearClientRouteState(){
    try{
      if(typeof state!=='undefined'&&state){
        if('currentRoute' in state)state.currentRoute=null;
        if('activeRoute' in state)state.activeRoute=null;
      }
    }catch(_){}
    try{
      if(typeof cfg!=='undefined'&&cfg){
        if('ownRoute' in cfg)cfg.ownRoute=null;
        if('currentRoute' in cfg)cfg.currentRoute=null;
        if('activeRoute' in cfg)cfg.activeRoute=null;
      }
    }catch(_){}
    for(const store of [localStorage,sessionStorage]){
      try{
        const keys=[];
        for(let i=0;i<store.length;i++)keys.push(store.key(i));
        for(const k of keys){
          if(!k)continue;
          if(/(active|current|own).*(route|rota)|(route|rota).*(active|current|own)/i.test(k)){
            store.removeItem(k);
          }
        }
      }catch(_){}
    }
  }

  function notifyRemoteRouteCancelled(){
    if(role==='jorge')return;
    try{
      if(navigator.serviceWorker?.controller){
        navigator.serviceWorker.controller.postMessage({type:'AERONAV_ROUTE_CANCELLED'});
        return;
      }
    }catch(_){}
    try{
      navigator.serviceWorker?.ready?.then(reg=>{
        if(Notification.permission==='granted'){
          reg.showNotification(
            role==='mathia'?'Rota cancelada por Jorge':'Rota cancelada pelo papá',
            {
              body:'A rota foi removida automaticamente do mapa.',
              tag:'aeronav-route-cancelled',
              renotify:true,
              requireInteraction:true,
              data:{kind:'route-cancelled'}
            }
          );
        }
      }).catch(()=>{});
    }catch(_){}
  }

  function applyRemoteCancelRow(row){
    const n=String(row?.display_name||'');
    if(!n.startsWith(ADMIN_CANCEL_PREFIX)||role==='jorge')return false;
    const p=n.slice(ADMIN_CANCEL_PREFIX.length).split('|');
    if(codeRole(p[0])!==role)return false;

    const ts=Date.parse(row?.updated_at||0)||0;
    if(!ts)return false;

    const seen=Number(localStorage.getItem(CANCEL_SEEN_KEY)||0)||0;
    if(ts<=seen)return true;

    // On the first run, silently absorb a very old historical cancel row.
    if(!seen && ts<moduleStartedAt-5*60*1000){
      try{localStorage.setItem(CANCEL_SEEN_KEY,String(ts));}catch(_){}
      return true;
    }

    try{localStorage.setItem(CANCEL_SEEN_KEY,String(ts));}catch(_){}
    clearClientRouteState();
    clearActiveRouteVisuals();
    notifyRemoteRouteCancelled();
    try{
      window.dispatchEvent(new CustomEvent('aeronav:route-cancelled',{
        detail:{remote:true,by:'jorge',eventId:p.slice(1).join('|'),updatedAt:row.updated_at}
      }));
    }catch(_){}
    return true;
  }

  function processAdminRows(rows){
    if(!Array.isArray(rows))return;
    for(const row of rows){
      if(String(row?.display_name||'').startsWith(ADMIN_ADDR_PREFIX)){
        applySharedAddressRow(row);
      }else if(String(row?.display_name||'').startsWith(ADMIN_CANCEL_PREFIX)){
        applyRemoteCancelRow(row);
      }
    }
  }

  const MODE_KEY='aeronav.workstatus.travelmode';
  let explicitTravelMode='';

  function setTravelMode(mode){
    explicitTravelMode=mode||'';
    try{sessionStorage.setItem(MODE_KEY,explicitTravelMode);}catch(_){}
  }

  function selectedByApp(btn){
    if(!btn)return false;
    const aria=String(btn.getAttribute('aria-pressed')||'').toLowerCase();
    const cls=String(btn.className||'').toLowerCase();
    const data=String(btn.dataset?.active||btn.dataset?.selected||'').toLowerCase();
    return aria==='true'||data==='true'||/\b(active|selected|current|on)\b/.test(cls);
  }

  function currentTravelMode(){
    const car=findModeButton('CARRO');
    const walk=findModeButton('A PÉ')||findModeButton('A PE');
    const flight=findModeButton('VOO');
    if(selectedByApp(car))return 'car';
    if(selectedByApp(walk))return 'walk';
    if(selectedByApp(flight))return 'flight';
    if(explicitTravelMode)return explicitTravelMode;
    try{return sessionStorage.getItem(MODE_KEY)||'';}catch(_){return '';}
  }

  function bindTravelModeButtons(){
    const pairs=[
      [findModeButton('VOO'),'flight'],
      [findModeButton('CARRO'),'car'],
      [findModeButton('A PÉ')||findModeButton('A PE'),'walk']
    ];
    for(const [btn,mode] of pairs){
      if(!btn||btn.dataset.aeronavModeBound==='1')continue;
      btn.dataset.aeronavModeBound='1';
      btn.addEventListener('click',()=>setTravelMode(mode),true);
    }
  }

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
    try{
    const m=preferredMap||findMapInstance();
    if(m){
      for(const marker of addressMarkers.values()){try{marker.remove();}catch(_){}}
      addressMarkers.clear();
      syncAddressMarkers(m);
    }
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
    const r=getRoute();
    return r&&typeof r==='object'?[r]:[];
  }

  function savedCommuteByCoords(route){
    const addresses=loadAddresses();
    const homes=addresses.filter(a=>normCategory(a.category)==='Casa');
    const works=addresses.filter(a=>normCategory(a.category)==='Trabalho');
    if(!route||!homes.length||!works.length)return false;

    const pts=[];
    collectCoords(route,pts,0);
    if(pts.length<2)return false;

    const nearHome=pts.some(p=>homes.some(a=>haversineM(p,a)<=350));
    const nearWork=pts.some(p=>works.some(a=>haversineM(p,a)<=350));
    return nearHome&&nearWork;
  }

  function checkAsset(url,key){
    const img=new Image();
    img.onload=()=>{available[key]=true;applyAvatars();};
    img.onerror=()=>{available[key]=false;};
    img.src=url+(url.includes('?')?'&':'?')+'v=RC11.98.6';
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

  function routeSourceId(id){
    return /(route|rota|direction|navigation|nav[-_]?route|trip|itinerary|journey|road[-_]?route|flight[-_]?route)/i.test(String(id||''));
  }

  function readSourceData(source){
    if(!source)return null;
    try{
      if(source._data&&typeof source._data==='object')return source._data;
    }catch(_){}
    try{
      const s=source.serialize?.();
      if(s?.data&&typeof s.data==='object')return s.data;
    }catch(_){}
    return null;
  }

  function currentRouteGeoJSON(){
    const m=preferredMap||findMapInstance();
    if(!m)return null;
    try{
      const style=m.getStyle?.();
      const ids=Object.keys(style?.sources||{});
      for(const id of ids){
        if(!routeSourceId(id))continue;
        const source=m.getSource?.(id);
        const data=readSourceData(source);
        if(data){
          const pts=[];
          collectCoords(data,pts,0);
          if(pts.length>=2)return data;
        }
      }
    }catch(_){}
    return null;
  }

  function routeLooksActive(route){
    if(Date.now()<routeCancelUntil)return false;
    if(route&&typeof route==='object'){
      const pts=[];collectCoords(route,pts,0);
      if(pts.length>=2)return true;
    }
    const geo=currentRouteGeoJSON();
    if(geo){
      const pts=[];collectCoords(geo,pts,0);
      if(pts.length>=2)return true;
    }
    return false;
  }

  function commuteRouteActive(){
    if(currentTravelMode()!=='car')return false;
    if(Date.now()<routeCancelUntil)return false;

    const route=getRoute();
    const geo=currentRouteGeoJSON();
    const active=route||geo;
    if(!routeLooksActive(active))return false;

    let txt='';
    try{txt=JSON.stringify(active).toLowerCase();}catch(_){}

    const hasHome=/\bcasa\b|\bhome\b|resid[eê]ncia/.test(txt);
    const hasWork=/trabalho|work|emprego|office|escrit[oó]rio/.test(txt);

    if(hasHome&&hasWork)return true;
    return savedCommuteByCoords(active);
  }

  function isFolga(){
    return role==='jorge' &&
           localStorage.getItem('aeronav.jorge.folga')==='1';
  }

  function localMode(){
    if(isFolga())return 'folga';
    if(commuteRouteActive())return 'car';
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

  function setButtonLabel(btn,text){
    btn.innerHTML='';
    const span=document.createElement('span');
    span.textContent=text;
    span.style.cssText='display:flex;align-items:center;justify-content:center;width:100%;height:100%;white-space:nowrap;';
    btn.appendChild(span);
  }

  function cloneModeButton(source,id,text){
    const b=source.cloneNode(true);
    b.id=id;
    b.removeAttribute('href');
    b.removeAttribute('onclick');
    b.removeAttribute('data-action');
    b.removeAttribute('aria-current');
    b.removeAttribute('aria-selected');
    b.type='button';
    setButtonLabel(b,text);
    b.style.removeProperty('display');
    b.style.removeProperty('visibility');
    b.style.removeProperty('opacity');
    b.style.setProperty('position','relative','important');
    b.style.setProperty('inset','auto','important');
    b.style.setProperty('transform','none','important');
    b.style.setProperty('pointer-events','auto','important');
    return b;
  }

  function commonModeContainer(voo,car,walk){
    if(!car)return null;
    let n=car.parentElement;
    for(let i=0;n&&i<7;i++,n=n.parentElement){
      const r=n.getBoundingClientRect?.();
      if((!voo||n.contains(voo))&&(!walk||n.contains(walk))&&(!r||r.height<220))return n;
    }
    return car.parentElement;
  }

  function injectHeaderControls(){
    if(role!=='jorge')return;

    bindTravelModeButtons();

    const existing=document.getElementById('aeronavSecondaryModeRow');
    if(existing){
      existing.style.removeProperty('display');
      existing.style.removeProperty('visibility');
      existing.style.removeProperty('opacity');
      folgaButtonRef=document.getElementById('aeronavFolgaBtn');
      paintFolgaButton();
      return;
    }

    const voo=findModeButton('VOO');
    const car=findModeButton('CARRO');
    const walk=findModeButton('A PÉ')||findModeButton('A PE');
    if(!voo||!car||!walk)return;

    const row=commonModeContainer(voo,car,walk);
    if(!row||!row.parentElement)return;

    const holder=row.cloneNode(false);
    holder.id='aeronavSecondaryModeRow';
    holder.removeAttribute('hidden');
    holder.style.removeProperty('display');
    holder.style.removeProperty('visibility');
    holder.style.removeProperty('opacity');

    // Keep the same three-column rhythm as VOO / CARRO / A PÉ.
    const rowStyle=getComputedStyle(row);
    if(rowStyle.display==='grid'){
      holder.style.display='grid';
      holder.style.gridTemplateColumns=rowStyle.gridTemplateColumns||'repeat(3,minmax(0,1fr))';
      holder.style.gap=rowStyle.gap||'12px';
    }else{
      holder.style.display='grid';
      holder.style.gridTemplateColumns='repeat(3,minmax(0,1fr))';
      holder.style.gap='12px';
    }
    holder.style.width='100%';
    holder.style.boxSizing='border-box';
    holder.style.marginTop='8px';
    holder.style.marginBottom='8px';
    holder.style.position='relative';
    holder.style.zIndex='2';

    const addresses=cloneModeButton(voo,'aeronavAddressesBtn','📍 ENDEREÇOS');
    addresses.dataset.aeronavHeaderControl='1';
    addresses.addEventListener('click',openAddressPanel);

    const folga=cloneModeButton(car,'aeronavFolgaBtn','🏖️ FOLGA');
    folga.dataset.aeronavHeaderControl='1';
    folga.addEventListener('click',()=>setFolga(!isFolga()));

    const blank=document.createElement('div');
    blank.setAttribute('aria-hidden','true');

    holder.append(addresses,folga,blank);
    row.insertAdjacentElement('afterend',holder);

    folgaButtonRef=folga;
    paintFolgaButton();
  }

  function injectClientAddressControl(){
    if(role==='jorge'||document.getElementById('aeronavClientAddressesBtn'))return;
    const candidates=[
      findModeButton('CARRO'),
      findModeButton('A PÉ')||findModeButton('A PE'),
      ...document.querySelectorAll('button,[role="button"]')
    ].filter(Boolean);
    const source=candidates[0];
    if(!source||!source.parentElement)return;
    const b=source.cloneNode(true);
    b.id='aeronavClientAddressesBtn';
    b.removeAttribute('onclick');
    b.removeAttribute('data-action');
    b.type='button';
    setButtonLabel(b,'📍 ENDEREÇOS');
    b.addEventListener('click',openAddressPanel);
    source.parentElement.insertAdjacentElement('afterend',b);
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
      .aeronavAddrShare{display:flex;gap:16px;flex-wrap:wrap;margin:7px 0 4px}.aeronavAddrShare label{display:flex!important;align-items:center;gap:7px;margin:0!important;opacity:1!important}.aeronavAddrShare input{width:auto!important;accent-color:#28b8f4}
      #aeronavAddressEditor label{display:block;font-size:12px;opacity:.8;margin:10px 0 5px}
      #aeronavAddressEditor input,#aeronavAddressEditor select{width:100%;box-sizing:border-box;border:1px solid #315e77;border-radius:12px;background:#061722;color:#fff;padding:12px;font-size:16px}
      .aeronavSavedPin{display:flex;flex-direction:column;align-items:center;pointer-events:auto;filter:drop-shadow(0 3px 4px rgba(0,0,0,.38));transform:translateY(0)}
      .aeronavSavedPinLabel{margin-bottom:4px;max-width:130px;padding:3px 7px;border-radius:8px;background:rgba(3,24,38,.92);color:#fff;font:700 11px system-ui,-apple-system,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .aeronavSavedPinHead{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#073451;border:2px solid #fff;font-size:19px;box-sizing:border-box}
      .aeronavSavedPinTip{width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #fff;margin-top:-1px;position:relative}
      .aeronavSavedPinTip:after{content:'';position:absolute;left:-5px;top:-10px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid #073451}
      #aeronavAddressPickToast{position:fixed;z-index:2147483600;left:50%;top:calc(18px + env(safe-area-inset-top,0px));transform:translateX(-50%);max-width:92vw;background:#07283c;color:#fff;border:1px solid #39a9dc;border-radius:999px;padding:10px 16px;font:750 14px system-ui,-apple-system,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.35)}
    `;
    document.head.appendChild(s);
  }

  function closeAddressPanel(){
    document.getElementById('aeronavAddressOverlay')?.remove();
  }

  function startAddressPick(existing=null){
    closeAddressPanel();
    addressPickMode=true;
    repositionAddress=existing||null;
    document.getElementById('aeronavAddressPickToast')?.remove();
    const t=document.createElement('div');
    t.id='aeronavAddressPickToast';
    t.textContent=existing
      ?'📍 Toque no NOVO ponto exato de '+String(existing.name||'endereço')
      :'📍 Toque no ponto exato do mapa que quer guardar';
    document.body.appendChild(t);
  }

  function openAddressEditor(point,existing){
    ensureAddressStyles();
    if(existing?.readOnly&&role!=='jorge'){
      mapFlyToAddress(existing);
      return;
    }

    pendingPoint={lat:Number(point.lat),lng:Number(point.lng)};
    closeAddressPanel();

    const overlay=document.createElement('div');
    overlay.id='aeronavAddressOverlay';
    const panel=document.createElement('div');
    panel.id='aeronavAddressPanel';

    const shareHtml=role==='jorge'?`
      <label>Partilhar com</label>
      <div class="aeronavAddrShare">
        <label><input type="checkbox" id="aeronavShareMathia"> Mathia</label>
        <label><input type="checkbox" id="aeronavShareWendler"> Wendler</label>
      </div>`:'';

    panel.innerHTML=`
      <div class="aeronavAddrTop"><h2>${existing?'Editar endereço':'Guardar endereço'}</h2><button class="aeronavAddrBtn" data-close>✕</button></div>
      <div id="aeronavAddressEditor">
        <label>Nome</label>
        <input id="aeronavAddrNameInput" maxlength="60" placeholder="Ex.: Casa, Trabalho TAAG, Hotel..." value="">
        <label>Categoria</label>
        <select id="aeronavAddrCategoryInput">
          <option>Casa</option><option>Trabalho</option><option>Aeroporto</option><option>Hotel</option><option>Escola</option><option>Outro</option>
        </select>
        ${shareHtml}
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
    const mathiaInput=panel.querySelector('#aeronavShareMathia');
    const wendlerInput=panel.querySelector('#aeronavShareWendler');

    if(existing){
      nameInput.value=existing.name||'';
      catInput.value=normCategory(existing.category);
      const shared=Array.isArray(existing.shareWith)?existing.shareWith:[];
      if(mathiaInput)mathiaInput.checked=shared.includes('mathia');
      if(wendlerInput)wendlerInput.checked=shared.includes('wendler');
    }

    panel.querySelector('[data-close]').onclick=closeAddressPanel;
    panel.querySelector('[data-cancel]').onclick=openAddressPanel;
    panel.querySelector('[data-save]').onclick=()=>{
      const name=String(nameInput.value||'').trim();
      if(!name){nameInput.focus();return;}

      const previousTargets=Array.isArray(existing?.shareWith)?[...existing.shareWith]:[];
      const shareWith=[];
      if(mathiaInput?.checked)shareWith.push('mathia');
      if(wendlerInput?.checked)shareWith.push('wendler');

      const list=loadAddresses();
      const item={
        id:existing?.id||('addr_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)),
        name,
        category:normCategory(catInput.value),
        lat:pendingPoint.lat,
        lng:pendingPoint.lng,
        updatedAt:new Date().toISOString(),
        shareWith
      };
      const idx=list.findIndex(x=>x.id===item.id);
      if(idx>=0)list[idx]=item;else list.push(item);
      saveAddresses(list);

      if(role==='jorge'){
        for(const target of previousTargets){
          if(!shareWith.includes(target))queueAddressDelete(existing||item,target);
        }
        for(const target of shareWith)queueAddressUpsert(item,target);
      }

      openAddressPanel();
    };
  }

  function isMapObject(v){
    return !!(v&&typeof v==='object'&&
      typeof v.flyTo==='function'&&
      typeof v.getCenter==='function'&&
      typeof v.project==='function'&&
      typeof v.unproject==='function'&&
      typeof v.getCanvas==='function');
  }

  function findMapInstance(){
    if(isMapObject(preferredMap))return preferredMap;
    const known=['map','mainMap','aeronavMap','mapInstance','mapa'];
    for(const k of known){
      try{
        if(isMapObject(window[k])){
          preferredMap=window[k];
          return preferredMap;
        }
      }catch(_){}
    }
    try{
      for(const k of Object.getOwnPropertyNames(window)){
        let v;
        try{v=window[k];}catch(_){continue;}
        if(isMapObject(v)){
          preferredMap=v;
          return v;
        }
      }
    }catch(_){}
    return null;
  }

  function categoryIcon(cat){
    switch(normCategory(cat)){
      case 'Casa': return '🏠';
      case 'Trabalho': return '🏢';
      case 'Aeroporto': return '✈️';
      case 'Hotel': return '🏨';
      case 'Escola': return '🏫';
      default: return '📍';
    }
  }

  function markerElement(a){
    const el=document.createElement('div');
    el.className='aeronavSavedPin';
    el.dataset.aeronavAddressId=a.id;

    const label=document.createElement('div');
    label.className='aeronavSavedPinLabel';
    label.textContent=a.name||normCategory(a.category);

    const head=document.createElement('div');
    head.className='aeronavSavedPinHead';
    head.textContent=categoryIcon(a.category);

    const tip=document.createElement('div');
    tip.className='aeronavSavedPinTip';

    // IMPORTANT: the pointer tip is the final/bottom pixel of the marker.
    // With anchor:'bottom', this exact tip is the saved longitude/latitude.
    el.append(label,head,tip);

    el.addEventListener('click',ev=>{
      ev.stopPropagation();
      const current=loadAddresses().find(x=>x.id===a.id);
      if(current){if(window.AERONAVAddressRoutes)openAddressRoute(current);else mapFlyToAddress(current);}
    });
    return el;
  }

  function syncAddressMarkers(map){
    if(!isMapObject(map)||!window.maplibregl?.Marker)return false;
    preferredMap=map;
    const list=loadAddresses();
    const wanted=new Set(list.map(a=>a.id));

    for(const [id,marker] of addressMarkers){
      if(!wanted.has(id)){
        try{marker.remove();}catch(_){}
        addressMarkers.delete(id);
      }
    }

    for(const a of list){
      const lng=Number(a.lng),lat=Number(a.lat);
      if(!Number.isFinite(lng)||!Number.isFinite(lat))continue;
      let marker=addressMarkers.get(a.id);
      if(!marker){
        try{
          marker=new window.maplibregl.Marker({
            element:markerElement(a),
            anchor:'bottom',
            offset:[0,0]
          }).setLngLat([lng,lat]).addTo(map);
          addressMarkers.set(a.id,marker);
        }catch(_){}
      }else{
        try{marker.setLngLat([lng,lat]);}catch(_){}
        try{
          const el=marker.getElement?.();
          if(el){
            const ic=el.querySelector('.aeronavSavedPinHead');
            const lb=el.querySelector('.aeronavSavedPinLabel');
            if(ic)ic.textContent=categoryIcon(a.category);
            if(lb)lb.textContent=a.name||normCategory(a.category);
          }
        }catch(_){}
      }
    }
    return true;
  }

  function mapFlyToAddress(a){
    const m=preferredMap||findMapInstance();
    if(m){
      preferredMap=m;
      try{
        const z=Math.max(Number(m.getZoom?.()||0),17);
        m.flyTo({center:[Number(a.lng),Number(a.lat)],zoom:z});
        syncAddressMarkers(m);
      }catch(_){}
    }
    try{window.dispatchEvent(new CustomEvent('aeronav:address-selected',{detail:a}));}catch(_){}
    closeAddressPanel();
  }

  function openAddressRoute(a){
    const api=window.AERONAVAddressRoutes;
    if(!api){alert('O planeador de endereços ainda não está disponível nesta versão. Atualize a aplicação.');return;}
    ensureAddressStyles();closeAddressPanel();
    const overlay=document.createElement('div');overlay.id='aeronavAddressOverlay';
    const panel=document.createElement('section');panel.id='aeronavAddressPanel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    panel.innerHTML=`<div class="aeronavAddrTop"><h2>Ir até este ponto</h2><button class="aeronavAddrBtn" data-close aria-label="Fechar">✕</button></div>
      <p data-destination></p><div id="aeronavAddressEditor">
      <label for="addressRouteOrigin">Origem</label><select id="addressRouteOrigin"><option value="gps">Minha posição GPS</option><option value="search">Pesquisar outro local</option></select>
      <div data-search hidden class="address-picker"><label for="addressRouteSearch">Pesquisar origem e selecionar uma sugestão</label><input id="addressRouteSearch" autocomplete="off" placeholder="Rua, bairro, cidade…"><div id="addressRouteSearchResults" class="airport-search-results address-search-results"></div><div id="addressRouteSearchStatus" role="status"></div></div>
      <label for="addressRouteMode">Modo de viagem</label><select id="addressRouteMode"><option value="drive">CARRO</option><option value="walk">A PÉ</option>${role==='jorge'?'<option value="flight">VOO — direto</option>':''}</select></div>
      <div class="aeronavAddrActions"><button class="aeronavAddrBtn aeronavAddrPrimary" data-calculate>Calcular rota</button><button class="aeronavAddrBtn" data-start hidden>Iniciar rota</button></div>
      <p data-result role="status" aria-live="polite"></p><small data-attribution hidden>© OpenStreetMap contributors · FOSSGIS · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Corrigir o mapa</a></small>`;
    panel.querySelector('[data-destination]').textContent='Destino: '+(a.name||'Ponto guardado');
    const origins=loadAddresses().filter(x=>x.id!==a.id),select=panel.querySelector('#addressRouteOrigin'),mode=panel.querySelector('#addressRouteMode');
    origins.forEach((x,i)=>{const option=document.createElement('option');option.value='saved:'+i;option.textContent=x.name||'Endereço guardado';select.appendChild(option);});
    mode.value=api.mode();if(!mode.value)mode.value='drive';
    const calc=panel.querySelector('[data-calculate]'),start=panel.querySelector('[data-start]'),result=panel.querySelector('[data-result]');
    let preview=null,revision=0;
    const invalidate=()=>{revision++;preview=null;start.hidden=true;result.textContent='';};
    select.onchange=()=>{invalidate();panel.querySelector('[data-search]').hidden=select.value!=='search';};
    mode.onchange=invalidate;panel.querySelector('#addressRouteSearch').addEventListener('input',e=>{delete e.target.dataset.addrLat;delete e.target.dataset.addrLon;delete e.target.dataset.addrName;invalidate();});panel.querySelector('#addressRouteSearch').addEventListener('change',invalidate);
    panel.querySelector('[data-close]').onclick=()=>{revision++;closeAddressPanel();};
    calc.onclick=async()=>{
      invalidate();const token=revision;calc.disabled=true;result.textContent=select.value==='gps'?'A obter a posição GPS e calcular…':'A calcular…';
      try{
        let origin={type:'gps'};
        if(select.value==='search'){
          const point=api.selected('addressRouteSearch');if(!point)throw new Error('Selecione uma sugestão de origem.');origin={type:'point',point};
        }else if(select.value.startsWith('saved:'))origin={type:'point',point:origins[Number(select.value.slice(6))]};
        const route=await api.preview({destination:a,origin,mode:mode.value});
        if(token!==revision||!overlay.isConnected)return;
        preview=route;const minutes=Math.max(1,Math.round(route.duration/60));
        result.textContent=`${(route.distance/1000).toFixed(1)} km · ${minutes} min · Chegada estimada ${new Date(Date.now()+route.duration*1000).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}${route.mode==='flight'?' · Percurso aéreo direto. Confirmar o plano de voo e as restrições.':''}`;
        panel.querySelector('[data-attribution]').hidden=route.mode!=='walk';start.hidden=false;
      }catch(e){if(token===revision&&overlay.isConnected)result.textContent=e.name==='AbortError'?'O serviço demorou demasiado. Tente novamente.':e.message||String(e);}
      finally{calc.disabled=false;}
    };
    start.onclick=async()=>{if(!preview)return;start.disabled=true;try{if(await api.start(preview))closeAddressPanel();}catch(e){result.textContent=e.message||String(e);}finally{start.disabled=false;}};
    overlay.appendChild(panel);document.body.appendChild(overlay);api.wireSearch('addressRouteSearch');select.focus();
  }

  window.AERONAVOpenAddressRoute=openAddressRoute;

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
      ${role==='jorge'?'<button class="aeronavAddrBtn aeronavAddrPrimary" data-pick>＋ Guardar ponto do mapa</button>':''}
      <div class="aeronavAddrList"></div>`;

    const listEl=panel.querySelector('.aeronavAddrList');
    if(!list.length){
      const empty=document.createElement('div');
      empty.className='aeronavAddrItem';
      empty.innerHTML=role==='jorge'
        ?'<div class="aeronavAddrName">Ainda não há endereços</div><div class="aeronavAddrMeta">Toque em “Guardar ponto do mapa” e depois no local exato.</div>'
        :'<div class="aeronavAddrName">Ainda não há endereços partilhados</div><div class="aeronavAddrMeta">Os endereços partilhados por Jorge aparecerão aqui e no mapa.</div>';
      listEl.appendChild(empty);
    }else{
      for(const a of list){
        const item=document.createElement('div');
        item.className='aeronavAddrItem';
        const safeName=String(a.name||'Endereço').replace(/[<>&"]/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
        const shares=Array.isArray(a.shareWith)?a.shareWith:[];
        const shareText=role==='jorge'&&shares.length
          ?' · Partilhado: '+shares.map(x=>x==='mathia'?'Mathia':'Wendler').join(', ')
          :(a.shared?' · Partilhado por Jorge':'');
        item.innerHTML=`
          <button class="aeronavAddrBtn aeronavAddrName" data-name>${categoryIcon(a.category)} ${safeName}</button>
          <div class="aeronavAddrMeta">${normCategory(a.category)} · ${Number(a.lat).toFixed(6)}, ${Number(a.lng).toFixed(6)}${shareText}</div>
          <div class="aeronavAddrActions">
            ${window.AERONAVAddressRoutes?'<button class="aeronavAddrBtn aeronavAddrPrimary" data-route>Ir até este ponto</button>':''}<button class="aeronavAddrBtn" data-go>Ver no mapa</button>
            ${role==='jorge'&&!a.readOnly?'<button class="aeronavAddrBtn" data-move>Reposicionar</button><button class="aeronavAddrBtn" data-edit>Editar</button><button class="aeronavAddrBtn aeronavAddrDanger" data-del>Apagar</button>':''}
          </div>`;
        item.querySelector('[data-name]').onclick=()=>window.AERONAVAddressRoutes?openAddressRoute(a):mapFlyToAddress(a);
        item.querySelector('[data-route]')?.addEventListener('click',()=>openAddressRoute(a));
        item.querySelector('[data-go]').onclick=()=>mapFlyToAddress(a);

        const move=item.querySelector('[data-move]');
        if(move)move.onclick=()=>startAddressPick(a);

        const edit=item.querySelector('[data-edit]');
        if(edit)edit.onclick=()=>openAddressEditor(a,a);

        const del=item.querySelector('[data-del]');
        if(del)del.onclick=()=>{
          if(role==='jorge'){
            const targets=Array.isArray(a.shareWith)?a.shareWith:[];
            for(const target of targets)queueAddressDelete(a,target);
          }
          saveAddresses(loadAddresses().filter(x=>x.id!==a.id));
          openAddressPanel();
        };
        listEl.appendChild(item);
      }
    }

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    panel.querySelector('[data-close]').onclick=closeAddressPanel;
    const pick=panel.querySelector('[data-pick]');
    if(pick)pick.onclick=startAddressPick;
  }

  function consumeMapClick(lngLat,map){
    if(!addressPickMode||!lngLat)return;
    const lat=Number(lngLat.lat),lng=Number(lngLat.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
    if(isMapObject(map))preferredMap=map;
    addressPickMode=false;
    document.getElementById('aeronavAddressPickToast')?.remove();
    const existing=repositionAddress;
    repositionAddress=null;
    openAddressEditor({lat,lng},existing||null);
  }

  function installExactAddressClickHook(){
    if(document.documentElement.dataset.aeronavExactAddressHook987==='1')return;
    document.documentElement.dataset.aeronavExactAddressHook987='1';

    document.addEventListener('click',ev=>{
      if(!addressPickMode)return;
      const x=Number(ev.clientX),y=Number(ev.clientY);
      if(!Number.isFinite(x)||!Number.isFinite(y))return;

      const candidates=[];
      try{
        const known=['map','mainMap','aeronavMap','mapInstance','mapa'];
        const seen=new Set();

        const consider=m=>{
          if(!isMapObject(m)||seen.has(m))return;
          seen.add(m);
          const canvas=m.getCanvas?.();
          if(!canvas)return;
          const r=canvas.getBoundingClientRect();
          if(r.width<80||r.height<80)return;
          if(x<r.left||x>r.right||y<r.top||y>r.bottom)return;
          candidates.push({m,r,area:r.width*r.height});
        };

        for(const k of known){
          try{consider(window[k]);}catch(_){}
        }
        for(const k of Object.getOwnPropertyNames(window)){
          try{consider(window[k]);}catch(_){}
        }
      }catch(_){}

      if(!candidates.length)return;

      candidates.sort((a,b)=>a.area-b.area);
      const chosen=candidates[0];

      try{
        const p=chosen.m.unproject([x-chosen.r.left,y-chosen.r.top]);
        if(!p||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lng)))return;
        ev.preventDefault();
        ev.stopPropagation();
        consumeMapClick({lat:Number(p.lat),lng:Number(p.lng)},chosen.m);
      }catch(_){}
    },true);
  }

    function installMapClickHook(){
    try{
      const proto=window.maplibregl?.Map?.prototype;
      if(!proto)return false;
      if(!proto.__aeronavAddressHook984){
        const nativeFire=proto.fire;
        proto.fire=function(type,data){
          try{
            if(isMapObject(this))preferredMap=this;
            const eventType=typeof type==='string'?type:type?.type;
            const payload=typeof type==='string'?data:type;
            if(eventType==='click'&&addressPickMode&&payload?.lngLat){
              setTimeout(()=>consumeMapClick(payload.lngLat,this),0);
            }
            if(/^(load|styledata|idle)$/.test(String(eventType||''))){
              setTimeout(()=>syncAddressMarkers(this),0);
            }
          }catch(_){}
          return nativeFire.apply(this,arguments);
        };
        proto.__aeronavAddressHook984=true;
      }
      const m=preferredMap||findMapInstance();
      if(m)syncAddressMarkers(m);
      return true;
    }catch(_){return false;}
  }

  function clearActiveRouteVisuals(){
    routeCancelUntil=Date.now()+15000;
    if(role!=='jorge')clearClientRouteState();

    const m=preferredMap||findMapInstance();
    if(!m){
      lastRoad=false;
      lastCommute=false;
      applyAvatars();
      return;
    }
    preferredMap=m;

    const empty={type:'FeatureCollection',features:[]};
    const clearNow=()=>{
      try{
        const style=m.getStyle?.();
        const ids=Object.keys(style?.sources||{});
        for(const id of ids){
          if(!routeSourceId(id))continue;
          const source=m.getSource?.(id);
          if(source&&typeof source.setData==='function'){
            try{source.setData(empty);}catch(_){}
          }
        }
      }catch(_){}
    };

    clearNow();
    for(const delay of [80,180,350,650,1000,1600,2400,4000,7000,11000]){
      setTimeout(clearNow,delay);
    }

    lastRoad=false;
    lastCommute=false;
    setTimeout(applyAvatars,0);
  }

  function actionText(target){
    let out='';
    let n=target;
    for(let i=0;n&&i<5;i++,n=n.parentElement){
      out+=' '+String(n.textContent||'');
      out+=' '+String(n.getAttribute?.('aria-label')||'');
      out+=' '+String(n.getAttribute?.('title')||'');
    }
    return out.replace(/\s+/g,' ').trim().toLowerCase();
  }

  function installCancelRouteHook(){
    if(document.documentElement.dataset.aeronavCancelHook985==='1')return;
    document.documentElement.dataset.aeronavCancelHook985='1';

    document.addEventListener('click',ev=>{
      const t=actionText(ev.target);
      if(/(cancelar|apagar|encerrar|terminar|parar).{0,18}(rota|route)|(rota|route).{0,18}(cancelar|apagar|encerrar|terminar|parar)/i.test(t)){
        if(role==='jorge')queueRouteCancel();
        setTimeout(clearActiveRouteVisuals,0);
      }
    },true);

    window.addEventListener('message',ev=>{
      const type=String(ev.data?.type||'');
      if(/ROUTE_CANCELLED|ROUTE_CANCELED/i.test(type)){
        clearClientRouteState();
        clearActiveRouteVisuals();
      }
    });

    window.addEventListener('aeronav:route-cancelled',ev=>{
      if(ev?.detail?.remote)return;
      if(role==='jorge')queueRouteCancel();
      clearActiveRouteVisuals();
    });
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
    avatarObserver?.disconnect();

    try{
      document.querySelectorAll('img').forEach(applyOne);
      document.querySelectorAll(
        '[style*="background"],.maplibregl-marker,.marker,.avatar'
      ).forEach(applyOne);
    }catch(_){}
    finally{
      applying=false;
      avatarObserver?.observe(document.documentElement,avatarObserveOptions);
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

        captureFamilyContext(url,init,rows);

        for(const row of rows){
          if(isAdminTechnicalRow(row))continue;
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
        try{
          const payload=await res.clone().json();
          const rows=Array.isArray(payload)?payload:(payload?[payload]:[]);
          captureFamilyContext(url,init,rows);
          processAdminRows(rows);

          const filtered=rows.filter(row=>!isAdminTechnicalRow(row));
          readLocations(filtered);

          if(Array.isArray(payload)&&filtered.length!==rows.length){
            const headers=new Headers(res.headers);
            headers.delete('content-length');
            headers.delete('content-encoding');
            headers.set('content-type','application/json; charset=utf-8');
            return new Response(JSON.stringify(filtered),{
              status:res.status,
              statusText:res.statusText,
              headers
            });
          }
        }catch(_){}
      }

      return res;
    }catch(_){
      return nativeFetch(input,init);
    }
  };

  const avatarSelector='img,[style*="background"],.maplibregl-marker,.marker,.avatar';
  function scheduleAvatars(){
    if(avatarTimer||document.hidden)return;
    avatarTimer=setTimeout(()=>{avatarTimer=0;applyAvatars();},250);
  }
  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.type==='attributes'&&r.target.tagName==='IMG'||
      r.type==='childList'&&Array.from(r.addedNodes).some(n=>n.nodeType===1&&(n.matches(avatarSelector)||n.querySelector(avatarSelector)))))scheduleAvatars();
  });

  function tick(){
    const nowRoad=commuteRouteActive();
    lastCommute=nowRoad;

    if(nowRoad!==lastRoad){
      lastRoad=nowRoad;
      applyAvatars();
    }

    bindTravelModeButtons();
    injectHeaderControls();
    injectClientAddressControl();
    installExactAddressClickHook();
    installMapClickHook();
    installCancelRouteHook();
    syncAddressMarkers(preferredMap||findMapInstance());
    paintFolgaButton();
    applyAvatars();

    if(role==='jorge'&&Date.now()-lastAdminFlushAt>3000)flushAdminQueue();
  }

  function start(){
    bindTravelModeButtons();
    installExactAddressClickHook();
    installMapClickHook();
    installCancelRouteHook();
    lastRoad=commuteRouteActive();
    lastCommute=lastRoad;
    injectHeaderControls();
    injectClientAddressControl();
    syncAddressMarkers(preferredMap||findMapInstance());
    applyAvatars();

    try{
      avatarObserver=observer;
      observer.observe(document.documentElement,avatarObserveOptions);
    }catch(_){}

    setInterval(tick,1000);

    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden)tick();
    });

    window.addEventListener('pageshow',tick);
    window.addEventListener('online',()=>setTimeout(flushAdminQueue,250));
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();

