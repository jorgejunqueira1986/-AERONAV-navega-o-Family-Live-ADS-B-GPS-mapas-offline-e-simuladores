/* AERONAV RC11.83 — Secure Google Photorealistic 3D proxy bridge
   Real Google Map Tiles API key stays only in Railway.
   Client requests are rewritten to the AERONAV backend proxy. */
(()=>{
  'use strict';
  const BACKEND='https://aeronav-cockpit-token-server-production.up.railway.app';
  const DUMMY='AERONAV_RAILWAY_PROXY_RC11_83_ONLY';
  const STORAGE='aeronav.googleMapTilesApiKey';

  try{
    // Remove any previously stored real key and replace it with a non-secret sentinel
    // so RC11.82's existing Photo 3D availability checks continue to work.
    localStorage.setItem(STORAGE,DUMMY);
  }catch(_){ }

  function proxyUrl(input){
    try{
      const raw=typeof input==='string'?input:(input&&input.url?input.url:String(input||''));
      const u=new URL(raw,location.href);
      if(u.hostname!=='tile.googleapis.com' || !u.pathname.startsWith('/v1/3dtiles/')) return null;
      u.searchParams.delete('key');
      const qs=u.searchParams.toString();
      return BACKEND+u.pathname+(qs?('?'+qs):'');
    }catch(_){return null;}
  }

  const nativeFetch=window.fetch?.bind(window);
  if(nativeFetch){
    window.fetch=function(input,init){
      const proxied=proxyUrl(input);
      if(!proxied) return nativeFetch(input,init);
      let next=init?{...init}:{};
      if(input instanceof Request){
        const headers=new Headers(input.headers);
        if(next.headers){new Headers(next.headers).forEach((v,k)=>headers.set(k,v));}
        next={method:input.method,headers,mode:'cors',credentials:'omit',cache:input.cache,redirect:input.redirect,referrerPolicy:input.referrerPolicy,...next};
      }else{
        next={...next,mode:'cors',credentials:'omit'};
      }
      return nativeFetch(proxied,next);
    };
  }

  // Cesium 1.105 can also use XHR depending on resource type/browser.
  const nativeOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url,...rest){
    const proxied=proxyUrl(url);
    return nativeOpen.call(this,method,proxied||url,...rest);
  };

  window.AERONAV_PHOTO3D_PROXY={
    enabled:true,
    backend:BACKEND,
    status:()=>nativeFetch(BACKEND+'/google3d/status',{cache:'no-store',credentials:'omit'}).then(r=>r.json())
  };

  function cleanLegacyKeyUI(){
    try{
      document.querySelectorAll('.photo3d-key-row').forEach(row=>row.remove());
      document.querySelectorAll('#clearPhoto3DKeyBtn').forEach(el=>el.remove());
      document.querySelectorAll('.source-note').forEach(el=>{
        if(/chave|Map Tiles API/i.test(el.textContent||'')){
          el.textContent='Photo 3D seguro: a chave Google fica apenas no Railway. O aparelho nunca recebe a chave real.';
        }
      });
      document.querySelectorAll('.notice').forEach(el=>{
        if(/chave.*Google|Map Tiles API.*ativa/i.test(el.textContent||'')){
          el.classList.remove('warn');el.classList.add('good');
          el.textContent='Photo 3D ligado ao proxy seguro Railway. Chave Google protegida no servidor.';
        }
      });
    }catch(_){ }
  }

  const observer=new MutationObserver(cleanLegacyKeyUI);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',cleanLegacyKeyUI,{once:true});
  else cleanLegacyKeyUI();
})();
