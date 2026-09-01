import { state } from '../state.js';
import { friendlyName, isActive, isUnavailable, escapeHtml } from '../utils.js';
import { toggleEntity } from '../api.js';
import { sendWs } from '../connection.js';

// Light cards are one big button: tap cycles power, press-and-hold (~500ms)
// opens the settings modal — the same gesture order as HA's native UI. A
// pointer move cancels the press so scrolling on a touch screen triggers
// neither action.
export function lightPressStart(ev, entityId) {
  if (ev.button != null && ev.button !== 0) return;
  state.lightPress.held = false;
  state.lightPress.x = ev.clientX;
  state.lightPress.y = ev.clientY;
  clearTimeout(state.lightPress.timer);
  state.lightPress.timer = setTimeout(() => { state.lightPress.held = true; openLightModal(entityId); }, 500);
}
export function lightPressMove(ev) {
  if (!state.lightPress.timer) return;
  if (Math.hypot(ev.clientX - state.lightPress.x, ev.clientY - state.lightPress.y) > 12) lightPressCancel();
}
export function lightPressEnd(ev, entityId) {
  if (ev.button != null && ev.button !== 0) return;
  clearTimeout(state.lightPress.timer);
  state.lightPress.timer = null;
  if (!state.lightPress.held) toggleEntity(entityId);
  state.lightPress.held = false;
}
export function lightPressCancel() {
  clearTimeout(state.lightPress.timer);
  state.lightPress.timer = null;
  state.lightPress.held = false;
}

// Click position on the color wheel -> hs_color (conic-gradient hue 0° is at
// 12 o'clock running clockwise; atan2 measures from 3 o'clock, hence +90).
export function lightWheelPick(ev, entityId) {
  const rect = ev.currentTarget.getBoundingClientRect();
  const dx = ev.clientX - (rect.left + rect.width / 2);
  const dy = ev.clientY - (rect.top + rect.height / 2);
  let hue = Math.round(Math.atan2(dy, dx) * 180 / Math.PI + 90);
  hue = ((hue % 360) + 360) % 360;
  const sat = Math.min(100, Math.round(Math.hypot(dx, dy) / (rect.width / 2) * 100));
  sendWs({ id: Date.now(), type: "call_service", domain: "light", service: "turn_on", service_data: { entity_id: entityId, hs_color: [hue, sat] } });
}

// Color-temp slider and/or an HSV color wheel for capable lights (light modal).
export function buildLightColorControls(entityId) {
  const st = state.states[entityId];
  if (!st || !st.attributes || !isActive(st.state) || isUnavailable(st)) return "";
  const modes = st.attributes.supported_color_modes || [];
  let html = "";
  if (modes.includes("color_temp")) {
    const minK = st.attributes.min_color_temp_kelvin || 2000;
    const maxK = st.attributes.max_color_temp_kelvin || 6500;
    const curK = st.attributes.color_temp_kelvin || Math.round((minK + maxK) / 2);
    html += `<div>
      <div class="light-modal-label">COLOR TEMP · ${curK}K</div>
      <div class="light-modal-temp-row">
        <span class="light-modal-temp-icon warm" title="Warm">&#9728;</span>
        <input type="range" min="${minK}" max="${maxK}" value="${curK}" class="light-modal-temp-slider" onchange="setColorTemp('${entityId}', this.value)">
        <span class="light-modal-temp-icon cool" title="Cool">&#10052;</span>
      </div>
    </div>`;
  }
  if (modes.some(m => ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(m))) {
    // Marker for the current color: hue runs clockwise from 12 o'clock,
    // saturation is the distance from center.
    const hs = st.attributes.hs_color;
    let marker = "";
    if (hs && hs.length === 2) {
      const rad = (hs[0] - 90) * Math.PI / 180;
      const dist = (hs[1] / 100) * 88; // 88px = wheel radius minus marker
      const x = Math.round(Math.cos(rad) * dist);
      const y = Math.round(Math.sin(rad) * dist);
      marker = `<div class="light-modal-marker" style="left:calc(50% + ${x}px);top:calc(50% + ${y}px);"></div>`;
    }
    html += `<div>
      <div class="light-modal-wheel-label">COLOR · TAP WHEEL TO PICK</div>
      <div class="light-modal-wheel" onclick="lightWheelPick(event,'${entityId}')">${marker}</div>
    </div>`;
  }
  return html;
}

// Hold-target modal with a light's full controls (brightness / temp / color).
export let lightModalEntity = null;

export function openLightModal(entityId) { lightModalEntity = entityId; renderLightModal(); }
export function closeLightModal() { lightModalEntity = null; renderLightModal(); }
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && lightModalEntity) closeLightModal(); });

export function renderLightModal() {
  let el = document.getElementById("light-modal-overlay");
  if (!lightModalEntity) { if (el) el.remove(); return; }
  // Never yank the DOM out from under an active slider drag on state updates.
  const ae = document.activeElement;
  if (el && ae && ae.tagName === "INPUT" && ae.type === "range" && el.contains(ae)) return;
  const entityId = lightModalEntity;
  const st = state.states[entityId];
  const offline = isUnavailable(st);
  const active = st ? isActive(st.state) : false;
  const brightness = st && st.attributes && st.attributes.brightness != null ? st.attributes.brightness : 0;
  const pct = Math.round((brightness / 255) * 100);
  const powerBtn = `<button title="Toggle power" class="light-modal-power${active ? " active" : ""}" onclick="toggleEntity('${entityId}')"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4v7"/><path d="M6.8 6.8a7.5 7.5 0 1 0 10.4 0"/></svg></button>`;
  const html = `<div class="modal-backdrop light-modal-backdrop" onclick="closeLightModal()">
    <div class="modal-panel light-modal-panel" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span>${escapeHtml(friendlyName(entityId))}</span>
        <span class="modal-close" onclick="closeLightModal()">[ CLOSE ✕ ]</span>
      </div>
      <div class="modal-body light-modal-body">
        <div class="light-modal-status-row">
          <span class="light-modal-status${active ? " active" : ""}">${offline ? "○ OFFLINE" : (active ? "● ON" : "○ OFF")}</span>
          ${powerBtn}
        </div>
        ${active && !offline ? `<div>
          <div class="light-modal-label">BRIGHTNESS · ${pct}%</div>
          <input type="range" min="0" max="100" value="${pct}" class="light-modal-brightness" onchange="setBrightness('${entityId}', this.value)">
        </div>` : ""}
        ${buildLightColorControls(entityId)}
      </div>
    </div>
  </div>`;
  if (!el) {
    el = document.createElement("div");
    el.id = "light-modal-overlay";
    document.body.appendChild(el);
  }
  el.innerHTML = html;
}
