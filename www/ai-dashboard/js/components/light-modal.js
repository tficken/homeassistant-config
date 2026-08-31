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
      <div style="font-size:0.72rem;color:var(--text-muted);letter-spacing:0.12em;margin-bottom:6px;">COLOR TEMP · ${curK}K</div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="color:var(--amber);font-size:1.1rem;" title="Warm">&#9728;</span>
        <input type="range" min="${minK}" max="${maxK}" value="${curK}" style="flex:1;min-height:36px;accent-color:var(--amber);" onchange="setColorTemp('${entityId}', this.value)">
        <span style="color:#7ab8ff;font-size:1.1rem;" title="Cool">&#10052;</span>
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
      marker = `<div style="position:absolute;left:calc(50% + ${x}px);top:calc(50% + ${y}px);width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.8);pointer-events:none;"></div>`;
    }
    html += `<div>
      <div style="font-size:0.72rem;color:var(--text-muted);letter-spacing:0.12em;margin-bottom:8px;text-align:center;">COLOR · TAP WHEEL TO PICK</div>
      <div style="position:relative;width:192px;height:192px;margin:0 auto;border-radius:50%;cursor:crosshair;border:1px solid var(--border);box-shadow:0 0 24px rgba(255,255,255,0.07), inset 0 0 12px rgba(0,0,0,0.4);background:radial-gradient(circle,#fff 0%,rgba(255,255,255,0) 62%),conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);" onclick="lightWheelPick(event,'${entityId}')">${marker}</div>
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
  const powerBtn = `<button title="Toggle power" style="width:56px;height:56px;border-radius:50%;border:1px solid ${active ? "var(--green)" : "var(--border)"};background:${active ? "rgba(20,254,23,0.08)" : "transparent"};color:${active ? "var(--green)" : "var(--text-muted)"};cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:box-shadow .15s,color .15s;${active ? "box-shadow:0 0 16px rgba(20,254,23,0.35);" : ""}" onclick="toggleEntity('${entityId}')"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4v7"/><path d="M6.8 6.8a7.5 7.5 0 1 0 10.4 0"/></svg></button>`;
  const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(3px);z-index:1200;display:flex;align-items:center;justify-content:center;" onclick="closeLightModal()">
    <div class="terminal-panel" style="width:min(560px,92vw);animation:lightModalPop .12s ease-out;" onclick="event.stopPropagation()">
      <div class="panel-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span>${escapeHtml(friendlyName(entityId))}</span>
        <span style="cursor:pointer;color:var(--text-muted);text-shadow:none;" onclick="closeLightModal()">[ CLOSE ✕ ]</span>
      </div>
      <div class="panel-body" style="display:flex;flex-direction:column;gap:18px;padding:16px 18px 20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-family:var(--font-mono);letter-spacing:0.1em;color:${offline ? "var(--text-muted)" : (active ? "var(--green)" : "var(--text-muted)")};${active ? "text-shadow:0 0 8px rgba(20,254,23,0.5);" : ""}">${offline ? "○ OFFLINE" : (active ? "● ON" : "○ OFF")}</span>
          ${powerBtn}
        </div>
        ${active && !offline ? `<div>
          <div style="font-size:0.72rem;color:var(--text-muted);letter-spacing:0.12em;margin-bottom:6px;">BRIGHTNESS · ${pct}%</div>
          <input type="range" min="0" max="100" value="${pct}" style="width:100%;min-height:44px;accent-color:var(--green);" onchange="setBrightness('${entityId}', this.value)">
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
