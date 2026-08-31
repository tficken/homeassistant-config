// Status Monitor screen: environment/system panel builders. fetchHistory
// comes from ../api.js; assembleColumns from ./index.js (runtime-only cycle).
import { state } from '../state.js';
import { friendlyName, sectionTitle, entityArea, escapeHtml } from '../utils.js';
import { effectivePanels } from '../config.js';
import { fetchHistory } from '../api.js';
import { renderTerminalPanel } from '../components/panels.js';
import { renderMetricCard, renderEnvMetric } from '../components/cards.js';
import { assembleColumns } from './index.js';

export async function buildStatusPanels() {
  const environment = (state.config.sections && state.config.sections.environment && state.config.sections.environment.entities) || [];
  const system = (state.config.sections && state.config.sections.system && state.config.sections.system.entities) || [];

  const envGroups = {};
  const envOrder = [];
  for (const id of environment) {
    const area = entityArea(id) || "Other";
    if (!envGroups[area]) {
      envGroups[area] = [];
      envOrder.push(area);
    }
    envGroups[area].push(id);
  }
  const envMetrics = `<div style="display:flex;flex-direction:column;gap:12px;height:100%;">` + envOrder.map(area => {
    const metrics = envGroups[area].map(id => renderEnvMetric(id)).join("");
    return `<div style="flex:1;display:flex;flex-direction:column;min-height:0;">
      <div style="font-family:var(--font-mono);font-size:0.8rem;color:var(--green);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${escapeHtml(area)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;flex:1;grid-auto-rows:1fr;">${metrics}</div>
    </div>`;
  }).join("") + `</div>`;

  const sysMetrics = system.filter(id => id.startsWith("sensor.")).map(id => renderMetricCard(id)).join("");

  const vacuumIds = system.filter(id => id.startsWith("vacuum."));
  const vacuumCards = vacuumIds.map(id => {
    const st = state.states[id];
    return `<div class="terminal-panel" data-entity-id="${id}">
      <div class="panel-body" style="display:flex;align-items:center;justify-content:space-between;font-family:var(--font-mono);">
        <span>${escapeHtml(friendlyName(id))}</span>
        <span style="color:var(--green);">${st ? escapeHtml(st.state) : "--"}</span>
      </div>
    </div>`;
  }).join("");

  const printerIds = Object.keys(state.states).filter(id => id.startsWith("sensor.") && id.endsWith("_print_status"));
  const printerCards = printerIds.map(id => {
    const st = state.states[id];
    const base = id.replace("print_status", "").replace(/_+$/, "");
    const prefix = base.split(".")[1];
    const progressId = Object.keys(state.states).find(x => x.startsWith(base) && x.includes("print_progress") && x !== id);
    const remainingId = Object.keys(state.states).find(x => x.startsWith(base) && x.includes("remaining_time") && x !== id);
    const progress = progressId && state.states[progressId] ? parseFloat(state.states[progressId].state) : null;
    const remaining = remainingId && state.states[remainingId] ? state.states[remainingId].state : null;
    const progressBar = progress != null && !isNaN(progress)
      ? `<div style="width:100%;height:8px;background:var(--green-dim);border-radius:4px;margin:8px 0;"><div style="width:${Math.min(100, Math.max(0, progress))}%;height:100%;background:var(--green);border-radius:4px;"></div></div><div style="color:var(--text-muted);font-size:0.75rem;">${progress}% ${remaining ? "· " + escapeHtml(remaining) + " left" : ""}</div>`
      : "";
    return `<div class="terminal-panel" data-entity-id="${id}" style="cursor:pointer;" title="Tap for printer controls" onclick="openPrinterModal('${prefix}')">
      <div class="panel-body" style="font-family:var(--font-mono);">
        <div style="color:var(--green);">${st ? escapeHtml(st.state) : "--"}</div>
        ${progressBar}
        <div style="color:var(--text-muted);font-size:0.8rem;">${escapeHtml(friendlyName(id))}</div>
      </div>
    </div>`;
  }).join("");

  const panels = {
    environment: `<div style="min-height:0;overflow-y:auto;display:flex;flex-direction:column;" data-panel-id="environment">${renderTerminalPanel(sectionTitle("environment"), envMetrics, "fill")}</div>`,
    system: `<div style="min-height:0;overflow-y:auto;display:flex;flex-direction:column;" data-panel-id="system">${renderTerminalPanel(sectionTitle("system"), `<div class="stretch-cards" style="display:flex;flex-direction:column;gap:10px;height:100%;">${sysMetrics + vacuumCards + printerCards}</div>`, "fill")}</div>`,
  };
  return {
    panels,
    gridStyle: "display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:1;min-height:0;overflow:hidden;",
    // Single-panel columns use display:grid so each panel wrapper (a grid item)
    // stretches to full column height exactly as it did as a direct grid item;
    // a flex column would collapse it to content height and break the
    // .terminal-panel.fill height:100% chain.
    colStyles: [
      "min-height:0;display:grid;",
      "min-height:0;display:grid;",
    ],
  };
}

export async function renderStatusScreen() {
  const environment = (state.config.sections && state.config.sections.environment && state.config.sections.environment.entities) || [];
  const system = (state.config.sections && state.config.sections.system && state.config.sections.system.entities) || [];
  const historyIds = environment.filter(id => {
    const s = state.states[id];
    const dc = s && s.attributes && s.attributes.device_class;
    return dc === "temperature" || dc === "humidity";
  });
  // System usage charts: any numeric system sensor (CPU %, memory %, disk) gets
  // the same 24h sparkline treatment as the environment metrics.
  const sysHistoryIds = system.filter(id =>
    id.startsWith("sensor.") && state.states[id] && !isNaN(parseFloat(state.states[id].state)));
  await fetchHistory(historyIds.concat(sysHistoryIds), 24);
  const b = await buildStatusPanels();
  document.getElementById("status-screen").innerHTML = assembleColumns(b.panels,
    effectivePanels("status"), b.gridStyle, b.colStyles);
}
