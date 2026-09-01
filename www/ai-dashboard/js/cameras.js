// Camera feeds: snapshot scheduling/refresh, on-demand Ring livestream
// start/stop, feed card rendering, and stream fallback. Timer state lives in
// state.js (snapshotRefreshTimers, snapshotLastRefresh, livestreamStartTimers).
import { state } from './state.js';
import { openSnapshotHistory } from './components/snapshot-viewer.js';
import { friendlyName, isUnavailable, renderOfflineBadge, escapeHtml, relativeTime } from './utils.js';
import { sendWs } from './connection.js';

export const SNAPSHOT_EVENT_REFRESH_DELAY_MS = 20000;
export const SNAPSHOT_IDLE_EVENT_WINDOW_MS = 60 * 60 * 1000;
export const SNAPSHOT_IDLE_POLL_MS = 30 * 60 * 1000;
export const SNAPSHOT_CHECK_MS = 5 * 60 * 1000;

export function cameraSnapshotConfig(cameraId) {
  const cams = (state.config.sections && state.config.sections.cameras) || {};
  return (cams.snapshot && cams.snapshot[cameraId]) || null;
}

export function snapshotSourceEntity(cameraId) {
  const snap = cameraSnapshotConfig(cameraId);
  if (!snap) return cameraId;
  const pref = snap.preferEntity;
  if (pref && state.states[pref] && !isUnavailable(state.states[pref])) return pref;
  return cameraId;
}

export function snapshotLastActivityMs(snap) {
  let latest = 0;
  for (const id of (snap.activityEntities || [])) {
    const s = state.states[id];
    if (!s || isUnavailable(s)) continue;
    const t = new Date(s.state).getTime();
    if (!isNaN(t) && t > latest) latest = t;
  }
  return latest;
}

export function snapshotImgUrl(srcEntity) {
  const st = state.states[srcEntity];
  let base;
  if (st && st.attributes && st.attributes.entity_picture) {
    base = st.attributes.entity_picture;
  } else if (window.HA_INTEGRATION_PROXY) {
    base = `/api/camera_proxy/${srcEntity}`;
  } else {
    base = `/api/camera_proxy/${srcEntity}?token=${encodeURIComponent(state.token)}`;
  }
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}ts=${Date.now()}`;
}

export function refreshCameraSnapshot(cameraId) {
  const img = document.querySelector(`img.camera-feed[data-snapshot-camera="${cameraId}"]`);
  if (!img) return;
  state.snapshotLastRefresh[cameraId] = Date.now();
  img.src = snapshotImgUrl(snapshotSourceEntity(cameraId));
}

export function scheduleSnapshotRefresh(changedId) {
  const cams = (state.config.sections && state.config.sections.cameras) || {};
  const snapMap = cams.snapshot || {};
  for (const cameraId of Object.keys(snapMap)) {
    const acts = snapMap[cameraId].activityEntities || [];
    if (!acts.includes(changedId)) continue;
    clearTimeout(state.snapshotRefreshTimers[cameraId]);
    state.snapshotRefreshTimers[cameraId] = setTimeout(() => refreshCameraSnapshot(cameraId), SNAPSHOT_EVENT_REFRESH_DELAY_MS);
  }
}

export function livestreamSwitchFor(cameraId) {
  const cams = (state.config.sections && state.config.sections.cameras) || {};
  return (cams.livestream && cams.livestream[cameraId]) || null;
}

export function cameraHistoryKey(cameraId) {
  const cams = (state.config.sections && state.config.sections.cameras) || {};
  return (cams.history && cams.history[cameraId]) || null;
}

export function renderCameraFeed(entityId) {
  const name = friendlyName(entityId);
  const snap = cameraSnapshotConfig(entityId);
  const srcEntity = snap ? snapshotSourceEntity(entityId) : entityId;
  const st = state.states[srcEntity];
  const offline = isUnavailable(st);
  const liveSwitch = !snap && livestreamSwitchFor(entityId);
  if (offline) {
    return `<div class="terminal-panel" style="margin-bottom:10px;" data-entity-id="${entityId}">
      <div class="panel-title">${escapeHtml(name)}${renderOfflineBadge()}</div>
      <div class="panel-body" style="padding:0;">
        <div style="width:100%;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:#000;color:var(--danger);font-family:var(--font-mono);">CAMERA OFFLINE</div>
      </div>
    </div>`;
  }
  let src = "";
  let isStream = false;
  if (snap) {
    src = snapshotImgUrl(srcEntity);
    state.snapshotLastRefresh[entityId] = Date.now();
  } else if (liveSwitch && window.HA_INTEGRATION_PROXY) {
    // On-demand Ring live stream: the src is attached by startLivestreamCameras()
    // only after the camera's live-stream switch has spun the session up. If the
    // switch is already on (e.g. a state-update re-render mid-viewing), attach
    // immediately — otherwise the re-render would strand the "starting" overlay.
    const sw = state.states[liveSwitch];
    if (sw && sw.state === "on") {
      src = `/ai-dashboard/cam_stream/${entityId}?ts=${Date.now()}`;
    }
    isStream = true;
  } else if (window.HA_INTEGRATION_PROXY) {
    // No snapshot config = live view camera. Stream through the dashboard
    // proxy: /api/camera_proxy_stream 403s for the remote browser session,
    // and entity_picture is only a still Ring refreshes on activity (it froze
    // the backyard cam for days).
    src = `/ai-dashboard/cam_stream/${entityId}`;
    isStream = true;
  } else if (st && st.attributes && st.attributes.entity_picture) {
    src = st.attributes.entity_picture;
  } else {
    src = `/api/camera_proxy_stream/${entityId}?token=${encodeURIComponent(state.token)}`;
    isStream = true;
  }
  const lastEventMs = snap ? snapshotLastActivityMs(snap) : 0;
  const lastEventLabel = lastEventMs ? relativeTime(new Date(lastEventMs).toISOString()) : "";
  const titleSuffix = snap && lastEventLabel
    ? ` <span style="color:var(--text-muted);font-size:0.75rem;">· LAST EVENT ${escapeHtml(lastEventLabel)}</span>`
    : "";
  const onerr = isStream ? ` onerror="streamFeedFallback(this,'${entityId}')"` : "";
  const liveAttrs = liveSwitch && !src ? ` data-livestream-camera="${entityId}"` : "";
  const pendingOverlay = liveSwitch && !src
    ? `<div class="livestream-pending" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;color:var(--text-muted);font-family:var(--font-mono);font-size:0.85rem;letter-spacing:0.1em;">STARTING LIVE STREAM…</div>`
    : "";
  if (src) armFeedFallbackSoon(entityId);
  const historyKey = cameraHistoryKey(entityId);
  const historyChip = historyKey
    ? ` <span class="history-chip" style="cursor:pointer;color:var(--accent,#2dd4bf);font-size:0.7rem;border:1px solid currentColor;padding:1px 6px;margin-left:6px;" onclick="event.stopPropagation();openSnapshotHistory('${historyKey}','${entityId}')">HISTORY</span>`
    : "";
  return `<div class="terminal-panel" style="margin-bottom:10px;" data-entity-id="${entityId}">
    <div class="panel-title">${escapeHtml(name)}${titleSuffix}${historyChip}</div>
    <div class="panel-body" style="padding:0;${liveSwitch ? "position:relative;" : ""}">
      <img class="camera-feed" ${snap ? `data-snapshot-camera="${entityId}"` : ""}${liveAttrs}${src ? ` src="${src}"` : ""} onload="cameraFeedLoaded(this)"${onerr} style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#000;" alt="${escapeHtml(name)}">
      ${pendingOverlay}
    </div>
  </div>`;
}

// Feed fade-in (css/screens.css keeps img.camera-feed transparent until
// .feed-loaded lands). Stills fire load once; MJPEG streams can fire load per
// frame or never fire a single clean one, so the first load wins and a 1500ms
// fallback timer — armed when the stream src is attached — guarantees the
// fade. Idempotent: repeated MJPEG load events just re-add the class.
export function cameraFeedLoaded(img) {
  if (img._feedFallbackTimer) {
    clearTimeout(img._feedFallbackTimer);
    img._feedFallbackTimer = null;
  }
  img.classList.add("feed-loaded");
}

function armFeedFallback(img) {
  if (img._feedFallbackTimer) clearTimeout(img._feedFallbackTimer);
  img._feedFallbackTimer = setTimeout(() => cameraFeedLoaded(img), 1500);
}

// renderCameraFeed returns HTML for an innerHTML swap, so the img isn't in the
// DOM yet — defer past the insertion, then arm the fallback on the live node.
function armFeedFallbackSoon(entityId) {
  setTimeout(() => {
    const img = document.querySelector(`[data-entity-id="${CSS.escape(entityId)}"] img.camera-feed`);
    if (img && img.src) armFeedFallback(img);
  }, 0);
}

// On-demand Ring live streams (ring-mqtt): the RTSP feed only exists while the
// camera's live-stream switch is on, so streams start when the screen showing
// them opens and stop when it closes. Leaving them running would suppress
// Ring motion/ding events and hit Ring's ~10 minute stream kill anyway.
export const LIVESTREAM_STARTUP_DELAY_MS = 6000;

export function startLivestreamCameras() {
  if (!window.HA_INTEGRATION_PROXY) return;
  const cams = (state.config.sections && state.config.sections.cameras) || {};
  for (const [cameraId, switchId] of Object.entries(cams.livestream || {})) {
    sendWs({ id: Date.now(), type: "call_service", domain: "switch", service: "turn_on", service_data: { entity_id: switchId } });
    clearTimeout(state.livestreamStartTimers[cameraId]);
    state.livestreamStartTimers[cameraId] = setTimeout(() => {
      const img = document.querySelector(`img.camera-feed[data-livestream-camera="${cameraId}"]`);
      if (!img) return;
      img.src = `/ai-dashboard/cam_stream/${cameraId}?ts=${Date.now()}`;
      armFeedFallback(img); // MJPEG may never fire a clean load; guarantee the fade-in
      const overlay = img.parentElement && img.parentElement.querySelector(".livestream-pending");
      if (overlay) overlay.remove();
    }, LIVESTREAM_STARTUP_DELAY_MS);
  }
}

export function stopLivestreamCameras() {
  if (!window.HA_INTEGRATION_PROXY) return;
  const cams = (state.config.sections && state.config.sections.cameras) || {};
  for (const [cameraId, switchId] of Object.entries(cams.livestream || {})) {
    clearTimeout(state.livestreamStartTimers[cameraId]);
    sendWs({ id: Date.now(), type: "call_service", domain: "switch", service: "turn_off", service_data: { entity_id: switchId } });
    const img = document.querySelector(`img.camera-feed[data-livestream-camera="${cameraId}"]`);
    if (img) img.removeAttribute("src");
  }
}

// A dead MJPEG stream otherwise strands a frozen frame / broken image forever:
// fall back to the camera's still, then retry the stream in 60s (the element
// may be gone after a re-render; the retry is a no-op then).
export function streamFeedFallback(img, entityId) {
  if (img.dataset.streamFallback) return; // already failed once; let the retry handle it
  img.dataset.streamFallback = "1";
  const st = state.states[entityId];
  const pic = st && st.attributes && st.attributes.entity_picture;
  if (pic) img.src = pic;
  setTimeout(() => {
    if (!img.isConnected) return;
    delete img.dataset.streamFallback;
    img.src = window.HA_INTEGRATION_PROXY
      ? `/ai-dashboard/cam_stream/${entityId}`
      : `/api/camera_proxy_stream/${entityId}?token=${encodeURIComponent(state.token)}`;
  }, 60000);
}
