import './globals.js';
import { state } from './state.js';
import { friendlyName, entityArea, escapeHtml, refreshDoorRecency } from './utils.js';
import { PANEL_REGISTRY, DEFAULT_CONFIG, effectivePanels, ensureConfigPanels, panelSection,
  deepMerge, loadConfig, migrateConfig, saveConfig, applyTheme } from './config.js';
import { fetchHAConfig, refreshForecast } from './api.js';
import { connect } from './connection.js';
import { refreshCameraSnapshot, snapshotLastActivityMs,
  SNAPSHOT_IDLE_EVENT_WINDOW_MS, SNAPSHOT_IDLE_POLL_MS, SNAPSHOT_CHECK_MS } from './cameras.js';
import { buildHomePanels } from './screens/home.js';
import { buildControlPanels } from './screens/control.js';
import { buildSecurityPanels } from './screens/security.js';
import { buildStatusPanels } from './screens/status.js';
import { renderDock, showScreen, renderAll, updateClock, measureClock } from './screens/index.js';

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

const SETTINGS_TABS = ["Layout", "Appearance", "Labels", "Data"];
let settingsTab = "Layout";

const EDITOR_SCREENS = [["home", "HOME"], ["control", "CONTROL HUB"], ["security", "SECURITY"], ["status", "STATUS MONITOR"]];
let editorScreen = "home";

export function setEditorScreen(name) {
  editorScreen = name;
  buildSettings();
}

export function switchSettingsTab(name) {
  settingsTab = name;
  buildSettings();
}

function entityOptionTags(domainFilter) {
  let list = Object.values(state.states);
  if (domainFilter) list = list.filter(s => domainFilter.includes(s.entity_id.split(".")[0]));
  return list.map(s => `<option value="${s.entity_id}">${escapeHtml(friendlyName(s.entity_id))} (${s.entity_id})</option>`).join("");
}

function buildSettings() {
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

function renderAppearanceTab() {
  return `
    <div class="settings-section" style="margin-bottom:22px;"><h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">Appearance</h3>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">Accent color</label><input id="cfg-accent" type="color" value="${state.config.theme.accentColor}"></div>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">24-hour clock</label><input id="cfg-24h" type="checkbox" ${state.config.layout.clock24h ? "checked" : ""}></div>
    </div>
    <div class="settings-section" style="margin-bottom:22px;"><h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">Layout</h3>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">Weather entity</label><select id="cfg-weather"><option value="">-- none --</option>${entityOptionTags(["weather"])}</select></div>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">Media player</label><select id="cfg-media"><option value="">-- none --</option>${entityOptionTags(["media_player"])}</select></div>
    </div>
  `;
}

function wireAppearanceTab() {
  document.getElementById("cfg-weather").value = state.config.entities.weather || "";
  document.getElementById("cfg-media").value = state.config.entities.mediaPlayer || "";
}

function renderLabelsTab() {
  const labels = state.config.labels || {};
  const rows = Object.keys(labels).sort().map(id => `
    <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
      <span style="flex:1;min-width:200px;font-size:0.85rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(id)}">${escapeHtml(id)}</span>
      <input value="${escapeHtml(labels[id])}" onchange="setLabelOverride('${escapeHtml(id)}', this.value)" style="min-width:180px;">
      <button class="btn" onclick="removeLabelOverride('${escapeHtml(id)}')">×</button>
    </div>`).join("");
  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">Label overrides</h3>
      <p style="color:var(--text-muted);font-size:0.85rem;">Override the display name shown for an entity anywhere on the dashboard. Clear a label's text (or press ×) to remove the override.</p>
      ${rows || "<p style='color:var(--text-muted);font-size:0.85rem;'>No label overrides yet.</p>"}
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-top:12px;flex-wrap:wrap;">
        <select id="cfg-label-entity" style="min-width:220px;"><option value="">-- pick entity --</option>${entityOptionTags(null)}</select>
        <input id="cfg-label-text" placeholder="Display label" style="min-width:180px;">
        <button class="btn" onclick="addLabelOverride()">Add</button>
      </div>
    </div>
  `;
}

export function setLabelOverride(id, value) {
  state.config.labels = state.config.labels || {};
  if (value) state.config.labels[id] = value;
  else delete state.config.labels[id];
  renderAll();
}

export function removeLabelOverride(id) {
  if (state.config.labels) delete state.config.labels[id];
  renderAll();
  buildSettings();
}

export function addLabelOverride() {
  const sel = document.getElementById("cfg-label-entity");
  const txt = document.getElementById("cfg-label-text");
  if (!sel || !sel.value) return;
  if (txt && txt.value) {
    state.config.labels = state.config.labels || {};
    state.config.labels[sel.value] = txt.value;
  }
  renderAll();
  buildSettings();
}

function renderDataTab() {
  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <p style="color:var(--text-muted);font-size:0.85rem;">Settings are saved to <code>config.json</code> on the server when you press Save &amp; Apply, and shared by every device that opens this dashboard. Export keeps a local backup file.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <button class="btn" onclick="exportConfig()">Export JSON</button>
        <button class="btn" onclick="importConfig()">Import JSON</button>
      </div>
      <button class="btn" onclick="logout()" style="background:rgba(248,113,113,0.15);border-color:rgba(248,113,113,0.3);">Clear token &amp; reload</button>
    </div>
  `;
}

let paletteFilter = "";
let paletteNewOnly = false;

function sectionOfEntity(id) {
  for (const key of Object.keys(state.config.sections || {})) {
    const ents = state.config.sections[key].entities || [];
    if (ents.includes(id)) return key;
  }
  return null;
}

function renderPaletteList() {
  const f = (paletteFilter || "").toLowerCase();
  const referenced = collectReferencedIds();
  const ids = Object.values(state.states)
    .map(s => s.entity_id)
    .filter(id => NEW_DEVICE_DOMAINS.includes(id.split(".")[0]))
    .filter(id => !paletteNewOnly || !referenced.has(id))
    .filter(id => !f || id.toLowerCase().includes(f) ||
      friendlyName(id).toLowerCase().includes(f) ||
      (entityArea(id) || "").toLowerCase().includes(f))
    .sort((a, b) => friendlyName(a).localeCompare(friendlyName(b)));
  const groups = {};
  for (const id of ids) {
    const area = entityArea(id) || "No area";
    (groups[area] = groups[area] || []).push(id);
  }
  const html = Object.keys(groups).sort().map(area => `
    <div style="margin-bottom:8px;">
      <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--green);margin:6px 0 2px;">${escapeHtml(area)}</div>
      ${groups[area].map(id => `
        <div class="palette-chip${referenced.has(id) ? " on-board" : ""}" data-entity="${escapeHtml(id)}" title="${escapeHtml(id)}">
          <span class="drag-handle" data-drag-palette title="Drag onto a section">⠿</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(friendlyName(id))}</span>
          ${referenced.has(id) ? '<span style="color:var(--green);font-size:0.65rem;flex-shrink:0;" title="On dashboard">●</span>' : ""}
        </div>`).join("")}
    </div>`).join("");
  return html || "<p style='color:var(--text-muted);font-size:0.85rem;'>No matching entities.</p>";
}

function renderLayoutTab() {
  const missing = computeMissingEntities();
  const missingBlock = missing.length ? `
    <div style="border:1px solid rgba(255,51,51,0.4);border-radius:6px;padding:8px;margin-bottom:8px;flex-shrink:0;">
      <div style="color:var(--danger);font-size:0.72rem;margin-bottom:4px;letter-spacing:0.06em;">MISSING (${missing.length}) — no longer in Home Assistant</div>
      ${missing.map(id => `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:0.78rem;padding:2px 0;">
        <span style="color:var(--danger);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(id)}</span>
        <button class="btn" style="padding:1px 8px;" onclick="removeMissingEntity('${escapeHtml(id)}')" title="Remove from config">×</button>
      </div>`).join("")}
    </div>` : "";
  const previewTabs = EDITOR_SCREENS.map(([id, label]) =>
    `<button class="btn" style="${id === editorScreen ? "border-color:var(--accent);color:var(--accent);" : ""}" onclick="setEditorScreen('${id}')">${label}</button>`
  ).join("");
  return `
    <div style="display:flex;gap:14px;height:100%;min-height:0;">
      <div id="palette" style="width:290px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;border:1px solid var(--border);border-radius:6px;padding:10px;">
        <input id="palette-filter" placeholder="Filter by name, id, or area..." value="${escapeHtml(paletteFilter)}" style="margin-bottom:8px;flex-shrink:0;">
        <label style="font-size:0.78rem;color:var(--text-muted);display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-shrink:0;cursor:pointer;">
          <input type="checkbox" id="palette-newonly" ${paletteNewOnly ? "checked" : ""}> only entities not on dashboard
        </label>
        ${missingBlock}
        <div id="palette-list" style="overflow-y:auto;flex:1;min-height:0;">${renderPaletteList()}</div>
        <p style="color:var(--text-muted);font-size:0.72rem;margin:8px 0 0;flex-shrink:0;">Drag an entity onto a panel to add it. Drag a card back here to remove it.</p>
      </div>
      <div id="preview" style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;">
        <div id="preview-tabs" style="display:flex;gap:8px;margin-bottom:8px;flex-shrink:0;">${previewTabs}</div>
        <div id="preview-stage" style="flex:1;min-height:0;overflow:auto;border:1px solid var(--border);border-radius:6px;padding:10px;">
          <div id="preview-stage-inner"></div>
        </div>
      </div>
    </div>`;
}

function initLayoutEditor() {
  const filterEl = document.getElementById("palette-filter");
  const newOnlyEl = document.getElementById("palette-newonly");
  const refresh = () => {
    paletteFilter = filterEl ? filterEl.value : "";
    paletteNewOnly = newOnlyEl ? newOnlyEl.checked : false;
    const list = document.getElementById("palette-list");
    if (list) list.innerHTML = renderPaletteList();
    initPreviewDrag();
  };
  if (filterEl) filterEl.addEventListener("input", refresh);
  if (newOnlyEl) newOnlyEl.addEventListener("change", refresh);
  initPreviewDrag();
  renderEditorPreview();
}

// Kill duplicate-id interference with the live #clock/#radar-map/#doors-panel
// and neutralize inline onclick/onchange handlers inside the preview. Live
// camera streams are swapped for their current still so the preview doesn't
// open duplicate MJPEG streams.
function sanitizePreviewHtml(html) {
  return html
    .replace(/ id="/g, ' data-pid="')
    .replace(/ on\w+="[^"]*"/g, "")
    .replace(/src="\/(?:api\/camera_proxy_stream|ai-dashboard\/cam_stream)\/([^"?]+)[^"]*"/g, (m, eid) => {
      const st = state.states[eid];
      const pic = st && st.attributes && st.attributes.entity_picture;
      return pic ? `src="${pic}"` : m;
    });
}

const PREVIEW_BUILDERS = {
  home: buildHomePanels,
  control: buildControlPanels,
  security: buildSecurityPanels,
  status: buildStatusPanels
};

// Build the editorScreen's HTML at real pixel size and display it scaled to
// fit the stage. Fire-and-forget from initLayoutEditor; re-wires drag handlers
// once the preview DOM exists.
async function renderEditorPreview() {
  const screen = editorScreen;
  const stage = document.getElementById("preview-stage");
  const inner = document.getElementById("preview-stage-inner");
  if (!stage || !inner) return;
  const build = PREVIEW_BUILDERS[screen] || buildHomePanels;
  const b = await build();
  // Bail if a tab switch re-rendered the settings body while we awaited.
  if (editorScreen !== screen || !inner.isConnected) return;
  // Hidden screens report clientWidth 0 (display:none); fall back to the
  // active screen, which shares the same container and therefore width.
  const live = document.getElementById(screen + "-screen");
  let w = live ? live.clientWidth : 0;
  if (!w) {
    const active = document.querySelector(".screen.active");
    w = active && active.clientWidth ? active.clientWidth : stage.clientWidth;
  }
  // Assemble inline (assembleColumns' signature stays untouched) so each
  // column div carries data-preview-col for panel drop targeting.
  const colsHtml = effectivePanels(screen).map((col, i) =>
    `<div data-preview-col="${i}" style="${b.colStyles[i]}">${col.map(id => b.panels[id] || "").join("")}</div>`
  ).join("");
  // Sanitize once and share the exact same HTML with the hidden measure
  // container so overflow math reflects the current (post-edit) effective
  // layout, never a stale cache.
  const sanitized = sanitizePreviewHtml(`<div style="${b.gridStyle}">${colsHtml}</div>`);
  inner.style.width = w + "px";
  inner.innerHTML = sanitized;
  // Scale against the stage's content-box width so the stage padding doesn't
  // bake in horizontal overflow.
  const stageStyle = getComputedStyle(stage);
  const stageContentW = stage.clientWidth - parseFloat(stageStyle.paddingLeft) - parseFloat(stageStyle.paddingRight);
  const k = Math.min(1, stageContentW / w);
  inner.style.transform = `scale(${k})`;
  inner.style.transformOrigin = "top left";
  // transform doesn't affect layout: shrink the layout box to the scaled
  // footprint or the stage shows scrollbars/dead space around the preview.
  inner.style.height = (inner.scrollHeight * k) + "px";
  decoratePreviewPanels(inner);
  if (window.updateOverflowBadges) window.updateOverflowBadges(sanitized, w);
  initPreviewDrag();
}

// Measured overflow warning for the layout preview. Recomputes on every
// renderEditorPreview (editor open, tab switch, every edit).
//
// IMPORTANT: all offsetHeight reads happen on the persistent hidden
// #preview-measure container — a 1.0-scale offscreen clone of the preview HTML
// — never on the scaled preview DOM. transform: scale() does not affect layout,
// so measuring the scaled DOM would technically give the same numbers, but
// injecting/clearing badges in the visible preview while reading heights from
// it would invite layout thrash and feedback loops; the offscreen clone keeps
// measurement and badge mutation fully separate.
//
// Caveat: the measurement reflects CURRENT content only. It cannot predict
// future states — e.g. printer cards that appear mid-print or the on-call panel
// that appears when a shift starts — so a layout that fits now may overflow
// later, and one that overflows now may be fine in practice.
function updateOverflowBadges(html, width) {
  const inner = document.getElementById("preview-stage-inner");
  if (!inner) return;
  // Clear previous badges/classes at the start of each recompute.
  inner.querySelectorAll(".overflow-badge").forEach(el => el.remove());
  inner.querySelectorAll("[data-preview-col].preview-overflow")
    .forEach(col => col.classList.remove("preview-overflow"));

  // Persistent hidden measure container, created once. visibility:hidden keeps
  // it laid out (measurable) but invisible; left:-10000px keeps it offscreen.
  let measure = document.getElementById("preview-measure");
  if (!measure) {
    measure = document.createElement("div");
    measure.id = "preview-measure";
    measure.setAttribute("aria-hidden", "true");
    measure.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden;";
    document.body.appendChild(measure);
  }

  // Width fallback mirrors renderEditorPreview: a hidden screen (display:none)
  // reports clientWidth 0, so fall back to the active screen, which shares the
  // same container and therefore width.
  const live = document.getElementById(editorScreen + "-screen");
  let w = width || (live ? live.clientWidth : 0);
  if (!w) {
    const active = document.querySelector(".screen.active");
    w = active && active.clientWidth ? active.clientWidth : 0;
  }
  // Available height = the live grid's clientHeight (the grid is the flex:1
  // child of the screen, so this already excludes dock/banner/alert chrome).
  // Same hidden-screen caveat as width: fall back to the active screen's grid —
  // same flex container, so same height (unless home's alert banner is showing,
  // in which case the fallback is only approximate).
  let grid = live ? live.querySelector("[data-screen-grid]") : null;
  let avail = grid ? grid.clientHeight : 0;
  if (!avail) {
    const activeGrid = document.querySelector(".screen.active [data-screen-grid]");
    avail = activeGrid ? activeGrid.clientHeight : 0;
  }
  if (!w || !avail) return; // nothing reliable to measure against; skip badging

  measure.style.width = w + "px";
  // `html` is the pristine sanitized render passed by renderEditorPreview.
  // inner.innerHTML is only a defensive fallback (it includes editor
  // affordances like × buttons/entity strips, which would skew heights).
  measure.innerHTML = html || inner.innerHTML;

  const previewCols = inner.querySelectorAll("[data-preview-col]");
  measure.querySelectorAll("[data-preview-col]").forEach((mcol, i) => {
    const panels = mcol.querySelectorAll(":scope > [data-panel-id]");
    if (!panels.length) return;
    // Sum panel heights + inter-panel gaps. Parse the computed row-gap so the
    // math stays honest if the column CSS changes (NaN for "normal" -> 14px,
    // the dashboard's standard gap).
    let gap = parseFloat(getComputedStyle(mcol).rowGap);
    if (Number.isNaN(gap)) gap = 14;
    let sum = gap * (panels.length - 1);
    panels.forEach(p => { sum += p.offsetHeight; });
    const over = sum - avail;
    if (over > 0 && previewCols[i]) {
      const n = Math.ceil(over / 10) * 10;
      previewCols[i].classList.add("preview-overflow");
      const badge = document.createElement("div");
      badge.className = "overflow-badge";
      badge.style.cssText = "background:rgba(255,174,0,0.15);border:1px solid var(--amber);color:var(--amber);font-family:var(--font-mono);font-size:0.7rem;padding:3px 8px;margin-bottom:6px;";
      badge.textContent = `⚠ overflows by ~${n}px`;
      previewCols[i].insertBefore(badge, previewCols[i].firstChild);
    }
  });
}

function applyPanelDrop(panelId, target) {
  ensureConfigPanels();
  const cols = state.config.panels[editorScreen];
  if (!cols) return;
  const targetPanelId = target.getAttribute("data-panel-id");
  const colEl = target.closest("[data-preview-col]");
  if (!colEl) return;
  const dest = cols[parseInt(colEl.getAttribute("data-preview-col"), 10)];
  if (!dest) return;
  for (const col of cols) {
    const i = col.indexOf(panelId);
    if (i !== -1) col.splice(i, 1);
  }
  let index = targetPanelId ? dest.indexOf(targetPanelId) : -1;
  if (index === -1) index = dest.length;
  dest.splice(index, 0, panelId);
  renderAll();
  buildSettings();
}

function refreshEditorAfterEdit() {
  renderAll();
  buildSettings();
}

// Entity chip for the aggregated-panel footer strip — same markup as the old
// board's chips (drag-handle + name + ×), but wired via listeners because the
// preview HTML is sanitized of inline handlers. The × carries .preview-remove
// so the stage click-capture guard lets it through.
function buildEntityChip(section, id) {
  const chip = document.createElement("span");
  chip.className = "entity-chip";
  chip.setAttribute("data-section", section);
  chip.setAttribute("data-entity", id);
  chip.title = id;
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.title = "Drag to reorder, move, or drag back to the palette to remove";
  handle.textContent = "⠿";
  chip.appendChild(handle);
  chip.appendChild(document.createTextNode(friendlyName(id) + " "));
  const btn = document.createElement("button");
  btn.className = "preview-remove";
  btn.setAttribute("data-entity", id);
  btn.textContent = "×";
  btn.addEventListener("click", ev => {
    ev.stopPropagation();
    removeSectionEntity(section, id);
  });
  chip.appendChild(btn);
  return chip;
}

// Click a section-kind panel's title to edit its icon/title inline (same input
// pattern as the old board header). Blur without a change restores the title.
// The key is the panel id itself: builders render sectionTitle(<panelId>), so
// the presence panel edits state.config.sections.presence, NOT home.
function wireTitleEdit(title, key) {
  if (title.dataset.editWired) return;
  title.dataset.editWired = "1";
  title.addEventListener("click", () => {
    if (title.querySelector("input")) return; // already editing
    const sec = state.config.sections[key] || {};
    const original = title.innerHTML;
    const iconInput = document.createElement("input");
    iconInput.value = sec.icon || "";
    iconInput.style.cssText = "width:42px;text-align:center;padding:4px;";
    iconInput.title = "Section icon";
    const titleInput = document.createElement("input");
    titleInput.value = sec.title || key;
    titleInput.style.cssText = "flex:1;min-width:80px;padding:4px 8px;";
    titleInput.title = "Section title";
    title.textContent = "";
    title.appendChild(iconInput);
    title.appendChild(titleInput);
    titleInput.focus();
    titleInput.select();
    let changed = false;
    iconInput.addEventListener("change", () => { changed = true; setSectionProp(key, "icon", iconInput.value); });
    titleInput.addEventListener("change", () => { changed = true; setSectionProp(key, "title", titleInput.value); });
    const onFocusOut = () => {
      // Defer so focus moving between the two inputs doesn't restore early.
      setTimeout(() => {
        if (title.contains(document.activeElement)) return;
        title.removeEventListener("focusout", onFocusOut);
        if (changed) buildSettings();
        else title.innerHTML = original;
      }, 0);
    };
    title.addEventListener("focusout", onFocusOut);
  });
}

// Post-render editor affordances on the scaled preview: × remove overlays on
// section-backed entity cards, registry note chips on fixed/auto/entity panel
// titles, footer entity strips for aggregated panels (roomMonitors renders
// per-area data-room cells, not per-entity cards), and inline title/icon
// editing on section-kind panel titles. Runs on the sanitized DOM, so every
// handler is attached with addEventListener.
function decoratePreviewPanels(inner) {
  const weatherMedia = new Set([
    state.config.entities && state.config.entities.weather,
    state.config.entities && state.config.entities.mediaPlayer
  ].filter(Boolean));
  inner.querySelectorAll("[data-panel-id]").forEach(panel => {
    const panelId = panel.getAttribute("data-panel-id");
    const entry = PANEL_REGISTRY[panelId];
    if (!entry) return;
    // The panel's own title chrome only — skip .panel-title elements hosted by
    // entity cards inside the panel (camera feed cards render their own name
    // titles; the cameras panel itself has no title, so it gets no note chip
    // or title editing — panel dragging still works via the cards' titles).
    let title = [...panel.querySelectorAll(".panel-title")].find(t => !t.closest("[data-entity-id]"));
    if (!title && !panel.querySelector(".panel-title")) {
      // Headerless panel (no .panel-title anywhere — the clock today; cameras
      // is deliberately excluded: its card-hosted titles are the drag handles
      // by design). Inject an editor-only handle bar with the panel name so
      // the existing [data-panel-id] .panel-title drag wiring and note-chip
      // logic below pick it up. Preview-only chrome — live builder markup is
      // untouched, so the live screens stay pixel-identical.
      const handle = document.createElement("div");
      handle.className = "panel-title preview-injected-handle";
      handle.style.cssText = "color:var(--text-muted);font-size:0.7rem;font-family:var(--font-mono);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;";
      handle.textContent = panelId;
      panel.prepend(handle);
      title = handle;
    }
    if (entry.note && title && !title.querySelector(".preview-note")) {
      const note = document.createElement("span");
      note.className = "preview-note";
      note.style.cssText = "color:var(--text-muted);font-size:0.65rem;margin-left:8px;";
      note.textContent = "Ⓘ " + entry.note;
      title.appendChild(note);
    }
    if (entry.kind !== "section") return;
    const section = entry.section;
    if (title) wireTitleEdit(title, panelId);
    const cards = panel.querySelectorAll("[data-entity-id]");
    if (!cards.length) {
      // Aggregated panel: no per-entity cards to drag or ×, so surface the
      // section's entities as a footer chip strip instead.
      const ents = (state.config.sections[section] && state.config.sections[section].entities) || [];
      const panelBody = panel.querySelector(".panel-body") || panel;
      if (!ents.length) {
        // Zero-entity section: muted hint so the empty panel reads as
        // intentional rather than broken (not an error style).
        if (!panelBody.querySelector("[data-empty-hint]")) {
          const hint = document.createElement("div");
          hint.setAttribute("data-empty-hint", section);
          hint.style.cssText = "color:var(--text-muted);font-size:0.75rem;font-family:var(--font-mono);";
          hint.textContent = "no entities — drag from palette";
          panelBody.appendChild(hint);
        }
        return;
      }
      if (!panelBody.querySelector("[data-entity-strip]")) {
        const strip = document.createElement("div");
        strip.setAttribute("data-entity-strip", section);
        strip.style.marginTop = "8px";
        for (const id of ents) strip.appendChild(buildEntityChip(section, id));
        panelBody.appendChild(strip);
      }
      return;
    }
    cards.forEach(card => {
      const id = card.getAttribute("data-entity-id");
      // weather/mediaPlayer are entity-kind panels: not section-editable.
      if (weatherMedia.has(id)) return;
      if (card.querySelector(".preview-remove")) return;
      card.style.position = "relative";
      const btn = document.createElement("button");
      btn.className = "preview-remove";
      btn.setAttribute("data-entity", id);
      btn.style.cssText = "position:absolute;top:4px;right:4px;z-index:5;background:rgba(0,0,0,0.6);border:1px solid var(--border);color:var(--text-muted);border-radius:4px;padding:0 6px;cursor:pointer;font-family:var(--font-mono);";
      btn.textContent = "×";
      btn.title = "Remove from section";
      btn.addEventListener("click", ev => {
        ev.stopPropagation();
        // Remove from this card's own panel section (exact), falling back to
        // the first section containing the id.
        const key = section || sectionOfEntity(id);
        if (key) removeSectionEntity(key, id); // re-renders dashboard + settings
      });
      card.appendChild(btn);
    });
  });
}

// Entity/palette drop: drag to the palette removes from the source section, a
// card/chip target inserts before it in that card's section, a panel target
// appends to the panel's section. Fixed/auto/entity panels reject the drop and
// surface their registry note as a transient hint. Palette drags ADD (copy) —
// an entity may live in multiple sections — while card/chip drags MOVE.
function applyEntityDrop(d, target) {
  const id = d.id;
  const isAdd = d.kind === "palette";
  const fromKey = isAdd ? null : d.key;
  if (target.id === "palette") {
    if (fromKey && state.config.sections[fromKey]) {
      state.config.sections[fromKey].entities = (state.config.sections[fromKey].entities || []).filter(x => x !== id);
      refreshEditorAfterEdit();
    }
    return;
  }
  const panel = target.closest("[data-panel-id]");
  if (!panel) return;
  const panelId = panel.getAttribute("data-panel-id");
  const entry = PANEL_REGISTRY[panelId];
  if (!entry || entry.kind !== "section") {
    const titleEl = panel.querySelector(".panel-title");
    let title = panelId;
    if (titleEl) {
      const clone = titleEl.cloneNode(true);
      clone.querySelectorAll(".preview-note, input").forEach(n => n.remove());
      title = clone.textContent.trim() || panelId;
    }
    setSettingsStatus(`${title}: ${entry && entry.note ? entry.note : "not entity-editable"}`);
    return;
  }
  const beforeId = target.getAttribute("data-entity-id") || target.getAttribute("data-entity");
  const toKey = target.getAttribute("data-section") || entry.section;
  if (!state.config.sections[toKey]) return;
  if (fromKey && state.config.sections[fromKey]) {
    state.config.sections[fromKey].entities = (state.config.sections[fromKey].entities || []).filter(x => x !== id);
  }
  const to = (state.config.sections[toKey].entities || []).filter(x => x !== id);
  let index = beforeId ? to.indexOf(beforeId) : -1;
  if (index === -1) index = to.length;
  to.splice(index, 0, id);
  state.config.sections[toKey].entities = to;
  refreshEditorAfterEdit();
  if (entry.filter === "person") {
    const domain = id.split(".")[0];
    if (domain !== "person" && domain !== "device_tracker") {
      setSettingsStatus("only person/device_tracker entities render in this panel");
    }
  }
}

function initPreviewDrag() {
  const body = document.getElementById("settings-body");
  if (!body) return;
  const stage = document.getElementById("preview-stage");
  // Belt-and-braces against any missed inline handlers (sanitization already
  // strips them). .panel-title clicks (inline title editing) and
  // .preview-remove clicks (× overlays / strip chips) are let through.
  if (stage && !stage.dataset.clickGuard) {
    stage.dataset.clickGuard = "1";
    stage.addEventListener("click", e => {
      if (!e.target.closest(".panel-title") && !e.target.closest(".preview-remove")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
  body.querySelectorAll(".palette-chip").forEach(chip => {
    if (chip.dataset.dragWired) return;
    chip.dataset.dragWired = "1";
    chip.addEventListener("pointerdown", ev => {
      if (ev.target.closest("button")) return;
      startDrag(ev, "palette", chip);
    });
  });
  if (stage) {
    stage.querySelectorAll("[data-panel-id] .panel-title").forEach(title => {
      if (title.dataset.dragWired) return;
      title.dataset.dragWired = "1";
      title.addEventListener("pointerdown", ev => {
        // Don't start a panel drag from the inline icon/title inputs (title
        // edit mode) or buttons.
        if (ev.target.closest("input") || ev.target.closest("button")) return;
        const panel = ev.target.closest("[data-panel-id]");
        if (panel) startDrag(ev, "panel", panel);
      });
    });
    // Entity drag sources: [data-entity-id] cards and footer-strip chips in
    // section-kind panels. A card's own .panel-title stays a panel-drag handle
    // (e.g. camera cards drag the cameras panel by their title).
    stage.querySelectorAll("[data-entity-id], .entity-chip[data-entity]").forEach(el => {
      if (el.dataset.dragWired) return;
      const chipSection = el.getAttribute("data-section");
      const panel = el.closest("[data-panel-id]");
      const entry = panel && PANEL_REGISTRY[panel.getAttribute("data-panel-id")];
      if (!chipSection && (!entry || entry.kind !== "section")) return;
      el.dataset.dragWired = "1";
      el.addEventListener("pointerdown", ev => {
        if (ev.target.closest(".preview-remove") || ev.target.closest("input")) return;
        if (ev.target.closest(".panel-title")) return;
        startDrag(ev, "entity", el);
      });
    });
  }
  let drag = null;

  function startDrag(ev, kind, el) {
    if (!el) return;
    ev.preventDefault();
    let id, key = null;
    if (kind === "panel") {
      id = el.getAttribute("data-panel-id");
    } else {
      id = el.getAttribute("data-entity-id") || el.getAttribute("data-entity");
      if (kind === "palette") {
        key = sectionOfEntity(id);
      } else {
        // Source section of an entity card/chip: explicit data-section on
        // strip chips, else the backing section of its panel.
        key = el.getAttribute("data-section");
        if (!key) {
          const panel = el.closest("[data-panel-id]");
          key = panel ? panelSection(panel.getAttribute("data-panel-id")) : null;
        }
      }
    }
    drag = {
      kind,
      el,
      key,
      id,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      moved: false,
      ghost: null
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
    document.addEventListener("pointercancel", onCancel, { once: true });
  }

  function onMove(ev) {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.classList.add("dragging");
      body.classList.add("editor-dragging");
      const ghost = drag.el.cloneNode(true);
      ghost.id = "drag-ghost";
      ghost.style.width = drag.el.offsetWidth + "px";
      document.body.appendChild(ghost);
      drag.ghost = ghost;
    }
    if (drag.ghost) {
      drag.ghost.style.left = (ev.clientX + 12) + "px";
      drag.ghost.style.top = (ev.clientY + 12) + "px";
    }
    // Auto-scroll the palette or preview stage when dragging near their edges.
    [document.getElementById("palette-list"), document.getElementById("preview-stage")].forEach(sc => {
      if (!sc) return;
      const r = sc.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
      if (ev.clientY < r.top + 40) sc.scrollTop -= 12;
      else if (ev.clientY > r.bottom - 40) sc.scrollTop += 12;
    });
    clearIndicators();
    const target = findDropTarget(ev);
    if (target) target.classList.add("drop-before");
  }

  function cleanupDrag(d) {
    d.el.classList.remove("dragging");
    if (d.ghost) d.ghost.remove();
    body.classList.remove("editor-dragging");
    clearIndicators();
  }

  function onCancel() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    if (!drag) return;
    const d = drag;
    drag = null;
    cleanupDrag(d);
  }

  function onUp(ev) {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointercancel", onCancel);
    if (!drag) return;
    const target = drag.moved ? findDropTarget(ev) : null;
    const d = drag;
    drag = null;
    cleanupDrag(d);
    if (d.moved && target) {
      if (d.kind === "panel") applyPanelDrop(d.id, target);
      else applyEntityDrop(d, target);
    }
  }

  function findDropTarget(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!el || !stage) return null;
    if (drag.kind === "entity" || drag.kind === "palette") {
      const palette = el.closest("#palette");
      if (palette) return palette;
      const card = el.closest("[data-entity-id], .entity-chip[data-entity]");
      if (card && stage.contains(card) && card !== drag.el) return card;
      const panel = el.closest("[data-panel-id]");
      if (panel && stage.contains(panel)) return panel;
      return null;
    }
    const panel = el.closest("[data-panel-id]");
    if (panel && stage.contains(panel) && panel !== drag.el) return panel;
    const colEl = el.closest("[data-preview-col]");
    if (colEl && stage.contains(colEl)) return colEl;
    return null;
  }

  function clearIndicators() {
    document.querySelectorAll(".drop-before").forEach(x => x.classList.remove("drop-before"));
  }
}

function setSectionProp(key, prop, value) {
  if (!state.config.sections[key]) return;
  state.config.sections[key][prop] = value;
  renderAll();
}

function removeSectionEntity(key, id) {
  const sec = state.config.sections[key];
  if (!sec) return;
  sec.entities = (sec.entities || []).filter(x => x !== id);
  renderAll();
  buildSettings();
}

const NEW_DEVICE_DOMAINS = ["light", "switch", "scene", "script", "fan", "sensor", "binary_sensor", "camera", "media_player", "vacuum", "lock", "cover", "siren", "update"];

function collectReferencedIds() {
  const ids = new Set();
  if (state.config.entities) {
    if (state.config.entities.weather) ids.add(state.config.entities.weather);
    if (state.config.entities.mediaPlayer) ids.add(state.config.entities.mediaPlayer);
  }
  for (const key of Object.keys(state.config.sections || {})) {
    const sec = state.config.sections[key];
    for (const id of (sec.entities || [])) ids.add(id);
  }
  for (const item of (state.config.dock && state.config.dock.items) || []) {
    if (item.entityId) ids.add(item.entityId);
  }
  return ids;
}

function computeMissingEntities() {
  const referenced = collectReferencedIds();
  const missing = [];
  for (const id of referenced) {
    if (!state.states[id] && !state.entityById[id]) missing.push(id);
  }
  return missing.sort();
}

export function removeMissingEntity(id) {
  for (const key of Object.keys(state.config.sections || {})) {
    const sec = state.config.sections[key];
    if (Array.isArray(sec.entities)) sec.entities = sec.entities.filter(x => x !== id);
  }
  if (state.config.entities) {
    if (state.config.entities.weather === id) state.config.entities.weather = "";
    if (state.config.entities.mediaPlayer === id) state.config.entities.mediaPlayer = "";
  }
  if (state.config.dock && Array.isArray(state.config.dock.items)) {
    state.config.dock.items = state.config.dock.items.filter(i => i.entityId !== id);
  }
  renderAll();
  buildSettings();
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

// ---- Init ----

async function init() {
  state.config = await loadConfig();
  applyTheme();
  await fetchHAConfig();
  document.getElementById("dock").innerHTML = renderDock();
  showScreen("home");
  setInterval(refreshForecast, 15 * 60 * 1000);
  if (window.HA_INTEGRATION_PROXY) {
    state.token = "";
    localStorage.removeItem("ha_token");
    connect();
  } else {
    state.token = localStorage.getItem("ha_token");
    if (!state.token) {
      state.token = prompt("Enter Home Assistant long-lived access token:");
      if (state.token) localStorage.setItem("ha_token", state.token);
    }
    if (state.token) connect();
  }
  setInterval(updateClock, 1000);
  window.addEventListener("resize", measureClock);
  setInterval(refreshDoorRecency, 30000);
  setInterval(() => {
    const cams = (state.config.sections && state.config.sections.cameras) || {};
    const snapMap = cams.snapshot || {};
    for (const cameraId of Object.keys(snapMap)) {
      const lastEvent = snapshotLastActivityMs(snapMap[cameraId]);
      const idleLongEnough = !lastEvent || (Date.now() - lastEvent) > SNAPSHOT_IDLE_EVENT_WINDOW_MS;
      const stale = (Date.now() - (state.snapshotLastRefresh[cameraId] || 0)) >= SNAPSHOT_IDLE_POLL_MS;
      if (idleLongEnough && stale) refreshCameraSnapshot(cameraId);
    }
  }, SNAPSHOT_CHECK_MS);
  // Restart live camera streams periodically: a stalled MJPEG <img> shows the
  // last frame forever without firing onerror, and browsers expose no stall
  // event. Scoped to the active screen; the ts= cache-buster forces a fresh
  // connection. Snapshot cameras are untouched (they have their own refresh).
  setInterval(() => {
    const screenEl = document.getElementById(state.currentScreen + "-screen");
    if (!screenEl) return;
    screenEl.querySelectorAll("img.camera-feed:not([data-snapshot-camera])").forEach(img => {
      if (!/(camera_proxy_stream|cam_stream)\//.test(img.src)) return;
      const base = img.src.replace(/([?&])ts=\d+/, "").replace(/[?&]$/, "");
      img.src = `${base}${base.includes("?") ? "&" : "?"}ts=${Date.now()}`;
    });
  }, 10 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", init);
