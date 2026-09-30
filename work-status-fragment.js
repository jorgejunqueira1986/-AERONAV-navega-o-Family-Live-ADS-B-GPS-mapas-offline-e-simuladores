/* AERONAV RC11.98.1 - Work/Home commute avatars + Jorge Folga hotfix.
   Preserves RC11.98 and RC11.97 Angola Offline.
   Fix: keep the original marker dimensions when swapping avatar images. */
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

  function checkAsset(url,key){
    const img=new Image();
    img.onload=()=>{available[key]=true;applyAvatars();};
    img.onerror=()=>{available[key]=false;};
    img.src=url+(url.includes('?')?'&':'?')+'v=RC11.98.1';
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
    const r=getRoute();
    if(!r||!roadRouteActive())return false;

    const txt=JSON.stringify(r).toLowerCase();
    return /trabalho|work|emprego|office|escrit[oó]rio|casa|home|resid[eê]ncia/.test(txt);
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

  function injectFolgaButton(){
    if(role!=='jorge'||document.getElementById('aeronavFolgaBtn'))return;

    const b=document.createElement('button');
    b.id='aeronavFolgaBtn';
    b.type='button';
    b.style.cssText=[
      'position:fixed',
      'right:14px',
      'bottom:calc(88px + env(safe-area-inset-bottom,0px))',
      'z-index:2147483000',
      'border:1px solid rgba(255,255,255,.24)',
      'border-radius:999px',
      'padding:10px 16px',
      'font:700 14px system-ui,-apple-system,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.28)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
      'cursor:pointer',
      'color:#fff'
    ].join(';');

    const paint=()=>{
      const on=isFolga();
      b.textContent=on?'Folga ✓':'Folga';
      b.setAttribute('aria-pressed',on?'true':'false');
      b.style.background=on?'rgba(210,42,86,.94)':'rgba(20,25,31,.90)';
    };

    b.addEventListener('click',()=>{
      const on=!isFolga();
      localStorage.setItem('aeronav.jorge.folga',on?'1':'0');
      paint();
      applyAvatars();
      try{
        window.dispatchEvent(new CustomEvent('aeronav:work-status',{
          detail:{role:'jorge',mode:on?'folga':'person'}
        }));
      }catch(_){}
    });

    paint();
    document.body.appendChild(b);
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

    if(nowRoad!==lastRoad){
      lastRoad=nowRoad;
      applyAvatars();
    }

    injectFolgaButton();
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
