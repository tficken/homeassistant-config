# AI Dashboard — Layout Fill & Rebalance

**Date:** 2026-08-15
**Status:** Approved by user, implementing directly
**Scope:** `www/ai-dashboard/index.html` only (CSS + screen renderers). No proxy, no config schema changes, no HA restart.

## Problem

Screenshots of the live dashboard (1920×929) show large blank areas on every screen:
panels size to their content instead of filling the available space.

- **HOME**: clock column ~60% empty (clock vertically centered in a column of its own);
  ROOM MONITORS panel content hugs the top.
- **CONTROL HUB**: SCENES and QUICK CONTROLS columns end at ~40% height; SCRIPTS
  overflows; media card sits under the longest column.
- **SECURITY**: SECURITY panel ends mid-screen; last-activity cards show raw ISO
  timestamps.
- **STATUS MONITOR**: bottom half fully empty.

## Design (approved)

1. **Home**: clock + date move to the top of the left column; PRESENCE panel moves from
   the right column to under the clock and fills the remaining height. Right column:
   radar (grows) + DOORS. Room monitor cards stretch to fill their panel.
2. **Control Hub**: scene buttons stretch vertically to fill their column (bigger touch
   targets); light cards stretch likewise; media card moves from the scripts column to
   the bottom of the quick-controls column; scripts column keeps content height and
   scrolls when long.
3. **Security**: SECURITY panel flexes to fill space under the cameras; its cards
   distribute evenly. `renderMetricCard` displays any sensor with
   `device_class: timestamp` as relative time ("1d ago") instead of the raw ISO string.
4. **Status Monitor**: ENVIRONMENT and SYSTEM panels fill full column height; metric
   content distributes vertically.
5. **Weather fix**: `LO --` — when the weather entity lacks `templow`, fall back to
   today's forecast low from `forecastCache.daily[0]`.

## Mechanism

- `renderTerminalPanel(title, bodyHtml, cls)` gains an optional class parameter.
- New CSS: `.terminal-panel.fill` makes a panel fill its container (flex column, body
  flexes); stretch containers distribute child cards/buttons via `flex: 1`.
- Existing scroll behavior is preserved: columns with more content than fits still
  scroll (`overflow-y: auto` wrappers unchanged).

## Testing

- JS syntax check (`new Function` on the extracted `<script>`) + Python `html.parser`
  check after edits.
- Visual verification of all four screens via WebBridge screenshots (1920×929).
- Browser refresh only; no HA restart.
