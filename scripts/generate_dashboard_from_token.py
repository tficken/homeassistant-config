import json
import os
import sys
import urllib.request
import urllib.error
import shutil
import re
from datetime import datetime


# ------------------------------------------------------------------------------
# Embedded dashboard SPA
# ------------------------------------------------------------------------------
DASHBOARD_HTML = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Home Assistant Wall Dashboard</title>
<style>
:root {
  --bg: #02040a;
  --bg-gradient: radial-gradient(circle at 20% 0%, rgba(30, 60, 90, 0.35), transparent 45%),
                 radial-gradient(circle at 80% 90%, rgba(20, 70, 80, 0.25), transparent 40%),
                 #02040a;
  --glass: rgba(16, 24, 38, 0.62);
  --glass-border: rgba(255, 255, 255, 0.07);
  --glass-hover: rgba(255, 255, 255, 0.10);
  --text: #f4f6fb;
  --text-muted: #8e9ab0;
  --accent: #2dd4bf;
  --accent-rgb: 45, 212, 191;
  --warning: #f59e0b;
  --danger: #f87171;
  --success: #34d399;
  --radius: 24px;
  --radius-sm: 16px;
  --radius-xs: 12px;
  --gap: 18px;
  --col-w: 320px;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  height: 100%; width: 100%;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
}
#bg {
  position: fixed; inset: 0; z-index: 0;
  background: var(--bg-gradient);
  background-size: cover;
  transition: background-image 0.5s ease;
}
#bg.image {
  background: linear-gradient(rgba(2,4,10,0.55), rgba(2,4,10,0.75)), var(--bg-image, var(--bg-gradient));
  background-size: cover; background-position: center;
}
#app {
  position: fixed; inset: 0; z-index: 1;
  display: grid;
  grid-template-columns: var(--col-w) 1fr var(--col-w);
  gap: var(--gap);
  padding: var(--gap);
}
.column {
  display: flex; flex-direction: column;
  gap: var(--gap);
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;
}
.column::-webkit-scrollbar { width: 5px; }
.column::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
.panel {
  background: var(--glass);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  padding: 18px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.28);
  flex-shrink: 0;
}
.section-title {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-muted);
  margin: 0 0 12px 2px;
  font-weight: 700;
}
.section-heading {
  display: flex; align-items: center; gap: 10px;
  font-size: 1.05rem; font-weight: 700;
  margin: 0 0 14px 2px;
  color: var(--text);
}
.section-icon { font-size: 1.3rem; line-height: 1; }

/* Center column */
.center {
  align-items: center;
  justify-content: flex-start;
  padding-top: 2vh;
  text-align: center;
}
.clock-time {
  font-size: clamp(5rem, 11vw, 9rem);
  font-weight: 200;
  line-height: 0.9;
  letter-spacing: -0.04em;
  text-shadow: 0 8px 30px rgba(0,0,0,0.35);
}
.clock-date {
  font-size: 1.35rem; color: var(--text-muted); margin-top: 10px; font-weight: 400;
}
.clock-panel {
  background: transparent;
  border: none;
  backdrop-filter: none;
  box-shadow: none;
}
.radar-panel {
  width: 100%;
  max-width: 720px;
  padding: 12px;
}
.radar-frame {
  width: 100%;
  aspect-ratio: 16/9;
  border: none;
  border-radius: var(--radius-sm);
  background: rgba(0,0,0,0.3);
}
.radar-placeholder {
  width: 100%;
  aspect-ratio: 16/9;
  border-radius: var(--radius-sm);
  background: rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
  font-size: 0.95rem;
}
.forecast-row {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
  width: 100%;
  max-width: 720px;
}
.forecast-cell {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: var(--radius-sm);
  padding: 12px 10px;
  min-width: 80px;
  text-align: center;
}
.forecast-cell .f-day { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.forecast-cell .f-icon { font-size: 1.6rem; margin: 6px 0; }
.forecast-cell .f-temp { font-size: 1rem; font-weight: 700; }

/* Cards */
.grid-1 { display: grid; grid-template-columns: 1fr; gap: 10px; }
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  min-height: 76px;
  display: flex; flex-direction: column; gap: 5px;
  justify-content: center;
  transition: transform 0.12s, background 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.card.actionable { cursor: pointer; user-select: none; }
.card.actionable:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.14); }
.card.actionable:active { transform: scale(0.96); }
.card.active { border-color: rgba(var(--accent-rgb), 0.55); background: rgba(var(--accent-rgb), 0.10); box-shadow: 0 0 22px rgba(var(--accent-rgb), 0.12); }
.card-row { display: flex; align-items: center; gap: 12px; }
.card-icon { font-size: 1.5rem; line-height: 1; width: 28px; text-align: center; }
.card-name { font-size: 0.92rem; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-state { font-size: 0.8rem; color: var(--text-muted); }

/* Home panel */
.home-weather {
  display: flex; align-items: center; gap: 14px;
  margin-bottom: 14px;
}
.home-weather-icon { font-size: 3.2rem; line-height: 1; }
.home-weather-temp { font-size: 2.8rem; font-weight: 700; line-height: 1; }
.home-weather-meta { text-align: left; }
.home-weather-condition { color: var(--text-muted); font-size: 1rem; }
.home-people {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.person-chip {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.9rem; font-weight: 500;
}
.person-chip.home { border-color: rgba(var(--accent-rgb), 0.4); background: rgba(var(--accent-rgb), 0.10); }
.person-chip.away { opacity: 0.7; }
.person-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); }
.person-chip.home .person-dot { background: var(--success); box-shadow: 0 0 8px var(--success); }

/* Metric card */
.metric-card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: var(--radius-sm);
  padding: 14px;
  text-align: center;
}
.metric-value { font-size: 1.6rem; font-weight: 700; }
.metric-unit { font-size: 0.85rem; color: var(--text-muted); }
.metric-name { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }

/* Presence */
.presence-list { display: flex; flex-direction: column; gap: 8px; }
.presence-row {
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: var(--radius-xs);
  padding: 10px 12px;
}
.presence-row.active { border-color: rgba(var(--accent-rgb), 0.45); background: rgba(var(--accent-rgb), 0.08); }
.presence-name { font-size: 0.9rem; font-weight: 600; }
.presence-pill {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;
  padding: 4px 8px; border-radius: 999px;
  background: rgba(255,255,255,0.1);
  color: var(--text-muted);
}
.presence-row.active .presence-pill { background: rgba(var(--accent-rgb), 0.2); color: var(--accent); }

/* Camera */
.camera-card { width: 100%; margin-bottom: 12px; }
.camera-card:last-child { margin-bottom: 0; }
.camera-name { font-size: 0.85rem; font-weight: 600; margin-bottom: 8px; color: var(--text-muted); }
.camera-feed {
  width: 100%; border-radius: var(--radius-sm);
  aspect-ratio: 16/9; object-fit: cover;
  background: rgba(0,0,0,0.3);
}

/* Status + settings */
#status {
  position: fixed; top: 14px; right: 14px; z-index: 50;
  width: 11px; height: 11px; border-radius: 50%;
  background: var(--warning);
  box-shadow: 0 0 0 2px rgba(0,0,0,0.3);
  transition: background 0.3s;
}
#status.connected { background: var(--success); }
#status.disconnected { background: var(--danger); }
#settings-btn {
  position: fixed; top: 10px; right: 32px; z-index: 50;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; color: var(--text-muted);
  font-size: 1.2rem; cursor: pointer; opacity: 0.6;
}
#settings-btn:hover { opacity: 1; color: var(--text); }
#settings-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  display: none; align-items: center; justify-content: center;
}
#settings-overlay.open { display: flex; }
#settings-panel {
  width: min(760px, 92vw); max-height: 88vh;
  overflow-y: auto;
  padding: 22px;
}
.settings-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.settings-title { font-size: 1.2rem; font-weight: 700; margin: 0; }
.settings-close { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: var(--text); border-radius: 10px; padding: 6px 12px; cursor: pointer; }
.settings-section { margin-bottom: 22px; }
.settings-section h3 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin: 0 0 10px; }
.settings-row { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.settings-row label { min-width: 120px; font-size: 0.9rem; color: var(--text-muted); }
.settings-row input, .settings-row select {
  flex: 1; min-width: 180px;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 8px 10px; color: var(--text); font-size: 0.9rem;
}
.settings-row input[type="checkbox"] { min-width: auto; flex: 0; width: 18px; height: 18px; }
.btn {
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.12);
  color: var(--text); border-radius: 10px; padding: 8px 14px; cursor: pointer; font-size: 0.85rem;
}
.btn:hover { background: rgba(255,255,255,0.16); }
.btn-primary { background: rgba(var(--accent-rgb), 0.18); border-color: rgba(var(--accent-rgb), 0.4); }
.entity-chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 999px; padding: 5px 10px; font-size: 0.8rem; margin: 4px 4px 0 0;
}
.entity-chip button { background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; }

@media (max-width: 1100px) {
  #app { grid-template-columns: 1fr 1fr; }
  .center { grid-column: 1 / -1; grid-row: 1; }
  .left { grid-column: 1; grid-row: 2; }
  .right { grid-column: 2; grid-row: 2; }
}
@media (max-width: 760px) {
  #app { grid-template-columns: 1fr; }
  .left, .center, .right { grid-column: 1; grid-row: auto; }
  .clock-time { font-size: 4rem; }
}
</style>
</head>
<body>
<div id="bg"></div>
<div id="status"></div>
<button id="settings-btn" onclick="openSettings()" title="Settings">⚙️</button>

<div id="app">
  <aside class="column left" id="left"></aside>
  <main class="column center" id="center"></main>
  <aside class="column right" id="right"></aside>
</div>

<div id="settings-overlay">
  <div id="settings-panel" class="panel">
    <div class="settings-header">
      <h2 class="settings-title">Dashboard Settings</h2>
      <button class="settings-close" onclick="closeSettings()">Close</button>
    </div>
    <div id="settings-body"></div>
    <div class="settings-row" style="justify-content:flex-end; margin-top:16px;">
      <button class="btn" onclick="exportConfig()">Export JSON</button>
      <button class="btn" onclick="importConfig()">Import JSON</button>
      <button class="btn btn-primary" onclick="saveSettings()">Save & Apply</button>
    </div>
  </div>
</div>

<script>
const DEFAULT_CONFIG = {
  theme: {
    backgroundImage: "",
    accentColor: "#2dd4bf"
  },
  layout: {
    left: ["home", "environment", "presence"],
    center: ["clock", "radar", "forecast"],
    right: ["scenes", "quickControls", "security", "system", "cameras"],
    clock24h: false
  },
  entities: {
    weather: "weather.forecast_home",
    temperatures: ["sensor.hobeian_zg_204zx_temperature", "sensor.hobeian_zg_204zx_temperature_2"],
    summaryChips: [],
    mediaPlayer: "media_player.living_room_fire_tv_living_room",
    quickControls: [
      "scene.all_lights_off",
      "scene.living_room_lights_on",
      "script.goodnight",
      "light.living_room_ceiling_fan"
    ]
  },
  sections: {
    home: { title: "Home", icon: "🏠", entities: ["person.woteg", "device_tracker.traviss_iphone", "weather.forecast_home"] },
    scenes: { title: "Scenes", icon: "🎨", entities: ["scene.all_lights_off", "scene.living_room_lights_on", "scene.relax_mode", "scene.movie_mode", "script.goodnight", "script.focus_mode"] },
    quickControls: { title: "Quick Controls", icon: "🎛️", entities: ["light.ceiling_fan", "light.living_room_ceiling_fan", "media_player.living_room_fire_tv_living_room"] },
    cameras: { title: "Cameras", icon: "📷", entities: ["camera.front_door_live_view", "camera.downstairs_live_view"] },
    security: { title: "Security", icon: "🛡️", entities: ["switch.front_door_motion_detection", "switch.downstairs_motion_detection", "sensor.front_door_battery", "sensor.downstairs_battery", "siren.downstairs_siren", "siren.downstairs_siren_2"] },
    environment: { title: "Environment", icon: "🌡️", entities: ["sensor.hobeian_zg_204zx_temperature", "sensor.hobeian_zg_204zx_humidity", "sensor.hobeian_zg_204zx_illuminance", "sensor.hobeian_zg_204zx_temperature_2", "sensor.hobeian_zg_204zx_humidity_2", "sensor.hobeian_zg_204zx_illuminance_2"] },
    presence: { title: "Presence", icon: "👤", entities: ["binary_sensor.hobeian_zg_204zx", "binary_sensor.hobeian_zg_204zx_2"] },
    system: { title: "System", icon: "⚙️", entities: ["sensor.home_assistant_core_cpu_percent", "sensor.home_assistant_core_memory_percent", "sensor.ha_disk_usage", "vacuum.geordi_la_forge", "vacuum.pooper_litter_box", "update.home_assistant_core_update", "update.home_assistant_operating_system_update", "update.home_assistant_supervisor_update"] }
  },
  dock: {
    items: [
      { icon: "💡", entityId: "scene.all_lights_off", label: "All off" },
      { icon: "🌙", entityId: "script.goodnight", label: "Goodnight" },
      { icon: "⚙️", action: "settings", label: "Settings" }
    ]
  }
};

const DOMAIN_ICONS = {
  light: { on: "💡", off: "🌑" },
  switch: { on: "⚡", off: "🔌" },
  fan: { on: "🌀", off: "🍃" },
  binary_sensor: { on: "🔔", off: "🔕" },
  climate: "🌡️", media_player: "📺", vacuum: "🤖",
  sensor: "📊", weather: "🌤️", scene: "🎬", script: "▶️",
  button: "🔘", number: "🔢", select: "☰", cover: "🪟",
  lock: "🔒", input_boolean: { on: "✅", off: "⬜" },
  person: "👤", device_tracker: "📍", camera: "📷",
  siren: "🚨", update: "🔄", alarm_control_panel: "🛡️"
};

const EXCLUDED_DOMAINS = new Set([
  "update", "device_tracker", "person", "camera", "alarm_control_panel",
  "automation", "input_text", "input_datetime", "input_select",
  "input_number", "input_button", "persistent_notification", "sun", "zone", "tts"
]);
const EXCLUDED_PREFIXES = [
  "sensor.home_assistant_core_", "sensor.home_assistant_host_", "sensor.home_assistant_supervisor_"
];

let config = {};
let token = "";
let ws = null;
let reconnectDelay = 1000;
let states = {};
let areas = [];
let entities = [];
let areaMap = {};
let entityById = {};
let haConfig = null;

function deepMerge(target, ...sources) {
  for (const src of sources) {
    if (!src) continue;
    for (const key of Object.keys(src)) {
      if (src[key] && typeof src[key] === "object" && !Array.isArray(src[key])) {
        target[key] = target[key] || {};
        deepMerge(target[key], src[key]);
      } else {
        target[key] = src[key];
      }
    }
  }
  return target;
}

async function loadConfig() {
  let fileConfig = {};
  try {
    const configUrl = window.HA_INTEGRATION_PROXY ? "/ai-dashboard/config.json" : "config.json";
    const r = await fetch(configUrl, { cache: "no-store" });
    if (r.ok) fileConfig = await r.json();
  } catch (e) {}
  let lsConfig = {};
  try {
    const raw = localStorage.getItem("ha_dashboard_config");
    if (raw) lsConfig = JSON.parse(raw);
  } catch (e) {}
  return deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), fileConfig, lsConfig);
}

function saveConfig() {
  localStorage.setItem("ha_dashboard_config", JSON.stringify(config));
}

function applyTheme() {
  const bg = document.getElementById("bg");
  if (config.theme.backgroundImage) {
    bg.classList.add("image");
    bg.style.setProperty("--bg-image", `url("${config.theme.backgroundImage}")`);
  } else {
    bg.classList.remove("image");
    bg.style.removeProperty("--bg-image");
  }
  const accent = config.theme.accentColor || DEFAULT_CONFIG.theme.accentColor;
  const rgb = hexToRgb(accent);
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
}

function hexToRgb(hex) {
  const m = hex.replace("#", "").match(/^(..?)(..?)(..?)$/);
  if (!m) return { r: 45, g: 212, b: 191 };
  return {
    r: parseInt(m[1].padStart(2, m[1]), 16),
    g: parseInt(m[2].padStart(2, m[2]), 16),
    b: parseInt(m[3].padStart(2, m[3]), 16)
  };
}

function friendlyName(entityId) {
  const s = states[entityId];
  if (s && s.attributes && s.attributes.friendly_name) return s.attributes.friendly_name;
  const e = entityById[entityId];
  if (e) return e.name || e.original_name || entityId;
  return entityId.split(".").pop().replace(/_/g, " ");
}

function iconFor(entityId, state) {
  const domain = entityId.split(".")[0];
  const s = (state || "").toLowerCase();
  const map = DOMAIN_ICONS[domain];
  if (typeof map === "object") {
    if (["on","playing","open","home","heat","cool","auto","active","true"].includes(s)) return map.on || map.off;
    return map.off || map.on;
  }
  return map || "●";
}

function isActive(state) {
  return ["on","playing","open","home","heat","cool","auto","active","true"].includes((state || "").toLowerCase());
}

function isActionable(domain) {
  return ["light","switch","fan","scene","script","button","input_boolean","cover","lock","media_player","siren"].includes(domain);
}

function formatState(state) {
  if (!state) return "unknown";
  const unit = state.attributes && state.attributes.unit_of_measurement ? state.attributes.unit_of_measurement : "";
  return `${state.state} ${unit}`.trim();
}

function weatherIcon(condition) {
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

function setStatus(cls) {
  const el = document.getElementById("status");
  el.className = cls;
  if (cls === "connected") reconnectDelay = 1000;
}

function toggleEntity(entityId) {
  if (!ws) return;
  const domain = entityId.split(".")[0];
  let service = "toggle";
  if (["scene","script","button"].includes(domain)) service = "turn_on";
  else if (domain === "media_player") service = "media_play_pause";
  else if (domain === "lock") {
    const st = states[entityId] && states[entityId].state;
    service = st === "locked" ? "unlock" : "lock";
  }
  ws.send(JSON.stringify({ id: Date.now(), type: "call_service", domain, service, service_data: { entity_id: entityId } }));
}

function cardHTML(entityId, opts = {}) {
  const state = states[entityId];
  const domain = entityId.split(".")[0];
  const name = opts.name || friendlyName(entityId);
  const active = state ? isActive(state.state) : false;
  const actionable = opts.actionable !== false && isActionable(domain);
  const classes = ["card"];
  if (active) classes.push("active");
  if (actionable) classes.push("actionable");
  const onclick = actionable ? `onclick="toggleEntity('${entityId}')"` : "";
  const icon = iconFor(entityId, state && state.state);
  const st = state ? formatState(state) : "unknown";
  return `<div class="${classes.join(" ")}" data-entity-id="${entityId}" ${onclick}>
    <div class="card-row"><div class="card-icon">${icon}</div>
    <div style="min-width:0;"><div class="card-name">${escapeHtml(name)}</div><div class="card-state">${escapeHtml(st)}</div></div></div>
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function apiFetch(path) {
  const headers = token ? { "Authorization": `Bearer ${token}` } : {};
  try {
    const r = await fetch(path, { headers });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error("apiFetch failed", path, e);
    return null;
  }
}

async function fetchHAConfig() {
  if (haConfig) return haConfig;
  haConfig = await apiFetch("/api/config");
  return haConfig;
}

function renderHomePanel(section) {
  const ids = section.entities || [];
  let weatherHtml = "";
  let peopleHtml = "";
  let extrasHtml = "";
  for (const id of ids) {
    const domain = id.split(".")[0];
    if (domain === "weather") {
      const s = states[id];
      let condition = "--", temp = "--", icon = "🌤️";
      if (s) {
        condition = s.state.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        temp = s.attributes && s.attributes.temperature != null ? s.attributes.temperature : "--";
        icon = weatherIcon(s.state);
      }
      weatherHtml = `<div class="home-weather">
        <div class="home-weather-icon">${icon}</div>
        <div class="home-weather-meta">
          <div class="home-weather-temp">${temp}°</div>
          <div class="home-weather-condition">${escapeHtml(condition)}</div>
        </div>
      </div>`;
    } else if (domain === "person" || domain === "device_tracker") {
      const s = states[id];
      const home = s && isActive(s.state);
      const label = home ? "Home" : (s ? s.state.replace(/_/g," ") : "Away");
      peopleHtml += `<span class="person-chip ${home ? "home" : "away"}"><span class="person-dot"></span>${escapeHtml(friendlyName(id))}: ${escapeHtml(label)}</span>`;
    } else {
      extrasHtml += cardHTML(id);
    }
  }
  return `<div class="panel">
    <div class="section-heading"><span class="section-icon">${section.icon || "🏠"}</span><span>${escapeHtml(section.title)}</span></div>
    ${weatherHtml}
    <div class="home-people">${peopleHtml}</div>
    ${extrasHtml ? `<div class="grid-1" style="margin-top:12px;">${extrasHtml}</div>` : ""}
  </div>`;
}

function renderEnvironmentPanel(section) {
  const ids = section.entities || [];
  const metrics = [];
  for (const id of ids) {
    const s = states[id];
    const domain = id.split(".")[0];
    if (domain !== "sensor" || !s) continue;
    const attrs = s.attributes || {};
    const unit = attrs.unit_of_measurement || "";
    metrics.push({ id, name: friendlyName(id), value: s.state, unit });
  }
  if (!metrics.length) return "";
  const cards = metrics.map(m => `<div class="metric-card" data-entity-id="${m.id}">
    <div class="metric-value">${escapeHtml(m.value)}<span class="metric-unit">${escapeHtml(m.unit)}</span></div>
    <div class="metric-name">${escapeHtml(m.name)}</div>
  </div>`).join("");
  return `<div class="panel">
    <div class="section-heading"><span class="section-icon">${section.icon || "🌡️"}</span><span>${escapeHtml(section.title)}</span></div>
    <div class="grid-2">${cards}</div>
  </div>`;
}

function renderPresencePanel(section) {
  const ids = section.entities || [];
  if (!ids.length) return "";
  const rows = ids.map(id => {
    const s = states[id];
    const active = s ? isActive(s.state) : false;
    const stateLabel = s ? s.state.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Unknown";
    return `<div class="presence-row ${active ? "active" : ""}" data-entity-id="${id}">
      <div class="presence-name">${escapeHtml(friendlyName(id))}</div>
      <div class="presence-pill">${escapeHtml(stateLabel)}</div>
    </div>`;
  }).join("");
  return `<div class="panel">
    <div class="section-heading"><span class="section-icon">${section.icon || "👤"}</span><span>${escapeHtml(section.title)}</span></div>
    <div class="presence-list">${rows}</div>
  </div>`;
}

async function renderRadarPanel() {
  const cfg = await fetchHAConfig();
  let src = "";
  if (cfg && cfg.latitude != null && cfg.longitude != null) {
    src = `https://www.rainviewer.com/api.html?lat=${cfg.latitude}&lon=${cfg.longitude}&z=8&r=true&c=1&d=true`;
  }
  return `<div class="panel radar-panel">
    <div class="section-title">Radar</div>
    ${src
      ? `<iframe class="radar-frame" src="${src}" loading="lazy" allow="fullscreen"></iframe>`
      : `<div class="radar-placeholder">Radar unavailable</div>`}
  </div>`;
}

function renderForecastPanel() {
  const eid = config.entities.weather;
  const s = states[eid];
  if (!s) return "";
  const fc = (s.attributes && s.attributes.forecast) || [];
  if (!fc.length) return "";
  const cells = fc.slice(0, 5).map(d => {
    const dt = new Date(d.datetime);
    const day = dt.toLocaleDateString([], { weekday: "short" });
    const t = d.temperature != null ? `${Math.round(d.temperature)}°` : "--";
    return `<div class="forecast-cell">
      <div class="f-day">${escapeHtml(day)}</div>
      <div class="f-icon">${weatherIcon(d.condition)}</div>
      <div class="f-temp">${escapeHtml(t)}</div>
    </div>`;
  }).join("");
  return `<div class="forecast-row">${cells}</div>`;
}

function renderClockPanel() {
  return `<div class="panel clock-panel">
    <div class="clock-time" id="clock">--:--</div>
    <div class="clock-date" id="date">Loading...</div>
  </div>`;
}

function renderSectionPanel(key, section) {
  const ids = section.entities || [];
  if (!ids.length) return "";
  let gridClass = "grid-2";
  if (ids.some(id => id.split(".")[0] === "camera")) gridClass = "grid-1";
  else if (ids.length <= 2) gridClass = "grid-1";
  else if (ids.length <= 4) gridClass = "grid-2";
  else gridClass = "grid-2";

  const cards = ids.map(id => {
    const domain = id.split(".")[0];
    if (domain === "camera") {
      const name = friendlyName(id);
      const src = window.HA_INTEGRATION_PROXY ? `/api/camera_proxy_stream/${id}` : `/api/camera_proxy_stream/${id}?token=${encodeURIComponent(token)}`;
      return `<div class="camera-card"><div class="camera-name">${escapeHtml(name)}</div><img class="camera-feed" src="${src}" alt="${escapeHtml(name)}"></div>`;
    }
    return cardHTML(id);
  }).join("");
  return `<div class="panel section-panel">
    <div class="section-heading"><span class="section-icon">${section.icon || "•"}</span><span>${escapeHtml(section.title)}</span></div>
    <div class="${gridClass}">${cards}</div>
  </div>`;
}

async function renderColumn(targetId, keys) {
  const el = document.getElementById(targetId);
  const sections = config.sections || DEFAULT_CONFIG.sections;
  let html = "";
  for (const key of keys) {
    if (key === "clock") html += renderClockPanel();
    else if (key === "radar") html += await renderRadarPanel();
    else if (key === "forecast") html += renderForecastPanel();
    else if (key === "home") html += renderHomePanel(sections.home || { title: "Home", icon: "🏠", entities: [] });
    else if (key === "environment") html += renderEnvironmentPanel(sections.environment || { title: "Environment", icon: "🌡️", entities: [] });
    else if (key === "presence") html += renderPresencePanel(sections.presence || { title: "Presence", icon: "👤", entities: [] });
    else if (sections[key]) html += renderSectionPanel(key, sections[key]);
  }
  el.innerHTML = html;
}

async function renderAll() {
  const layout = config.layout || DEFAULT_CONFIG.layout;
  await Promise.all([
    renderColumn("left", layout.left || []),
    renderColumn("center", layout.center || []),
    renderColumn("right", layout.right || [])
  ]);
  updateClock();
}

function updateClock() {
  const now = new Date();
  const opts = config.layout.clock24h ? { hour: "2-digit", minute: "2-digit", hour12: false } : { hour: "numeric", minute: "2-digit" };
  const el = document.getElementById("clock");
  if (el) el.textContent = now.toLocaleTimeString([], opts);
  const d = document.getElementById("date");
  if (d) d.textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function updateCard(state) {
  const card = document.querySelector(`[data-entity-id="${state.entity_id}"]`);
  if (!card) return;
  const domain = state.entity_id.split(".")[0];
  const active = isActive(state.state);
  card.classList.toggle("active", active);
  const st = card.querySelector(".card-state");
  if (st) st.textContent = formatState(state);
  const icon = card.querySelector(".card-icon");
  if (icon) icon.textContent = iconFor(state.entity_id, state.state);

  // Update metric cards
  const metricValue = card.querySelector(".metric-value");
  if (metricValue) {
    const unit = state.attributes && state.attributes.unit_of_measurement ? state.attributes.unit_of_measurement : "";
    metricValue.innerHTML = `${escapeHtml(state.state)}<span class="metric-unit">${escapeHtml(unit)}</span>`;
  }

  // Update presence rows
  const presencePill = card.querySelector(".presence-pill");
  if (presencePill) {
    const row = card.closest(".presence-row");
    row.classList.toggle("active", active);
    presencePill.textContent = state.state.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  if (domain === "weather" && state.entity_id === config.entities.weather) renderAll();
}

async function fetchRegistry() {
  const [aRes, eRes] = await Promise.all([
    apiFetch("/api/config/area_registry/list"),
    apiFetch("/api/config/entity_registry/list")
  ]);
  areas = aRes || [];
  entities = eRes || [];
  areaMap = {};
  for (const a of areas) areaMap[a.area_id] = a.name;
  entityById = {};
  for (const e of entities) entityById[e.entity_id] = e;
}

function connectProxy() {
  setStatus("connecting");
  const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ai-dashboard/ws";
  ws = new WebSocket(url);
  ws.onopen = () => {
    setStatus("connected");
    ws.send(JSON.stringify({ id: 1, type: "get_states" }));
  };
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "result" && msg.id === 1 && msg.success) {
      states = {};
      for (const s of msg.result) states[s.entity_id] = s;
      await fetchRegistry();
      await renderAll();
    }
    if (msg.type === "event" && msg.event && msg.event.event_type === "state_changed") {
      const s = msg.event.data.new_state;
      if (s) { states[s.entity_id] = s; updateCard(s); }
    }
  };
  ws.onclose = () => {
    setStatus("disconnected");
    setTimeout(connectProxy, Math.min(reconnectDelay, 30000));
    reconnectDelay *= 2;
  };
  ws.onerror = () => { setStatus("disconnected"); ws.close(); };
}

function connect() {
  if (window.HA_INTEGRATION_PROXY) return connectProxy();
  setStatus("connecting");
  const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/websocket";
  ws = new WebSocket(url);
  ws.onopen = () => ws.send(JSON.stringify({ type: "auth", access_token: token }));
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "auth_ok") {
      setStatus("connected");
      ws.send(JSON.stringify({ id: 1, type: "get_states" }));
      ws.send(JSON.stringify({ id: 2, type: "subscribe_events", event_type: "state_changed" }));
      await fetchRegistry();
    }
    if (msg.type === "result" && msg.id === 1 && msg.success) {
      states = {};
      for (const s of msg.result) states[s.entity_id] = s;
      await renderAll();
    }
    if (msg.type === "event" && msg.event && msg.event.event_type === "state_changed") {
      const s = msg.event.data.new_state;
      if (s) { states[s.entity_id] = s; updateCard(s); }
    }
  };
  ws.onclose = () => {
    setStatus("disconnected");
    setTimeout(connect, Math.min(reconnectDelay, 30000));
    reconnectDelay *= 2;
  };
  ws.onerror = () => { setStatus("disconnected"); ws.close(); };
}

function logout() {
  localStorage.removeItem("ha_token");
  location.reload();
}

function openSettings() {
  buildSettings();
  document.getElementById("settings-overlay").classList.add("open");
}
function closeSettings() {
  document.getElementById("settings-overlay").classList.remove("open");
}

function entityOptions(domainFilter) {
  let list = Object.values(states);
  if (domainFilter) list = list.filter(s => domainFilter.includes(s.entity_id.split(".")[0]));
  return list.map(s => `<option value="${s.entity_id}">${escapeHtml(friendlyName(s.entity_id))} (${s.entity_id})</option>`).join("");
}

function sectionCheckboxes(column, available) {
  const layout = config.layout || {};
  const selected = layout[column] || [];
  return available.map(sec => {
    const checked = selected.includes(sec) ? "checked" : "";
    return `<label style="display:inline-flex;align-items:center;gap:6px;margin-right:12px;"><input type="checkbox" name="layout-${column}" value="${sec}" ${checked}> ${sec}</label>`;
  }).join("");
}

function buildSettings() {
  const body = document.getElementById("settings-body");
  const layoutSections = ["home", "environment", "presence", "clock", "radar", "forecast", "scenes", "quickControls", "security", "system", "cameras"];
  body.innerHTML = `
    <div class="settings-section"><h3>Appearance</h3>
      <div class="settings-row"><label>Background URL</label><input id="cfg-bg" type="text" value="${escapeHtml(config.theme.backgroundImage)}"></div>
      <div class="settings-row"><label>Accent color</label><input id="cfg-accent" type="color" value="${config.theme.accentColor}"></div>
      <div class="settings-row"><label>24-hour clock</label><input id="cfg-24h" type="checkbox" ${config.layout.clock24h ? "checked" : ""}></div>
    </div>
    <div class="settings-section"><h3>Layout</h3>
      <div class="settings-row"><label>Left column</label><div>${sectionCheckboxes("left", layoutSections)}</div></div>
      <div class="settings-row"><label>Center column</label><div>${sectionCheckboxes("center", layoutSections)}</div></div>
      <div class="settings-row"><label>Right column</label><div>${sectionCheckboxes("right", layoutSections)}</div></div>
      <div class="settings-row"><label>Weather entity</label><select id="cfg-weather"><option value="">-- none --</option>${entityOptions(["weather"])}</select></div>
    </div>
    <div class="settings-section"><h3>Quick Controls</h3>
      <div id="quick-list">${(config.entities.quickControls || []).map(id =>
        `<span class="entity-chip">${escapeHtml(friendlyName(id))} <button onclick="removeQuick('${id}')">×</button></span>`
      ).join("")}</div>
      <div class="settings-row"><select id="cfg-add-quick"><option value="">Add entity...</option>${entityOptions(["light","switch","scene","script","fan","input_boolean","button"])}</select></div>
    </div>
    <div class="settings-section"><h3>Data</h3>
      <p style="color:var(--text-muted);font-size:0.85rem;">Settings are saved in this browser. Use Export to get a JSON file you can save as <code>config.json</code> in this folder.</p>
      <button class="btn" onclick="logout()" style="background:rgba(248,113,113,0.15);border-color:rgba(248,113,113,0.3);">Clear token & reload</button>
    </div>
  `;
  document.getElementById("cfg-weather").value = config.entities.weather || "";
  document.getElementById("cfg-add-quick").addEventListener("change", e => { if(e.target.value) addQuick(e.target.value); e.target.value=""; });
}

function addQuick(id) {
  if (!config.entities.quickControls.includes(id)) config.entities.quickControls.push(id);
  buildSettings();
}
function removeQuick(id) {
  config.entities.quickControls = config.entities.quickControls.filter(x => x !== id);
  buildSettings();
}

function saveSettings() {
  config.theme.backgroundImage = document.getElementById("cfg-bg").value.trim();
  config.theme.accentColor = document.getElementById("cfg-accent").value;
  config.layout.clock24h = document.getElementById("cfg-24h").checked;
  config.entities.weather = document.getElementById("cfg-weather").value || "";
  ["left","center","right"].forEach(col => {
    const vals = [];
    document.querySelectorAll(`input[name="layout-${col}"]:checked`).forEach(cb => vals.push(cb.value));
    config.layout[col] = vals;
  });
  saveConfig();
  applyTheme();
  renderAll();
  closeSettings();
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "dashboard-config.json"; a.click();
  URL.revokeObjectURL(url);
}

function importConfig() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "application/json";
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const txt = await file.text();
      const data = JSON.parse(txt);
      config = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), data);
      saveConfig();
      applyTheme();
      renderAll();
      buildSettings();
    } catch (e) { alert("Invalid JSON: " + e.message); }
  };
  input.click();
}

async function init() {
  config = await loadConfig();
  applyTheme();
  await renderAll();
  if (window.HA_INTEGRATION_PROXY) {
    token = "";
    localStorage.removeItem("ha_token");
    connect();
  } else {
    token = localStorage.getItem("ha_token");
    if (!token) {
      token = prompt("Enter Home Assistant long-lived access token:");
      if (token) localStorage.setItem("ha_token", token);
    }
    if (token) connect();
  }
  setInterval(updateClock, 1000);
}

document.addEventListener("DOMContentLoaded", init);
</script>
</body>
</html>
'''


# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
TOKEN_PATH = "//HOMEASSISTANT/config/token.ha"


def get_config():
    ha_url = os.environ.get("HA_URL", "http://homeassistant.local:8123").rstrip("/")
    ha_token = os.environ.get("HA_TOKEN", "")
    if not ha_token and os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, "r", encoding="utf-8") as f:
            ha_token = f.read().strip()
    return {
        "ha_url": ha_url,
        "ha_token": ha_token,
        "www_root": os.environ.get("WWW_ROOT", "www"),
    }


# ------------------------------------------------------------------------------
# Home Assistant API
# ------------------------------------------------------------------------------
def api_request(url, token, path, exit_on_error=True):
    req = urllib.request.Request(
        f"{url}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print("Authentication failed — check HA_TOKEN or token.ha", file=sys.stderr)
        elif exit_on_error:
            reason = e.reason or "unknown error"
            print(f"Home Assistant API error ({e.code}) at {url}{path}: {reason}", file=sys.stderr)
        else:
            reason = e.reason or "unknown error"
            print(f"Warning: could not fetch {url}{path} ({e.code} {reason})", file=sys.stderr)
            return None
        sys.exit(1)
    except urllib.error.URLError as e:
        if exit_on_error:
            print(f"Failed to connect to Home Assistant at {url}: {e.reason}", file=sys.stderr)
            sys.exit(1)
        print(f"Warning: could not connect to {url}{path}: {e.reason}", file=sys.stderr)
        return None


def fetch_data(ha_url, ha_token):
    states = api_request(ha_url, ha_token, "/api/states")
    areas = api_request(ha_url, ha_token, "/api/config/area_registry/list", exit_on_error=False) or []
    entities = api_request(ha_url, ha_token, "/api/config/entity_registry/list", exit_on_error=False) or []
    return states, areas, entities


# ------------------------------------------------------------------------------
# Default config builder
# ------------------------------------------------------------------------------
PREFERRED_QUICK_CONTROLS = [
    "scene.all_lights_off",
    "scene.living_room_lights_on",
    "script.goodnight",
    "light.living_room_ceiling_fan",
]


def find_first_entity(states, domain, fallback=None):
    prefix = f"{domain}."
    for state in states:
        if state.get("entity_id", "").startswith(prefix):
            return state["entity_id"]
    return fallback


def find_temperatures(states, limit=4):
    temps = []
    for state in states:
        eid = state.get("entity_id", "")
        if not eid.startswith("sensor."):
            continue
        attrs = state.get("attributes", {})
        unit = attrs.get("unit_of_measurement", "") or ""
        device_class = attrs.get("device_class", "")
        if device_class == "temperature" or re.search(r"°[CF]|temperature", unit, re.IGNORECASE):
            temps.append(eid)
            if len(temps) >= limit:
                break
    return temps


def build_quick_controls(states, preferred, limit=4):
    state_ids = {s.get("entity_id") for s in states}
    controls = []
    for eid in preferred:
        if eid in state_ids and eid not in controls:
            controls.append(eid)
            if len(controls) >= limit:
                return controls
    # Fill remaining slots with scenes/scripts, then lights
    for domain in ("scene", "script"):
        for state in states:
            eid = state.get("entity_id", "")
            if eid.startswith(f"{domain}.") and eid not in controls:
                controls.append(eid)
                if len(controls) >= limit:
                    return controls
    for state in states:
        eid = state.get("entity_id", "")
        if eid.startswith("light.") and eid not in controls:
            controls.append(eid)
            if len(controls) >= limit:
                return controls
    return controls


def build_default_config(states, areas, entities):
    weather = find_first_entity(states, "weather", "weather.forecast_home")
    media_player = find_first_entity(states, "media_player", "")
    temperatures = find_temperatures(states, 4)
    quick_controls = build_quick_controls(states, PREFERRED_QUICK_CONTROLS, 4)
    state_ids = {s.get("entity_id") for s in states}

    section_definitions = {
        "home": ("🏠", [
            "person.woteg", "device_tracker.traviss_iphone", "weather.forecast_home"
        ]),
        "scenes": ("🎨", [
            "scene.all_lights_off", "scene.living_room_lights_on", "scene.relax_mode",
            "scene.movie_mode", "script.goodnight", "script.focus_mode"
        ]),
        "quickControls": ("🎛️", [
            "light.ceiling_fan", "light.living_room_ceiling_fan",
            "media_player.living_room_fire_tv_living_room"
        ]),
        "cameras": ("📷", [
            "camera.front_door_live_view", "camera.downstairs_live_view"
        ]),
        "security": ("🛡️", [
            "switch.front_door_motion_detection", "switch.downstairs_motion_detection",
            "sensor.front_door_battery", "sensor.downstairs_battery",
            "siren.downstairs_siren", "siren.downstairs_siren_2"
        ]),
        "environment": ("🌡️", [
            "sensor.hobeian_zg_204zx_temperature", "sensor.hobeian_zg_204zx_humidity",
            "sensor.hobeian_zg_204zx_illuminance",
            "sensor.hobeian_zg_204zx_temperature_2", "sensor.hobeian_zg_204zx_humidity_2",
            "sensor.hobeian_zg_204zx_illuminance_2"
        ]),
        "presence": ("👤", [
            "binary_sensor.hobeian_zg_204zx", "binary_sensor.hobeian_zg_204zx_2"
        ]),
        "system": ("⚙️", [
            "sensor.home_assistant_core_cpu_percent", "sensor.home_assistant_core_memory_percent",
            "sensor.ha_disk_usage", "vacuum.geordi_la_forge", "vacuum.pooper_litter_box",
            "update.home_assistant_core_update", "update.home_assistant_operating_system_update",
            "update.home_assistant_supervisor_update"
        ]),
    }
    title_map = {
        "home": "Home", "scenes": "Scenes", "quickControls": "Quick Controls",
        "cameras": "Cameras", "security": "Security", "environment": "Environment",
        "presence": "Presence", "system": "System"
    }
    sections_config = {}
    for key, (icon, candidates) in section_definitions.items():
        present = [eid for eid in candidates if eid in state_ids]
        if present:
            sections_config[key] = {"title": title_map.get(key, key), "icon": icon, "entities": present}

    return {
        "theme": {
            "backgroundImage": "",
            "accentColor": "#2dd4bf"
        },
        "layout": {
            "left": ["home", "environment", "presence"],
            "center": ["clock", "radar", "forecast"],
            "right": ["scenes", "quickControls", "security", "system", "cameras"],
            "clock24h": False
        },
        "entities": {
            "weather": weather,
            "temperatures": temperatures,
            "summaryChips": [],
            "mediaPlayer": media_player,
            "quickControls": quick_controls
        },
        "sections": sections_config,
        "dock": {
            "items": [
                {"icon": "💡", "entityId": "scene.all_lights_off", "label": "All off"},
                {"icon": "🌙", "entityId": "script.goodnight", "label": "Goodnight"},
                {"icon": "⚙️", "action": "settings", "label": "Settings"}
            ]
        }
    }


def backup_existing(path):
    if os.path.exists(path):
        backup = os.path.join(
            os.path.dirname(path),
            f"{os.path.basename(path)}.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        )
        shutil.copy2(path, backup)
        print(f"Backed up existing file to {backup}")
        return backup
    return None


def write_dashboard_files(config_json, www_root="www"):
    out_dir = os.path.join(www_root, "ai-dashboard")
    os.makedirs(out_dir, exist_ok=True)

    config_path = os.path.join(out_dir, "config.json")
    backup_existing(config_path)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_json, f, indent=2)
    print(f"Wrote config to {config_path}")

    html_path = os.path.join(out_dir, "index.html")
    backup_existing(html_path)
    with open(html_path, "w", encoding="utf-8", newline="") as f:
        f.write(DASHBOARD_HTML)
    print(f"Wrote dashboard to {html_path}")


# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
def generate(config, dry_run=False):
    states, areas, entities = fetch_data(config["ha_url"], config["ha_token"])
    default_config = build_default_config(states, areas, entities)
    if dry_run:
        print(f"Fetched {len(entities)} entities, {len(states)} states, {len(areas)} areas")
        print(f"Discovered weather: {default_config['entities']['weather']}")
        print(f"Discovered mediaPlayer: {default_config['entities']['mediaPlayer']}")
        print(f"Discovered temperatures ({len(default_config['entities']['temperatures'])}): {default_config['entities']['temperatures']}")
        print(f"Discovered quickControls ({len(default_config['entities']['quickControls'])}): {default_config['entities']['quickControls']}")
        print("Config that would be written:")
        print(json.dumps(default_config, indent=2))
    else:
        write_dashboard_files(default_config, config["www_root"])


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate AI dashboard config and HTML for Home Assistant.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch entities and print config without writing files.")
    args = parser.parse_args()

    config = get_config()
    if not config["ha_token"]:
        print("No HA_TOKEN or token.ha found.", file=sys.stderr)
        sys.exit(1)

    generate(config, dry_run=args.dry_run)
