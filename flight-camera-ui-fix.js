/* AERONAV RC12.37.9 — Camera master switch + menu exclusivity */
(() => {
  'use strict';
  if (window.__AERONAV_CAMERA_UI_FIX_379__) return;
  window.__AERONAV_CAMERA_UI_FIX_379__ = true;

  const $ = (s) => document.querySelector(s);

  const camApi = () => window.AERONAVFlightCamera || null;
  const camStatus = () => {
    try { return camApi()?.status?.() || {}; }
    catch (_) { return {}; }
  };

  function closeMapMenu() {
    const menu = $('#mobileMapMenu');
    const btn = $('#mobileMapMenuBtn');
    if (menu) {
      menu.classList.remove('show');
      menu.setAttribute('aria-hidden', 'true');
    }
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function closeCameraMenu() {
    const menu = $('#flightCameraMenu');
    if (menu) menu.classList.remove('show');
  }

  function ensureStyle() {
    if ($('#aeronavCameraUiFix379Style')) return;
    const style = document.createElement('style');
    style.id = 'aeronavCameraUiFix379Style';
    style.textContent = `
      #flightCameraMenu .fc-master{
        display:flex;align-items:center;justify-content:space-between;gap:10px;
        margin-bottom:9px;padding:10px;border-radius:13px;
        background:#0a1d2b;border:1px solid #284d65
      }
      #flightCameraMenu .fc-master strong{display:block;font-size:11px}
      #flightCameraMenu .fc-master small{display:block;margin-top:3px;color:#8fb1c6;font-size:9px}
      #fcMasterToggle{
        min-width:105px;border:1px solid #4b6779;background:#173040;color:#eaf8ff;
        border-radius:999px;padding:8px 11px;font-size:10px;font-weight:1000
      }
      #fcMasterToggle.on{background:#0d8b59;border-color:#4fe0a1;color:#fff}
      #fcMasterToggle.off{background:#8d2633;border-color:#ff7f90;color:#fff}
      #flightCameraMenu.camera-disabled [data-flight-camera],
      #flightCameraMenu.camera-disabled #fcAutoToggle{
        opacity:.42;filter:saturate(.4)
      }
    `;
    document.head.appendChild(style);
  }

  function ensureMasterSwitch() {
    const menu = $('#flightCameraMenu');
    if (!menu || $('#fcMasterToggle')) return;

    const head = menu.querySelector('.fc-head');
    const row = document.createElement('div');
    row.className = 'fc-master';
    row.innerHTML = `
      <div>
        <strong>ÂNGULOS DE VOO</strong>
        <small id="fcMasterState">Controlo de câmara</small>
      </div>
      <button type="button" id="fcMasterToggle">DESLIGAR</button>
    `;
    head?.insertAdjacentElement('afterend', row);

    $('#fcMasterToggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const api = camApi();
      if (!api?.enable) return;

      const enabled = camStatus().enabled !== false;
      api.enable(!enabled);

      if (enabled) {
        try { window.AERONAV3DAircraft?.deactivate?.(); } catch (_) {}
      }

      setTimeout(syncUi, 30);
    });
  }

  function syncUi() {
    ensureStyle();
    ensureMasterSwitch();

    const status = camStatus();
    const enabled = status.enabled !== false;
    const menu = $('#flightCameraMenu');
    const master = $('#fcMasterToggle');
    const state = $('#fcMasterState');

    if (menu) menu.classList.toggle('camera-disabled', !enabled);

    if (master) {
      master.classList.toggle('on', enabled);
      master.classList.toggle('off', !enabled);
      master.textContent = enabled ? 'DESLIGAR' : 'LIGAR';
      master.setAttribute('aria-pressed', String(enabled));
    }

    if (state) {
      state.textContent = enabled
        ? `Ligado · ${status.automatic ? 'AUTO' : 'MANUAL'}`
        : 'Desligado · mapa normal';
    }

    const auto = $('#fcAutoToggle');
    if (auto) auto.disabled = !enabled;

    menu?.querySelectorAll('[data-flight-camera]').forEach((button) => {
      button.disabled = !enabled;
    });

    const mobile = $('#mobileFlightCameraBtn');
    if (mobile) {
      mobile.textContent = enabled
        ? '🎥 Ângulos de voo · ON'
        : '🎥 Ângulos de voo · OFF';
    }

    const desktop = $('#flightCameraBtn');
    if (desktop) {
      desktop.textContent = enabled
        ? '🎥 ÂNGULOS'
        : '🎥 ÂNGULOS OFF';
    }
  }

  function installMenuExclusivity() {
    const mobileCam = $('#mobileFlightCameraBtn');
    if (mobileCam && !mobileCam.dataset.fix379) {
      mobileCam.dataset.fix379 = '1';
      mobileCam.addEventListener('click', closeMapMenu, true);
    }

    const desktopCam = $('#flightCameraBtn');
    if (desktopCam && !desktopCam.dataset.fix379) {
      desktopCam.dataset.fix379 = '1';
      desktopCam.addEventListener('click', closeMapMenu, true);
    }

    const mapButton = $('#mobileMapMenuBtn');
    if (mapButton && !mapButton.dataset.fix379) {
      mapButton.dataset.fix379 = '1';
      mapButton.addEventListener('click', closeCameraMenu, true);
    }

    const mapMenu = $('#mobileMapMenu');
    if (mapMenu && !mapMenu.dataset.fix379) {
      mapMenu.dataset.fix379 = '1';
      mapMenu.addEventListener('click', (event) => {
        if (event.target?.closest?.('button')) closeCameraMenu();
      }, true);
    }
  }

  function syncAll() {
    installMenuExclusivity();
    syncUi();

    const mapOpen = $('#mobileMapMenu')?.classList.contains('show');
    const cameraOpen = $('#flightCameraMenu')?.classList.contains('show');

    if (mapOpen && cameraOpen) closeCameraMenu();
  }

  document.addEventListener('click', () => setTimeout(syncAll, 0), true);
  window.addEventListener('pageshow', () => setTimeout(syncAll, 40));
  window.addEventListener('aeronav:screen-change', () => setTimeout(syncAll, 40));
  window.addEventListener('aeronav:camera-change', () => setTimeout(syncAll, 40));

  setInterval(syncAll, 500);
  setTimeout(syncAll, 350);

  window.AERONAVFlightCameraUIFix = {
    release: 'RC12.37.9',
    closeMapMenu,
    closeCameraMenu,
    status: () => ({
      release: 'RC12.37.9',
      cameraEnabled: camStatus().enabled !== false,
      mapMenuOpen: !!$('#mobileMapMenu')?.classList.contains('show'),
      cameraMenuOpen: !!$('#flightCameraMenu')?.classList.contains('show')
    })
  };
})();
