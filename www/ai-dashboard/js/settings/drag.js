// Pointer-drag interactions for the settings layout editor: panel reordering
// between preview columns, entity add/move/remove via palette and card drags,
// and the post-render editor affordances on the scaled preview. Circular with
// layout.js (sectionOfEntity, removeSectionEntity, refreshEditorAfterEdit,
// wireTitleEdit) and editor.js (editorScreen, setSettingsStatus, buildSettings)
// — function references at runtime only.
import { state } from '../state.js';
import { friendlyName, entityArea } from '../utils.js';
import { PANEL_REGISTRY, ensureConfigPanels, panelSection, effectivePanels, effectiveSizes, effectiveColWidths } from '../config.js';
import { renderAll } from '../screens/index.js';
import { editorScreen, setSettingsStatus, buildSettings } from './editor.js';
import { sectionOfEntity, removeSectionEntity, refreshEditorAfterEdit, wireTitleEdit } from './layout.js';

export function applyPanelDrop(panelId, target) {
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

// Merge a patch into the panel's sizes entry for the editor screen, creating
// the buckets on demand and dropping empty entries so the saved config stays
// clean. In-memory only — persisted by Save & Apply.
function setSizeEntry(panelId, patch) {
  state.config.sizes = state.config.sizes || {};
  const bucket = state.config.sizes[editorScreen] = state.config.sizes[editorScreen] || {};
  bucket[panelId] = Object.assign({}, bucket[panelId], patch);
  const entry = bucket[panelId];
  if (!entry.full) delete entry.full;
  if (typeof entry.h !== "number" && !entry.full) delete bucket[panelId];
  if (!Object.keys(bucket).length) delete state.config.sizes[editorScreen];
}

// ⇔ toggle: hoist the panel into its own full-width row (or back into its
// column). A no-op flag on a single-column screen is prevented by the caller
// (the ⇔ button is only injected on multi-column screens).
export function toggleFull(panelId) {
  const cur = effectiveSizes(editorScreen)[panelId] || {};
  setSizeEntry(panelId, { full: !cur.full });
  refreshEditorAfterEdit();
}

// Current preview scale factor (pointer deltas are viewport px; unscaled
// layout px = delta / k). Written by renderEditorPreview after every render.
function previewScale() {
  const stage = document.getElementById("preview-stage");
  const k = stage && parseFloat(stage.dataset.scale);
  return k > 0 ? k : 1;
}

// Bottom-edge height drag. The panel's flex weight tracks the pointer live;
// the final weight is committed to state.config on pointerup. Weight unit
// calibration comes from the panel's weighted flex siblings (px per unit);
// an all-auto column falls back to 100 px/unit. An auto-height panel converts
// to weighted on first drag, starting at its current rendered height.
function startHeightResize(ev, target, panelId) {
  ev.preventDefault();
  ev.stopPropagation();
  const k = previewScale();
  const parent = target.parentElement;
  if (!parent) return;
  // Exclude editor chrome injected into columns (overflow badges).
  const siblings = [...parent.children].filter(el => !el.classList.contains("overflow-badge"));
  let sumGrow = 0, sumH = 0;
  for (const el of siblings) {
    const g = parseFloat(getComputedStyle(el).flexGrow) || 0;
    if (g > 0) { sumGrow += g; sumH += el.offsetHeight; }
  }
  const pxPerUnit = sumGrow > 0 ? sumH / sumGrow : 100;
  const grow0 = parseFloat(getComputedStyle(target).flexGrow) || 0;
  const w0 = grow0 > 0 ? grow0 : target.offsetHeight / pxPerUnit;
  const startY = ev.clientY;
  const pointerId = ev.pointerId;
  let w = w0;
  const onMove = e => {
    if (e.pointerId !== pointerId) return;
    w = Math.max(0.25, w0 + (e.clientY - startY) / (k * pxPerUnit));
    target.style.flex = `${w} 1 0`;
    target.style.minHeight = "0";
  };
  const onUp = e => {
    if (e.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    setSizeEntry(panelId, { h: Math.round(w * 100) / 100 });
    refreshEditorAfterEdit();
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}

// Column-divider width drag. Adjusts the two neighboring fr values (total
// conserved so other columns are unaffected), floors at 0.4 fr, live-updates
// the grid's template, and commits to state.config on pointerup.
function startWidthResize(ev, grid, colIndex) {
  ev.preventDefault();
  ev.stopPropagation();
  const k = previewScale();
  const frs = effectiveColWidths(editorScreen);
  if (colIndex < 0 || colIndex >= frs.length - 1) return;
  const cols = [...grid.children].filter(el => el.hasAttribute("data-preview-col"));
  if (cols.length < 2 || !cols[0].offsetWidth) return;
  const pxPerFr = cols[0].offsetWidth / frs[0];
  const startX = ev.clientX;
  const pointerId = ev.pointerId;
  let cur = frs.slice();
  const onMove = e => {
    if (e.pointerId !== pointerId) return;
    let dfr = (e.clientX - startX) / (k * pxPerFr);
    dfr = Math.max(0.4 - frs[colIndex], Math.min(frs[colIndex + 1] - 0.4, dfr));
    cur = frs.slice();
    cur[colIndex] = frs[colIndex] + dfr;
    cur[colIndex + 1] = frs[colIndex + 1] - dfr;
    grid.style.gridTemplateColumns = cur.map(n => n + "fr").join(" ");
  };
  const onUp = e => {
    if (e.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    state.config.colWidths = state.config.colWidths || {};
    state.config.colWidths[editorScreen] = cur.map(n => Math.round(n * 100) / 100);
    refreshEditorAfterEdit();
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}

// Post-render editor affordances on the scaled preview: × remove overlays on
// section-backed entity cards AND on aggregated per-room cells (roomMonitors),
// registry note chips on fixed/auto/entity panel titles, and inline title/icon
// editing on section-kind panel titles. Runs on the sanitized DOM, so every
// handler is attached with addEventListener.
export function decoratePreviewPanels(inner) {
  const weatherMedia = new Set([
    state.config.entities && state.config.entities.weather,
    state.config.entities && state.config.entities.mediaPlayer
  ].filter(Boolean));
  const sizes = effectiveSizes(editorScreen);
  const multiCol = effectivePanels(editorScreen).length > 1;
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
    // Editor-only sizing chrome: ⇔ full-width toggle (multi-column screens)
    // and a bottom-edge height handle. The panel element is the flex child
    // that carries the weight, so the handle anchors to it directly.
    if (!panel.querySelector(".preview-size-h")) {
      panel.style.position = panel.style.position || "relative";
      const h = document.createElement("div");
      h.className = "preview-size-h";
      h.title = "Drag to resize height";
      h.addEventListener("pointerdown", ev => startHeightResize(ev, panel, panelId));
      panel.appendChild(h);
    }
    if (multiCol && !panel.querySelector(".preview-full")) {
      const on = !!(sizes[panelId] && sizes[panelId].full);
      const btn = document.createElement("button");
      btn.className = "preview-full";
      btn.style.cssText = "position:absolute;top:4px;right:4px;z-index:6;background:rgba(0,0,0,0.6);border:1px solid " +
        (on ? "var(--accent)" : "var(--border)") + ";color:" + (on ? "var(--accent)" : "var(--text-muted)") +
        ";border-radius:4px;padding:0 6px;cursor:pointer;font-family:var(--font-mono);";
      btn.textContent = "⇔";
      btn.title = on ? "Restore to column" : "Span full width";
      btn.addEventListener("click", ev => {
        ev.stopPropagation();
        toggleFull(panelId);
      });
      panel.appendChild(btn);
    }
    if (entry.kind !== "section") return;
    const section = entry.section;
    if (title) wireTitleEdit(title, panelId);
    const cards = panel.querySelectorAll("[data-entity-id]");
    if (!cards.length) {
      // Aggregated panel: no per-entity cards to drag or ×. roomMonitors gets
      // per-room × overlays below; other aggregated sections manage entities
      // from the palette/labels instead.
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
      // Aggregated room cells (roomMonitors): a per-room × like the per-card
      // one below, removing every entity grouped into that room (the same
      // area-or-name grouping renderRoomMonitors uses) in a single re-render.
      panel.querySelectorAll("[data-room]").forEach(cell => {
        if (cell.querySelector(".preview-remove")) return;
        const area = cell.getAttribute("data-room");
        const roomEnts = ents.filter(id => (entityArea(id) || friendlyName(id)) === area);
        if (!roomEnts.length) return;
        cell.style.position = "relative";
        const btn = document.createElement("button");
        btn.className = "preview-remove";
        btn.style.cssText = "position:absolute;top:4px;right:4px;z-index:5;background:rgba(0,0,0,0.6);border:1px solid var(--border);color:var(--text-muted);border-radius:4px;padding:0 6px;cursor:pointer;font-family:var(--font-mono);";
        btn.textContent = "×";
        btn.title = `Remove ${area} (${roomEnts.length} entities)`;
        btn.addEventListener("click", ev => {
          ev.stopPropagation();
          const sec = state.config.sections[section];
          if (!sec) return;
          sec.entities = (sec.entities || []).filter(x => !roomEnts.includes(x));
          refreshEditorAfterEdit();
        });
        cell.appendChild(btn);
      });
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

  // Full-width rows hoist their panel out of the columns; the row div (not
  // the panel) carries the row's flex weight, so its height handle anchors
  // to the row.
  inner.querySelectorAll("[data-full-row]").forEach(row => {
    if (row.querySelector(":scope > .preview-size-h")) return;
    row.style.position = row.style.position || "relative";
    const h = document.createElement("div");
    h.className = "preview-size-h";
    h.title = "Drag to resize row height";
    h.addEventListener("pointerdown", ev => startHeightResize(ev, row, row.getAttribute("data-full-row")));
    row.appendChild(h);
  });

  // Column dividers: one handle per boundary, anchored to each band grid so
  // overflow-y:auto columns can't clip them. Skip single-column grids.
  const grids = new Set();
  inner.querySelectorAll("[data-preview-col]").forEach(col => { if (col.parentElement) grids.add(col.parentElement); });
  grids.forEach(grid => {
    const cols = [...grid.children].filter(el => el.hasAttribute("data-preview-col"));
    if (cols.length < 2) return;
    grid.style.position = grid.style.position || "relative";
    for (let i = 0; i < cols.length - 1; i++) {
      if (grid.querySelector(`.preview-size-w[data-divider="${i}"]`)) continue;
      const d = document.createElement("div");
      d.className = "preview-size-w";
      d.setAttribute("data-divider", String(i));
      d.title = "Drag to resize columns";
      // Center the 14px-wide handle over the inter-column gap.
      d.style.left = (cols[i].offsetLeft + cols[i].offsetWidth - 7) + "px";
      d.addEventListener("pointerdown", ev => startWidthResize(ev, grid, i));
      grid.appendChild(d);
    }
  });
}

// Entity/palette drop: drag to the palette removes from the source section, a
// card/chip target inserts before it in that card's section, a panel target
// appends to the panel's section. Fixed/auto/entity panels reject the drop and
// surface their registry note as a transient hint. Palette drags ADD (copy) —
// an entity may live in multiple sections — while card/chip drags MOVE.
export function applyEntityDrop(d, target) {
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

export function initPreviewDrag() {
  const body = document.getElementById("settings-body");
  if (!body) return;
  const stage = document.getElementById("preview-stage");
  // Belt-and-braces against any missed inline handlers (sanitization already
  // strips them). .panel-title clicks (inline title editing), .preview-remove
  // clicks (× overlays / strip chips), and .preview-full clicks (⇔ width
  // toggle) are let through.
  if (stage && !stage.dataset.clickGuard) {
    stage.dataset.clickGuard = "1";
    stage.addEventListener("click", e => {
      if (!e.target.closest(".panel-title") && !e.target.closest(".preview-remove") && !e.target.closest(".preview-full")) {
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
