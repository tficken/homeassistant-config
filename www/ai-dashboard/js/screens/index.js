// Cross-screen shell: dock rendering, grid assembly (assembleColumns), screen
// switching (showScreen), per-entity incremental card updates (updateCard /
// updateEntityCardInPlace / entityBelongsToScreen), renderAll, and the clock.
// The four screen modules import assembleColumns/measureClock back from here —
// runtime-only circular function references, no top-level reads of bindings.
import { state } from '../state.js';
import { escapeHtml, sectionTitle, recentDoorIds } from '../utils.js';
import { PANEL_REGISTRY, effectivePanels } from '../config.js';
import { startLivestreamCameras, stopLivestreamCameras } from '../cameras.js';
import { renderTerminalPanel } from '../components/panels.js';
import { renderLightCard, renderSwitchCard, renderMetricCard, renderMediaCard } from '../components/cards.js';
import { lightModalEntity, renderLightModal } from '../components/light-modal.js';
import { printerModalPrefix, renderPrinterModal } from '../components/printer-modal.js';
import { renderHomeScreen, getPresenceEntities, renderDoors } from './home.js';
import { renderControlScreen } from './control.js';
import { renderSecurityScreen } from './security.js';
import { renderStatusScreen } from './status.js';

export function renderBottomButton(label, target, active = false) {
  const cls = active ? "bottom-btn active-dock-btn" : "bottom-btn";
  return `<button class="${cls}" onclick="showScreen('${target}')">${escapeHtml(label)}</button>`;
}

export function renderDockItem(item) {
  const icon = item.icon ? escapeHtml(item.icon) + " " : "";
  const label = escapeHtml(item.label || item.entityId || "");
  if (item.action === "settings") {
    return `<button class="bottom-btn" onclick="openSettings()">${icon}${label}</button>`;
  }
  if (item.entityId) {
    return `<button class="bottom-btn" onclick="toggleEntity('${item.entityId}')">${icon}${label}</button>`;
  }
  return "";
}

export function renderDock() {
  const screens = renderBottomButton("HOME", "home", state.currentScreen === "home") +
    renderBottomButton("CONTROL HUB", "control", state.currentScreen === "control") +
    renderBottomButton("SECURITY", "security", state.currentScreen === "security") +
    renderBottomButton("STATUS MONITOR", "status", state.currentScreen === "status");
  const items = ((state.config.dock && state.config.dock.items) || []).map(renderDockItem).join("");
  return screens + items;
}

// Assemble a screen grid from prebuilt panel HTML. `columns` is an array of
// columns, each an ordered array of panel ids; every panel string's outermost
// element carries data-panel-id (inert live, used by the layout editor). The
// outer grid div carries data-screen-grid so the editor's overflow check can
// measure the live grid's available height.
export function assembleColumns(panelHtml, columns, gridStyle, colStyles) {
  const cols = columns.map((col, i) =>
    `<div style="${colStyles[i]}">${col.map(id => panelHtml[id] || "").join("")}</div>`
  ).join("");
  return `<div data-screen-grid style="${gridStyle}">${cols}</div>`;
}

export async function showScreen(name) {
  const prevScreen = state.currentScreen;
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  const target = document.getElementById(name + "-screen");
  if (!target) return;
  target.classList.add("active");
  state.currentScreen = name;
  if (prevScreen === "security" && name !== "security") stopLivestreamCameras();
  document.getElementById("dock").innerHTML = renderDock();
  if (name === "home") renderHomeScreen();
  else if (name === "control") renderControlScreen();
  else if (name === "security") { renderSecurityScreen(); startLivestreamCameras(); }
  else if (name === "status") await renderStatusScreen();
}

export function entityBelongsToScreen(entityId, screen) {
  // Base membership derives from the effective panel layout, so moved panels
  // keep receiving in-place card updates on their new screen.
  const ids = [];
  for (const col of effectivePanels(screen)) {
    for (const pid of col) {
      const p = PANEL_REGISTRY[pid];
      if (!p) continue;
      if (p.kind === "section") {
        ids.push(...(pid === "presence"
          ? getPresenceEntities()
          : ((state.config.sections[p.section] && state.config.sections[p.section].entities) || [])));
      } else if (p.kind === "entity" && state.config.entities[p.entityKey]) {
        ids.push(state.config.entities[p.entityKey]);
      }
    }
  }
  if (ids.includes(entityId)) return true;
  if (screen === "home") {
    if (entityId.startsWith("calendar.")) return true;
    const sec = (state.config.sections.security && state.config.sections.security.entities) || [];
    const sys = (state.config.sections.system && state.config.sections.system.entities) || [];
    if (sec.includes(entityId) || sys.includes(entityId)) return true;
  }
  if (screen === "status" && entityId.startsWith("sensor.") &&
      (entityId.endsWith("_print_status") || entityId.includes("print_progress") || entityId.includes("remaining_time"))) {
    return true;
  }
  return false;
}

export function updateEntityCardInPlace(entityId) {
  // Scope the lookup to the active screen: inactive screens keep their last-rendered
  // HTML in the DOM, so a document-wide query could match a hidden screen's card.
  const screenEl = document.getElementById(state.currentScreen + "-screen");
  if (!screenEl) return false;
  const el = screenEl.querySelector(`[data-entity-id="${CSS.escape(entityId)}"]`);
  const domain = entityId.split(".")[0];
  if (state.currentScreen === "home") {
    if (domain === "calendar") return false; // on-call panel appears/disappears: structural
    const doors = (state.config.sections.doors && state.config.sections.doors.entities) || [];
    if (doors.includes(entityId)) {
      const panel = document.getElementById("doors-panel");
      if (!panel) return false;
      panel.innerHTML = renderTerminalPanel(sectionTitle("doors"), renderDoors());
      state.lastRecentDoorKey = recentDoorIds().join(",");
      return true;
    }
    // Home light tiles update in place so a toggle doesn't rebuild the whole
    // screen (and the radar map with it).
    const homeLights = (state.config.sections.lights && state.config.sections.lights.entities) || [];
    if (homeLights.includes(entityId) && el) {
      el.outerHTML = renderLightCard(entityId);
      return true;
    }
    // Weather panel, presence cards (battery reads sibling sensors), and room
    // monitors (per-area cells, not per-entity) are not addressable per entity.
    return false;
  }
  if (!el) return false;
  // Never yank the DOM out from under an active slider drag. Only guard range
  // inputs — a just-clicked button keeps focus too, and skipping its re-render
  // would leave the ON/OFF label stale.
  const ae = document.activeElement;
  if (ae && ae.tagName === "INPUT" && ae.type === "range" && el.contains(ae)) return true;
  let html = null;
  if (state.currentScreen === "control") {
    if (domain === "light") html = renderLightCard(entityId);
    else if (domain === "switch") html = renderSwitchCard(entityId);
    else if (entityId === (state.config.entities.mediaPlayer || "")) html = renderMediaCard(entityId);
  } else if (state.currentScreen === "security") {
    if (["sensor", "binary_sensor"].includes(domain)) html = renderMetricCard(entityId);
    // switch/siren/button/script render as scene-btns without data-entity-id: structural fallback
  } else if (state.currentScreen === "status") {
    // Env metrics embed sparklines; printer cards read sibling sensors;
    // vacuum cards exist but printer progress must not be missed: keep fallback.
    return false;
  }
  if (html) {
    el.outerHTML = html;
    return true;
  }
  return false;
}

export async function updateCard(st) {
  if (lightModalEntity === st.entity_id) renderLightModal();
  if (printerModalPrefix) {
    const slug = st.entity_id.split(".")[1];
    if (slug && slug.startsWith(printerModalPrefix)) renderPrinterModal();
  }
  if (!entityBelongsToScreen(st.entity_id, state.currentScreen)) return;
  if (updateEntityCardInPlace(st.entity_id)) return;
  if (state.currentScreen === "home") renderHomeScreen();
  else if (state.currentScreen === "control") renderControlScreen();
  else if (state.currentScreen === "security") renderSecurityScreen();
  else if (state.currentScreen === "status") await renderStatusScreen();
}

export async function renderAll() {
  if (state.currentScreen === "home") renderHomeScreen();
  else if (state.currentScreen === "control") renderControlScreen();
  else if (state.currentScreen === "security") renderSecurityScreen();
  else if (state.currentScreen === "status") await renderStatusScreen();
  updateClock();
}

export function measureClock() {
  const el = document.getElementById("clock");
  if (!el) { state.clockFontSize = null; return; }
  // Fit the time on one line: start from the clamp(4rem, 9vw, 6.5rem) size,
  // then shrink proportionally until it fits the column width.
  const preferred = Math.min(Math.max(64, window.innerWidth * 0.09), 104);
  el.style.fontSize = preferred + "px";
  const avail = el.parentElement.clientWidth - 16;
  const need = el.scrollWidth;
  state.clockFontSize = need > avail && need > 0 ? Math.max(28, Math.floor(preferred * avail / need)) : preferred;
  el.style.fontSize = state.clockFontSize + "px";
}

export function updateClock() {
  const now = new Date();
  const opts = state.config.layout.clock24h ? { hour: "2-digit", minute: "2-digit", hour12: false } : { hour: "numeric", minute: "2-digit" };
  const el = document.getElementById("clock");
  if (el) {
    const timeStr = now.toLocaleTimeString([], opts);
    el.innerHTML = escapeHtml(timeStr).replace(/:/g, '<span class="colon">:</span>');
    if (state.clockFontSize != null) el.style.fontSize = state.clockFontSize + "px";
  }
  const d = document.getElementById("date");
  if (d) d.textContent = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
}
