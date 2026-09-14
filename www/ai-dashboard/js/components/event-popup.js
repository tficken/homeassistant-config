// Event-triggered camera popup: when a configured event entity (e.g.
// event.front_door_ding) changes to a newer timestamp, show a floating
// modal with the associated camera feed and auto-dismiss after a timeout.
import { state } from '../state.js';
import { escapeHtml } from '../utils.js';
import { renderCameraFeed } from '../cameras.js';

const POPUP_ID = "event-popup";
const LATEST_SEEN_KEY = "_eventPopupLatestSeen";

function parseEventTime(st) {
  if (!st) return 0;
  const t = new Date(String(st.state || "").replace(" ", "T")).getTime();
  return isNaN(t) ? 0 : t;
}

function findEventPopupConfig(entityId) {
  const popups = Array.isArray(state.config.eventPopups) ? state.config.eventPopups : [];
  return popups.find(p => p && Array.isArray(p.events) && p.events.includes(entityId));
}

function removeExistingPopup() {
  const existing = document.getElementById(POPUP_ID);
  if (existing) existing.remove();
  if (state.eventPopupTimer) {
    clearTimeout(state.eventPopupTimer);
    state.eventPopupTimer = null;
  }
}

export function closeEventPopup() {
  removeExistingPopup();
}

export function showEventPopup(config) {
  removeExistingPopup();
  const cameraId = config.camera;
  if (!cameraId || !state.states[cameraId]) return;

  const title = config.title || "EVENT";
  const timeoutMs = typeof config.timeout === "number" && config.timeout > 0
    ? config.timeout * 1000
    : 30000;

  const el = document.createElement("div");
  el.id = POPUP_ID;
  el.className = "modal-backdrop event-popup-backdrop";
  el.innerHTML = `
    <div class="modal-panel event-popup-panel" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span>${escapeHtml(title)}</span>
        <span class="modal-close" onclick="closeEventPopup()">✕</span>
      </div>
      <div class="modal-body event-popup-body" onclick="closeEventPopup()">
        ${renderCameraFeed(cameraId)}
      </div>
    </div>
  `;
  el.addEventListener("click", closeEventPopup);
  document.body.appendChild(el);

  state.eventPopupTimer = setTimeout(closeEventPopup, timeoutMs);
}

export function handleEventStateChange(newState) {
  const config = findEventPopupConfig(newState.entity_id);
  if (!config) return;

  const prev = state.states[newState.entity_id];
  const prevTime = parseEventTime(prev);
  const newTime = parseEventTime(newState);
  // Only react to a genuinely newer event timestamp, which avoids spurious
  // popups on reconnect or on non-event state attributes.
  if (newTime && prevTime && newTime > prevTime) {
    showEventPopup(config);
  }
}
