// Entity card renderers: light/switch cards, metric cards with sparklines,
// environment metrics, and the media player card. Inline handler strings in
// the generated HTML (lightPress*, toggleEntity, mediaCmd) are resolved by
// the globals.js window shim — they are intentionally not imported here.
import { state } from '../state.js';
import { friendlyName, isActive, isUnavailable, renderOfflineBadge, escapeHtml, relativeTime } from '../utils.js';
import { renderStatusLed } from './panels.js';

export function renderLightCard(entityId) {
  const st = state.states[entityId];
  const offline = isUnavailable(st);
  const active = st ? isActive(st.state) : false;
  const brightness = st && st.attributes && st.attributes.brightness != null ? st.attributes.brightness : 0;
  const pct = Math.round((brightness / 255) * 100);
  // Compact grid tile: bulb icon glows green while lit. Tap toggles, hold opens
  // the controls modal (see lightPress*).
  const lit = active && !offline;
  const bulb = `<svg viewBox="0 0 24 24" width="36" height="36" fill="${lit ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:${lit ? "var(--green)" : "var(--text-muted)"};${lit ? "filter:drop-shadow(0 0 10px rgba(20,254,23,0.55));" : ""}"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.9.7 1.6 1.6 1.6 2.7h4c0-1.1.7-2 1.6-2.7A6 6 0 0 0 12 3z"/></svg>`;
  return `<div class="terminal-panel" data-entity-id="${entityId}" style="${lit ? "border-color:rgba(20,254,23,0.45);background:linear-gradient(180deg,rgba(20,254,23,0.07),rgba(20,254,23,0.02));box-shadow:0 0 16px rgba(20,254,23,0.15), inset 0 0 24px rgba(20,254,23,0.04);" : ""}">
    <div class="panel-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;padding:14px 10px;"
      onpointerdown="lightPressStart(event,'${entityId}')" onpointermove="lightPressMove(event)" onpointerup="lightPressEnd(event,'${entityId}')" onpointercancel="lightPressCancel()" oncontextmenu="event.preventDefault()">
      ${bulb}
      <div style="font-family:var(--font-mono);font-size:0.85rem;color:var(--text);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${lit ? "text-shadow:0 0 8px rgba(20,254,23,0.4);" : ""}">${escapeHtml(friendlyName(entityId))}</div>
      <div style="font-family:var(--font-mono);font-size:0.72rem;letter-spacing:0.08em;color:${lit ? "var(--green)" : "var(--text-muted)"};">${offline ? "OFFLINE" : (active ? `ON · ${pct}%` : "OFF")}</div>
    </div>
  </div>`;
}

export function renderSwitchCard(entityId) {
  const st = state.states[entityId];
  const offline = isUnavailable(st);
  const active = st ? isActive(st.state) : false;
  return `<div class="terminal-panel" data-entity-id="${entityId}">
    <div class="panel-body" style="display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;" onclick="toggleEntity('${entityId}')">
      <div>${renderStatusLed(offline ? "unavailable" : (active ? "on" : "off"))} <span style="font-family:var(--font-mono);">${escapeHtml(friendlyName(entityId))}</span></div>
      <div style="color:var(--text-muted);font-family:var(--font-mono);">${offline ? "OFFLINE" : (active ? "ON" : "OFF")}</div>
    </div>
  </div>`;
}

export function renderMetricCard(entityId) {
  const st = state.states[entityId];
  if (!st) return "";
  const deviceClass = st.attributes && st.attributes.device_class;
  const isTimestamp = deviceClass === "timestamp";
  const unit = st.attributes && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "";
  const offline = isUnavailable(st) ? renderOfflineBadge() : "";
  const value = isTimestamp ? escapeHtml(relativeTime(st.state) || st.state) : escapeHtml(st.state);
  return `<div class="terminal-panel" style="text-align:center;padding:8px;display:flex;flex-direction:column;justify-content:center;" data-entity-id="${entityId}">
    <div style="font-family:var(--font-mono);font-size:1.4rem;color:var(--green);">${offline || value}<span style="font-size:0.8rem;color:var(--text-muted);">${offline || isTimestamp ? "" : escapeHtml(unit)}</span></div>
    <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(friendlyName(entityId))}</div>
    ${renderSparkline(entityId)}
  </div>`;
}

export function renderSparkline(entityId, width = 100, height = 20) {
  const data = state.historyCache[entityId] && state.historyCache[entityId].data;
  if (!data || data.length < 2) return "";
  const values = data.map(d => parseFloat(d.state)).filter(v => !isNaN(v));
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  return `<svg width="${width}" height="${height}" style="display:block;margin:4px auto 0;"><polyline points="${points}" fill="none" stroke="rgba(20,254,23,0.45)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function renderEnvMetric(entityId) {
  const st = state.states[entityId];
  if (!st) return "";
  const unit = st.attributes && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "";
  const deviceClass = st.attributes && st.attributes.device_class;
  const labelMap = { temperature: "TEMP", humidity: "HUM", illuminance: "LIGHT" };
  const label = labelMap[deviceClass] || (deviceClass ? deviceClass.toUpperCase() : entityId.split("_").pop().toUpperCase());
  const offline = isUnavailable(st) ? renderOfflineBadge() : "";
  const sparkline = (deviceClass === "temperature" || deviceClass === "humidity")
    ? renderSparkline(entityId)
    : "";
  return `<div class="terminal-panel" style="text-align:center;padding:10px 4px;display:flex;flex-direction:column;justify-content:center;" data-entity-id="${entityId}">
    <div style="font-family:var(--font-mono);font-size:1.5rem;color:var(--green);">${offline || escapeHtml(st.state)}<span style="font-size:0.75rem;color:var(--text-muted);">${offline ? "" : escapeHtml(unit)}</span></div>
    <div class="metric-label" style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</div>
    ${sparkline}
  </div>`;
}

export function renderMediaCard(entityId) {
  const st = state.states[entityId];
  if (!st) return "";
  const title = st.attributes && (st.attributes.media_title || st.attributes.friendly_name) || friendlyName(entityId);
  const artist = st.attributes && st.attributes.media_artist ? st.attributes.media_artist : st.state;
  const playing = st.state === "playing";
  return `<div class="terminal-panel" data-entity-id="${entityId}">
    <div class="panel-title">${escapeHtml(friendlyName(entityId))}</div>
    <div class="panel-body" style="font-family:var(--font-mono);">
      <div style="color:var(--green);">${escapeHtml(title)}</div>
      <div style="color:var(--text-muted);font-size:0.85rem;">${escapeHtml(artist)}</div>
      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn" onclick="mediaCmd('${entityId}','media_previous_track')">⏮</button>
        <button class="btn" onclick="mediaCmd('${entityId}','${playing ? "media_pause" : "media_play"}')">${playing ? "⏸" : "▶"}</button>
        <button class="btn" onclick="mediaCmd('${entityId}','media_next_track')">⏭</button>
      </div>
    </div>
  </div>`;
}
