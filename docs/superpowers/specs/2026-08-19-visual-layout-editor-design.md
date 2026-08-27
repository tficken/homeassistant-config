# Visual Layout Editor with Rearrangeable Panels — Design Spec

> **Note (2026-08-26):** Shipped, except cross-screen panel moves were **not** implemented — each screen's builder only builds its own panels, and the defensive `DEFAULT_PANELS` merge re-appends misplaced panels on their default screen. The "all four renderers become generic panel assemblers" idea below does not reflect the shipped code. See AGENTS.md for current behavior.

**Date:** 2026-08-19
**Status:** Approved (design), pending implementation plan
**Scope:** Replace the AI dashboard Settings → Layout section-box board with a visual preview editor: real rendered panels, entity-level drag add/remove/rearrange, panel-level drag rearrangement per screen, and a measured overflow check. Approved by user 2026-08-19.

---

## Background

The current Layout tab (`www/ai-dashboard/index.html`, `renderLayoutTab`/`initEditorDrag`, `SCREEN_SECTION_GROUPS`) shows abstract section boxes grouped under screen headings. Problems reported by the user:

- The board doesn't represent what screens actually look like (fixed panels like clock/radar/weather/on-call were invisible until a recent stopgap added static placeholder cards).
- Dragging is clunky (small handles, blind dragging) — partially addressed by recent UX fixes (whole-chip drag, ghost, auto-scroll), but the fundamental mismatch remains: the user wants a **visual preview** where both entities and **panels themselves** can be rearranged, with feedback on whether the result fits the screen.

## Current screen anatomy (as-built)

- **HOME** — 3 columns (widths `0.9fr 1.2fr 1fr`): col1 = clock block, presence panel (entities from section `home`, `person.*` only), on-call panel (conditional, auto-detected `calendar.*`); col2 = weather panel (`config.entities.weather`), roomMonitors panel (section `roomMonitors`, temp/humidity only); col3 = radar panel (fixed), doors panel (section `doors`). Alert banner on top (auto).
- **CONTROL HUB** — 3 columns (`1fr 1fr 1.1fr`): scenes | quickControls + media card (`config.entities.mediaPlayer`) | scripts.
- **SECURITY** — vertical stack: camera feeds row (section `cameras`, no panel wrapper), security panel (section `security`).
- **STATUS MONITOR** — 2 columns (`1fr 1fr`): environment | system (system panel also embeds vacuum cards from section `system` and auto-discovered printer cards).

Renderers (`renderHomeScreen`, `renderControlScreen`, `renderSecurityScreen`, `renderStatusScreen`) currently hardcode panel placement and write directly to `document.getElementById("<screen>-screen").innerHTML`.

## Design

### 1. Layout model

New config key `panels`: screen id → array of columns, each an ordered array of panel ids.

```json
"panels": {
  "home":    [["clock", "presence", "oncall"], ["weather", "roomMonitors"], ["radar", "doors"]],
  "control": [["scenes"], ["quickControls", "media"], ["scripts"]],
  "security": [["cameras", "security"]],
  "status":  [["environment"], ["system"]]
}
```

Panel registry (constant in index.html): each panel id maps to `{ title, kind }` where kind is `section` (backed by `config.sections.<id>` — except `presence`, which is backed by section `home` filtered to `person.*`), `fixed` (clock, radar), `entity` (weather → `config.entities.weather`, media → `config.entities.mediaPlayer`), or `auto` (oncall → calendar autodiscovery).

Rules:

- Column **count and widths are fixed per screen** (today's proportions). Panels move freely within/between columns and across screens.
- `config.panels` absent → renderers use `DEFAULT_PANELS` (the arrangements above). Editor always works on the effective layout and writes the full model on Save & Apply.
- Panel ids in `config.panels` that don't exist in the registry are skipped; registry panels missing from the effective layout render at their default position (defensive merge for forward compatibility).
- A panel placed on a screen whose renderer can't host it: all four renderers become generic panel assemblers, so any panel can live on any screen. (`cameras` on HOME renders as its feeds; `environment` on CONTROL renders its metric grid; etc.)

### 2. Renderer refactor

Split each screen renderer into a pure builder + thin writer:

- `build<Screen>Panels()` → `{ panels: { id: html }, widths: [...] }` — no DOM writes, no side effects.
- `render<Screen>()` (live path) → calls builder, assembles via shared `assembleColumns(panelHtml, layout, widths)`, writes to the screen element, then performs side effects (radar init, clock measure, history prefetch, door-recency bookkeeping).
- Side effects never run in preview renders.
- `renderStatusScreen`'s history prefetch stays in the live writer; the status builder remains async (sparklines render from cache; preview may show empty sparklines on first open — acceptable).

ID sanitization for preview: rendered preview HTML has `id="..."` rewritten to `data-pid="..."` so preview content can never collide with or be mutated by live-app code paths (`#clock`, `#radar-map`, `#doors-panel`).

### 3. Preview editor (replaces the board in Settings → Layout)

Layout: palette column on the left (unchanged: filter, "not on dashboard" toggle, missing-entity cleanup), preview pane on the right with a screen tab bar (HOME / CONTROL HUB / SECURITY / STATUS MONITOR).

- The selected screen renders at real pixel size in an offscreen container, then displayed via `transform: scale()` to fit the pane.
- **Entity interactions** (on `[data-entity-id]` cards inside preview): drag card → reorder within panel, move to another panel (any screen via tab switch while dragging is out of scope — drag only within the visible screen; cross-screen entity moves happen by dragging to the palette, switching tab, dragging out); × overlay on card removes the entity from its section; drag from palette onto a panel appends to that panel's section (or does nothing with a hint for fixed/auto panels).
- **Panel interactions**: drag panel by its header → drop before another panel or into a column (drop indicators); fixed/auto panels move the same way but show a small note instead of entity editing ("entity set in Appearance tab", "auto-detects calendar entities", "built in").
- **Section title/icon editing**: clicking a section-backed panel's header title turns it into the existing inline icon+title inputs (same `setSectionProp` path).
- Edits mutate `config.sections`/`config.panels` immediately and re-render live screens behind the modal (existing `renderAll` pattern); Save & Apply persists (existing `POST /ai-dashboard/api/config`).

The old board (`SCREEN_SECTION_GROUPS`, editor-section cards, chip lists, `data-drag-section` reordering, and the sectionOrder-based board ordering) is removed. `config.sectionOrder` becomes unused and is dropped from `DEFAULT_CONFIG` and `config.json` (panel order replaces it). The drag-UX mechanics from the current editor (whole-chip drag, distance threshold, ghost, auto-scroll, drop outlines, pointercancel cleanup) carry over and are extended to panel dragging.

### 4. Overflow check (measured)

Because the preview renders real HTML at real size offscreen:

- Measure each panel's `offsetHeight` and each column's summed height (including gaps) against the live screen container's `clientHeight` (i.e., the actual device viewport minus dock/banner chrome).
- A column whose content exceeds available height gets an amber warning badge in the preview: "overflows by ~Npx" (N rounded to 10px). Panels in that column get an amber outline.
- Empty section panels get a muted "no entities" hint (not an error).
- Recomputed after every edit and on editor open/tab switch.
- Caveat to document in code comment and AGENTS.md: measurement reflects current content; it cannot predict future states (e.g., printer cards appearing mid-print, on-call panel appearing when a shift starts).

### 5. Plumbing

- `custom_components/ai_dashboard_proxy/http.py`: add `"panels"` to `CONFIG_KEYS` (one line). **HA restart required** before Save & Apply accepts the new key.
- `DEFAULT_CONFIG`: add `panels: DEFAULT_PANELS`-equivalent defaults; remove `sectionOrder`.
- `config.json`: add the default `panels` model (so the file is self-describing) and remove `sectionOrder`.
- Camera snapshot config (`sections.cameras.snapshot`) is panel-attached config and is unaffected.

### 6. Removed/changed surface

- Removed: `SCREEN_SECTION_GROUPS`, the board markup path in `renderLayoutTab`, section drag ordering, `sectionOrder` everywhere (`orderedSectionKeys` deleted or repurposed).
- Kept: palette, missing-entity cleanup, Labels/Appearance/Data tabs, dock rendering, all live-screen behavior (same default layouts produce pixel-identical screens).

## Out of scope

- Editing column counts/widths or grid proportions.
- Cross-screen entity drags in one gesture (use palette as the intermediary).
- Making fixed panels (clock, radar) configurable beyond placement.
- Touch-specific tap-to-move alternative interaction (drag mechanics were fixed in the preceding change; revisit only if still clunky).

## Validation

Local CI checks (HTML parse, config.json JSON, flake8 + compileall for the proxy one-liner), then browser checklist:

1. Open Settings → Layout: preview matches the live screens 1:1 with default layout.
2. Drag `doors` panel to column 1 on HOME; dashboard behind modal updates; Save & Apply; hard-refresh → persists.
3. Drag an entity from palette onto a panel; drag a card between panels; × removes; drag to palette removes.
4. Overflow: stack all home panels into one column → amber overflow badge appears with plausible pixel figure; spread them back → clears.
5. Preview ID sanitization: live clock keeps ticking and live radar keeps animating while the preview is open.
6. HA restart, then Save & Apply with a panel change → 200 and `panels` key present in `config.json`.
7. Regression: all four screens render identically to before with a fresh `config.json` lacking `panels`.

## Risks

- **Renderer refactor regression** — the four screens must remain pixel-identical under default layout; mitigate with the checklist above and side-by-side comparison.
- **Duplicate-ID interference** — mitigated by `data-pid` sanitization; verified by checklist item 5.
- **Save before restart** — without the HA restart, Save & Apply 400s on the `panels` key; mitigate by noting it in the commit message and to the user at handoff.
- **Preview scale math** — `transform: scale()` affects layout of children correctly for measurement only if measurement happens on the unscaled offscreen render; spec mandates measuring offscreen at 1.0 scale, never the scaled preview.
