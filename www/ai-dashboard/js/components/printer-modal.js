import { state } from '../state.js';
import { friendlyName, isActive, escapeHtml } from '../utils.js';
import { sendWs } from '../connection.js';

// ---- Printer modal: full Bambu Lab status/camera/controls in a popup ----
// prefix is the shared entity slug, e.g. "p1s_01p00a412300832" — every entity
// of the printer starts with "<domain>.<prefix>_".
export let printerModalPrefix = null;

export function openPrinterModal(prefix) { printerModalPrefix = prefix; renderPrinterModal(); }
export function closePrinterModal() { printerModalPrefix = null; renderPrinterModal(); }
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && printerModalPrefix) closePrinterModal(); });

export function pressPrinterButton(entityId) {
  sendWs({ id: Date.now(), type: "call_service", domain: "button", service: "press", service_data: { entity_id: entityId } });
}

export function printerEntities(prefix, domain) {
  return Object.keys(state.states).filter(id => {
    const parts = id.split(".");
    return parts[1] && parts[1].startsWith(prefix) && (!domain || parts[0] === domain);
  });
}

// First entity whose id contains any keyword (in priority order), skipping ids
// already claimed by an earlier stat.
export function findPrinterSensor(prefix, keywords, used) {
  for (const kw of keywords) {
    const hit = printerEntities(prefix, "sensor").find(id => id.includes(kw) && !used.has(id));
    if (hit) { used.add(hit); return hit; }
  }
  return null;
}

export function printerStat(entityId) {
  const s = state.states[entityId];
  if (!s) return null;
  const unit = s.attributes && s.attributes.unit_of_measurement ? s.attributes.unit_of_measurement : "";
  return escapeHtml(String(s.state)) + (unit ? `<span class="printer-modal-unit"> ${escapeHtml(unit)}</span>` : "");
}

export function renderPrinterModal() {
  let el = document.getElementById("printer-modal-overlay");
  if (!printerModalPrefix) { if (el) el.remove(); return; }
  const prefix = printerModalPrefix;
  const statusId = printerEntities(prefix, "sensor").find(id => id.endsWith("_print_status"));
  const printerName = friendlyName(statusId || `sensor.${prefix}_print_status`).replace(/\s*print.?status\s*/i, "").trim();

  const used = new Set(statusId ? [statusId] : []);
  const progressId = findPrinterSensor(prefix, ["print_progress"], used);
  const progress = progressId && state.states[progressId] ? parseFloat(state.states[progressId].state) : null;
  const layerId = findPrinterSensor(prefix, ["current_layer"], used);
  const totalLayerId = findPrinterSensor(prefix, ["total_layer"], used);
  const statSpecs = [
    ["STAGE", ["current_stage", "stage"]],
    ["TASK", ["task_name"]],
    ["REMAINING", ["remaining_time"]],
    ["NOZZLE", ["nozzle_temp"]],
    ["BED", ["bed_temp"]],
    ["CHAMBER", ["chamber_temp"]],
    ["SPEED", ["speed_profile", "printing_speed"]],
    ["FILAMENT", ["print_weight"]],
  ];
  const stats = statSpecs.map(([label, kws]) => {
    const id = findPrinterSensor(prefix, kws, used);
    const v = id && printerStat(id);
    return v ? `<div class="printer-modal-stat"><span class="printer-modal-stat-label">${label}</span><span class="printer-modal-stat-value">${v}</span></div>` : "";
  });
  if (layerId && state.states[layerId]) {
    const total = totalLayerId && state.states[totalLayerId] ? state.states[totalLayerId].state : null;
    stats.splice(1, 0, `<div class="printer-modal-stat"><span class="printer-modal-stat-label">LAYER</span><span class="printer-modal-stat-value">${escapeHtml(state.states[layerId].state)}${total ? " / " + escapeHtml(total) : ""}</span></div>`);
  }

  // Chamber camera (live stream with still fallback + retry, same as Security).
  const camId = printerEntities(prefix, "camera").find(id => id.includes("camera"));
  const camHtml = camId ? `<img src="${window.HA_INTEGRATION_PROXY ? `/ai-dashboard/cam_stream/${camId}` : `/api/camera_proxy_stream/${camId}?token=${encodeURIComponent(state.token)}`}" class="printer-modal-cam" alt="" onerror="streamFeedFallback(this, '${camId}')">` : "";

  // AMS trays: colored chips from the tray entities' color/name attributes.
  const trays = printerEntities(prefix, "sensor").filter(id => id.includes("_tray_"));
  const amsHtml = trays.length ? `<div>
    <div class="printer-modal-label">AMS</div>
    <div class="printer-modal-trays">${trays.map(id => {
      const a = state.states[id].attributes || {};
      const hex = a.color ? "#" + String(a.color).slice(0, 6) : "var(--border)";
      const label = a.type || a.name || state.states[id].state;
      return `<div class="printer-modal-tray">
        <div class="printer-modal-tray-dot" style="background:${hex};"></div>
        <div class="printer-modal-tray-label">${escapeHtml(String(label))}</div>
      </div>`;
    }).join("")}</div>
  </div>` : "";

  // Controls: chamber light toggle + pause/resume/stop buttons (button.press).
  const chamberLight = printerEntities(prefix, "light").find(id => id.includes("chamber_light"));
  const ctrlBtns = ["pause", "resume", "stop"].map(kw => printerEntities(prefix, "button").find(id => id.includes(kw))).filter(Boolean);
  const controlsHtml = (chamberLight || ctrlBtns.length) ? `<div>
    <div class="printer-modal-label">CONTROLS</div>
    <div class="printer-modal-controls">
      ${chamberLight ? `<button class="scene-btn" onclick="toggleEntity('${chamberLight}')">💡 CHAMBER ${state.states[chamberLight] && isActive(state.states[chamberLight].state) ? "ON" : "OFF"}</button>` : ""}
      ${ctrlBtns.map(id => `<button class="scene-btn" onclick="pressPrinterButton('${id}')">${escapeHtml(id.split("_").pop().toUpperCase())}</button>`).join("")}
    </div>
  </div>` : "";

  const progressHtml = progress != null && !isNaN(progress) ? `<div>
    <div class="printer-modal-progress-head"><span class="printer-modal-progress-label">PROGRESS</span><span class="printer-modal-progress-value">${progress}%</span></div>
    <div class="printer-modal-progress-track"><div class="printer-modal-progress-bar" style="width:${Math.min(100, Math.max(0, progress))}%;"></div></div>
  </div>` : "";

  const html = `<div class="modal-backdrop printer-modal-backdrop" onclick="closePrinterModal()">
    <div class="modal-panel printer-modal-panel" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span>🖨 ${escapeHtml(printerName || prefix)}</span>
        <span class="modal-close" onclick="closePrinterModal()">[ CLOSE ✕ ]</span>
      </div>
      <div class="modal-body printer-modal-body${camId ? " with-cam" : ""}">
        ${camId ? `<div>${camHtml}</div>` : ""}
        <div class="printer-modal-side">
          <div class="printer-modal-status${statusId && state.states[statusId] && isActive(state.states[statusId].state) ? " active" : ""}">${statusId && state.states[statusId] ? escapeHtml(String(state.states[statusId].state).toUpperCase()) : "--"}</div>
          ${progressHtml}
          <div>${stats.join("")}</div>
          ${amsHtml}
          ${controlsHtml}
        </div>
      </div>
    </div>
  </div>`;
  if (!el) {
    el = document.createElement("div");
    el.id = "printer-modal-overlay";
    document.body.appendChild(el);
  }
  el.innerHTML = html;
}
