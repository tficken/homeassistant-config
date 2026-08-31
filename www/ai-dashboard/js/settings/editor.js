// Settings editor shell: overlay open/close, tab switching, the settings
// status line, and the Data-tab actions (save/export/import/logout). Tab
// renderers live in ./layout.js, ./appearance.js, ./labels.js, ./data.js.
// Circular with config.js (saveConfig), labels.js/layout.js (buildSettings)
// and screens/index.js (renderAll) — function references at runtime only.
import { state } from '../state.js';
import { friendlyName, escapeHtml } from '../utils.js';
import { DEFAULT_CONFIG, deepMerge, migrateConfig, saveConfig, applyTheme } from '../config.js';
import { renderAll } from '../screens/index.js';
import { renderLayoutTab, initLayoutEditor } from './layout.js';
import { renderAppearanceTab, wireAppearanceTab } from './appearance.js';
import { renderLabelsTab } from './labels.js';
import { renderDataTab } from './data.js';

export function setSettingsStatus(msg) {
  const el = document.getElementById("settings-status");
  if (el) el.textContent = msg || "";
}

// ---- Settings ----

export function openSettings() {
  buildSettings();
  document.getElementById("settings-overlay").style.display = "flex";
}
export function closeSettings() {
  document.getElementById("settings-overlay").style.display = "none";
}

export const SETTINGS_TABS = ["Layout", "Appearance", "Labels", "Data"];
let settingsTab = "Layout";

export const EDITOR_SCREENS = [["home", "HOME"], ["control", "CONTROL HUB"], ["security", "SECURITY"], ["status", "STATUS MONITOR"]];
// Exported live binding: layout.js and drag.js read the current editor screen.
export let editorScreen = "home";

export function setEditorScreen(name) {
  editorScreen = name;
  buildSettings();
}

export function switchSettingsTab(name) {
  settingsTab = name;
  buildSettings();
}

export function entityOptionTags(domainFilter) {
  let list = Object.values(state.states);
  if (domainFilter) list = list.filter(s => domainFilter.includes(s.entity_id.split(".")[0]));
  return list.map(s => `<option value="${s.entity_id}">${escapeHtml(friendlyName(s.entity_id))} (${s.entity_id})</option>`).join("");
}

export function buildSettings() {
  const tabsEl = document.getElementById("settings-tabs");
  tabsEl.innerHTML = SETTINGS_TABS.map(t =>
    `<button class="btn" style="${t === settingsTab ? "border-color:var(--accent);color:var(--accent);" : ""}" onclick="switchSettingsTab('${t}')">${t}</button>`
  ).join("");
  const body = document.getElementById("settings-body");
  if (settingsTab === "Layout") {
    body.innerHTML = renderLayoutTab();
    initLayoutEditor();
  } else if (settingsTab === "Appearance") {
    body.innerHTML = renderAppearanceTab();
    wireAppearanceTab();
  } else if (settingsTab === "Labels") {
    body.innerHTML = renderLabelsTab();
  } else {
    body.innerHTML = renderDataTab();
  }
}

export async function saveSettings() {
  const accentEl = document.getElementById("cfg-accent");
  if (accentEl) state.config.theme.accentColor = accentEl.value;
  const clockEl = document.getElementById("cfg-24h");
  if (clockEl) state.config.layout.clock24h = clockEl.checked;
  const weatherEl = document.getElementById("cfg-weather");
  if (weatherEl) state.config.entities.weather = weatherEl.value || "";
  const mediaEl = document.getElementById("cfg-media");
  if (mediaEl) state.config.entities.mediaPlayer = mediaEl.value || "";
  applyTheme();
  await renderAll();
  const ok = await saveConfig();
  if (ok) {
    setSettingsStatus("");
    closeSettings();
  }
}

export function exportConfig() {
  const blob = new Blob([JSON.stringify(state.config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "dashboard-config.json"; a.click();
  URL.revokeObjectURL(url);
}

export function importConfig() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "application/json";
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const txt = await file.text();
      const data = JSON.parse(txt);
      state.config = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), data);
      migrateConfig(state.config);
      applyTheme();
      renderAll();
      buildSettings();
    } catch (e) { alert("Invalid JSON: " + e.message); }
  };
  input.click();
}

export function logout() {
  localStorage.removeItem("ha_token");
  location.reload();
}
