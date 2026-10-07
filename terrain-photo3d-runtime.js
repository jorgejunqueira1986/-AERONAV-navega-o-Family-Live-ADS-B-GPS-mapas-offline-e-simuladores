/* AERONAV RC12.37.3 — Terrain + Photo3D runtime bridge */
(() => {
  'use strict';
  if (window.__AERONAV_3D_RUNTIME_RC12373__) return;
  window.__AERONAV_3D_RUNTIME_RC12373__ = true;

  const $ = s => document.querySelector(s);

  function mode() {
    if ($('#modeFlight')?.classList.contains('active')) return 'flight';
    if ($('#modeDrive')?.classList.contains('active')) return 'drive';
    return localStorage.getItem('aeronav.mode') || 'flight';
  }

  function driveView() {
    const v = localStorage.getItem('aeronav.drive.view') || '3d';
    return ['2d','3d','perspective'].includes(v) ? v : '3d';
  }

  function wantsTerrain() {
    if (mode() === 'flight') return true;
    return mode() === 'drive' && driveView() !== '2d';
  }

  async function syncTerrain() {
    const bridge = window.AERONAVTerrainBridge;
    if (!bridge?.apply) return false;
    if (!$('#screen-map')?.classList.contains('active')) return false;

    try {
      if (!wantsTerrain()) {
        await bridge.clear?.();
        document.body.classList.remove('aeronav-terrain3d-active');
        return false;
      }
      const ok = !!(await bridge.apply());
      document.body.classList.toggle('aeronav-terrain3d-active', ok);
      return ok;
    } catch (_) {
      document.body.classList.remove('aeronav-terrain3d-active');
      return false;
    }
  }

  async function status() {
    let terrain = { ok:false, available:false, active:false };
    let photo3d = { ok:false, configured:false, proxyLoaded:false };

    try {
      terrain = await window.AERONAVTerrainBridge?.status?.() || terrain;
    } catch (_) {}

    try {
      const p = window.AERONAV_PHOTO3D_PROXY;
      if (p?.enabled && p?.status) {
        photo3d = { ...(await p.status()), proxyLoaded:true, backend:p.backend };
      }
    } catch (e) {
      photo3d = { ok:false, configured:false, proxyLoaded:true, error:String(e?.message || e) };
    }

    return {
      release:'RC12.37.3',
      mode:mode(),
      driveView:driveView(),
      wantsTerrain:wantsTerrain(),
      terrain,
      photo3d
    };
  }

  window.AERONAV3D = { release:'RC12.37.3', sync:syncTerrain, status };

  ['aeronav:map-ready','aeronav:screen-change','aeronav:drive-core-view','pageshow'].forEach(ev => {
    window.addEventListener(ev, () => setTimeout(syncTerrain, 150));
  });

  document.addEventListener('click', e => {
    if (e.target?.closest?.('#modeFlight,#modeDrive,[data-drive-view],[data-drive-proxy],#myPositionBtn,[data-bottom="map"]')) {
      setTimeout(syncTerrain, 180);
    }
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(syncTerrain, 180);
  });

  setInterval(() => {
    if (document.visibilityState === 'visible') syncTerrain();
  }, 7000);

  setTimeout(syncTerrain, 600);
})();
