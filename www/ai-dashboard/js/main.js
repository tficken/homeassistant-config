// Entry point: module wiring (via globals.js side-effect import) plus init.
// The settings editor lives in ./settings/*; screens in ./screens/*.
import './globals.js';
import { state } from './state.js';
import { refreshDoorRecency } from './utils.js';
import { loadConfig, applyTheme } from './config.js';
import { fetchHAConfig, refreshForecast } from './api.js';
import { connect } from './connection.js';
import { refreshCameraSnapshot, snapshotLastActivityMs,
  SNAPSHOT_IDLE_EVENT_WINDOW_MS, SNAPSHOT_IDLE_POLL_MS, SNAPSHOT_CHECK_MS } from './cameras.js';
import { renderDock, showScreen, updateClock, measureClock } from './screens/index.js';

// ---- Init ----

async function init() {
  state.config = await loadConfig();
  applyTheme();
  await fetchHAConfig();
  document.getElementById("dock").innerHTML = renderDock();
  showScreen("home");
  setInterval(refreshForecast, 15 * 60 * 1000);
  if (window.HA_INTEGRATION_PROXY) {
    state.token = "";
    localStorage.removeItem("ha_token");
    connect();
  } else {
    state.token = localStorage.getItem("ha_token");
    if (!state.token) {
      state.token = prompt("Enter Home Assistant long-lived access token:");
      if (state.token) localStorage.setItem("ha_token", state.token);
    }
    if (state.token) connect();
  }
  setInterval(updateClock, 1000);
  window.addEventListener("resize", measureClock);
  setInterval(refreshDoorRecency, 30000);
  setInterval(() => {
    const cams = (state.config.sections && state.config.sections.cameras) || {};
    const snapMap = cams.snapshot || {};
    for (const cameraId of Object.keys(snapMap)) {
      const lastEvent = snapshotLastActivityMs(snapMap[cameraId]);
      const idleLongEnough = !lastEvent || (Date.now() - lastEvent) > SNAPSHOT_IDLE_EVENT_WINDOW_MS;
      const stale = (Date.now() - (state.snapshotLastRefresh[cameraId] || 0)) >= SNAPSHOT_IDLE_POLL_MS;
      if (idleLongEnough && stale) refreshCameraSnapshot(cameraId);
    }
  }, SNAPSHOT_CHECK_MS);
  // Restart live camera streams periodically: a stalled MJPEG <img> shows the
  // last frame forever without firing onerror, and browsers expose no stall
  // event. Scoped to the active screen; the ts= cache-buster forces a fresh
  // connection. Snapshot cameras are untouched (they have their own refresh).
  setInterval(() => {
    const screenEl = document.getElementById(state.currentScreen + "-screen");
    if (!screenEl) return;
    screenEl.querySelectorAll("img.camera-feed:not([data-snapshot-camera])").forEach(img => {
      if (!/(camera_proxy_stream|cam_stream)\//.test(img.src)) return;
      const base = img.src.replace(/([?&])ts=\d+/, "").replace(/[?&]$/, "");
      img.src = `${base}${base.includes("?") ? "&" : "?"}ts=${Date.now()}`;
    });
  }, 10 * 60 * 1000);
  // Signals the load-error trap in index.html that boot completed — runtime
  // errors after this point must not be mislabeled as module-load failures.
  window.__dashBooted = true;
}

document.addEventListener("DOMContentLoaded", init);
