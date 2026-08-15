# AI Dashboard — Shared Config, Section Editor, and New-Device Suggestions

**Date:** 2026-08-15
**Status:** Approved design (pending spec review)
**Scope:** `www/ai-dashboard/index.html`, `www/ai-dashboard/config.json`, `custom_components/ai_dashboard_proxy/`

## Problem

The AI dashboard's sections are hardcoded entity lists in `config.json`. Adding a new
light or smart outlet to Home Assistant does not surface it on the dashboard — someone
must edit `config.json` by hand. Settings are stored per-browser in `localStorage`, so
changes made on one wall tablet do not appear on others, and making them permanent
requires an export/copy file dance.

## Goals

1. **Shared, server-side config.** One `config.json` on the server is the single source
   of truth; all tablets/browsers load and save the same config.
2. **Full section editor.** From the dashboard's Settings overlay: rename sections,
   reorder sections, add/remove/reorder tiles within a section, and move tiles between
   sections — with drag-and-drop that works on iPad touch and desktop mouse.
3. **New-device suggestions, not auto-add.** The dashboard flags entities that exist in
   HA but are not on the dashboard, with one-tap placement into a chosen section. New
   devices never appear on screens on their own. It also flags config entries whose
   entity no longer exists, with one-tap removal.

## Non-goals

- No auto-discovery rules engine (no "auto-include all lights in area X").
- No creating/deleting sections, no choosing which screen a section appears on. The
  four screens (HOME / CONTROL HUB / SECURITY / STATUS MONITOR) and their fixed panels
  (clock, radar, weather, media card) stay as they are.
- No per-device config overrides; `localStorage` persistence is removed.
- No frontend dependencies; no build step. Vanilla JS, matching the existing file.

## Current State (as found)

- `index.html` (~1360 lines) already has a Settings overlay covering accent color, 24h
  clock, weather/media entity pickers, and Quick Controls add/remove.
- `loadConfig()` merges `DEFAULT_CONFIG` ← `config.json` ← `localStorage`
  (`ha_dashboard_config`). `saveConfig()` writes only `localStorage`.
- The dashboard already fetches the entity registry and area registry, and the proxy
  injects `window.HA_AREAS` (entity_id → area name) into `index.html`.
- The proxy (`custom_components/ai_dashboard_proxy/http.py`) already exposes
  authenticated POST helper endpoints (`/ai-dashboard/api/forecast`,
  `/ai-dashboard/api/history`) gated by `_is_authorized()` (LAN client, HA session, or
  shared secret).
- Pre-existing inconsistency: the Settings "Quick Controls" editor writes
  `config.entities.quickControls`, but `renderControlScreen()` reads
  `config.sections.quickControls.entities`. This is unified by this design.
- The STATUS MONITOR screen already auto-discovers Bambu printer cards from live
  states; that behavior is untouched.

## Design

### 1. Server-side config persistence (proxy)

New route in `http.py`, registered in `async_setup_http` before the catch-all:

```
POST /ai-dashboard/api/config
```

- Guarded by the existing `_is_authorized()` check (same as forecast/history).
- Body must be a JSON object containing at least one known top-level key
  (`theme`, `layout`, `entities`, `sections`, `dock`, `presenceLabels`); otherwise 400
  and no write.
- Write path (`hass.config.config_dir/www/ai-dashboard/config.json`):
  1. If `config.json` exists, copy it to `config.json.bak.<YYYYMMDD_HHMMSS>`
     (matches the existing `.bak` convention in that folder).
  2. Write to `config.json.tmp`, then `os.replace()` to `config.json` (atomic).
- File I/O runs via `hass.async_add_executor_job`; JSON body capped implicitly by
  aiohttp's default client max size.
- Returns `200 {"success": true}`; `500` with a plain-text error on failure.
- Requires a Home Assistant restart to take effect (proxy is Python).

### 2. Config load/save flow (dashboard JS)

- `loadConfig()`: fetch `config.json` (no-store), deep-merge over `DEFAULT_CONFIG`.
  `localStorage` is no longer read or written.
- `saveConfig()`: `POST /ai-dashboard/api/config` with the full config object; on
  success, keep the in-memory config and re-render. On failure, show a status message
  in the overlay; the in-memory config stays live so the dashboard keeps working, and
  Export remains available as a manual fallback.
- Export/Import JSON buttons remain (backups, moving configs between instances).
- Non-proxy fallback (opening the file directly without the integration): the POST
  will 404; the dashboard catches this, shows "save unavailable — use Export", and
  keeps running from the in-memory config.

### 3. Settings overlay → tabbed editor

The overlay gains tabs: **Appearance**, **Sections**, **New Devices**, **Data**.

- **Appearance**: existing controls (accent color, 24h clock, weather entity, media
  player entity). The old "Quick Controls" section is removed from here — those
  entities are now edited in the Sections tab like everything else.
- **Sections**: the editor, below.
- **New Devices**: suggestions, below.
- **Data**: export, import, clear token (existing).

Saving applies immediately: `renderAll()` runs after every mutation so the dashboard
behind the (semi-transparent) overlay reflects changes; the POST to the server happens
on "Save & Apply".

### 4. Sections editor

- Sections are listed grouped under read-only screen headers (HOME, CONTROL HUB,
  SECURITY, STATUS MONITOR) matching the hardcoded screen composition.
- Each section row: drag handle, editable title, editable icon, tile chips, an "add
  entity" picker, and a drag handle for reordering sections.
- Tiles: chips showing friendly name + domain icon. Drag to reorder within the section
  or drop into another section. A × on each chip removes it.
- Add entity: searchable picker (text filter over friendly name, entity ID, and area
  name) populated from live states + registry.
- Config model changes:
  - `config.sections` gains an explicit order via a new `config.sectionOrder` array of
    section keys. Render functions that stack multiple section panels in one column
    (HOME right column: presence/doors) iterate this order instead of hardcoding
    sequence. Grid-fixed panels keep their positions regardless of order.
  - Panel titles/icons become config-driven: renderers read
    `config.sections.<key>.title` / `.icon` instead of hardcoded strings (e.g.
    `renderTerminalPanel("SCENES", …)`).
  - `config.entities.quickControls` is removed; `config.sections.quickControls.entities`
    is the only quick-controls list. `loadConfig()` migrates: if
    `entities.quickControls` exists and `sections.quickControls.entities` is absent or
    empty, copy the former into the latter.

### 5. Drag-and-drop mechanics

- One reusable module (~120 lines) using Pointer Events (`pointerdown` on a drag
  handle → `setPointerCapture` → `pointermove` → `pointerup`).
- While dragging: the chip follows the pointer; an insertion indicator line shows the
  drop position within the target section; hovering another section's body marks it as
  the drop target.
- Dragging only starts from handles, so normal tile taps (toggle entity) are
  unaffected.
- Works with touch (iPad wall panel) and mouse. No external libraries.

### 6. New Devices tab

- Compute the set of entity IDs referenced anywhere in config (all
  `sections.*.entities`, `entities.weather`, `entities.mediaPlayer`,
  `entities.temperatures`, `dock.items[].entityId`, `sections.doors.lastActivity`
  values).
- **New entities**: entities from live states/registry not referenced, filtered to
  dashboard-worthy domains: `light`, `switch`, `scene`, `script`, `fan`, `sensor`,
  `binary_sensor`, `camera`, `media_player`, `vacuum`, `lock`, `cover`, `siren`,
  `update`. Each row: friendly name, entity ID, area, and an "Add to section" dropdown
  that appends it to the chosen section.
- **Missing entities**: config-referenced IDs with no live state and no registry
  entry, each with a one-tap remove button.

### 7. Error handling

- Save POST failure → inline status message in the overlay; in-memory config retained;
  dashboard unaffected.
- Malformed POST body → 400, no file write, no backup created.
- Entities that are unavailable at runtime render as OFFLINE (existing behavior).
- Import of invalid JSON → alert, no state change (existing behavior).

## Testing

No automated test harness exists for the dashboard; verification is:

1. `flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503`
   and `python -m compileall custom_components/ai_dashboard_proxy -q` (matches CI).
2. HTML parse check on `index.html` and `json.tool` on `config.json` (matches CI).
3. Restart Home Assistant (proxy change), hard-refresh the dashboard.
4. Manual checks:
   - Reorder tiles within a section and move a tile between sections (mouse and iPad
     touch); reorder two sections; rename a section; reload the page and confirm
     persistence.
   - Open the dashboard in a second browser and confirm it loads the saved config
     (shared config works).
   - Confirm `config.json.bak.<timestamp>` was created on save.
   - Add an entity via New Devices; remove a missing entity.
   - Disconnect the network / block the endpoint and confirm save failure degrades
     gracefully.

## Risks / Notes

- The proxy writes into `www/ai-dashboard/` at runtime; this is the same trust level
  as its existing read access, and the endpoint is behind the same auth gate.
- `sectionOrder` only affects vertically stacked section panels; grid-fixed panels
  (clock, radar, weather, media) do not move. This is intentional per non-goals.
