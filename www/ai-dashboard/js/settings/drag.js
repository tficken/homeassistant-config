// Pointer-drag interactions for the settings layout editor: panel reordering
// between preview columns, entity add/move/remove via palette and card drags,
// and the post-render editor affordances on the scaled preview. Circular with
// layout.js (sectionOfEntity, removeSectionEntity, refreshEditorAfterEdit,
// wireTitleEdit) and editor.js (editorScreen, setSettingsStatus, buildSettings)
// — function references at runtime only.
import { state } from '../state.js';
import { friendlyName } from '../utils.js';
import { PANEL_REGISTRY, ensureConfigPanels, panelSection } from '../config.js';
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

// Entity chip for the aggregated-panel footer strip — same markup as the old
// board's chips (drag-handle + name + ×), but wired via listeners because the
// preview HTML is sanitized of inline handlers. The × carries .preview-remove
// so the stage click-capture guard lets it through.
export function buildEntityChip(section, id) {
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

// Post-render editor affordances on the scaled preview: × remove overlays on
// section-backed entity cards, registry note chips on fixed/auto/entity panel
// titles, footer entity strips for aggregated panels (roomMonitors renders
// per-area data-room cells, not per-entity cards), and inline title/icon
// editing on section-kind panel titles. Runs on the sanitized DOM, so every
// handler is attached with addEventListener.
export function decoratePreviewPanels(inner) {
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
