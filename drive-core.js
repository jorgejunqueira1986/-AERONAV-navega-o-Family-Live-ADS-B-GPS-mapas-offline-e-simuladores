/* AERONAV RC12.37.2 — Drive 2D/3D core controller */
(() => {
  'use strict';
  if (window.__AERONAV_DRIVE_CORE_RC12372__) return;
  window.__AERONAV_DRIVE_CORE_RC12372__ = true;
  if (/\/(?:mathia|wendler|family)(?:\/|\.html|$)/i.test(location.pathname || '')) return;

  const $ = s => document.querySelector(s);
  const state = { map: null, originalEaseTo: null, savedExtrusions: new Map(), lastView: '' };

  const isDrive = () =>
    localStorage.getItem('aeronav.mode') === 'drive' ||
    !!$('#modeDrive')?.classList.contains('active');

  const isMapScreen = () => !!$('#screen-map')?.classList.contains('active');

  const selectedView = () => {
    const v = localStorage.getItem('aeronav.drive.view') || '3d';
    return ['2d', '3d', 'perspective'].includes(v) ? v : '3d';
  };

  const mapObject = () => {
    const candidates = [window.__AERONAV_MAP__, window.aeronavMap, window.mainMap, window.map];
    return candidates.find(m => m && typeof m.easeTo === 'function' && typeof m.getStyle === 'function') || null;
  };

  function headingFromMap(m) {
    try { return Number(m.getBearing?.() || 0); } catch (_) { return 0; }
  }

  function cameraFor(view, m, input = {}) {
    const base = { ...(input || {}) };
    if (view === '2d') {
      base.pitch = 0;
      base.bearing = 0;
      if (!Number.isFinite(Number(base.zoom)) || Number(base.zoom) < 14.5) {
        base.zoom = Math.max(14.5, Number(m.getZoom?.() || 14.5));
      }
      base.padding = base.padding || { top: 20, bottom: 110, left: 18, right: 18 };
    } else if (view === 'perspective') {
      base.pitch = 67;
      if (!Number.isFinite(Number(base.bearing))) base.bearing = headingFromMap(m);
      if (!Number.isFinite(Number(base.zoom)) || Number(base.zoom) < 16.2) {
        base.zoom = Math.max(16.2, Number(m.getZoom?.() || 16.2));
      }
      base.padding = base.padding || { top: 68, bottom: 190, left: 18, right: 18 };
    } else {
      base.pitch = 56;
      if (!Number.isFinite(Number(base.bearing))) base.bearing = headingFromMap(m);
      if (!Number.isFinite(Number(base.zoom)) || Number(base.zoom) < 15.6) {
        base.zoom = Math.max(15.6, Number(m.getZoom?.() || 15.6));
      }
      base.padding = base.padding || { top: 62, bottom: 175, left: 18, right: 18 };
    }
    return base;
  }

  function setExtrusions(m, on) {
    try {
      const layers = m.getStyle?.()?.layers || [];
      for (const layer of layers) {
        if (layer.type !== 'fill-extrusion') continue;
        if (!state.savedExtrusions.has(layer.id)) {
          let v = 'visible';
          try { v = m.getLayoutProperty(layer.id, 'visibility') || 'visible'; } catch (_) {}
          state.savedExtrusions.set(layer.id, v);
        }
        try { m.setLayoutProperty(layer.id, 'visibility', on ? 'visible' : 'none'); } catch (_) {}
      }
    } catch (_) {}
  }

  function patchMap(m) {
    if (!m || m.__aeronavDriveCoreRc12372) return;
    m.__aeronavDriveCoreRc12372 = true;
    try { m.setMaxPitch?.(75); } catch (_) {}
    const original = m.easeTo.bind(m);
    state.originalEaseTo = original;
    m.easeTo = function(options, eventData) {
      let next = { ...(options || {}) };
      if (isDrive() && isMapScreen()) next = cameraFor(selectedView(), m, next);
      return original(next, eventData);
    };
  }

  function applyView({ instant = false } = {}) {
    const m = mapObject();
    if (!m || !isDrive() || !isMapScreen()) return;
    state.map = m;
    patchMap(m);

    const view = selectedView();
    setExtrusions(m, view !== '2d');

    const target = cameraFor(view, m, {
      center: m.getCenter?.(),
      bearing: view === '2d' ? 0 : headingFromMap(m),
      duration: instant ? 0 : 550
    });
    try { state.originalEaseTo ? state.originalEaseTo(target) : m.easeTo(target); } catch (_) {}

    state.lastView = view;
    syncHud();
    window.dispatchEvent(new CustomEvent('aeronav:drive-core-view', { detail: { view } }));
  }

  function ensureHud() {
    document.getElementById('aeronavDrive23d')?.remove();
    document.getElementById('aeronavDrive3dHud')?.remove();

    if (!$('#aeronavDriveCoreStyle')) {
      const st = document.createElement('style');
      st.id = 'aeronavDriveCoreStyle';
      st.textContent = `
        #aeronavDriveCoreHud{position:absolute;z-index:35;left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));top:8px;display:none;align-items:flex-start;justify-content:space-between;gap:8px;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff}
        body.aeronav-drive-core-3d #aeronavDriveCoreHud{display:flex}
        #aeronavDriveCoreHud .dc-speed,#aeronavDriveCoreHud .dc-turn{background:#07111dea;border:1px solid #325065;border-radius:15px;backdrop-filter:blur(12px);box-shadow:0 8px 20px #0007}
        #aeronavDriveCoreHud .dc-speed{padding:8px 11px;min-width:76px}.dc-speed b{font-size:32px;line-height:1}.dc-speed small{display:block;color:#a9c4d5;font-size:9px;font-weight:800;margin-top:2px}
        #aeronavDriveCoreHud .dc-turn{margin-left:auto;max-width:min(620px,68vw);padding:9px 12px}.dc-turn b{display:block;font-size:18px}.dc-turn strong{display:block;margin-top:2px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dc-turn small{display:block;margin-top:3px;color:#a9c4d5;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        @media(max-width:620px){#aeronavDriveCoreHud .dc-speed{min-width:58px;padding:7px 8px}.dc-speed b{font-size:26px!important}#aeronavDriveCoreHud .dc-turn{max-width:64vw;padding:7px 9px}.dc-turn b{font-size:15px!important}.dc-turn strong{font-size:10px!important}.dc-turn small{font-size:8px!important}}
      `;
      document.head.appendChild(st);
    }

    let hud = $('#aeronavDriveCoreHud');
    const wrap = $('#screen-map .map-wrap');
    if (!wrap) return null;
    if (hud && hud.parentElement !== wrap) { hud.remove(); hud = null; }
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'aeronavDriveCoreHud';
      hud.innerHTML = '<div class="dc-speed"><b id="dcSpeed">—</b><small>km/h</small></div><div class="dc-turn"><b id="dcDist">—</b><strong id="dcInstr">Pronto para conduzir</strong><small id="dcMeta">Selecione um destino</small></div></div>';
      wrap.appendChild(hud);
    }
    return hud;
  }

  function syncHud() {
    const hud = ensureHud();
    const show = isDrive() && isMapScreen() && selectedView() !== '2d';
    document.body.classList.toggle('aeronav-drive-core-3d', show);
    if (!hud || !show) return;

    const speedText = String($('#gsValue')?.textContent || '—');
    const speedMatch = speedText.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    $('#dcSpeed').textContent = speedMatch ? String(Math.round(Number(speedMatch[0]))) : '—';

    const card = $('#driveNavCard');
    const kpis = card ? Array.from(card.querySelectorAll('.drive-nav-kpi')) : [];
    $('#dcDist').textContent = kpis[0]?.querySelector('strong')?.textContent || '—';
    $('#dcInstr').textContent = card?.querySelector('h4')?.textContent || 'Pronto para conduzir';
    const dest = kpis[1]?.querySelector('strong')?.textContent || 'Destino';
    const rest = kpis[2]?.querySelector('strong')?.textContent || '—';
    $('#dcMeta').textContent = `${dest} · ${rest}`;
  }

  function tick() {
    const m = mapObject();
    if (m) patchMap(m);
    if (isDrive() && isMapScreen()) {
      const v = selectedView();
      if (v !== state.lastView) applyView({ instant: false });
      else setExtrusions(m, v !== '2d');
    }
    syncHud();
  }

  window.AERONAVDriveCore = {
    apply: applyView,
    view: selectedView,
    status: () => ({ release: 'RC12.37.2', view: selectedView(), active: isDrive() && isMapScreen() })
  };

  ['aeronav:map-ready','aeronav:screen-change','pageshow'].forEach(ev =>
    window.addEventListener(ev, () => setTimeout(() => applyView({ instant: true }), 100))
  );

  document.addEventListener('click', e => {
    if (e.target?.closest?.('[data-drive-view],[data-drive-proxy],#modeDrive,#myPositionBtn,[data-bottom="map"]')) {
      setTimeout(() => applyView({ instant: false }), 80);
    }
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => applyView({ instant: true }), 100);
  });

  setInterval(tick, 1200);
  setTimeout(() => { tick(); applyView({ instant: true }); }, 300);
})();
