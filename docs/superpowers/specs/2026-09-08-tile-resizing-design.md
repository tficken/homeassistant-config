# Tile Resizing for the AI Dashboard Layout Editor — Design

**Date:** 2026-09-08
**Status:** approved (brainstorm session)
**Scope:** `www/ai-dashboard/` frontend only. No changes to `custom_components/ai_dashboard_proxy/`. No new dependencies, no build step.

## Background

The dashboard layout is a per-screen array of 3 column stacks (`config.panels`); panels stack vertically with hardcoded flex styles, and each screen's grid has hardcoded column-width ratios (e.g. home: `0.85fr 1fr 1.2fr`). The settings Layout editor already supports drag-reordering panels between columns and per-room/per-card removal. Users currently cannot resize tiles.

## Requirements (from brainstorm)

- Resize tiles by dragging in the layout preview: tile heights, column widths, and full-width spanning.
- Heights are **relative weights**: shrinking a tile makes its column-mates absorb the freed space. No empty gaps.
- Spanning means a **full-width row** (all 3 columns). No 2-of-3-column spans (rejected: contradicts gap-free absorption).
- All four screens supported (shared model).
- Changes persist only via the existing Save & Apply flow.

## Data Model

`config.json` gains one optional top-level key. Everything else is unchanged.

```json
"sizes": {
  "home": {
    "presence": { "h": 0.6 },
    "lights": { "full": true }
  },
  "control": {}
},
"colWidths": {
  "home": [0.7, 1.0, 1.3]
}
```

- `sizes.<screen>.<panelId>.h` — flex weight for the panel's height within its column. Absent = the panel's hardcoded default (some panels are `flex: 1`, others auto-height; see Rendering).
- `sizes.<screen>.<panelId>.full` — the panel renders as a full-width row (see Band splitting).
- `colWidths.<screen>` — three fr values for the screen's grid columns. Absent = the screen's hardcoded default.
- Backward compatibility: old configs (no `sizes`/`colWidths`) render exactly as today. Unknown/stale panel ids in `sizes` are ignored at render time and pruned on the next save. Old dashboard code reading a new config ignores the unknown keys (deepMerge with defaults).

## Rendering

### Height weights

Panel wrapper divs currently carry hardcoded inline flex styles in the `screens/*.js` builders (`flex:1;min-height:0;`, `flex-shrink:0;`, etc.). Builders switch to a helper:

```js
panelStyle(screen, panelId, defaultStyle) // screens/index.js
```

which returns the override (`flex:<h> 1 0;min-height:0;`) when `sizes[screen][panelId].h` exists, else `defaultStyle`. An auto-height panel (e.g. clock, `flex-shrink:0`) stays auto until the user drags it; the first drag converts it to weighted.

### Column widths

`assembleColumns` builds the band grid's `grid-template-columns` from `colWidths[screen]` when present, else the builder's hardcoded `gridStyle` default (defaults are preserved per screen as today).

### Band splitting (full-width rows)

Given the 3 column arrays and the set of full-width panels:

1. Find the full-width panel with the smallest index `i` (its position among **non-full** panels in its own column; ties broken by column order, left to right).
2. Split **every** column at `min(i, column length)`. The top segments form a 3-column band (rendered with the column-width grid).
3. Render the full-width panel as its own full-width row.
4. Recurse on the remaining column segments.

Reading: "the row lands as far down as the tile was in its column." A column shorter than `i` simply contributes nothing further to upper bands. A full-width panel keeps an `h` weight applied to its row (default: content height).

`assembleColumns` becomes band-aware; its public signature is unchanged for callers (it gains the screen id + sizes via parameters already available at call sites — final signature settled in the implementation plan).

## Editor Interactions (Settings → Layout preview)

All interactions mutate in-memory `state.config`, re-render the preview and the live dashboard, and persist only via the existing **Save & Apply** button.

- **Tile height:** dragging a tile's bottom-edge handle zone (bottom 8 px) adjusts its `h` weight. The pixel delta is divided by the preview's scale factor `k` and converted to a weight change relative to column-mates; weights are renormalized within the column so absorption is immediate and visible. Weight floor: 0.25.
- **Column widths:** dragging a divider between preview columns adjusts the neighboring fr values (delta / k). Floor: 0.4 fr per column so no column can vanish.
- **Full-width toggle:** a `⇔` button on each preview tile (same chrome as the existing `.preview-remove` ×) toggles `full`.
- **Reset:** a "Reset sizes" button in the Layout tab clears `sizes[screen]` and `colWidths[screen]` for the currently previewed screen.

Drag handles/buttons are editor-only chrome added by `settings/drag.js` (same pattern as the existing × overlays); live builder markup is untouched.

## Edge Cases

- Weight floor 0.25 and width floor 0.4 fr keep every tile/column reachable.
- Drag math always divides by the preview scale `k` (the preview renders at `transform: scale(k)`).
- Stale `sizes` entries for removed panels: ignored at render, pruned on save.
- `prefers-reduced-motion`: no new animations are introduced; drag interactions are unaffected.
- Circular-import rule (runtime-only function references, no top-level binding reads) applies to any new cross-module wiring, per the project conventions established in the modernization.

## Verification

- JS module syntax loop over `www/ai-dashboard/js/` + `python -m json.tool www/ai-dashboard/config.json`.
- Live browser verification via the WebBridge daemon: dispatch synthetic PointerEvents for edge/divider drags, assert the expected `state.config` mutations, screenshot before/after, and confirm a plain reload (no Save & Apply) discards changes while Save & Apply persists them (a new `config.json.bak.*` appears).
- Manual smoke on the wall tablet: existing checklist (4 screens, dock, modals, camera streams) plus the three new drag gestures.

## Out of Scope

- 2-of-3-column spans, free-form gaps, per-tile pixel heights, phone/responsive layouts.
- Changes to `ai_dashboard_proxy` (config save endpoint already accepts the whole config object).
