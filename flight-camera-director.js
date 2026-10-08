/* AERONAV RC12.37.14 — Aircraft-only GLB camera, map stays stable. */
(() => {
  'use strict';
  if (window.__AERONAV_FLIGHT_CAMERA_RC12376__) return;
  window.__AERONAV_FLIGHT_CAMERA_RC12376__ = true;
  if (/\/(?:mathia|wendler|family)(?:\/|\.html|$)/i.test(location.pathname || '')) return;

  const KEY = 'aeronav.flight.camera.v3';
  const PHASE_KEY = 'aeronav.flightops.phase.v1';
  const $ = s => document.querySelector(s);

  const PRESETS = {
    behind:   { label:'ATRÁS',          pitch:72, bearingOffset:0,    zoom:11.4, external:true,  planeY:67 },
    left:     { label:'LADO ESQUERDO',  pitch:60, bearingOffset:105,  zoom:10.9, external:true,  planeY:64 },
    right:    { label:'LADO DIREITO',   pitch:60, bearingOffset:-105, zoom:10.9, external:true,  planeY:64 },
    top:      { label:'TOPO',           pitch:0,  bearingOffset:0,    zoom:10.4, external:true,  planeY:50 },
    inclined: { label:'INCLINADA',      pitch:74, bearingOffset:40,   zoom:11.4, external:true,  planeY:66 },
    orbit:    { label:'ÓRBITA 360°',    pitch:64, bearingOffset:0,    zoom:10.9, external:true,  planeY:62 },
    cockpit:  { label:'COCKPIT',        pitch:55, bearingOffset:0,    zoom:9.2,  external:false, planeY:0  }
  };

  const AUTO_MAP = {
    ground:'behind',
    taxi:'behind',
    takeoff:'behind',
    climb:'right',
    cruise:'behind',
    descent:'left',
    approach:'inclined',
    landing:'behind'
  };

  const PHASE_LABEL = {
    ground:'PARADO',
    taxi:'TÁXI',
    takeoff:'DESCOLAGEM',
    climb:'SUBIDA',
    cruise:'CRUZEIRO',
    descent:'DESCIDA',
    approach:'APROXIMAÇÃO',
    landing:'ATERRAGEM'
  };

  let prefs = { preset:'behind', enabled:true, automatic:true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && PRESETS[saved.preset]) prefs.preset = saved.preset;
    if (saved && typeof saved.enabled === 'boolean') prefs.enabled = saved.enabled;
    if (saved && typeof saved.automatic === 'boolean') prefs.automatic = saved.automatic;
  } catch (_) {}

  const runtime = {
    map:null,
    lastHeading:0,
    lastLat:null,
    lastLon:null,
    lastApply:0,
    orbitAngle:0,
    lastPlaneSrc:'',
    menuOpen:false,
    autoPhase:'ground',
    phaseChangedAt:0,
    candidate:'',
    candidateHits:0,
    lastPhaseStorage:'',
    lastPhaseStorageAt:0
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

  function flightOpsPhase() {
    try {
      const raw = JSON.parse(localStorage.getItem(PHASE_KEY) || '{"phase":"ground","at":0}');
      return {
        phase: raw?.phase === 'airborne' ? 'airborne' : 'ground',
        at: Number(raw?.at || 0)
      };
    } catch (_) {
      return { phase:'ground', at:0 };
    }
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

  function deriveAutoPhase() {
    const s = snapshot() || {};
    const ops = flightOpsPhase();
    const gs = Number(s.gs);
    const vs = Number(s.vs);
    const alt = Number(s.alt);
    const dist = Number(s.distanceNm);
    const now = Date.now();
    const age = ops.at > 0 ? now - ops.at : Infinity;

    if (ops.phase !== runtime.lastPhaseStorage || ops.at !== runtime.lastPhaseStorageAt) {
      runtime.lastPhaseStorage = ops.phase;
      runtime.lastPhaseStorageAt = ops.at;
    }

    if (ops.phase === 'ground') {
      if (age < 75000 && runtime.autoPhase !== 'ground' && runtime.autoPhase !== 'taxi') return 'landing';
      if (Number.isFinite(gs) && Number.isFinite(vs) && gs >= 40 && vs >= 100) return 'takeoff';
      if (Number.isFinite(gs) && gs >= 4) return 'taxi';
      return 'ground';
    }

    if (age < 90000 && (!Number.isFinite(vs) || vs > 80)) return 'takeoff';

    const nearDestination =
      Number.isFinite(dist) && dist <= 18 &&
      (!Number.isFinite(vs) || vs < 100);

    const lowAndSlow =
      Number.isFinite(gs) && gs <= 175 &&
      Number.isFinite(alt) && alt <= 4500 &&
      (!Number.isFinite(vs) || vs < 150);

    if (nearDestination || lowAndSlow) {
      if ((Number.isFinite(dist) && dist <= 3) || (Number.isFinite(gs) && gs <= 125)) return 'landing';
      return 'approach';
    }

    if (Number.isFinite(vs)) {
      if (vs >= 250) return 'climb';
      if (vs <= -250) return 'descent';
    }

    return 'cruise';
  }

  function stableAutoPhase() {
    const candidate = deriveAutoPhase();
    const now = Date.now();

    if (candidate === runtime.autoPhase) {
      runtime.candidate = '';
      runtime.candidateHits = 0;
      return runtime.autoPhase;
    }

    if (candidate !== runtime.candidate) {
      runtime.candidate = candidate;
      runtime.candidateHits = 1;
      return runtime.autoPhase;
    }

    runtime.candidateHits += 1;

    const urgent = ['takeoff','landing','approach'].includes(candidate);
    const enoughHits = urgent ? 2 : 3;
    const dwell = now - runtime.phaseChangedAt;
    if (runtime.candidateHits >= enoughHits && (urgent || dwell >= 5000)) {
      runtime.autoPhase = candidate;
      runtime.phaseChangedAt = now;
      runtime.candidate = '';
      runtime.candidateHits = 0;
    }

    return runtime.autoPhase;
  }

  function ensureStyles() {
    if ($('#aeronavFlightCameraStyles')) return;
    const st = document.createElement('style');
    st.id = 'aeronavFlightCameraStyles';
    st.textContent = `
      #flightCameraBtn.active,#mobileFlightCameraBtn.active{background:#0d6efd!important;border-color:#55c7ff!important;color:#fff!important}
      #flightCameraMenu{position:absolute;z-index:52;right:10px;top:10px;width:min(390px,calc(100vw - 20px));display:none;padding:10px;border-radius:17px;background:#06131feb;border:1px solid #31566e;box-shadow:0 18px 50px #000b;backdrop-filter:blur(16px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eef9ff}
      #flightCameraMenu.show{display:block}
      #flightCameraMenu .fc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
      #flightCameraMenu .fc-head strong{font-size:13px;letter-spacing:.05em}
      #flightCameraMenu .fc-close{border:0;background:#13293a;color:#fff;width:31px;height:31px;border-radius:10px;font-weight:900}
      #flightCameraMenu .fc-auto{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;padding:10px;border-radius:13px;background:#0a1d2b;border:1px solid #284d65}
      #flightCameraMenu .fc-auto-copy strong{display:block;font-size:11px}.fc-auto-copy small{display:block;margin-top:3px;color:#8fb1c6;font-size:9px}
      #flightCameraMenu .fc-auto-btn{min-width:96px;border:1px solid #425d6f;background:#1a2832;color:#d5e5ee;border-radius:999px;padding:8px 10px;font-size:10px;font-weight:1000}
      #flightCameraMenu .fc-auto-btn.on{background:#0d8b59;border-color:#4fe0a1;color:#fff}
      #flightCameraMenu .fc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      #flightCameraMenu .fc-grid button{border:1px solid #284d65;background:#0a2030;color:#dff5ff;border-radius:12px;padding:10px 8px;font-size:11px;font-weight:900;letter-spacing:.02em}
      #flightCameraMenu .fc-grid button.active{background:#0b78e3;border-color:#68cfff;color:#fff}
      #flightCameraMenu .fc-grid button:disabled{opacity:.45}
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
        <div class="fc-head"><strong>🎥 CÂMARA DE VOO</strong><button class="fc-close" type="button" aria-label="Fechar">✕</button></div>
        <div class="fc-auto">
          <div class="fc-auto-copy"><strong>MODO AUTOMÁTICO</strong><small id="fcAutoState">—</small></div>
          <button class="fc-auto-btn" id="fcAutoToggle" type="button">AUTO</button>
        </div>
        <div class="fc-grid">
          ${Object.entries(PRESETS).map(([id,p]) => `<button type="button" data-flight-camera="${id}">${p.label}</button>`).join('')}
        </div>
        <div class="fc-note">AUTO ON: a câmara muda por fase de voo. AUTO OFF: a vista fica totalmente manual. Ao escolher um ângulo manual, o AUTO é desligado.</div>
      `;
      wrap.appendChild(menu);
      menu.querySelector('.fc-close').onclick = () => closeMenu();
      menu.querySelector('#fcAutoToggle').onclick = () => setAutomatic(!prefs.automatic);
      menu.querySelectorAll('[data-flight-camera]').forEach(b => {
        b.onclick = () => {
          setPreset(b.dataset.flightCamera, { manual:true });
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
    const source = $('.position-marker.flight img') || null;
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

    const autoBtn = $('#fcAutoToggle');
    if (autoBtn) {
      autoBtn.classList.toggle('on', prefs.automatic);
      autoBtn.textContent = prefs.automatic ? 'AUTO ON' : 'AUTO OFF';
      autoBtn.setAttribute('aria-pressed', String(prefs.automatic));
    }

    const autoState = $('#fcAutoState');
    if (autoState) {
      autoState.textContent = prefs.automatic
        ? `${PHASE_LABEL[runtime.autoPhase] || runtime.autoPhase} → ${preset.label}`
        : `Manual · ${preset.label}`;
    }

    const badge = $('#flightCameraBadge');
    if (badge) {
      badge.textContent = prefs.automatic
        ? `AUTO · ${PHASE_LABEL[runtime.autoPhase] || runtime.autoPhase} · ${preset.label}`
        : `MANUAL · ${preset.label}`;
    }

    const plane = $('#flightCameraAircraft');
    if (plane) {
      plane.style.top = `${preset.planeY || 64}%`;
      plane.style.width = prefs.preset === 'top' ? 'min(30vw,220px)' : 'min(42vw,310px)';
      plane.style.transform = 'translate(-50%,-50%)';
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

  /* RC12.37.14: flight-camera presets control the aircraft, NOT MapLibre. */
  function applyPreset({ instant = false, source = 'manual' } = {}) {
    ensureUi();
    syncSelectedAircraftImage();
    syncUi();
    if (!prefs.enabled || !modeFlight() || !mapActive()) return false;
    const selected = PRESETS[prefs.preset] || PRESETS.behind;
    // GLB renderer listens to this event. No calls to map.easeTo, setPitch,
    // setBearing, camera fitting or Cesium photographic map positioning.
    window.dispatchEvent(new CustomEvent('aeronav:camera-change', {
      detail: {preset:prefs.preset,label:selected.label,source,
        phase:runtime.autoPhase,automatic:prefs.automatic,
        aircraftOnly:true,release:'RC12.37.14'}
    }));
    runtime.lastApply = Date.now();
    return true;
  }

  function setPreset(id, { manual = false, instant = false } = {}) {
    if (!PRESETS[id]) return false;

    if (manual) prefs.automatic = false;
    prefs.preset = id;
    prefs.enabled = true;
    runtime.orbitAngle = 0;
    save();
    syncUi();
    applyPreset({ instant, source:manual ? 'manual' : 'automatic' });
    return true;
  }

  function setAutomatic(on) {
    prefs.automatic = !!on;
    prefs.enabled = true;
    runtime.candidate = '';
    runtime.candidateHits = 0;
    runtime.phaseChangedAt = Date.now();

    if (prefs.automatic) {
      runtime.autoPhase = deriveAutoPhase();
      prefs.preset = AUTO_MAP[runtime.autoPhase] || 'behind';
    }

    save();
    syncUi();
    applyPreset({ instant:false, source:prefs.automatic ? 'automatic' : 'manual' });
    return prefs.automatic;
  }

  function enable(on = true) {
    prefs.enabled = !!on;
    save();
    syncUi();
    if (prefs.enabled) applyPreset({ instant:true, source:prefs.automatic ? 'automatic' : 'manual' });
    return prefs.enabled;
  }

  function autoTick() {
    if (!prefs.automatic || !prefs.enabled || !modeFlight() || !mapActive()) return;

    const phase = stableAutoPhase();
    const target = AUTO_MAP[phase] || 'behind';
    if (target !== prefs.preset) {
      prefs.preset = target;
      runtime.orbitAngle = 0;
      save();
      syncUi();
      applyPreset({ instant:false, source:'automatic' });
    }
  }

  function tick() {
    ensureUi();
    syncSelectedAircraftImage();

    if (prefs.automatic) autoTick();
    syncUi();

    if (!prefs.enabled || !modeFlight() || !mapActive()) return;

    const now = Date.now();
    const cadence = 1200; // Orbit is animated in the aircraft GLB viewer.
    if (now - runtime.lastApply >= cadence) {
      applyPreset({
        instant:false,
        source:prefs.automatic ? 'automatic' : 'manual'
      });
    }
  }

  window.AERONAVFlightCamera = {
    release:'RC12.37.14',
    presets:() => Object.fromEntries(Object.entries(PRESETS).map(([k,v]) => [k,v.label])),
    autoMap:() => ({ ...AUTO_MAP }),
    set:(id) => setPreset(id, { manual:true }),
    automatic:setAutomatic,
    enable,
    apply:() => applyPreset({ instant:false, source:prefs.automatic ? 'automatic' : 'manual' }),
    open:() => { ensureUi(); runtime.menuOpen=false; toggleMenu(); },
    status:() => ({
      release:'RC12.37.14',
      enabled:prefs.enabled,
      preset:prefs.preset,
      label:(PRESETS[prefs.preset] || PRESETS.behind).label,
      active:prefs.enabled && modeFlight() && mapActive(),
      automatic:prefs.automatic,
      phase:runtime.autoPhase,
      phaseLabel:PHASE_LABEL[runtime.autoPhase] || runtime.autoPhase
    })
  };

  document.addEventListener('click', e => {
    if (!e.target?.closest?.('#flightCameraMenu,#flightCameraBtn,#mobileFlightCameraBtn')) closeMenu();
    if (e.target?.closest?.('#modeFlight,[data-bottom="map"],#myPositionBtn')) {
      setTimeout(() => applyPreset({ instant:true, source:prefs.automatic ? 'automatic' : 'manual' }), 160);
    }
  }, true);

  ['aeronav:map-ready','aeronav:screen-change','pageshow'].forEach(ev => {
    window.addEventListener(ev, () => setTimeout(() => {
      if (prefs.automatic) {
        runtime.autoPhase = deriveAutoPhase();
        prefs.preset = AUTO_MAP[runtime.autoPhase] || prefs.preset;
      }
      applyPreset({ instant:true, source:prefs.automatic ? 'automatic' : 'manual' });
    }, 180));
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => applyPreset({ instant:true, source:prefs.automatic ? 'automatic' : 'manual' }), 180);
  });

  setInterval(tick, 320);
  setTimeout(() => {
    ensureUi();
    runtime.autoPhase = deriveAutoPhase();
    if (prefs.automatic) prefs.preset = AUTO_MAP[runtime.autoPhase] || prefs.preset;
    applyPreset({ instant:true, source:prefs.automatic ? 'automatic' : 'manual' });
  }, 700);
})();
