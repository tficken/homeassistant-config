// Layout model, default configuration, and config load/save/theme helpers.
// Calls back into settings/editor.js (setSettingsStatus) and api.js (apiCall)
// at runtime only — circular function references, no top-level reads of
// imported bindings.
import { state } from './state.js';
import { apiCall } from './api.js';
import { setSettingsStatus } from './settings/editor.js';

// Layout model: screen -> array of columns -> ordered panel ids.
// Known limitation: panels can move within/between columns of their own screen
// only — each screen's builder builds only its own panels, so moving a panel
// to a different screen (hand-edited state.config.panels) renders an empty slot there
// while effectivePanels re-appends it on its default screen.
export const DEFAULT_PANELS = {
  home:    [["clock", "presence", "lights", "oncall"], ["weather", "roomMonitors"], ["radar", "doors"]],
  control: [["scenes"], ["quickControls", "media"], ["scripts"]],
  security: [["cameras", "security"]],
  status:  [["environment"], ["system"]]
};

// Panel id -> how the panel is backed. kinds:
//   section — entities live in state.config.sections[section] (presence: title/icon from
//             sections.presence but entities from sections.home filtered to
//             person.*/device_tracker.* — see getPresenceEntities())
//   fixed   — built-in panel, not entity-editable (clock, radar)
//   entity  — single entity from state.config.entities[entityKey] (set in Appearance tab)
//   auto    — self-populating (oncall detects calendar.* entities)
export const PANEL_REGISTRY = {
  clock:        { kind: "fixed", note: "built in" },
  radar:        { kind: "fixed", note: "built in" },
  oncall:       { kind: "auto", note: "auto-detects calendar.* entities" },
  weather:      { kind: "entity", entityKey: "weather", note: "entity set in Appearance tab" },
  media:        { kind: "entity", entityKey: "mediaPlayer", note: "entity set in Appearance tab" },
  presence:     { kind: "section", section: "home", filter: "person" },
  lights:       { kind: "section", section: "lights" },
  roomMonitors: { kind: "section", section: "roomMonitors" },
  doors:        { kind: "section", section: "doors" },
  scenes:       { kind: "section", section: "scenes" },
  quickControls:{ kind: "section", section: "quickControls" },
  scripts:      { kind: "section", section: "scripts" },
  cameras:      { kind: "section", section: "cameras" },
  security:     { kind: "section", section: "security" },
  environment:  { kind: "section", section: "environment" },
  system:       { kind: "section", section: "system" }
};

// Resolve the effective layout for a screen: state.config.panels if valid, else the
// defaults; unknown panel ids dropped, missing default panels re-appended at
// their default column/index. Pure — never mutates state.config.
export function effectivePanels(screen) {
  const defaults = DEFAULT_PANELS[screen] || [];
  const raw = state.config.panels && state.config.panels[screen];
  const cols = (Array.isArray(raw) && raw.length && raw.every(Array.isArray))
    ? raw.map(col => col.filter(id => PANEL_REGISTRY[id]))
    : defaults.map(col => col.slice());
  const present = new Set(cols.flat());
  defaults.forEach((col, ci) => {
    col.forEach((id, pi) => {
      if (!present.has(id)) {
        const target = cols[ci] || (cols[ci] = []);
        target.splice(Math.min(pi, target.length), 0, id);
        present.add(id);
      }
    });
  });
  return cols;
}

// Copy the resolved layout into state.config.panels so a later save persists the full
// model (the editor calls this before its first mutation).
export function ensureConfigPanels() {
  state.config.panels = state.config.panels || {};
  for (const screen of Object.keys(DEFAULT_PANELS)) {
    state.config.panels[screen] = effectivePanels(screen).map(col => col.slice());
  }
}

// Hardcoded per-screen grid column ratios (the builders' defaults today).
// security is single-column and has no entry: width dragging is disabled there.
export const SCREEN_DEFAULT_FR = {
  home: [0.85, 1, 1.2],
  control: [1, 1, 1.1],
  status: [1, 1]
};

// Resolve the effective per-panel sizing for a screen: state.config.sizes[screen]
// validated against the effective layout — unknown/stale panel ids dropped, `h`
// clamped to the 0.25 weight floor, `full` kept only as a boolean. Pure.
export function effectiveSizes(screen) {
  const raw = (state.config.sizes && state.config.sizes[screen]) || {};
  const valid = new Set(effectivePanels(screen).flat());
  const out = {};
  for (const id of Object.keys(raw)) {
    const v = raw[id];
    if (!valid.has(id) || !v || typeof v !== "object") continue;
    const entry = {};
    if (typeof v.h === "number" && isFinite(v.h)) entry.h = Math.max(0.25, v.h);
    if (v.full === true) entry.full = true;
    if (Object.keys(entry).length) out[id] = entry;
  }
  return out;
}

// Resolve the effective grid column fr values for a screen: a valid config
// array (right length, every entry >= the 0.4 fr floor) wins, else the
// hardcoded defaults. Pure.
export function effectiveColWidths(screen) {
  const defaults = SCREEN_DEFAULT_FR[screen] || [1, 1, 1];
  const raw = state.config.colWidths && state.config.colWidths[screen];
  if (Array.isArray(raw) && raw.length === defaults.length &&
      raw.every(n => typeof n === "number" && isFinite(n) && n >= 0.4)) {
    return raw.slice();
  }
  return defaults.slice();
}

// Panel wrapper flex declaration: the `h` weight override replaces the
// builder's hardcoded default (auto-height panels become weighted on first
// drag); anything else returns the default verbatim. Builders compose this
// with their non-flex declarations.
export function panelFlex(screen, panelId, defaultFlex) {
  const s = effectiveSizes(screen)[panelId];
  if (s && typeof s.h === "number") return `flex:${s.h} 1 0;min-height:0;`;
  return defaultFlex;
}

// Backing state.config.sections key for a section-kind panel, else null. The
// presence panel's entities live in sections.home (filtered to
// person.*/device_tracker.* by getPresenceEntities()), so presence -> "home".
export function panelSection(panelId) {
  const entry = PANEL_REGISTRY[panelId];
  return entry && entry.kind === "section" ? entry.section : null;
}

export const DEFAULT_CONFIG = {
  theme: { backgroundImage: "", accentColor: "#2dd4bf" },
  panels: DEFAULT_PANELS,
  layout: { clock24h: false },
  sizes: {},
  colWidths: {},
  entities: {
    weather: "weather.forecast_home",
    mediaPlayer: "media_player.living_room_fire_tv_living_room"
  },
  sections: {
    home: { title: "Home", icon: "🏠", entities: ["person.woteg", "person.bobbie", "weather.forecast_home"] },
    scenes: { title: "Scenes", icon: "🎨", entities: ["scene.all_lights_off", "scene.relax_mode", "scene.movie_mode", "scene.focus_mode", "scene.living_room_focus_mode", "scene.living_room_relax_mode", "scene.living_room_all_lights_off"] },
    scripts: { title: "Scripts", icon: "▶️", entities: ["script.goodnight", "script.focus_mode", "script.movie_mode", "script.relax_mode", "script.pause_all_media", "script.living_room_lights_on", "script.living_room_lights_off", "script.travis_office_lights_on", "script.travis_office_lights_off", "script.goodnight_door_check", "script.goodnight_dim_lights", "script.goodnight_enable_security"] },
    quickControls: { title: "Quick Controls", icon: "🎛️", entities: ["light.ceiling_fan", "light.living_room_ceiling_fan", "light.p1s_01p00a412300832_chamber_light", "light.travis_office_p1s_uno_chamber_light"] },
    lights: { title: "Lights", icon: "💡", entities: ["light.ceiling_fan", "light.living_room_ceiling_fan"] },
    cameras: { title: "Cameras", icon: "📷", entities: ["camera.front_door_live_view", "camera.backyard_rtsp_live"], snapshot: { "camera.front_door_live_view": { preferEntity: "camera.front_door_last_recording", activityEntities: ["event.front_door_motion", "event.front_door_ding", "sensor.front_door_last_activity"] } }, livestream: { "camera.backyard_rtsp_live": "switch.downstairs_live_stream" }, history: { "camera.front_door_live_view": "front_door", "camera.backyard_rtsp_live": "backyard" } },
    security: { title: "Security", icon: "🛡️", entities: ["switch.front_door_motion_detection", "switch.downstairs_motion_detection", "sensor.front_door_battery", "sensor.downstairs_battery", "siren.downstairs_siren", "siren.downstairs_siren_2", "sensor.front_door_last_activity", "sensor.downstairs_last_activity"] },
    doors: { title: "Doors", icon: "🚪", entities: ["binary_sensor.living_room_front_door", "binary_sensor.backdoor"] },
    roomMonitors: { title: "Room Monitors", icon: "🌡️", entities: ["sensor.hobeian_zg_204zx_temperature", "sensor.hobeian_zg_204zx_humidity", "sensor.hobeian_zg_204zx_temperature_2", "sensor.hobeian_zg_204zx_humidity_2"] },
    environment: { title: "Environment", icon: "🌡️", entities: ["sensor.hobeian_zg_204zx_temperature", "sensor.hobeian_zg_204zx_humidity", "sensor.hobeian_zg_204zx_illuminance", "sensor.hobeian_zg_204zx_temperature_2", "sensor.hobeian_zg_204zx_humidity_2", "sensor.hobeian_zg_204zx_illuminance_2"] },
    presence: { title: "Presence", icon: "👤", entities: ["binary_sensor.hobeian_zg_204zx", "binary_sensor.hobeian_zg_204zx_2"] },
    system: { title: "System", icon: "⚙️", entities: ["sensor.home_assistant_core_cpu_percent", "sensor.home_assistant_core_memory_percent", "sensor.ha_disk_usage", "vacuum.geordi_la_forge", "vacuum.pooper_litter_box", "update.home_assistant_core_update", "update.home_assistant_operating_system_update", "update.home_assistant_supervisor_update"] }
  },
  dock: { items: [{ icon: "⚙️", action: "settings", label: "Settings" }] },
  // Idle / night mode (see js/components/night-mode.js).
  idle: { returnHomeSeconds: 60, nightStart: "22:00", nightEnd: "07:00" },
  // Event-triggered camera popups (see js/components/event-popup.js).
  eventPopups: [
    {
      events: ["event.front_door_ding", "event.front_door_motion"],
      camera: "camera.front_door_live_view",
      title: "FRONT DOOR",
      timeout: 30
    }
  ],
  // Config-driven alert rules for the Home banner (see getAlerts() in screens/home.js).
  // Each rule: entity + one condition (above/below for numeric states, equals for
  // string states) + a label template where {state} interpolates the current state.
  alerts: [
    { entity: "sensor.ha_last_backup_age", above: 8, label: "Backup is {state}d old" },
    { entity: "sensor.ha_disk_usage", above: 85, label: "Disk {state}% full" },
    { entity: "binary_sensor.exos_router_wan_status", equals: "off", label: "Internet down" }
  ]
};

export function deepMerge(target, ...sources) {
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

export async function loadConfig() {
  let fileConfig = {};
  try {
    const r = await fetch("config.json", { cache: "no-store" });
    if (r.ok) fileConfig = await r.json();
  } catch (e) {}
  const cfg = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), fileConfig);
  migrateConfig(cfg);
  return cfg;
}

export function migrateConfig(cfg) {
  if (cfg.entities && Array.isArray(cfg.entities.quickControls)) {
    const legacy = cfg.entities.quickControls;
    if (legacy.length &&
        (!cfg.sections.quickControls || !Array.isArray(cfg.sections.quickControls.entities) || !cfg.sections.quickControls.entities.length)) {
      cfg.sections.quickControls = cfg.sections.quickControls || { title: "Quick Controls", icon: "🎛️", entities: [] };
      cfg.sections.quickControls.entities = legacy;
    }
    delete cfg.entities.quickControls;
  }
  delete cfg.sectionOrder; // superseded by state.config.panels
}

// Drop sizes entries for panel ids no longer on their screen and empty
// per-screen buckets, so stale config doesn't accumulate across saves.
function pruneSizes() {
  const sizes = state.config.sizes;
  if (sizes && typeof sizes === "object") {
    for (const screen of Object.keys(sizes)) {
      const valid = new Set(effectivePanels(screen).flat());
      const bucket = sizes[screen];
      if (!bucket || typeof bucket !== "object") { delete sizes[screen]; continue; }
      for (const id of Object.keys(bucket)) {
        if (!valid.has(id)) delete bucket[id];
      }
      if (!Object.keys(bucket).length) delete sizes[screen];
    }
  }
  const cw = state.config.colWidths;
  if (cw && typeof cw === "object") {
    for (const screen of Object.keys(cw)) {
      if (!DEFAULT_PANELS[screen]) delete cw[screen];
    }
  }
}

export async function saveConfig() {
  pruneSizes();
  const res = await apiCall("POST", "/ai-dashboard/api/config", state.config);
  if (res && res.success === true) return true;
  setSettingsStatus("SAVE FAILED — changes are live but not persisted. Use Data > Export JSON as a backup.");
  return false;
}

export function applyTheme() {
  const accent = state.config.theme.accentColor || DEFAULT_CONFIG.theme.accentColor;
  document.documentElement.style.setProperty("--accent", accent);
}
