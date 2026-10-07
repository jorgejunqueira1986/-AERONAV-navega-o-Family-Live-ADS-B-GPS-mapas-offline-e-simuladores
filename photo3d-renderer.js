/* AERONAV RC12.37.4 — Google Photorealistic 3D renderer via secure proxy + CesiumJS. */
(() => {
  'use strict';
  if (window.__AERONAV_PHOTO3D_RENDERER_RC12374__) return;
  window.__AERONAV_PHOTO3D_RENDERER_RC12374__ = true;

  const CESIUM_VERSION = '1.146';
  const CESIUM_BASE = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/`;
  const ROOT_TILESET = 'https://tile.googleapis.com/v1/3dtiles/root.json?key=AERONAV_RAILWAY_PROXY_RC11_84_ONLY';
  const PREF_KEY = 'aeronav.photo3d.enabled';
  const QUALITY_KEY = 'aeronav.mapQuality';

  const $ = s => document.querySelector(s);
  const runtime = {
    enabled: false,
    loading: false,
    viewer: null,
    tileset: null,
    lastSyncAt: 0,
    error: '',
    ready: false
  };

  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = String(msg || '');
    t.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove('show'), 4200);
  }

  function mainMap() {
    const candidates = [window.__AERONAV_MAP__, window.aeronavMap, window.mainMap, window.map];
    return candidates.find(m => m && typeof m.getCenter === 'function' && typeof m.getZoom === 'function') || null;
  }

  function mapScreenActive() {
    return !!$('#screen-map')?.classList.contains('active');
  }

  function online() {
    return navigator.onLine !== false && localStorage.getItem('aeronav.net') !== 'offline';
  }

  function ensureUi() {
    const toolbar = $('#screen-map .map-toolbar');
    if (toolbar && !$('#photo3dBtn')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'soft-btn';
      b.id = 'photo3dBtn';
      b.textContent = '🌐 Foto 3D';
      b.setAttribute('aria-pressed', 'false');
      const terrain = $('#terrainOverlayBtn');
      toolbar.insertBefore(b, terrain || $('#refreshAllBtn') || null);
      b.addEventListener('click', () => toggle());
    }

    const mobile = $('#mobileMapMenu');
    if (mobile && !$('#mobilePhoto3dBtn')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'mobilePhoto3dBtn';
      b.textContent = '🌐 Foto 3D';
      b.addEventListener('click', () => toggle());
      const terrain = mobile.querySelector('[data-map-proxy="terrainOverlayBtn"]');
      mobile.insertBefore(b, terrain || null);
    }

    if (!$('#photo3dRendererStyle')) {
      const st = document.createElement('style');
      st.id = 'photo3dRendererStyle';
      st.textContent = `
        #photo3dHost{position:absolute;inset:0;z-index:18;display:none;overflow:hidden;background:#07121a;pointer-events:none}
        body.aeronav-photo3d-on #photo3dHost{display:block}
        body.aeronav-photo3d-on #map{opacity:0!important}
        body.aeronav-photo3d-on #offlineMap{opacity:0!important}
        #photo3dHost .cesium-viewer,#photo3dHost .cesium-widget,#photo3dHost canvas{width:100%!important;height:100%!important}
        #photo3dHost .cesium-viewer-bottom{left:4px!important;right:4px!important;bottom:2px!important}
        #photo3dStatus{position:absolute;z-index:42;left:50%;bottom:12px;transform:translateX(-50%);display:none;pointer-events:none;padding:6px 10px;border-radius:999px;background:#07111dda;border:1px solid #35536a;color:#eaf7ff;font:800 10px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(10px);white-space:nowrap}
        body.aeronav-photo3d-on #photo3dStatus{display:block}
        #photo3dBtn.active,#mobilePhoto3dBtn.active{background:#0d6efd!important;border-color:#49b8ff!important;color:#fff!important}
      `;
      document.head.appendChild(st);
    }

    const wrap = $('#screen-map .map-wrap');
    if (wrap && !$('#photo3dHost')) {
      const host = document.createElement('div');
      host.id = 'photo3dHost';
      host.setAttribute('aria-label', 'Google Photorealistic 3D');
      wrap.appendChild(host);

      const badge = document.createElement('div');
      badge.id = 'photo3dStatus';
      badge.textContent = 'PHOTO 3D';
      wrap.appendChild(badge);
    }
    syncButtons();
  }

  function syncButtons() {
    for (const id of ['photo3dBtn', 'mobilePhoto3dBtn']) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.classList.toggle('active', runtime.enabled);
      b.setAttribute('aria-pressed', runtime.enabled ? 'true' : 'false');
      b.textContent = runtime.loading ? '🌐 A carregar…' : (runtime.enabled ? '🌐 Foto 3D ✓' : '🌐 Foto 3D');
    }
    const s = $('#photo3dStatus');
    if (s) s.textContent = runtime.error ? 'PHOTO 3D · ERRO' : (runtime.ready ? 'PHOTO 3D · GOOGLE' : 'PHOTO 3D');
  }

  function loadCss() {
    if ($('#aeronavCesiumCss')) return;
    const link = document.createElement('link');
    link.id = 'aeronavCesiumCss';
    link.rel = 'stylesheet';
    link.href = `${CESIUM_BASE}Widgets/widgets.css`;
    document.head.appendChild(link);
  }

  function loadCesium() {
    if (window.Cesium) return Promise.resolve(window.Cesium);
    if (loadCesium._promise) return loadCesium._promise;
    loadCss();
    window.CESIUM_BASE_URL = CESIUM_BASE;
    loadCesium._promise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${CESIUM_BASE}Cesium.js`;
      s.async = true;
      s.onload = () => window.Cesium ? resolve(window.Cesium) : reject(new Error('CesiumJS não ficou disponível.'));
      s.onerror = () => reject(new Error('Falha ao carregar CesiumJS.'));
      document.head.appendChild(s);
    });
    return loadCesium._promise;
  }

  function qualitySettings() {
    const q = localStorage.getItem(QUALITY_KEY) || 'balanced';
    if (q === 'eco') return { sse: 24, cacheBytes: 96 * 1024 * 1024 };
    if (q === 'high') return { sse: 8, cacheBytes: 256 * 1024 * 1024 };
    return { sse: 14, cacheBytes: 160 * 1024 * 1024 };
  }

  function zoomHeight(zoom, lat) {
    const z = Math.max(1, Math.min(22, Number(zoom) || 15));
    const c = Math.max(0.25, Math.cos((Number(lat) || 0) * Math.PI / 180));
    return Math.max(55, Math.min(2500000, (40075016.686 * c / Math.pow(2, z)) * 0.92));
  }

  function syncCamera(force = false) {
    if (window.__AERONAV_3D_AIRCRAFT_CAMERA_OVERRIDE__) return;
    if (!runtime.enabled || !runtime.viewer || !runtime.ready || !mapScreenActive()) return;
    const now = performance.now();
    if (!force && now - runtime.lastSyncAt < 120) return;
    runtime.lastSyncAt = now;

    const m = mainMap();
    if (!m || !window.Cesium) return;

    try {
      const center = m.getCenter();
      const zoom = m.getZoom();
      const bearing = Number(m.getBearing?.() || 0);
      const pitch = Math.max(0, Math.min(85, Number(m.getPitch?.() || 0)));
      const height = zoomHeight(zoom, center.lat);
      const cesiumPitch = -(90 - pitch);

      runtime.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, height),
        orientation: {
          heading: Cesium.Math.toRadians(bearing),
          pitch: Cesium.Math.toRadians(cesiumPitch),
          roll: 0
        }
      });
      runtime.viewer.scene.requestRender?.();
    } catch (_) {}
  }

  async function initViewer() {
    if (runtime.viewer && runtime.tileset) return;
    if (!window.AERONAV_PHOTO3D_PROXY?.enabled) {
      throw new Error('Proxy Photo3D não está ativo.');
    }

    const Cesium = await loadCesium();
    ensureUi();
    const host = $('#photo3dHost');
    if (!host) throw new Error('Área Photo3D não encontrada.');

    if (!runtime.viewer) {
      Cesium.Ion.defaultAccessToken = '';
      runtime.viewer = new Cesium.Viewer(host, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        infoBox: false,
        selectionIndicator: false,
        fullscreenButton: false,
        vrButton: false,
        baseLayer: false,
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity
      });

      runtime.viewer.scene.globe.show = false;
      runtime.viewer.scene.skyAtmosphere.show = false;
      runtime.viewer.scene.fog.enabled = true;
      runtime.viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#07121a');
      runtime.viewer.scene.screenSpaceCameraController.enableInputs = false;
      runtime.viewer.scene.highDynamicRange = true;
    }

    if (!runtime.tileset) {
      const q = qualitySettings();
      const tileset = await Cesium.Cesium3DTileset.fromUrl(ROOT_TILESET, {
        maximumScreenSpaceError: q.sse,
        cacheBytes: q.cacheBytes,
        dynamicScreenSpaceError: true,
        skipLevelOfDetail: true,
        preferLeaves: false,
        preloadWhenHidden: false
      });
      runtime.viewer.scene.primitives.add(tileset);
      runtime.tileset = tileset;
    }

    runtime.ready = true;
    runtime.error = '';
    syncCamera(true);
  }

  async function enable() {
    ensureUi();
    if (runtime.enabled && runtime.ready) return true;
    if (!online()) {
      toast('Foto 3D requer ligação à Internet.');
      return false;
    }

    runtime.loading = true;
    runtime.error = '';
    syncButtons();

    try {
      const st = await window.AERONAV_PHOTO3D_PROXY?.status?.();
      if (st && st.configured === false) {
        throw new Error('Google 3D ainda não está configurado no servidor.');
      }
      await initViewer();
      runtime.enabled = true;
      localStorage.setItem(PREF_KEY, '1');
      document.body.classList.add('aeronav-photo3d-on');
      syncButtons();
      syncCamera(true);
      toast('Google Photorealistic 3D ativado.');
      return true;
    } catch (e) {
      runtime.enabled = false;
      runtime.ready = false;
      runtime.error = String(e?.message || e || 'Falha Photo3D');
      document.body.classList.remove('aeronav-photo3d-on');
      localStorage.setItem(PREF_KEY, '0');
      syncButtons();
      toast(`Foto 3D: ${runtime.error}`);
      return false;
    } finally {
      runtime.loading = false;
      syncButtons();
    }
  }

  function disable() {
    runtime.enabled = false;
    localStorage.setItem(PREF_KEY, '0');
    document.body.classList.remove('aeronav-photo3d-on');
    syncButtons();
    toast('Foto 3D desativado.');
  }

  function toggle() {
    if (runtime.enabled) disable();
    else enable();
  }

  function status() {
    return {
      release: 'RC12.37.8',
      enabled: runtime.enabled,
      loading: runtime.loading,
      ready: runtime.ready,
      error: runtime.error,
      cesiumVersion: CESIUM_VERSION,
      proxy: !!window.AERONAV_PHOTO3D_PROXY?.enabled,
      tilesetLoaded: !!runtime.tileset
    };
  }

  window.AERONAVPhoto3DRenderer = { enable, disable, toggle, status, sync: () => syncCamera(true), viewer: () => runtime.viewer };

  ensureUi();

  const loop = () => {
    syncCamera(false);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  ['aeronav:map-ready', 'aeronav:screen-change', 'aeronav:drive-core-view', 'pageshow']
    .forEach(ev => window.addEventListener(ev, () => setTimeout(() => syncCamera(true), 140)));

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => syncCamera(true), 160);
  });

  if (localStorage.getItem(PREF_KEY) === '1' && online()) {
    setTimeout(enable, 900);
  }
})();
