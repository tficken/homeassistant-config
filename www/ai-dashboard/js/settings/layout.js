// Layout tab of the settings editor: entity palette (filter/new-only), the
// scaled live preview of each screen, measured overflow badges, and the
// missing-entity audit. Drag-and-drop interactions live in ./drag.js.
// PREVIEW_BUILDERS reuses the four live screen builders from ../screens/*.js.
// Circular with editor.js (EDITOR_SCREENS, editorScreen, buildSettings) and
// drag.js (decoratePreviewPanels, initPreviewDrag) — function references and
// runtime reads of live bindings only.
import { state } from '../state.js';
import { friendlyName, entityArea, escapeHtml } from '../utils.js';
import { effectivePanels, effectiveSizes } from '../config.js';
import { buildHomePanels } from '../screens/home.js';
import { buildControlPanels } from '../screens/control.js';
import { buildSecurityPanels } from '../screens/security.js';
import { buildStatusPanels } from '../screens/status.js';
import { renderAll, assembleColumns } from '../screens/index.js';
import { EDITOR_SCREENS, editorScreen, buildSettings } from './editor.js';
import { decoratePreviewPanels, initPreviewDrag } from './drag.js';

let paletteFilter = "";
let paletteNewOnly = false;

export function sectionOfEntity(id) {
  for (const key of Object.keys(state.config.sections || {})) {
    const ents = state.config.sections[key].entities || [];
    if (ents.includes(id)) return key;
  }
  return null;
}

export function renderPaletteList() {
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

export function renderLayoutTab() {
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
        <div id="preview-tabs" style="display:flex;gap:8px;margin-bottom:8px;flex-shrink:0;">${previewTabs}
          <button class="btn" style="margin-left:auto;" onclick="resetSizes()" title="Clear saved tile heights and column widths for this screen">RESET SIZES</button>
        </div>
        <div id="preview-stage" style="flex:1;min-height:0;overflow:auto;border:1px solid var(--border);border-radius:6px;padding:10px;">
          <div id="preview-stage-inner"></div>
        </div>
      </div>
    </div>`;
}

export function initLayoutEditor() {
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
export function sanitizePreviewHtml(html) {
  return html
    .replace(/ id="/g, ' data-pid="')
    .replace(/ on\w+="[^"]*"/g, "")
    .replace(/src="\/(?:api\/camera_proxy_stream|ai-dashboard\/cam_stream)\/([^"?]+)[^"]*"/g, (m, eid) => {
      const st = state.states[eid];
      const pic = st && st.attributes && st.attributes.entity_picture;
      return pic ? `src="${pic}"` : m;
    });
}

export const PREVIEW_BUILDERS = {
  home: buildHomePanels,
  control: buildControlPanels,
  security: buildSecurityPanels,
  status: buildStatusPanels
};

// Build the editorScreen's HTML at real pixel size and display it scaled to
// fit the stage. Fire-and-forget from initLayoutEditor; re-wires drag handlers
// once the preview DOM exists.
export async function renderEditorPreview() {
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
  // Shared assembly with the live path; preview:true puts data-preview-col on
  // column divs for drop targeting and omits data-screen-grid.
  const assembled = assembleColumns(b.panels, effectivePanels(screen),
    b.gridStyle, b.colStyles, effectiveSizes(screen), { preview: true });
  // Sanitize once and share the exact same HTML with the hidden measure
  // container so overflow math reflects the current (post-edit) effective
  // layout, never a stale cache.
  const sanitized = sanitizePreviewHtml(assembled);
  inner.style.width = w + "px";
  inner.innerHTML = sanitized;
  // Scale against the stage's content-box width so the stage padding doesn't
  // bake in horizontal overflow.
  const stageStyle = getComputedStyle(stage);
  const stageContentW = stage.clientWidth - parseFloat(stageStyle.paddingLeft) - parseFloat(stageStyle.paddingRight);
  const k = Math.min(1, stageContentW / w);
  inner.style.transform = `scale(${k})`;
  inner.style.transformOrigin = "top left";
  // Expose the scale factor for resize-drag math in drag.js (pointer deltas
  // are viewport px; unscaled layout px = delta / k).
  stage.dataset.scale = String(k);
  // transform doesn't affect layout: shrink the layout box to the scaled
  // footprint or the stage shows scrollbars/dead space around the preview.
  inner.style.height = (inner.scrollHeight * k) + "px";
  decoratePreviewPanels(inner);
  updateOverflowBadges(sanitized, w);
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
export function updateOverflowBadges(html, width) {
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
  // Full-width rows sit outside the columns; subtract their heights (plus one
  // 14px wrapper gap each) from the height available to column content.
  measure.querySelectorAll("[data-full-row]").forEach(row => { avail -= row.offsetHeight + 14; });
  if (avail <= 0) return;

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

export function refreshEditorAfterEdit() {
  renderAll();
  buildSettings();
}

// Clear saved tile heights and column widths for the previewed screen.
// In-memory only until Save & Apply, like every other layout edit.
export function resetSizes() {
  if (state.config.sizes) delete state.config.sizes[editorScreen];
  if (state.config.colWidths) delete state.config.colWidths[editorScreen];
  refreshEditorAfterEdit();
}

// Click a section-kind panel's title to edit its icon/title inline (same input
// pattern as the old board header). Blur without a change restores the title.
// The key is the panel id itself: builders render sectionTitle(<panelId>), so
// the presence panel edits state.config.sections.presence, NOT home.
export function wireTitleEdit(title, key) {
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

export function setSectionProp(key, prop, value) {
  if (!state.config.sections[key]) return;
  state.config.sections[key][prop] = value;
  renderAll();
}

export function removeSectionEntity(key, id) {
  const sec = state.config.sections[key];
  if (!sec) return;
  sec.entities = (sec.entities || []).filter(x => x !== id);
  renderAll();
  buildSettings();
}

export const NEW_DEVICE_DOMAINS = ["light", "switch", "scene", "script", "fan", "sensor", "binary_sensor", "camera", "media_player", "vacuum", "lock", "cover", "siren", "update"];

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
