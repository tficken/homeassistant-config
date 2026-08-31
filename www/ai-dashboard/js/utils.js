// Pure formatting/entity helpers + door/presence last-event tracking.
// Leaf module: only reads shared runtime state and calls back into
// screens/home.js (getPresenceEntities/renderDoors) and components/panels.js
// (renderTerminalPanel) — circular function references only, no top-level
// reads of imported bindings.
import { state } from './state.js';
import { getPresenceEntities, renderDoors } from './screens/home.js';
import { renderTerminalPanel } from './components/panels.js';

const DOMAIN_ICONS = {
  light: { on: "💡", off: "🌑" }, switch: { on: "⚡", off: "🔌" }, fan: { on: "🌀", off: "🍃" },
  binary_sensor: { on: "🔔", off: "🔕" }, climate: "🌡️", media_player: "📺", vacuum: "🤖",
  sensor: "📊", weather: "🌤️", scene: "🎬", script: "▶️", button: "🔘", number: "🔢",
  select: "☰", cover: "🪟", lock: "🔒", input_boolean: { on: "✅", off: "⬜" },
  person: "👤", device_tracker: "📍", camera: "📷", siren: "🚨", update: "🔄", alarm_control_panel: "🛡️"
};

export function friendlyName(entityId) {
  if (state.config.labels && state.config.labels[entityId]) return state.config.labels[entityId];
  const s = state.states[entityId];
  if (s && s.attributes && s.attributes.friendly_name) return s.attributes.friendly_name;
  const e = state.entityById[entityId];
  if (e) return e.name || e.original_name || entityId;
  return entityId.split(".").pop().replace(/_/g, " ");
}

export function presenceLabel(entityId) {
  if (state.config.presenceLabels && state.config.presenceLabels[entityId]) return state.config.presenceLabels[entityId];
  return friendlyName(entityId);
}

export function sectionTitle(key, fallback) {
  const s = state.config.sections && state.config.sections[key];
  const t = s && s.title ? String(s.title) : (fallback || key);
  return t.toUpperCase();
}

export function entityArea(entityId) {
  return (window.HA_AREAS && window.HA_AREAS[entityId]) || "";
}

export function iconFor(entityId, state) {
  const domain = entityId.split(".")[0];
  const s = (state || "").toLowerCase();
  const map = DOMAIN_ICONS[domain];
  if (typeof map === "object") {
    if (["on","playing","open","home","heat","cool","auto","active","true"].includes(s)) return map.on || map.off;
    return map.off || map.on;
  }
  return map || "●";
}

export function isActive(state) {
  return ["on","playing","open","home","heat","cool","auto","active","true","cleaning","docked","idle"].includes((state || "").toLowerCase());
}

export function isUnavailable(state) {
  if (!state) return true;
  const s = String(state.state).toLowerCase();
  return s === "unavailable" || s === "unknown";
}

export function renderOfflineBadge() {
  return `<span class="offline-badge">OFFLINE</span>`;
}

export function isActionable(domain) {
  return ["light","switch","fan","scene","script","button","input_boolean","cover","lock","media_player","siren"].includes(domain);
}

export function formatState(state) {
  if (!state) return "unknown";
  const unit = state.attributes && state.attributes.unit_of_measurement ? state.attributes.unit_of_measurement : "";
  return `${state.state} ${unit}`.trim();
}

export function weatherIcon(condition) {
  const c = (condition || "").toLowerCase();
  if (c.includes("clear") || c.includes("sunny")) return "☀️";
  if (c.includes("partly")) return "⛅";
  if (c.includes("cloud")) return "☁️";
  if (c.includes("rain") || c.includes("drizzle")) return "🌧️";
  if (c.includes("snow")) return "❄️";
  if (c.includes("storm") || c.includes("thunder")) return "⛈️";
  if (c.includes("fog") || c.includes("mist")) return "🌫️";
  return "🌤️";
}

export function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

export function formatTemp(v) {
  if (v == null || v === "unknown" || v === "unavailable") return "--";
  return `${Math.round(v)}°`;
}

export function relativeTime(isoString) {
  if (!isoString || isoString === "unknown" || isoString === "unavailable") return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Recorder-backed "last event" times. state.last_changed resets to the HA
// restart time for restored entities, so door "last opened" and presence
// "last seen" would falsely read "minutes ago" after every reboot. The cache
// is seeded from recorder history (POST /ai-dashboard/api/history, survives
// restarts) and then kept current by tracking real state transitions from WS
// events — restart republishes arrive with an unchanged state and are ignored.

export function doorEntityIds() {
  return (state.config.sections && state.config.sections.doors && state.config.sections.doors.entities) || [];
}

export function lastEventTime(id) {
  const ms = state.lastEventCache[id];
  if (ms) return new Date(ms).toISOString();
  const st = state.states[id];
  return st ? st.last_changed : null;
}

// Re-primed (merged, newest wins) on every full states reload so events that
// happened while the socket was down (e.g. mid-restart) are picked up.
export async function primeLastEventCache() {
  if (!window.HA_INTEGRATION_PROXY) return;
  const doorIds = doorEntityIds();
  const personIds = getPresenceEntities();
  const ids = [...new Set([...doorIds, ...personIds])];
  if (!ids.length) return;
  try {
    const resp = await fetch("/ai-dashboard/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_ids: ids, hours: 168 }),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const now = Date.now();
    for (const id of ids) {
      const rows = data[id] || [];
      let ms = null;
      if (doorIds.includes(id)) {
        // last time the door was OPEN (not just last open/close flip)
        for (let i = rows.length - 1; i >= 0; i--) {
          if (String(rows[i].state).toLowerCase() === "on") { ms = Date.parse(rows[i].last_changed); break; }
        }
      } else if (rows.length) {
        ms = Date.parse(rows[rows.length - 1].last_changed);
      }
      if (ms && ms <= now) state.lastEventCache[id] = Math.max(state.lastEventCache[id] || 0, ms);
    }
  } catch (e) { /* cache stays as-is; renderers fall back to last_changed */ }
}

export function trackLastEvent(prev, next) {
  if (!prev || !next || prev.state === next.state) return;
  const id = next.entity_id;
  if (doorEntityIds().includes(id)) {
    if (String(next.state).toLowerCase() === "on") state.lastEventCache[id] = Date.now();
  } else if (getPresenceEntities().includes(id)) {
    state.lastEventCache[id] = Date.now();
  }
}

export const DOOR_RECENT_WINDOW_MS = 10 * 60 * 1000;

export function recentDoorIds() {
  const doors = (state.config.sections && state.config.sections.doors && state.config.sections.doors.entities) || [];
  const recent = [];
  for (const doorId of doors) {
    const s = state.states[doorId];
    if (!s || isUnavailable(s)) continue;
    const t = new Date(s.last_changed).getTime();
    if (!isNaN(t) && Date.now() - t < DOOR_RECENT_WINDOW_MS) recent.push(doorId);
  }
  return recent;
}

export function refreshDoorRecency() {
  const key = recentDoorIds().join(",");
  if (key === state.lastRecentDoorKey) return;
  state.lastRecentDoorKey = key;
  const el = document.getElementById("doors-panel");
  if (el && state.currentScreen === "home") {
    el.innerHTML = renderTerminalPanel(sectionTitle("doors"), renderDoors());
  }
}
