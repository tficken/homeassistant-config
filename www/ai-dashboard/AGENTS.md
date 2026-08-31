# AI Dashboard Guide

`www/ai-dashboard/` is a custom retro-terminal wall dashboard served at `/ai-dashboard/`, built as a standalone HTML/JS/CSS app and proxied through `custom_components/ai_dashboard_proxy/`. It is designed for landscape wall-mounted iPads / tablets and is the primary wall UI in this house.

The two halves of the system:

- **Frontend**: `index.html` (markup + all JS/CSS inline), `config.json` (persisted user config), `vendor/leaflet/` (vendored radar map library — no CDN dependency; Google Fonts still loads from CDN), `snapshots/` (camera event archive, git-ignored).
- **Backend**: `custom_components/ai_dashboard_proxy/` (self-written, not HACS-managed). **Any change to its Python requires a Home Assistant restart** — a browser refresh is not enough.

---

## Screens

Four screens are switched via a bottom dock, which also renders the quick-action buttons configured in `config.dock.items` (e.g. All off / Goodnight):

- **HOME** — clock, weather + room monitors, radar + presence + doors. Door "opened" and presence "last seen" times are seeded from recorder history via `POST /ai-dashboard/api/history` and tracked from live WS transitions, so HA restarts don't reset them.
- **CONTROL HUB** — scenes, scripts, lights, media.
- **SECURITY** — camera feeds (front door last-activity snapshot; backyard true live MJPEG that auto-starts/stops with the screen) plus a HISTORY chip per camera opening the motion/ding event archive modal, and alarm-related sensors. See "Camera event archive" below and `docs/ring-cameras.md` for the streaming constraints.
- **STATUS MONITOR** — per-area environment sensors with 24-hour sparklines for temperature/humidity, plus host/system metrics.

The radar is a RainViewer overlay on a keyless Esri dark-gray basemap, with the Esri World_Transportation (bold highways/interstates) and World_Boundaries_and_Places_Alternate (state lines + city labels, light-on-dark variant) reference layers above the radar frames. Camera feeds and the radar map render above the CRT scanline/vignette overlays for clarity — the overlay divs live inside `#app`, because outside it, `#app`'s own stacking context would keep any content z-index from winning.

---

## Content Changes: Prefer the Built-in Settings Editor

Click `[ SETTINGS ]` in the bottom dock. Do this for any content/layout change before hand-editing `config.json`.

- **Layout tab** — a visual preview editor: an entity palette (filterable, grouped by area, with a "not on dashboard" toggle and a missing-entity cleanup block) on the left, and a scaled live preview of the selected screen (screen tabs across the top) on the right. Drag panels by their headers to reorder them within or between columns; drag entities from the palette onto a panel to add them (an entity can live in multiple sections at once — palette drags add, card drags move); drag cards between panels to move them; click a card's × (or drag it back to the palette) to remove it. Section titles/icons are editable by clicking a panel's title. An amber badge warns when a column's panels overflow the screen height.
- **Appearance tab** — accent color, clock format, weather/media entity picks.
- **Labels tab** — per-entity display-name overrides (`config.labels`).
- **Save & Apply** persists to `config.json` on the server via `POST /ai-dashboard/api/config`. A timestamped `config.json.bak.*` backup is created on every save, pruned to the newest 10. Changes are shared by all devices.

### Layout model: `config.panels`

Screen → columns → ordered panel ids, with defensive defaults in `DEFAULT_PANELS` (it replaced the old `sectionOrder` board). Panels can be rearranged within or between columns of a screen. **Moving a panel to a DIFFERENT screen is not supported**: each screen's builder only builds its own panels, and hand-editing `config.panels` that way yields an empty slot on the target screen while the defensive merge re-appends the panel on its default screen.

Only edit `config.json` by hand for structural changes the editor doesn't cover.

The Layout tab's measured overflow badge reflects current content only — it cannot predict future states such as printer cards appearing mid-print or the on-call panel appearing when a shift starts.

---

## Proxy Endpoints and Behavior (`custom_components/ai_dashboard_proxy/http.py`)

- Serves dashboard assets with registry-derived area names injected.
- `/ai-dashboard/ws` — WebSocket proxying HA state events and service calls.
  - Service calls are restricted to `ALLOWED_SERVICE_DOMAINS` (light, switch, scene, script, media_player, vacuum, siren, lock, cover, fan, climate, input_boolean). A dashboard feature calling any other domain is rejected with `domain_not_allowed` until the domain is added there.
  - Answers `{type:"ping"}` with `{type:"pong"}` — the dashboard client runs an app-level ping watchdog plus a visibilitychange/pageshow force-reconnect to recover half-open sockets after a wall tablet wakes from sleep.
- `POST /ai-dashboard/api/forecast` — weather forecast, server-side so the dashboard needs no HA token.
- `POST /ai-dashboard/api/history` — recorder state history for sparklines, via `homeassistant.components.recorder.history.get_significant_states` run in the recorder executor.
- `POST /ai-dashboard/api/config` — persists config to `config.json` with a timestamped backup and atomic write.
- `GET /ai-dashboard/cam_stream/{entity_id}` — authenticated MJPEG camera stream passthrough (`/api/camera_proxy_stream` 403s for remote browser sessions).
- `GET /ai-dashboard/api/snapshots?camera=<key>` — lists the motion/ding archive (see below).

### Auth model

`_is_authorized` allows a request if **any** of these hold:

1. The client IP is private/LAN (by design — wall tablets need zero-config access; the LAN is the trust boundary).
2. The request carries HA's authenticated-session flag.
3. The request presents the configured secret as `Authorization: Bearer <secret>` or a `?secret=` query param (the query-param form will end up in browser history and proxy logs — prefer the header where possible).

Area names are resolved by reading `.storage/core.area_registry` / `core.device_registry` / `core.entity_registry` JSON directly (in an executor job), not via HA's registry helper APIs — if area names ever silently stop appearing after an HA upgrade, suspect a registry schema change there first.

---

## Camera Event Archive

`GET /ai-dashboard/api/snapshots?camera=<key>` lists archives under `www/ai-dashboard/snapshots/<key>/` (git-ignored): 10s mp4 clips recorded from the ring-mqtt RTSP feed by the `ring_snapshot_archive_*` automations (see `automations.yaml` and `docs/ring-cameras.md`), plus legacy jpg stills. Pruning: past 14 days / 100 files. Files are written by the automations and served as static dashboard assets.

---

## Development Workflow

1. Edit `www/ai-dashboard/index.html` and/or `www/ai-dashboard/config.json` directly (for content changes, prefer the Settings editor above).
2. Validate HTML/JSON syntax:
   ```bash
   # HTML — using local Node.js
   .tools/node/node.exe -e "const HTMLParser = require('node-html-parser'); HTMLParser.parse(require('fs').readFileSync('www/ai-dashboard/index.html', 'utf8')); console.log('HTML parse OK')"
   # HTML — Python fallback
   py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
   # JSON
   python -m json.tool www/ai-dashboard/config.json > /dev/null
   ```
3. Hard-refresh the dashboard in the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) — the proxy serves files directly from `www/ai-dashboard/`.
4. If you changed anything under `custom_components/ai_dashboard_proxy/` (Python), **restart Home Assistant**.
   - CI also runs `flake8` and `compileall` on the proxy — see the root `AGENTS.md` CI section for the local equivalents.
