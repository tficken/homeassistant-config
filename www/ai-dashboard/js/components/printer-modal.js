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
  return escapeHtml(String(s.state)) + (unit ? `<span style="color:var(--text-muted);font-size:0.75rem;"> ${escapeHtml(unit)}</span>` : "");
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
    return v ? `<div style="display:flex;justify-content:space-between;gap:12px;font-family:var(--font-mono);padding:5px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);font-size:0.78rem;letter-spacing:0.08em;">${label}</span><span style="color:var(--green);">${v}</span></div>` : "";
  });
  if (layerId && state.states[layerId]) {
    const total = totalLayerId && state.states[totalLayerId] ? state.states[totalLayerId].state : null;
    stats.splice(1, 0, `<div style="display:flex;justify-content:space-between;gap:12px;font-family:var(--font-mono);padding:5px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);font-size:0.78rem;letter-spacing:0.08em;">LAYER</span><span style="color:var(--green);">${escapeHtml(state.states[layerId].state)}${total ? " / " + escapeHtml(total) : ""}</span></div>`);
  }

  // Chamber camera (live stream with still fallback + retry, same as Security).
  const camId = printerEntities(prefix, "camera").find(id => id.includes("camera"));
  const camHtml = camId ? `<img src="${window.HA_INTEGRATION_PROXY ? `/ai-dashboard/cam_stream/${camId}` : `/api/camera_proxy_stream/${camId}?token=${encodeURIComponent(state.token)}`}" style="width:100%;border:1px solid var(--border);display:block;background:#000;" alt="" onerror="streamFeedFallback(this, '${camId}')">` : "";

  // AMS trays: colored chips from the tray entities' color/name attributes.
  const trays = printerEntities(prefix, "sensor").filter(id => id.includes("_tray_"));
  const amsHtml = trays.length ? `<div>
    <div style="font-size:0.72rem;color:var(--text-muted);letter-spacing:0.12em;margin-bottom:8px;">AMS</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">${trays.map(id => {
      const a = state.states[id].attributes || {};
      const hex = a.color ? "#" + String(a.color).slice(0, 6) : "var(--border)";
      const label = a.type || a.name || state.states[id].state;
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
        <div style="width:34px;height:34px;border-radius:50%;background:${hex};border:1px solid var(--border);"></div>
        <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);max-width:64px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(String(label))}</div>
      </div>`;
    }).join("")}</div>
  </div>` : "";

  // Controls: chamber light toggle + pause/resume/stop buttons (button.press).
  const chamberLight = printerEntities(prefix, "light").find(id => id.includes("chamber_light"));
  const ctrlBtns = ["pause", "resume", "stop"].map(kw => printerEntities(prefix, "button").find(id => id.includes(kw))).filter(Boolean);
  const controlsHtml = (chamberLight || ctrlBtns.length) ? `<div>
    <div style="font-size:0.72rem;color:var(--text-muted);letter-spacing:0.12em;margin-bottom:8px;">CONTROLS</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${chamberLight ? `<button class="scene-btn" style="cursor:pointer;" onclick="toggleEntity('${chamberLight}')">💡 CHAMBER ${state.states[chamberLight] && isActive(state.states[chamberLight].state) ? "ON" : "OFF"}</button>` : ""}
      ${ctrlBtns.map(id => `<button class="scene-btn" style="cursor:pointer;" onclick="pressPrinterButton('${id}')">${escapeHtml(id.split("_").pop().toUpperCase())}</button>`).join("")}
    </div>
  </div>` : "";

  const progressHtml = progress != null && !isNaN(progress) ? `<div>
    <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;"><span style="letter-spacing:0.08em;">PROGRESS</span><span style="color:var(--green);">${progress}%</span></div>
    <div style="width:100%;height:10px;background:var(--green-dim);border-radius:5px;"><div style="width:${Math.min(100, Math.max(0, progress))}%;height:100%;background:var(--green);border-radius:5px;box-shadow:0 0 10px rgba(20,254,23,0.4);transition:width .3s;"></div></div>
  </div>` : "";

  const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(3px);z-index:1200;display:flex;align-items:center;justify-content:center;" onclick="closePrinterModal()">
    <div class="terminal-panel" style="width:min(720px,94vw);max-height:92vh;display:flex;flex-direction:column;animation:lightModalPop .12s ease-out;" onclick="event.stopPropagation()">
      <div class="panel-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span>🖨 ${escapeHtml(printerName || prefix)}</span>
        <span style="cursor:pointer;color:var(--text-muted);text-shadow:none;" onclick="closePrinterModal()">[ CLOSE ✕ ]</span>
      </div>
      <div class="panel-body" style="display:grid;grid-template-columns:${camId ? "1.1fr 1fr" : "1fr"};gap:18px;overflow-y:auto;">
        ${camId ? `<div>${camHtml}</div>` : ""}
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div style="font-family:var(--font-mono);color:${statusId && state.states[statusId] && isActive(state.states[statusId].state) ? "var(--green)" : "var(--text-muted)"};letter-spacing:0.08em;">${statusId && state.states[statusId] ? escapeHtml(String(state.states[statusId].state).toUpperCase()) : "--"}</div>
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
