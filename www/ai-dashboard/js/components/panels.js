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
  const itemHtml = alerts.map(a => `<span class="alert-banner-item">! ${escapeHtml(a)}</span>`).join("");
  const scroll = alerts.length > 1;
  const trackHtml = scroll ? `${itemHtml}${itemHtml}` : itemHtml;
  const duration = Math.max(10, Math.round(alerts.reduce((sum, a) => sum + a.length + 3, 0) / 6));
  return `<div class="alert-banner${scroll ? " alert-banner-scroll" : ""}"><div class="alert-banner-track" style="--marquee-duration:${duration}s;">${trackHtml}</div></div>`;
}

export function renderSceneButton(entityId) {
  const name = friendlyName(entityId);
  return `<button class="scene-btn" data-entity-id="${entityId}" onclick="toggleEntity('${entityId}')">${escapeHtml(name)}</button>`;
}
