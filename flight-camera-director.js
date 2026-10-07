/* AERONAV RC12.37.5 — Manual Flight Camera Director. */
(() => {
  'use strict';
  if (window.__AERONAV_FLIGHT_CAMERA_RC12375__) return;
  window.__AERONAV_FLIGHT_CAMERA_RC12375__ = true;
  if (/\/(?:mathia|wendler|family)(?:\/|\.html|$)/i.test(location.pathname || '')) return;

  const KEY = 'aeronav.flight.camera.v3';
  const $ = s => document.querySelector(s);

  const PRESETS = {
    behind:   { label:'ATRÁS',          pitch:68, bearingOffset:0,   zoom:11.2, external:true,  planeY:66 },
    left:     { label:'LADO ESQUERDO',  pitch:58, bearingOffset:90,  zoom:10.8, external:true,  planeY:64 },
    right:    { label:'LADO DIREITO',   pitch:58, bearingOffset:-90, zoom:10.8, external:true,  planeY:64 },
    top:      { label:'TOPO',           pitch:0,  bearingOffset:0,   zoom:10.2, external:true,  planeY:50 },
    front:    { label:'FRENTE',         pitch:60, bearingOffset:180, zoom:11.0, external:true,  planeY:61 },
    inclined: { label:'INCLINADA',      pitch:72, bearingOffset:35,  zoom:11.4, external:true,  planeY:67 },
    orbit:    { label:'ÓRBITA 360°',    pitch:62, bearingOffset:0,   zoom:10.9, external:true,  planeY:62 },
    cockpit:  { label:'COCKPIT',        pitch:55, bearingOffset:0,   zoom:9.2,  external:false, planeY:0  }
  };

  let prefs = { preset:'behind', enabled:true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && PRESETS[saved.preset]) prefs.preset = saved.preset;
    if (saved && typeof saved.enabled === 'boolean') prefs.enabled = saved.enabled;
  } catch (_) {}

  const runtime = {
    map:null,
    lastHeading:0,
    lastLat:null,
    lastLon:null,
    lastApply:0,
    orbitAngle:0,
    lastPlaneSrc:'',
    menuOpen:false
  };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {}
  }

  function modeFlight() {
    return localStorage.getItem('aeronav.mode') === 'flight' ||
      !!$('#modeFlight')?.classList.contains('active');
  }

  function mapActive() {
    return !!$('#screen-map')?.classList.contains('active');
  }

  function mapObject() {
    if (runtime.map && typeof runtime.map.easeTo === 'function') return runtime.map;
    const candidates = [window.__AERONAV_MAP__, window.aeronavMap, window.mainMap, window.map];
    runtime.map = candidates.find(m => m && typeof m.easeTo === 'function' && typeof m.getCenter === 'function') || null;
    return runtime.map;
  }

  function snapshot() {
    try { return window.AERONAVCockpit?.snapshot?.() || null; } catch (_) { return null; }
  }

  function updateNavigationState() {
    const s = snapshot();
    if (Number.isFinite(Number(s?.heading))) runtime.lastHeading = Number(s.heading);

    const g = window.__AERONAV_LAST_GPS__;
    const lat = Number(g?.coords?.latitude), lon = Number(g?.coords?.longitude);
    const hdg = Number(g?.coords?.heading);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      runtime.lastLat = lat;
      runtime.lastLon = lon;
    }
    if (Number.isFinite(hdg) && hdg >= 0) runtime.lastHeading = hdg;
  }

  function centerFor(m) {
    updateNavigationState();
    if (Number.isFinite(runtime.lastLat) && Number.isFinite(runtime.lastLon)) {
      return [runtime.lastLon, runtime.lastLat];
    }
    try {
      const c = m.getCenter();
      return [Number(c.lng), Number(c.lat)];
    } catch (_) {
      return null;
    }
  }

  function headingFor(m) {
    updateNavigationState();
    if (Number.isFinite(runtime.lastHeading)) return (runtime.lastHeading + 360) % 360;
    try { return Number(m.getBearing?.() || 0); } catch (_) { return 0; }
  }

  function ensureStyles() {
    if ($('#aeronavFlightCameraStyles')) return;
    const st = document.createElement('style');
    st.id = 'aeronavFlightCameraStyles';
    st.textContent = `
      #flightCameraBtn.active,#mobileFlightCameraBtn.active{background:#0d6efd!important;border-color:#55c7ff!important;color:#fff!important}
      #flightCameraMenu{position:absolute;z-index:52;right:10px;top:10px;width:min(370px,calc(100vw - 20px));display:none;padding:10px;border-radius:17px;background:#06131feb;border:1px solid #31566e;box-shadow:0 18px 50px #000b;backdrop-filter:blur(16px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eef9ff}
      #flightCameraMenu.show{display:block}
      #flightCameraMenu .fc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
      #flightCameraMenu .fc-head strong{font-size:13px;letter-spacing:.05em}
      #flightCameraMenu .fc-close{border:0;background:#13293a;color:#fff;width:31px;height:31px;border-radius:10px;font-weight:900}
      #flightCameraMenu .fc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      #flightCameraMenu .fc-grid button{border:1px solid #284d65;background:#0a2030;color:#dff5ff;border-radius:12px;padding:10px 8px;font-size:11px;font-weight:900;letter-spacing:.02em}
      #flightCameraMenu .fc-grid button.active{background:#0b78e3;border-color:#68cfff;color:#fff}
      #flightCameraMenu .fc-note{margin-top:8px;color:#8fb1c6;font-size:9px;line-height:1.35}
      #flightCameraAircraft{position:absolute;z-index:29;left:50%;top:66%;transform:translate(-50%,-50%);width:min(42vw,310px);max-height:28vh;object-fit:contain;filter:drop-shadow(0 16px 14px #0009);pointer-events:none;display:none;transition:top .35s ease,width .35s ease,transform .35s ease}
      body.aeronav-flight-camera-external #flightCameraAircraft{display:block}
      body.aeronav-flight-camera-external #aeronavRearAircraft{display:none!important}
      body.aeronav-flight-camera-external #cockpitLite{display:none!important}
      #flightCameraBadge{position:absolute;z-index:31;left:12px;bottom:12px;display:none;padding:6px 9px;border-radius:999px;background:#07131ddb;border:1px solid #31566e;color:#cbeeff;font:900 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.06em;pointer-events:none}
      body.aeronav-flight-camera-on #flightCameraBadge{display:block}
      @media(max-width:620px){
        #flightCameraMenu{right:7px;top:7px;width:calc(100vw - 14px)}
        #flightCameraMenu .fc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        #flightCameraAircraft{width:min(58vw,280px)}
      }
    `;
    document.head.appendChild(st);
  }

  function ensureUi() {
    ensureStyles();
    const toolbar = $('#screen-map .map-toolbar');
    if (toolbar && !$('#flightCameraBtn')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'flightCameraBtn';
      b.className = 'soft-btn';
      b.textContent = '🎥 ÂNGULOS';
      const photo = $('#photo3dBtn');
      toolbar.insertBefore(b, photo || $('#terrainOverlayBtn') || null);
      b.onclick = () => toggleMenu();
    }

    const mobile = $('#mobileMapMenu');
    if (mobile && !$('#mobileFlightCameraBtn')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'mobileFlightCameraBtn';
      b.textContent = '🎥 Ângulos de voo';
      const photo = $('#mobilePhoto3dBtn');
      mobile.insertBefore(b, photo || mobile.firstChild);
      b.onclick = () => toggleMenu();
    }

    const wrap = $('#screen-map .map-wrap');
    if (wrap && !$('#flightCameraMenu')) {
      const menu = document.createElement('div');
      menu.id = 'flightCameraMenu';
      menu.innerHTML = `
        <div class="fc-head"><strong>🎥 CÂMARA DE VOO · MANUAL</strong><button class="fc-close" type="button" aria-label="Fechar">✕</button></div>
        <div class="fc-grid">
          ${Object.entries(PRESETS).map(([id,p]) => `<button type="button" data-flight-camera="${id}">${p.label}</button>`).join('')}
        </div>
        <div class="fc-note">RC12.37.5 · Escolha manual. A mudança automática por fase de voo será ativada na próxima correção.</div>
      `;
      wrap.appendChild(menu);
      menu.querySelector('.fc-close').onclick = () => closeMenu();
      menu.querySelectorAll('[data-flight-camera]').forEach(b => {
        b.onclick = () => {
          setPreset(b.dataset.flightCamera);
          closeMenu();
        };
      });

      const img = document.createElement('img');
      img.id = 'flightCameraAircraft';
      img.alt = 'Aeronave selecionada';
      img.draggable = false;
      wrap.appendChild(img);

      const badge = document.createElement('div');
      badge.id = 'flightCameraBadge';
      wrap.appendChild(badge);
    }

    syncUi();
  }

  function syncSelectedAircraftImage() {
    const out = $('#flightCameraAircraft');
    if (!out) return;
    const source =
      $('.position-marker.flight img') ||
      $('#aeronavRearAircraft image') ||
      null;
    const src = source?.getAttribute?.('src') || source?.src || '';
    if (src && src !== runtime.lastPlaneSrc) {
      runtime.lastPlaneSrc = src;
      out.src = src;
    }
  }

  function syncUi() {
    const active = prefs.enabled && modeFlight() && mapActive();
    const preset = PRESETS[prefs.preset] || PRESETS.behind;
    document.body.classList.toggle('aeronav-flight-camera-on', active);
    document.body.classList.toggle('aeronav-flight-camera-external', active && preset.external);

    for (const id of ['flightCameraBtn','mobileFlightCameraBtn']) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.classList.toggle('active', active);
      b.hidden = !modeFlight();
    }

    const badge = $('#flightCameraBadge');
    if (badge) badge.textContent = `🎥 ${preset.label}`;

    const plane = $('#flightCameraAircraft');
    if (plane) {
      plane.style.top = `${preset.planeY || 64}%`;
      plane.style.width = prefs.preset === 'top' ? 'min(30vw,220px)' : 'min(42vw,310px)';
      if (prefs.preset === 'front') plane.style.transform = 'translate(-50%,-50%) scaleX(-1)';
      else if (prefs.preset === 'left') plane.style.transform = 'translate(-50%,-50%) rotate(-4deg)';
      else if (prefs.preset === 'right') plane.style.transform = 'translate(-50%,-50%) rotate(4deg)';
      else plane.style.transform = 'translate(-50%,-50%)';
    }

    $('#flightCameraMenu')?.querySelectorAll('[data-flight-camera]').forEach(b => {
      b.classList.toggle('active', b.dataset.flightCamera === prefs.preset);
    });

    window.__AERONAV_FLIGHT_CAMERA_DIRECTOR_ACTIVE__ = !!active;
  }

  function toggleMenu() {
    ensureUi();
    const menu = $('#flightCameraMenu');
    if (!menu) return;
    runtime.menuOpen = !menu.classList.contains('show');
    menu.classList.toggle('show', runtime.menuOpen);
  }

  function closeMenu() {
    runtime.menuOpen = false;
    $('#flightCameraMenu')?.classList.remove('show');
  }

  function targetFor(presetId, m, instant = false) {
    const p = PRESETS[presetId] || PRESETS.behind;
    const center = centerFor(m);
    const hdg = headingFor(m);
    const currentZoom = Number(m.getZoom?.() || p.zoom);
    let bearing = (hdg + p.bearingOffset + 360) % 360;

    if (presetId === 'orbit') {
      runtime.orbitAngle = (runtime.orbitAngle + 6) % 360;
      bearing = (hdg + runtime.orbitAngle) % 360;
    }

    return {
      center: center || undefined,
      zoom: Math.max(currentZoom, p.zoom),
      pitch: p.pitch,
      bearing,
      duration: instant ? 0 : (presetId === 'orbit' ? 260 : 650),
      padding: p.external
        ? { top:70, bottom:175, left:14, right:14 }
        : { top:55, bottom:75, left:12, right:12 }
    };
  }

  function applyPreset({ instant = false } = {}) {
    ensureUi();
    syncSelectedAircraftImage();
    syncUi();

    if (!prefs.enabled || !modeFlight() || !mapActive()) return false;
    const m = mapObject();
    if (!m) return false;

    const preset = PRESETS[prefs.preset] || PRESETS.behind;

    if (prefs.preset === 'cockpit') {
      window.__AERONAV_COCKPIT_PITCH__ = 55;
      try { window.AERONAVCockpit?.camera?.(55); } catch (_) {}
    }

    try {
      m.setMaxPitch?.(80);
      m.easeTo(targetFor(prefs.preset, m, instant));
      window.AERONAVPhoto3DRenderer?.sync?.();
      window.dispatchEvent(new CustomEvent('aeronav:camera-change', {
        detail: { preset:prefs.preset, label:preset.label, source:'manual', release:'RC12.37.5' }
      }));
      runtime.lastApply = Date.now();
      return true;
    } catch (_) {
      return false;
    }
  }

  function setPreset(id) {
    if (!PRESETS[id]) return false;
    prefs.preset = id;
    prefs.enabled = true;
    runtime.orbitAngle = 0;
    save();
    syncUi();
    applyPreset({ instant:false });
    return true;
  }

  function enable(on = true) {
    prefs.enabled = !!on;
    save();
    syncUi();
    if (prefs.enabled) applyPreset({ instant:true });
    return prefs.enabled;
  }

  function tick() {
    ensureUi();
    syncSelectedAircraftImage();
    syncUi();
    if (!prefs.enabled || !modeFlight() || !mapActive()) return;

    const now = Date.now();
    const cadence = prefs.preset === 'orbit' ? 280 : 1200;
    if (now - runtime.lastApply >= cadence) applyPreset({ instant:false });
  }

  window.AERONAVFlightCamera = {
    release:'RC12.37.5',
    presets:() => Object.fromEntries(Object.entries(PRESETS).map(([k,v]) => [k,v.label])),
    set:setPreset,
    enable,
    apply:() => applyPreset({ instant:false }),
    open:() => { ensureUi(); runtime.menuOpen=false; toggleMenu(); },
    status:() => ({
      release:'RC12.37.5',
      enabled:prefs.enabled,
      preset:prefs.preset,
      label:(PRESETS[prefs.preset] || PRESETS.behind).label,
      active:prefs.enabled && modeFlight() && mapActive(),
      automatic:false
    })
  };

  document.addEventListener('click', e => {
    if (!e.target?.closest?.('#flightCameraMenu,#flightCameraBtn,#mobileFlightCameraBtn')) closeMenu();
    if (e.target?.closest?.('#modeFlight,[data-bottom="map"],#myPositionBtn')) setTimeout(() => applyPreset({ instant:true }), 160);
  }, true);

  ['aeronav:map-ready','aeronav:screen-change','pageshow'].forEach(ev => {
    window.addEventListener(ev, () => setTimeout(() => applyPreset({ instant:true }), 180));
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => applyPreset({ instant:true }), 180);
  });

  setInterval(tick, 260);
  setTimeout(() => { ensureUi(); applyPreset({ instant:true }); }, 700);
})();
