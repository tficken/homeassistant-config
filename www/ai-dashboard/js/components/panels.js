// Panel chrome renderers: terminal panel wrapper, status LED, alert banner,
// scene/script buttons. utils.js imports renderTerminalPanel back from here
// (circular function references only — no top-level reads of imported bindings).
import { friendlyName, escapeHtml } from '../utils.js';

export function renderTerminalPanel(title, bodyHtml, cls, attrs) {
  return `<div class="terminal-panel${cls ? " " + cls : ""}"${attrs ? " " + attrs : ""}>
    <div class="panel-title">${escapeHtml(title)}</div>
    <div class="panel-body">${bodyHtml}</div>
  </div>`;
}

export function renderStatusLed(state) {
  let cls = "";
  const s = String(state || "").toLowerCase();
  if (["on","playing","open","home","heat","cool","auto","active","true","cleaning","docked","idle"].includes(s)) cls = "on";
  else if (["unavailable","unknown","offline"].includes(s)) cls = "danger";
  return `<span class="status-led ${cls}"></span>`;
}

export function renderAlertBanner(alerts) {
  if (!alerts || !alerts.length) return "";
  const items = alerts.slice(0, 3).map(a => `<span style="margin-right:18px;">! ${escapeHtml(a)}</span>`).join("");
  return `<div style="width:100%;background:rgba(255,174,0,0.12);border:1px solid var(--amber);color:var(--amber);font-family:var(--font-mono);padding:10px 14px;letter-spacing:0.05em;">${items}</div>`;
}

export function renderSceneButton(entityId) {
  const name = friendlyName(entityId);
  return `<button class="scene-btn" data-entity-id="${entityId}" onclick="toggleEntity('${entityId}')">${escapeHtml(name)}</button>`;
}
