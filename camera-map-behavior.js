/* AERONAV RC12.37.10 — Vistas integration, Auto Zoom switch and single-aircraft display. */
(() => {
  'use strict';
  if (window.__AERONAV_CAMERA_MAP_BEHAVIOR_3710__) return;
  window.__AERONAV_CAMERA_MAP_BEHAVIOR_3710__ = true;

  const AUTO_ZOOM_KEY = 'aeronav.map.autozoom';
  const $ = s => document.querySelector(s);

  function autoZoomOn() {
    return localStorage.getItem(AUTO_ZOOM_KEY) !== '0';
  }

  function setAutoZoom(on) {
    localStorage.setItem(AUTO_ZOOM_KEY, on ? '1' : '0');
    syncAutoZoomButton();
    window.dispatchEvent(new CustomEvent('aeronav:autozoom-change', {
      detail: { enabled: !!on, release: 'RC12.37.10' }
    }));
    if (on) {
      try { window.AERONAVFlightCamera?.apply?.(); } catch (_) {}
    }
    return !!on;
  }

  function ensureStyles() {
    if ($('#aeronavCameraMapBehavior3710Style')) return;
    const st = document.createElement('style');
    st.id = 'aeronavCameraMapBehavior3710Style';
    st.textContent = `
      #flightCameraBtn,#mobileFlightCameraBtn{display:none!important}
      body.aeronav-flight-camera-external .position-marker.flight{display:none!important}
      body.aeronav-flight-camera-external #aeronavRearAircraft{display:none!important}

      #autoZoomMapBtn{
        position:absolute;z-index:35;left:12px;top:12px;
        border:1px solid #31566e;border-radius:999px;
        padding:7px 10px;background:#07131de8;color:#dff6ff;
        font:900 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        letter-spacing:.04em;box-shadow:0 7px 20px #0007;
        backdrop-filter:blur(10px)
      }
      #autoZoomMapBtn.on{background:#0d6f53;border-color:#4bd7a0;color:#fff}
      #autoZoomMapBtn.off{background:#51252b;border-color:#a85a65;color:#fff}
      #clFlightAngles{min-height:58px}
      #clFlightAngles b{font-size:18px}
    `;
    document.head.appendChild(st);
  }

  function ensureAutoZoomButton() {
    const wrap = $('#screen-map .map-wrap');
    if (!wrap || $('#autoZoomMapBtn')) return;

    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'autoZoomMapBtn';
    b.addEventListener('click', e => {
      e.stopPropagation();
      setAutoZoom(!autoZoomOn());
    });

    wrap.appendChild(b);
    syncAutoZoomButton();
  }

  function syncAutoZoomButton() {
    const b = $('#autoZoomMapBtn');
    if (!b) return;
    const on = autoZoomOn();
    b.classList.toggle('on', on);
    b.classList.toggle('off', !on);
    b.textContent = on ? '🔎 ZOOM AUTO · ON' : '🔎 ZOOM AUTO · OFF';
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('title', on ? 'Desligar zoom automático' : 'Ligar zoom automático');
  }

  function closeVistasMenu() {
    const menu = $('#clViewMenu');
    const btn = $('#clViews');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function ensureAnglesInsideVistas() {
    const grid = $('#clViewMenu .cl-views');
    if (!grid || $('#clFlightAngles')) return;

    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'clFlightAngles';
    b.innerHTML = '<b>🎥</b>Ângulos de voo';
    b.addEventListener('click', e => {
      e.stopPropagation();
      closeVistasMenu();

      const mapMenu = $('#mobileMapMenu');
      const mapMenuBtn = $('#mobileMapMenuBtn');
      if (mapMenu) {
        mapMenu.classList.remove('show');
        mapMenu.setAttribute('aria-hidden', 'true');
      }
      if (mapMenuBtn) mapMenuBtn.setAttribute('aria-expanded', 'false');

      setTimeout(() => {
        try { window.AERONAVFlightCamera?.open?.(); } catch (_) {}
      }, 30);
    });

    grid.appendChild(b);
  }

  function syncSingleAircraft() {
    const external = document.body.classList.contains('aeronav-flight-camera-external');
    const marker = $('.position-marker.flight');
    if (marker) marker.setAttribute('aria-hidden', external ? 'true' : 'false');
  }

  function sync() {
    ensureStyles();
    ensureAutoZoomButton();
    ensureAnglesInsideVistas();
    syncAutoZoomButton();
    syncSingleAircraft();
  }

  ['aeronav:camera-change','aeronav:screen-change','aeronav:map-ready','pageshow','aeronav:autozoom-change']
    .forEach(ev => window.addEventListener(ev, () => setTimeout(sync, 40)));

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(sync, 50);
  });

  setInterval(sync, 500);
  setTimeout(sync, 350);

  window.AERONAVMapViewControls = {
    release:'RC12.37.10',
    autoZoom:setAutoZoom,
    status:() => ({
      release:'RC12.37.10',
      autoZoom:autoZoomOn(),
      anglesInVistas:!!$('#clFlightAngles'),
      duplicateAircraftSuppressed:document.body.classList.contains('aeronav-flight-camera-external')
    })
  };
})();
