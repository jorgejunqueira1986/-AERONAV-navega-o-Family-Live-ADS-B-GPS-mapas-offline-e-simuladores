/* AERONAV RC12.32 — compact cockpit, shared live state, no network/GPS owner. */
(()=>{
'use strict';
if(window.__AERONAV_COCKPIT_LITE__||/\/(mathia|wendler|family)(\/|\.html)/i.test(location.pathname))return;
window.__AERONAV_COCKPIT_LITE__=true;
const KEY='aeronav.cockpit.lite.v1';
let prefs={view:'cockpit',plane:96},timer=0,lastActive=false,root,menu,button;
try{const p=JSON.parse(localStorage.getItem(KEY)||'null');if(p){if(['aerial','cockpit','clean'].includes(p.view))prefs.view=p.view;if([64,96,128].includes(p.plane))prefs.plane=p.plane;}}catch(_){}
const $=id=>document.getElementById(id);
const put=(id,v)=>{const e=$(id),s=String(v??'—');if(e&&e.textContent!==s)e.textContent=s;};
const num=v=>typeof v==='number'&&Number.isFinite(v);
const val=(v,unit='',digits=0)=>num(v)?v.toFixed(digits)+unit:'—';
const endpoint=x=>String(x||'—');
function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(_){}}
function closeMenu(){if(menu)menu.hidden=true;if(button)button.setAttribute('aria-expanded','false');}
function viewPitch(){return prefs.view==='aerial'?45:prefs.view==='cockpit'?55:0;}
function applyView(move=true){
 window.__AERONAV_COCKPIT_PITCH__=viewPitch();
 document.documentElement.style.setProperty('--cl-plane',prefs.plane+'px');
 if(root)root.dataset.view=prefs.view;
 for(const b of menu?.querySelectorAll('[data-cl-view]')||[])b.setAttribute('aria-pressed',String(b.dataset.clView===prefs.view));
 if(move)window.AERONAVCockpit?.camera(viewPitch());
}
function refresh(){
 const s=window.AERONAVCockpit?.snapshot();
 const active=!!s&&s.mode==='flight'&&s.tab==='map'&&!document.hidden;
 if(root)root.hidden=!active;
 if(button)button.hidden=s?.mode!=='flight';
 document.body.classList.toggle('cl-flight',active&&prefs.view!=='clean');
 if(!active){closeMenu();lastActive=false;return;}
 if(!lastActive){applyView(true);lastActive=true;}
 const clean=prefs.view==='clean';root.dataset.view=prefs.view;
 put('clAircraft',s.aircraft);put('clSource',s.fresh?s.source:'SEM DADOS RECENTES');
 put('clFrom',endpoint(s.from));put('clTo',endpoint(s.to));
 put('clRouteStatus',s.route?'ROTA ATIVA':'SEM ROTA ATIVA');
 put('clGs',val(s.gs,' KT',1));put('clTas',val(s.tas,' KT',1));
 put('clAlt',val(s.alt,' FT'));put('clVs',val(s.vs,' FT/MIN'));
 put('clHdg',num(s.heading)?String(Math.round((s.heading+360)%360)%360).padStart(3,'0')+'°':'—');
 put('clWind',num(s.windDir)&&num(s.windSpeed)?Math.round(s.windDir)+'° / '+Math.round(s.windSpeed)+' KT':'—');
 put('clDistance',val(s.distanceNm,' NM',1));
 const minutes=num(s.eteSeconds)?Math.round(s.eteSeconds/60):null;
 put('clEte',minutes===null?'—':Math.floor(minutes/60)+':'+String(minutes%60).padStart(2,'0'));
 put('clEta',s.eta?new Date(s.eta).toISOString().slice(11,16)+'Z':'—');
 const dial=$('clDial');if(dial){const rotation=num(s.heading)?'rotate('+(-s.heading)+'deg)':'rotate(0deg)';if(dial.style.transform!==rotation)dial.style.transform=rotation;}
 const notes=$('clEstimate');if(notes)notes.hidden=clean||!s.route;
}
function schedule(){
 clearTimeout(timer);timer=0;
 refresh();
 if(!document.hidden&&window.AERONAVCockpit?.snapshot()?.tab==='map')timer=setTimeout(schedule,1500);
}
function openData(){const p=$('mapDataPanel');if(p&&!p.classList.contains('open'))$('mobileMapDataBtn')?.click();}
function start(){
 const host=document.querySelector('#screen-map .map-wrap'),controls=$('mobileMapControls');if(!host||!controls)return;
 const style=document.createElement('style');style.id='cockpitLiteStyles';style.textContent=`
 #cockpitLite[hidden],#clViewMenu[hidden],#clViews[hidden]{display:none!important}
 #cockpitLite{position:absolute;inset:0;pointer-events:none;z-index:24;color:#eaf7ff;font-family:system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums}
 #cockpitLite button,#clViewMenu{pointer-events:auto}
 .cl-glass{background:linear-gradient(150deg,rgba(3,18,34,.96),rgba(5,35,54,.94));border:1px solid #31749a;border-radius:13px;box-shadow:0 3px 12px #0004}
 .cl-route{position:absolute;top:9px;left:9px;right:9px;min-height:48px;display:grid;grid-template-columns:minmax(100px,1.1fr) minmax(64px,1fr) 20px minmax(64px,1fr);gap:8px;align-items:center;padding:8px 12px}
 .cl-route>div{min-width:0}.cl-route strong,.cl-route small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .cl-route strong{font-size:13px}.cl-route small{font-size:8px;letter-spacing:.07em;color:#8cb5ce;margin-top:3px}
 .cl-route .cl-destination{border-left:1px solid #24516d;padding-left:10px}.cl-arrow{color:#54dcff}
 .cl-rail{position:absolute;top:77px;left:9px;display:grid;gap:6px}
 .cl-rail button{display:grid;place-items:center;gap:1px;width:44px;height:44px;padding:3px;border:1px solid #286989;border-radius:10px;background:#041e32ee;color:#95e7ff;font-weight:800;font-size:16px;cursor:pointer}
 .cl-rail small{font-size:8px;letter-spacing:.03em}.cl-rail button:active{background:#0e4865}
 .cl-compass{position:absolute;top:77px;right:10px;width:104px;height:104px;border-radius:50%;border:2px solid #3f7a9b;background:#04101ff5;box-shadow:0 0 0 4px #091f34aa;display:grid;place-items:center}
 .cl-compass:after{content:'▾';position:absolute;top:-5px;color:#4cddff;font-size:20px}
 #clDial{position:absolute;inset:7px;border-radius:50%;border:1px solid #376078}
 #clDial span{position:absolute;color:#b0c9dc;font-size:9px;font-weight:800}#clDial span:nth-child(1){top:2px;left:calc(50% - 4px)}#clDial span:nth-child(2){right:3px;top:calc(50% - 6px)}#clDial span:nth-child(3){bottom:2px;left:calc(50% - 3px)}#clDial span:nth-child(4){left:3px;top:calc(50% - 6px)}
 .cl-compass strong{font-size:23px;z-index:1}.cl-compass small{position:absolute;bottom:21px;font-size:7px;color:#97bbd4}
 .cl-wind{position:absolute;top:191px;right:9px;padding:7px 9px;width:126px;font-size:11px}.cl-wind small{display:block;color:#8ab9d1;font-size:8px;margin-bottom:3px}
 .cl-altitude{position:absolute;bottom:98px;left:9px;min-width:105px;padding:9px 11px}.cl-altitude small{display:block;color:#8ab9d1;font-size:8px;letter-spacing:.07em}.cl-altitude strong{display:block;font-size:17px;margin:3px 0 8px}.cl-altitude b{font-size:11px;font-weight:600}
 .cl-metrics{position:absolute;bottom:10px;left:9px;right:9px;padding:9px 6px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0}
 .cl-metrics>div{min-width:0;padding:0 8px;border-right:1px solid #24516d}.cl-metrics>div:last-child{border:0}.cl-metrics small{display:block;color:#8ab9d1;font-size:8px;letter-spacing:.04em;white-space:nowrap}.cl-metrics strong{display:block;font-size:15px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 #clEstimate{position:absolute;bottom:75px;right:12px;padding:3px 6px;border-radius:5px;background:#041b2bd9;color:#b2cbdc;font-size:8px}
 #clViewMenu{position:absolute;z-index:50;top:9px;left:9px;right:9px;padding:12px;border:1px solid #56c9ed;border-radius:15px;background:#031627;box-shadow:0 12px 30px #0008}
 .cl-menu-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:12px;font-weight:800}.cl-menu-head button{border:0;border-radius:8px;background:#163b51;color:white;width:36px;height:36px}
 .cl-views{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.cl-views button{min-height:62px;border:1px solid #27526f;border-radius:10px;background:linear-gradient(#123b55,#051727);color:#d4eefe;font-size:11px;font-weight:700}.cl-views button b{display:block;font-size:23px;margin-bottom:3px}.cl-views button[aria-pressed=true]{border-color:#54e4ff;box-shadow:inset 0 0 0 1px #54e4ff;color:#65e6ff}
 .cl-plane-size{display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:12px;color:#aad0e1;font-size:11px}.cl-plane-size select{font-size:13px;color:#ecf9ff;background:#102d43;border:1px solid #326789;border-radius:8px;padding:9px}
 #screen-map #mobileMapControls:has(#clViews:not([hidden])){grid-template-columns:42px minmax(62px,1fr) minmax(62px,1fr) 42px 46px;max-width:580px}
 #screen-map #clViews{font-size:11px!important;letter-spacing:.03em!important;color:#6cddff}
 #screen-map .position-marker.flight{width:var(--cl-plane,96px)!important;height:calc(var(--cl-plane,96px)*.74)!important}
 #screen-map .position-marker.flight img{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important}
 body.cl-flight #screen-map #mapBadge{bottom:76px!important;max-width:145px!important}
 body.cl-flight #screen-map #navHud{display:none!important}
 #cockpitLite[data-view=clean]>.cl-instruments,#cockpitLite[data-view=clean]>.cl-route,#cockpitLite[data-view=clean]>.cl-metrics,#cockpitLite[data-view=clean]>.cl-rail,#cockpitLite[data-view=clean]>#clEstimate{display:none!important}
 #cockpitLite[data-view=aerial] .cl-altitude{display:none}
 @media(max-width:600px){.cl-route{grid-template-columns:minmax(90px,1.15fr) minmax(52px,1fr) 12px minmax(52px,1fr);gap:4px;padding:7px 8px}.cl-route strong{font-size:10px}.cl-route small{font-size:7px}.cl-compass{width:76px;height:76px}.cl-compass strong{font-size:18px}.cl-compass small{bottom:13px;font-size:6px}.cl-wind{top:164px;width:106px;font-size:10px}.cl-metrics{padding:8px 3px}.cl-metrics>div{padding:0 4px}.cl-metrics small{font-size:6px;letter-spacing:0}.cl-metrics strong{font-size:10px}.cl-altitude{bottom:91px;padding:7px;min-width:85px}.cl-altitude strong{font-size:14px}.cl-rail{gap:5px}.cl-rail button{width:39px;height:39px}.cl-rail small{font-size:7px}#clEstimate{bottom:63px;font-size:7px}body.cl-flight #screen-map #mapBadge{bottom:62px!important;max-width:115px!important}}
 @media(max-height:600px){.cl-altitude,.cl-wind{display:none!important}.cl-rail{display:flex}.cl-compass{width:68px;height:68px}.cl-compass small{bottom:10px}}
 `;document.head.appendChild(style);
 root=document.createElement('div');root.id='cockpitLite';root.hidden=true;
 root.innerHTML=`<div class="cl-route cl-glass"><div><strong id="clAircraft">—</strong><small id="clSource">A AGUARDAR GPS</small></div><div class="cl-destination"><strong id="clFrom">—</strong><small id="clRouteStatus">SEM ROTA ATIVA</small></div><span class="cl-arrow">→</span><div><strong id="clTo">—</strong><small>DESTINO</small></div></div>
 <nav class="cl-rail" aria-label="Atalhos de voo"><button type="button" data-cl-action="center" aria-label="Centrar mapa">⌖<small>MAPA</small></button><button type="button" data-cl-action="route" aria-label="Plano de voo">▤<small>FPL</small></button><button type="button" data-cl-action="weather" aria-label="Meteorologia">☁<small>WX</small></button><button type="button" data-cl-action="traffic" aria-label="Tráfego ADS-B">✈<small>TFC</small></button></nav>
 <div class="cl-instruments"><div class="cl-compass"><div id="clDial"><span>N</span><span>E</span><span>S</span><span>W</span></div><strong id="clHdg">—</strong><small>HDG / TRK</small></div><div class="cl-wind cl-glass"><small>VENTO</small><strong id="clWind">—</strong></div><div class="cl-altitude cl-glass"><small>ALTITUDE GPS</small><strong id="clAlt">—</strong><small>V/S</small><b id="clVs">—</b></div></div>
 <div class="cl-metrics cl-glass"><div><small>GROUND SPEED</small><strong id="clGs">—</strong></div><div><small>TRUE AIRSPEED</small><strong id="clTas">—</strong></div><div><small>DTG DIRETO</small><strong id="clDistance">—</strong></div><div><small>ETE EST.</small><strong id="clEte">—</strong></div><div><small>ETA EST. UTC</small><strong id="clEta">—</strong></div></div><small id="clEstimate" hidden>Estimativa direta ao destino</small>
 <section id="clViewMenu" aria-label="Vistas de navegação" hidden><div class="cl-menu-head">VISTA DE NAVEGAÇÃO<button type="button" id="clCloseViews" aria-label="Fechar vistas">✕</button></div><div class="cl-views"><button type="button" data-cl-view="aerial"><b>✈</b>Aérea</button><button type="button" data-cl-view="cockpit"><b>◉</b>Cockpit</button><button type="button" data-cl-view="clean"><b>◇</b>Mapa limpo</button></div><label class="cl-plane-size">Tamanho da aeronave<select id="clPlaneSize"><option value="64">Pequena</option><option value="96">Média</option><option value="128">Grande</option></select></label></section>`;
 host.appendChild(root);menu=$('clViewMenu');
 button=document.createElement('button');button.id='clViews';button.type='button';button.textContent='VISTAS';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','clViewMenu');controls.insertBefore(button,$('mobileFullBtn'));
 button.addEventListener('click',()=>{menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)$('clCloseViews')?.focus();});
 $('clCloseViews').addEventListener('click',()=>{closeMenu();button.focus();});
 $('clPlaneSize').value=String(prefs.plane);
 $('clPlaneSize').addEventListener('change',e=>{const n=Number(e.target.value);if([64,96,128].includes(n)){prefs.plane=n;save();applyView(false);}});
 menu.addEventListener('click',e=>{const b=e.target.closest('[data-cl-view]');if(!b)return;prefs.view=b.dataset.clView;save();applyView();closeMenu();refresh();});
 root.addEventListener('click',e=>{const b=e.target.closest('[data-cl-action]');if(!b)return;const a=b.dataset.clAction;if(a==='center')$('myPositionBtn')?.click();else if(a==='weather'){openData();$('aeronavWxPanel')?.scrollIntoView({block:'nearest'});}else if(a==='traffic')$('trafficQuickBtn')?.click();else window.AERONAVCockpit?.navigate('route');});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
 document.addEventListener('visibilitychange',schedule);
 window.addEventListener('aeronav:screen-change',()=>{closeMenu();schedule();});
 window.addEventListener('aeronav:cockpit-change',schedule);
 window.addEventListener('pageshow',schedule);
 window.addEventListener('aeronav:map-ready',()=>{applyView(true);schedule();});
 applyView(false);schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
