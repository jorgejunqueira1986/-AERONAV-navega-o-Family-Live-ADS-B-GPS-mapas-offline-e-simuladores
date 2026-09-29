/* AERONAV RC11.84 — Secure Google Photorealistic 3D proxy bridge HOTFIX
   Fixes RC11.83 UI freeze caused by a recursive MutationObserver.
   Real Google Map Tiles API key stays only in Railway. */
(()=>{
  'use strict';
  if (window.__AERONAV_PHOTO3D_PROXY_RC1184__) return;
  window.__AERONAV_PHOTO3D_PROXY_RC1184__ = true;

  const BACKEND='https://aeronav-cockpit-token-server-production.up.railway.app';
  const DUMMY='AERONAV_RAILWAY_PROXY_RC11_84_ONLY';
  const STORAGE='aeronav.googleMapTilesApiKey';

  try{ localStorage.setItem(STORAGE,DUMMY); }catch(_){}

  function proxyUrl(input){
    try{
      const raw=typeof input==='string'?input:(input&&input.url?input.url:String(input||''));
      const u=new URL(raw,location.href);
      if(u.hostname!=='tile.googleapis.com' || !u.pathname.startsWith('/v1/3dtiles/')) return null;
      u.searchParams.delete('key');
      const qs=u.searchParams.toString();
      return BACKEND+u.pathname+(qs?('?'+qs):'');
    }catch(_){ return null; }
  }

  const nativeFetch=window.fetch?.bind(window);
  if(nativeFetch){
    window.fetch=function(input,init){
      const proxied=proxyUrl(input);
      if(!proxied) return nativeFetch(input,init);
      let next=init?{...init}: {};
      if(typeof Request!=='undefined' && input instanceof Request){
        const headers=new Headers(input.headers);
        if(next.headers){ new Headers(next.headers).forEach((v,k)=>headers.set(k,v)); }
        next={
          method:input.method,
          headers,
          mode:'cors',
          credentials:'omit',
          cache:input.cache,
          redirect:input.redirect,
          referrerPolicy:input.referrerPolicy,
          ...next
        };
      }else{
        next={...next,mode:'cors',credentials:'omit'};
      }
      return nativeFetch(proxied,next);
    };
  }

  if(typeof XMLHttpRequest!=='undefined'){
    const nativeOpen=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(method,url,...rest){
      const proxied=proxyUrl(url);
      return nativeOpen.call(this,method,proxied||url,...rest);
    };
  }

  window.AERONAV_PHOTO3D_PROXY={
    enabled:true,
    backend:BACKEND,
    status:()=>nativeFetch
      ? nativeFetch(BACKEND+'/google3d/status',{cache:'no-store',credentials:'omit'}).then(r=>r.json())
      : Promise.resolve({ok:false,configured:false})
  };

  /* Hide obsolete local-key controls without observing/mutating the DOM repeatedly. */
  try{
    const style=document.createElement('style');
    style.id='aeronav-photo3d-proxy-ui-rc1184';
    style.textContent=`
      .photo3d-key-row{display:none!important}
      #clearPhoto3DKeyBtn{display:none!important}
    `;
    document.head.appendChild(style);
  }catch(_){}
})();