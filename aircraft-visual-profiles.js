/* AERONAV RC12.37.7 — Aircraft Visual Profiles overlay. */
(() => {
  'use strict';
  if (window.__AERONAV_AIRCRAFT_VISUALS_RC12377__) return;
  window.__AERONAV_AIRCRAFT_VISUALS_RC12377__ = true;
  if (/\/(?:mathia|wendler|family)(?:\/|\.html|$)/i.test(location.pathname || '')) return;

  const $ = s => document.querySelector(s);

  const PROFILES = {
    c152:    { name:'Cessna 152',                width:'min(30vw,215px)', top:'min(23vw,170px)' },
    c172:    { name:'Cessna 172',                width:'min(32vw,225px)', top:'min(24vw,175px)' },
    q400:    { name:'De Havilland Dash 8 Q400',  width:'min(40vw,285px)', top:'min(29vw,215px)' },
    b7377:   { name:'Boeing 737-700',            width:'min(42vw,305px)', top:'min(30vw,225px)' },
    a2203:   { name:'Airbus A220-300',           width:'min(41vw,300px)', top:'min(30vw,220px)' },
    b777300: { name:'Boeing 777-300ER',          width:'min(48vw,350px)', top:'min(34vw,250px)' },
    b7879:   { name:'Boeing 787-9',              width:'min(46vw,340px)', top:'min(33vw,245px)' },
    b78710:  { name:'Boeing 787-10',             width:'min(48vw,350px)', top:'min(34vw,250px)' }
  };

  const state = { lastAircraft:'', lastPreset:'', lastSrc:'' };

  function aircraftId() {
    const id = localStorage.getItem('aeronav.aircraftPref') || 'c152';
    return PROFILES[id] ? id : 'c152';
  }

  function cameraStatus() {
    try { return window.AERONAVFlightCamera?.status?.() || {}; }
    catch (_) { return {}; }
  }

  function ensureStyle() {
    if ($('#aircraftVisualProfilesStyle')) return;
    const st = document.createElement('style');
    st.id = 'aircraftVisualProfilesStyle';
    st.textContent = `
      #flightAircraftIdentity{
        position:absolute;z-index:31;right:12px;bottom:12px;display:none;
        align-items:center;gap:7px;padding:6px 9px;border-radius:999px;
        background:#07131de8;border:1px solid #31566e;color:#eef9ff;
        font:900 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        pointer-events:none;max-width:min(72vw,430px)
      }
      body.aeronav-flight-camera-on #flightAircraftIdentity{display:flex}
      #flightAircraftIdentity .taag-mark{
        display:inline-flex;align-items:center;justify-content:center;
        padding:4px 7px;border-radius:999px;
        background:linear-gradient(90deg,#b90010,#e31b23 58%,#f58220);
        color:#fff;letter-spacing:.08em
      }
      #flightAircraftIdentity .aircraft-name{
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap
      }
      @media(max-width:620px){
        #flightAircraftIdentity{right:7px;bottom:44px;max-width:62vw}
      }
    `;
    document.head.appendChild(st);
  }

  function ensureIdentity() {
    ensureStyle();
    const wrap = $('#screen-map .map-wrap');
    if (!wrap) return null;
    let id = $('#flightAircraftIdentity');
    if (!id) {
      id = document.createElement('div');
      id.id = 'flightAircraftIdentity';
      id.innerHTML = '<span class="taag-mark">TAAG</span><span class="aircraft-name">Aeronave</span>';
      wrap.appendChild(id);
    }
    return id;
  }

  function selectedAvatarSource() {
    const marker = $('.position-marker.flight img');
    return marker?.getAttribute?.('src') || marker?.src || '';
  }

  function syncAircraftImage() {
    const img = $('#flightCameraAircraft');
    if (!img) return;
    const id = aircraftId();
    const src = selectedAvatarSource();
    if (src && (state.lastAircraft !== id || state.lastSrc !== src)) {
      img.src = src;
      img.dataset.aircraftId = id;
      img.alt = `TAAG · ${PROFILES[id].name}`;
      state.lastAircraft = id;
      state.lastSrc = src;
    }
  }

  function transformForPreset(preset) {
    if (preset === 'front') return 'translate(-50%,-50%) scaleX(-1) scaleY(.93)';
    if (preset === 'left') return 'translate(-50%,-50%) rotate(-6deg) skewY(-2deg)';
    if (preset === 'right') return 'translate(-50%,-50%) rotate(6deg) skewY(2deg)';
    if (preset === 'inclined') return 'translate(-50%,-50%) rotate(3deg)';
    if (preset === 'top') return 'translate(-50%,-50%) scale(.96)';
    return 'translate(-50%,-50%)';
  }

  function sync() {
    ensureIdentity();
    syncAircraftImage();

    const id = aircraftId();
    const profile = PROFILES[id];
    const cam = cameraStatus();
    const preset = cam.preset || 'behind';

    const identity = $('#flightAircraftIdentity .aircraft-name');
    if (identity) identity.textContent = profile.name;

    const plane = $('#flightCameraAircraft');
    if (plane) {
      plane.style.width = preset === 'top' ? profile.top : profile.width;
      plane.style.transform = transformForPreset(preset);
      plane.dataset.aircraftProfile = id;
    }

    const badge = $('#flightCameraBadge');
    if (badge && cam.active) {
      badge.title = `${profile.name} · ${cam.automatic ? 'AUTO' : 'MANUAL'}`;
    }

    state.lastPreset = preset;
  }

  window.AERONAVAircraftVisuals = {
    release:'RC12.37.7',
    profiles:() => ({...PROFILES}),
    sync,
    status:() => {
      const id = aircraftId();
      const cam = cameraStatus();
      return {
        release:'RC12.37.7',
        aircraft:id,
        aircraftName:PROFILES[id].name,
        preset:cam.preset || 'behind',
        automatic:!!cam.automatic,
        active:!!cam.active
      };
    }
  };

  ['aeronav:camera-change','aeronav:map-ready','aeronav:screen-change','pageshow'].forEach(ev => {
    window.addEventListener(ev, () => setTimeout(sync, 80));
  });

  document.addEventListener('click', e => {
    if (e.target?.closest?.('#addonAircraft,#flightCameraBtn,#mobileFlightCameraBtn,[data-flight-camera],#fcAutoToggle')) {
      setTimeout(sync, 120);
    }
  }, true);

  document.addEventListener('change', e => {
    if (e.target?.matches?.('#addonAircraft')) setTimeout(sync, 160);
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(sync, 100);
  });

  setInterval(sync, 700);
  setTimeout(sync, 500);
})();
