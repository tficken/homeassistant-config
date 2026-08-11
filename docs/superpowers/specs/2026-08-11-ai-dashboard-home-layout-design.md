# AI Dashboard Home Layout Polish — Design Spec

## Goal
Tighten the Home screen of the AI wall dashboard so presence is compact, room monitors are visible at a glance, and the layout feels balanced across different iPad / wall-panel / browser sizes.

## Visual Style
- Keep the existing retro-terminal / Fallout-green theme (`--bg`, `--green`, `.terminal-panel`, mono font).
- No new colors or fonts. Re-use `.terminal-panel`, `.panel-title`, `.status-led`, and `.offline-badge`.

## Layout

### Home screen grid
- 3-column CSS Grid kept in landscape: `grid-template-columns: 0.9fr 1.2fr 1fr; gap: 14px;`.
- The grid is the main content area between the top status bar and the bottom dock.
- Column contents:
  1. **Left — Clock**: date/time only, vertically centered so the large empty area feels intentional.
  2. **Center — Weather**: current conditions + 5-day forecast strip.
  3. **Right — Radar + Presence + Room Monitors**: stacked top-to-bottom, each in a `.terminal-panel`. Radar takes the remaining vertical space after presence and room monitors.

### Presence strip
- Two equal-width cards side-by-side inside one `.terminal-panel` titled `PRESENCE`.
- Each card: circular avatar initial, friendly name (Travis / Bobbie), status LED + `HOME`/`AWAY` text.
- Card layout uses flexbox: `display:flex; align-items:center; gap:12px;`.
- Both cards are always the same width (`flex:1`).

### Room monitors
- One `.terminal-panel` titled `ROOM MONITORS`.
- Inside: one sub-panel per Home Assistant area found in `sections.environment`.
- Each room card shows:
  - Room name as a small uppercase mono label.
  - Temperature (large, green) and humidity (smaller, muted) in a 2-column grid.
- Sensors are matched by `device_class`: `temperature` and `humidity`.
- If a room has only one sensor type, the missing value shows `--`.
- Offline sensors render the existing `OFFLINE` badge instead of the numeric value.

### Responsive behavior
- Landscape orientation always keeps the 3-column grid.
- Sizing is fluid:
  - Clock uses `clamp(4rem, 9vw, 6.5rem)`.
  - Card gaps stay at `14px`.
  - Panel padding stays consistent.
- No portrait-specific collapse is required; the dashboard is intended for horizontal wall mounts.
- If a panel is too small to show all room monitors, the right column scrolls internally rather than breaking the grid.

## Data Sources
- Presence entities come from `config.sections.home.entities` filtered to `person.*` and `device_tracker.*` (existing `getPresenceEntities()`).
- Room monitor entities come from `config.sections.environment.entities`.
- Area names come from the existing `entityArea()` helper, which reads `window.HA_AREAS` populated by the dashboard proxy.
- Fallback: if no area mapping exists, each sensor renders as its own mini room card using the friendly name.

## Error Handling
- Missing weather / radar / sensor state renders `--` or the existing offline badge.
- Empty environment section shows a muted "NO ROOM DATA" message.

## Configuration
- No required changes to `config.json`.
- Optional future addition: `sections.roomMonitors` to override which entities/areas appear.

## Files Affected
- `www/ai-dashboard/index.html` — home-screen render function, new room-monitor renderer, presence layout change.
- `www/ai-dashboard/config.json` — no required changes; labels already map `person.woteg` to "Travis" and `person.bobbie` to "Bobbie".
