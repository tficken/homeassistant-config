# Bug Fixes + Proxy/Dashboard Hardening — Design Spec

**Date:** 2026-08-18
**Status:** Approved (design), pending implementation plan
**Scope:** Correctness fixes in the HA YAML config, live-update bug fixes in the AI dashboard, hardening of the `ai_dashboard_proxy` integration, and targeted code-quality fixes in the dashboard frontend.

This spec consolidates the findings of a full audit of `configuration.yaml`, `automations.yaml`, `scripts.yaml`, `ipad-wall-panel.yaml`, `www/ai-dashboard/` (`index.html`, `config.json`), and `custom_components/ai_dashboard_proxy/` (`http.py`).

---

## A. HA YAML fixes

### A1. Remove the `backyard night motion` automation

- **File:** `automations.yaml:1-21`
- **Problem:** The automation turns `siren.downstairs_siren_2` on and nothing anywhere turns it off. The user confirmed it never actually fires.
- **Fix:** Delete the whole automation block (id `1784005048682`). No other automation references it.

### A2. Fix broken tile entity in the iPad wall panel

- **File:** `ipad-wall-panel.yaml:74`
- **Problem:** The "Living Room On" tile references `scene.living_room_lights_on`, which does not exist. The corresponding script `script.living_room_lights_on` exists in `scripts.yaml:122`.
- **Fix:** Change the tile's `entity:` to `script.living_room_lights_on`.

### A3. Printer notifications go to the phone

- **File:** `automations.yaml:137-167, 182-212` (four automations: print finished / print error for each of the two P1S printers)
- **Problem:** Notifications use only `persistent_notification.create`, which is invisible unless someone opens the HA UI.
- **Fix:** Add a `notify.mobile_app_traviss_iphone` action alongside the existing persistent_notification in each of the four automations, reusing the same title/message templates.

### A4. Backup failure alerts

- **Files:** `scripts/create_weekly_backup.py`, `scripts/cleanup_old_backups.py`
- **Problem:** The automations (`automations.yaml:23-45`) invoke the scripts via `shell_command`; failures only land in a log file. Exit codes are not surfaced to HA.
- **Fix:** In each Python script, wrap the main flow so that on failure it POSTs to the HA API (`/api/services/notify/mobile_app_traviss_iphone`) using the `SUPERVISOR_TOKEN` environment variable the scripts already read, sending the failure reason. Success path unchanged. Keep the change minimal — a small `notify_failure(message)` helper in each script.

---

## B. Dashboard live-update bugs (`www/ai-dashboard/index.html`)

### B1. Fix stale live updates (`entityBelongsToScreen`)

- **Location:** `entityBelongsToScreen()` at `index.html:1314-1340`
- **Problem:** The home-screen entity map only includes `weather` + presence (plus security/system extras). The `doors` and `environment` sections and `calendar.*` entities are unmapped, and the status-screen map omits the dynamically discovered `sensor.*_print_status` / `*_print_progress` / `*_remaining_time` entities. `updateCard()` (`index.html:1342`) therefore drops those state events — door open/close, room temps, on-call shifts, and print progress stay stale until the user switches screens.
- **Fix:** Add `doors` and `environment` section entities and `calendar.*` prefix matching to the home map; add printer-sensor suffix matching to the status map.

### B2. Radar map init-once

- **Location:** `renderHomeScreen()` calls `initRadarMap()` unconditionally at `index.html:1172`; `initRadarMap()` at `index.html:844-880` destroys the map, clears the animation interval, re-fetches `api.rainviewer.com`, and re-adds 8 tile layers.
- **Problem:** Every state event routed to the home screen (including frequently-updating system sensors) tears down and rebuilds the Leaflet map — visible flicker, tile re-downloads, CPU churn on the wall iPad.
- **Fix:** Guard with `if (radarMap) return;` — build the map only on screen entry (and rebuild on resize if needed). State updates must not re-trigger map init.

### B3. Render the configured dock

- **Location:** `renderDock()` at `index.html:915-920` hardcodes the 4 screen buttons; `config.dock.items` (`config.json:155-172`) is never read.
- **Problem:** The configured quick actions (`scene.all_lights_off` "All off", `script.goodnight` "Goodnight", settings) don't exist on screen.
- **Fix:** Render `config.dock.items` as action buttons alongside the screen switcher. Items with `entityId` call the appropriate service (scene/script `turn_on`) over the WS proxy; items with `action: "settings"` open the settings modal. Keep the 4 screen buttons.

### B4. Purge dead config keys

- **Locations:** `config.json:14-19, 27`; `DEFAULT_CONFIG` at `index.html:284`; missing-entity cleanup references at `index.html:1710-1711, 1740-1741`
- **Problem:** `layout.left/center/right` (home layout is hardcoded), `entities.temperatures`, and `entities.summaryChips` are never rendered — they mislead anyone using the Settings editor.
- **Fix:** Remove these keys from `DEFAULT_CONFIG` and `config.json`, and remove their cleanup-block references. Keep `layout.clock24h`, `presenceLabels`, `labels`, and everything else.

### B5. Labels support end-to-end

- **Locations:** `friendlyName()` honors `config.labels` at `index.html:450`; `CONFIG_KEYS` in `http.py:347` omits `"labels"`.
- **Problem:** A labels-only save payload would 400; there is no Settings UI for label overrides.
- **Fix:** Add `"labels"` to `CONFIG_KEYS` in the proxy. Add a simple label-override editor to the Settings modal (per-entity text input listing current overrides with add/remove).

---

## C. Proxy hardening (`custom_components/ai_dashboard_proxy/http.py`)

### C1. WebSocket heartbeat

- **Location:** `web.WebSocketResponse()` at `http.py:176`
- **Fix:** `web.WebSocketResponse(heartbeat=30)` so half-open connections (sleeping iPad, network blips) are reaped server-side.

### C2. Service-call domain allowlist

- **Location:** WS service-call handler at `http.py:225-231`
- **Problem:** Any authorized LAN client can call any HA domain/service through the proxy, including `homeassistant.restart`.
- **Fix:** Allow only: `light`, `switch`, `scene`, `script`, `media_player`, `vacuum`, `siren`, `lock`, `cover`, `fan`, `climate`, `input_boolean`. Reject others with an error result naming the disallowed domain.

### C3. Prune config backups

- **Location:** config save at `http.py:374-379`
- **Fix:** After writing `config.json.bak.<timestamp>`, keep the newest 10 backups and delete older ones.

### C4. Area map refresh

- **Location:** area map built once at setup, `http.py:399`
- **Fix:** Rebuild the area/entity map when the area or entity registry changes (listen for `EVENT_AREA_REGISTRY_UPDATED` / `EVENT_ENTITY_REGISTRY_UPDATED`), so `window.HA_AREAS` stays current without an HA restart.

### C5. Dead-socket future exceptions

- **Location:** `forward_event()` at `http.py:184-196`
- **Problem:** `run_coroutine_threadsafe` results are never checked; `send_json` failures on closing sockets surface as "Future exception was never retrieved" log noise.
- **Fix:** Add a done-callback that retrieves and logs/swallows exceptions, and skip forwarding when the socket is closed.

### C6. Drop the duplicate WS handshake

- **Locations:** server auto-sends full states with `id: 1` at `http.py:202-210`; client sends its own `get_states` (`id: 1`) and `subscribe_events` at `index.html:1807-1808`
- **Problem:** Two full state payloads per connect; `subscribe_events` is silently ignored by the server (events are always forwarded), which is misleading.
- **Fix:** In proxy mode, the client sends neither — it consumes the server-pushed states.

---

## D. Dashboard code quality (`index.html`)

### D1. History cache TTL

- **Location:** `fetchHistory()` at `index.html:377-388`
- **Fix:** Store `fetchedAt` per entity; refetch when older than 30 minutes.

### D2. Guard `JSON.parse` on WS messages

- **Location:** `index.html:1811, 1839`
- **Fix:** Wrap in try/catch; log and drop malformed frames.

### D3. Skip registry fetches when proxied

- **Location:** `fetchRegistry()` at `index.html:677-688`
- **Problem:** Calls HA registry REST endpoints with no token in proxy mode — both 401, logging console errors, and `entityById` stays empty.
- **Fix:** Skip both calls when `window.HA_INTEGRATION_PROXY` is set (the proxy already injects `window.HA_AREAS`).

### D4. Targeted DOM updates

- **Location:** `updateCard()` at `index.html:1342-1348`
- **Problem:** Every matching state event re-renders the entire active screen via innerHTML — loses scroll positions and resets the brightness slider mid-drag.
- **Fix:** Update the changed `[data-entity-id]` node in place (state text, toggle/active classes, attribute-driven visuals). Fall back to a full re-render for structural changes (e.g. printer cards appearing/disappearing). This is the riskiest item in this spec — verify slider drag, scroll retention, and section rendering manually.

### D5. Vendor Leaflet

- **Location:** CDN references at `index.html:7-9`
- **Fix:** Download Leaflet JS/CSS (and marker images) into `www/ai-dashboard/vendor/leaflet/` and update the references. Google Fonts stays on CDN with the existing mono fallback (user decision).

### D6. Clock measurement

- **Location:** `updateClock()` at `index.html:1367-1373` reads `scrollWidth` every second (forced layout).
- **Fix:** Measure on render/resize; the per-second tick only updates text content.

### D7. Connection-lost banner

- **Location:** WS close handling at `index.html:640-651`; LED style at `index.html:254-255`
- **Fix:** Show a full-width amber "CONNECTION LOST — retrying" banner reusing the alert-banner style while the WS is down; hide on reconnect.

### D8. Radar per-frame timestamp

- **Location:** animation interval at `index.html:879`
- **Fix:** Label shows the currently displayed frame's time (`useFrames[idx].time`), not always the latest frame.

### D9. Quick Controls renders switches

- **Location:** `renderControlScreen()` filters to `light.*` only at `index.html:1184`
- **Fix:** Render `switch.*` entities in Quick Controls with a toggle card (same service-call path as lights).

---

## Explicitly out of scope

- New dashboard features: media volume/power controls, vacuum start/dock buttons, printer glance tile on home, open-door alert banner, screensaver/dim, tap-to-live camera, forecast precip/hourly, loading splash.
- HA housekeeping: unused `input_boolean.voice_mute`, unreferenced `script.all_lights_off` / `script.restart_ha`, stale `updater` recorder exclusion, backup log rotation, merging the two PagerDuty automations.
- UX polish: muted-text contrast, media/dock touch-target sizes, openHASP offline verification.

## Validation

Run the repo's CI checks locally before and after:

```bash
python scripts/validate_ha_yaml.py
python -m json.tool www/ai-dashboard/config.json > /dev/null
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
python -m compileall custom_components/ai_dashboard_proxy -q
```

Manual verification:

1. **HA YAML:** reload automations/scripts/Lovelace (or restart); confirm the wall-panel "Living Room On" tile works and the siren automation is gone from the UI.
2. **Dashboard (B/D):** hard-refresh; open/close a door and watch the home screen update without switching screens; confirm the radar no longer flickers on state events; drag a light brightness slider while state events arrive; verify dock "All off"/"Goodnight" buttons fire; disconnect network briefly and confirm the connection-lost banner appears and clears.
3. **Proxy (C):** restart Home Assistant; confirm the dashboard reconnects and works; attempt a disallowed service call (e.g. `homeassistant.restart`) from the browser console and confirm it is rejected; save config twice and confirm old `.bak` files are pruned to 10.

**Restart required:** changes to `custom_components/ai_dashboard_proxy/` (Batch C, B5's `CONFIG_KEYS` change) require a Home Assistant restart. YAML changes (Batch A) need automations/Lovelace reload. Dashboard file changes (B, D) need only a browser hard-refresh.
