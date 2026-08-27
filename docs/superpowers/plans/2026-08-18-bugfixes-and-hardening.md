# Bug Fixes + Proxy/Dashboard Hardening Implementation Plan

> **Note (2026-08-26):** All tasks completed and shipped (checkboxes were left unchecked during execution). One detail is stale: the radar basemap is now keyless Esri World Dark Gray + RainViewer overlay (not CartoCDN), so tile requests in verification checklists should read accordingly.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved four-batch fix set (HA YAML fixes, dashboard live-update bugs, proxy hardening, dashboard code quality) from `docs/superpowers/specs/2026-08-18-bugfixes-and-hardening-design.md`.

**Architecture:** Home Assistant YAML config (automations, wall panel, backup scripts) is fixed in place; the single-file dashboard (`www/ai-dashboard/index.html` + `config.json`) gets targeted JS/HTML edits; the `ai_dashboard_proxy` custom integration (`custom_components/ai_dashboard_proxy/http.py`) gets hardening edits. Leaflet is vendored as static files under `www/ai-dashboard/vendor/leaflet/`.

**Tech Stack:** Home Assistant YAML, vanilla JS (single-file index.html), Python/aiohttp (ai_dashboard_proxy)

## Global Constraints

- No new dependencies or package manifests; vendor Leaflet as static files only.
- YAML: 2-space indent, match surrounding style; automations keep existing `id`/`alias`/`mode` conventions.
- Changes to custom_components/ai_dashboard_proxy/ require an HA restart; index.html/config.json changes need only a browser hard-refresh; automations.yaml/ipad-wall-panel.yaml need YAML reload.
- All validation commands run from //HOMEASSISTANT/config/ using the repo CI checks.
- Do not run `git commit` without explicit user approval; the commit step in each task is executed only when the user has approved git mutations.

## Baseline validation

Run once before starting, so pre-existing failures are known:

- [ ] `python scripts/validate_ha_yaml.py`
- [ ] `python -m json.tool www/ai-dashboard/config.json > /dev/null`
- [ ] `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
- [ ] `flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503`
- [ ] `python -m compileall custom_components/ai_dashboard_proxy -q`

---

### Task 1: automations.yaml — remove backyard night motion, add phone notify to printer automations (A1 + A3)

**Files:** Modify `automations.yaml` (delete lines 1-22; edit the four printer automations spanning lines 124-212).

**Interfaces:** None. Independent of all other tasks.

Spec note: the spec cited actions regions `137-167, 182-212`; the actual four automations span lines 124-212, with `actions:` blocks at 137-143 (`bambu_p1s_print_finished`), 161-167 (`bambu_p1s_print_error`), 182-188 (`bambu_p1s_uno_print_finished`), 206-212 (`bambu_p1s_uno_print_error`).

- [ ] Delete the whole `backyard night motion` automation (id `1784005048682`) at the top of the file, including the blank line after it. Before (lines 1-22):

```yaml
- id: '1784005048682'
  alias: backyard night motion
  description: ''
  triggers:
  - trigger: event.received
    target:
      entity_id: event.downstairs_motion
    options:
      event_type:
      - motion
  conditions:
  - condition: sun
    after: sunset
    before: sunrise
  actions:
  - action: siren.turn_on
    metadata: {}
    target:
      entity_id: siren.downstairs_siren_2
    data: {}
  mode: single

- id: cleanup_old_backups
```

  After: the file starts directly with:

```yaml
- id: cleanup_old_backups
```

- [ ] In `bambu_p1s_print_finished` (currently lines 137-143), add a phone notify action after the existing `persistent_notification.create` action. Before:

```yaml
  actions:
    - action: persistent_notification.create
      data:
        title: "P1S print finished"
        message: "P1S print status changed to {{ trigger.to_state.state }}."
        notification_id: bambu_p1s_print_finished
  mode: single
```

  After:

```yaml
  actions:
    - action: persistent_notification.create
      data:
        title: "P1S print finished"
        message: "P1S print status changed to {{ trigger.to_state.state }}."
        notification_id: bambu_p1s_print_finished
    - action: notify.mobile_app_traviss_iphone
      data:
        title: "P1S print finished"
        message: "P1S print status changed to {{ trigger.to_state.state }}."
  mode: single
```

- [ ] In `bambu_p1s_print_error` (currently lines 161-167), add the phone notify action. Before:

```yaml
  actions:
    - action: persistent_notification.create
      data:
        title: "P1S print error"
        message: "P1S reported an error ({{ trigger.entity_id }}: {{ trigger.to_state.state }})."
        notification_id: bambu_p1s_print_error
  mode: single
```

  After:

```yaml
  actions:
    - action: persistent_notification.create
      data:
        title: "P1S print error"
        message: "P1S reported an error ({{ trigger.entity_id }}: {{ trigger.to_state.state }})."
        notification_id: bambu_p1s_print_error
    - action: notify.mobile_app_traviss_iphone
      data:
        title: "P1S print error"
        message: "P1S reported an error ({{ trigger.entity_id }}: {{ trigger.to_state.state }})."
  mode: single
```

- [ ] In `bambu_p1s_uno_print_finished` (currently lines 182-188), add the phone notify action. Before:

```yaml
  actions:
    - action: persistent_notification.create
      data:
        title: "P1S UNO print finished"
        message: "P1S UNO print status changed to {{ trigger.to_state.state }}."
        notification_id: bambu_p1s_uno_print_finished
  mode: single
```

  After:

```yaml
  actions:
    - action: persistent_notification.create
      data:
        title: "P1S UNO print finished"
        message: "P1S UNO print status changed to {{ trigger.to_state.state }}."
        notification_id: bambu_p1s_uno_print_finished
    - action: notify.mobile_app_traviss_iphone
      data:
        title: "P1S UNO print finished"
        message: "P1S UNO print status changed to {{ trigger.to_state.state }}."
  mode: single
```

- [ ] In `bambu_p1s_uno_print_error` (currently lines 206-212), add the phone notify action. Before:

```yaml
  actions:
    - action: persistent_notification.create
      data:
        title: "P1S UNO print error"
        message: "P1S UNO reported an error ({{ trigger.entity_id }}: {{ trigger.to_state.state }})."
        notification_id: bambu_p1s_uno_print_error
  mode: single
```

  After:

```yaml
  actions:
    - action: persistent_notification.create
      data:
        title: "P1S UNO print error"
        message: "P1S UNO reported an error ({{ trigger.entity_id }}: {{ trigger.to_state.state }})."
        notification_id: bambu_p1s_uno_print_error
    - action: notify.mobile_app_traviss_iphone
      data:
        title: "P1S UNO print error"
        message: "P1S UNO reported an error ({{ trigger.entity_id }}: {{ trigger.to_state.state }})."
  mode: single
```

- [ ] Validate: `python scripts/validate_ha_yaml.py`
- [ ] Manual verification: reload automations (Developer Tools > YAML > Automations); confirm `backyard night motion` no longer appears in Settings > Automations, and each of the four printer automations shows two actions in the UI editor.
- [ ] Commit (only with user approval): `fix(automations): remove dead backyard siren automation, notify phone on printer events`

---

### Task 2: ipad-wall-panel.yaml — fix broken Living Room On tile (A2)

**Files:** Modify `ipad-wall-panel.yaml:74`.

**Interfaces:** None.

- [ ] Change the tile entity from the nonexistent scene to the existing script. Before (lines 73-79):

```yaml
          - type: tile
            entity: scene.living_room_lights_on
            name: Living Room On
            icon: mdi:sofa
            grid_options:
              columns: 4
              rows: auto
```

  After:

```yaml
          - type: tile
            entity: script.living_room_lights_on
            name: Living Room On
            icon: mdi:sofa
            grid_options:
              columns: 4
              rows: auto
```

- [ ] Validate: `python scripts/validate_ha_yaml.py`
- [ ] Manual verification: reload Lovelace dashboards (Developer Tools > YAML > Lovelace Dashboards); open the `ipad-wall-panel` dashboard and tap "Living Room On" — the living room lights script runs (no "entity not found" error).
- [ ] Commit (only with user approval): `fix(lovelace): point Living Room On tile at existing script entity`

---

### Task 3: backup scripts — notify_failure phone alerts (A4)

**Files:** Modify `scripts/create_weekly_backup.py` and `scripts/cleanup_old_backups.py`.

**Interfaces:** None. The automations invoking these via `shell_command` (`automations.yaml` `cleanup_old_backups` / `weekly_backup`) are unchanged.

Spec deviation (required): the spec said POST to `/api/services/notify/mobile_app_traviss_iphone`. These scripts can only reach `http://supervisor` (the Supervisor API). The Supervisor proxies the HA Core API under `/core/api/...`, so the working path is `/core/api/services/notify/mobile_app_traviss_iphone`, reusing each script's existing `api_request()` helper (which already authenticates with `SUPERVISOR_TOKEN`).

- [ ] In `scripts/create_weekly_backup.py`, insert this helper immediately after `api_request()` (i.e. after line 48, before `def main()`):

```python
def notify_failure(message: str) -> None:
    """Send a phone notification via the HA Core API through the Supervisor proxy.

    Failures here must never mask the original error, so all exceptions are
    caught and only logged.
    """
    if not TOKEN:
        return
    try:
        payload = json.dumps({
            "title": "Weekly backup failed",
            "message": message,
        }).encode("utf-8")
        api_request("/core/api/services/notify/mobile_app_traviss_iphone", method="POST", data=payload)
    except Exception as exc:
        log(f"Failed to send failure notification: {exc}")
```

- [ ] In the same file's `main()`, change the exception handler. Before (lines 59-61):

```python
    except Exception as exc:
        log(f"ERROR: {exc}")
        return 1
```

  After:

```python
    except Exception as exc:
        log(f"ERROR: {exc}")
        notify_failure(str(exc))
        return 1
```

- [ ] In `scripts/cleanup_old_backups.py`, insert this helper immediately after `api_request()` (i.e. after line 49, before `def main()`):

```python
def notify_failure(message: str) -> None:
    """Send a phone notification via the HA Core API through the Supervisor proxy.

    Failures here must never mask the original error, so all exceptions are
    caught and only logged.
    """
    if not TOKEN:
        return
    try:
        payload = json.dumps({
            "title": "Backup cleanup failed",
            "message": message,
        }).encode("utf-8")
        api_request("/core/api/services/notify/mobile_app_traviss_iphone", method="POST", data=payload)
    except Exception as exc:
        log(f"Failed to send failure notification: {exc}")
```

- [ ] In the same file's `main()`, change the exception handler. Before (lines 89-91):

```python
    except Exception as exc:
        log(f"ERROR: {exc}")
        return 1
```

  After:

```python
    except Exception as exc:
        log(f"ERROR: {exc}")
        notify_failure(str(exc))
        return 1
```

- [ ] Validate: `python -m compileall scripts/create_weekly_backup.py scripts/cleanup_old_backups.py -q` and `python scripts/validate_ha_yaml.py`
- [ ] Manual verification: run `SUPERVISOR_TOKEN= python scripts/create_weekly_backup.py` (no token) — it should exit 1, log the error, and not crash in `notify_failure` (helper returns early when `TOKEN` is unset). Full phone-delivery verification happens on the next real failure or by temporarily forcing an error on the live system (optional; do not break the live backup schedule to test).
- [ ] Commit (only with user approval): `feat(scripts): notify phone when weekly backup or cleanup fails`

---

### Task 4: index.html — entityBelongsToScreen maps + radar init-once (B1 + B2)

**Files:** Modify `www/ai-dashboard/index.html` (`entityBelongsToScreen` at lines 1314-1340; `initRadarMap` at lines 841-888, guard variables at lines 839-840).

**Interfaces:** Task 11 rewrites `updateCard` (lines 1342-1348, immediately after `entityBelongsToScreen`) — if both are edited in the same session, re-read the file between tasks. The radar guard added here is designed to keep working after Task 11 stops full home-screen re-renders (see below).

Spec deviation (required): the spec's plain `if (radarMap) return;` guard would break the radar, because `renderHomeScreen()` rewrites `#home-screen` innerHTML on every full home re-render, destroying the `#radar-map` element the map is bound to. The guard below tracks the bound element: init is skipped only when the map is already bound to the *current* `#radar-map` element. Before Task 11 lands, full home re-renders still rebuild the map (correct behavior); after Task 11, state events no longer wipe `#radar-map`, so init truly runs once per screen entry.

- [ ] Update the `home` entry of the `sectionMap` in `entityBelongsToScreen()` to include the doors and environment sections. Before (lines 1315-1331):

```js
  const sectionMap = {
    home: [config.entities.weather, ...getPresenceEntities()],
    control: [
      ...((config.sections.scenes && config.sections.scenes.entities) || []),
      ...((config.sections.scripts && config.sections.scripts.entities) || []),
      ...((config.sections.quickControls && config.sections.quickControls.entities) || []),
      config.entities.mediaPlayer
    ],
    security: [
      ...((config.sections.cameras && config.sections.cameras.entities) || []),
      ...((config.sections.security && config.sections.security.entities) || [])
    ],
    status: [
      ...((config.sections.environment && config.sections.environment.entities) || []),
      ...((config.sections.system && config.sections.system.entities) || [])
    ]
  };
```

  After:

```js
  const sectionMap = {
    home: [
      config.entities.weather,
      ...getPresenceEntities(),
      ...((config.sections.doors && config.sections.doors.entities) || []),
      ...((config.sections.environment && config.sections.environment.entities) || [])
    ],
    control: [
      ...((config.sections.scenes && config.sections.scenes.entities) || []),
      ...((config.sections.scripts && config.sections.scripts.entities) || []),
      ...((config.sections.quickControls && config.sections.quickControls.entities) || []),
      config.entities.mediaPlayer
    ],
    security: [
      ...((config.sections.cameras && config.sections.cameras.entities) || []),
      ...((config.sections.security && config.sections.security.entities) || [])
    ],
    status: [
      ...((config.sections.environment && config.sections.environment.entities) || []),
      ...((config.sections.system && config.sections.system.entities) || [])
    ]
  };
```

- [ ] Add prefix/suffix matching for `calendar.*` (home) and printer sensors (status). Before (lines 1332-1339):

```js
  const ids = sectionMap[screen] || [];
  if (ids.includes(entityId)) return true;
  if (screen === "home") {
    const sec = (config.sections.security && config.sections.security.entities) || [];
    const sys = (config.sections.system && config.sections.system.entities) || [];
    if (sec.includes(entityId) || sys.includes(entityId)) return true;
  }
  return false;
```

  After:

```js
  const ids = sectionMap[screen] || [];
  if (ids.includes(entityId)) return true;
  if (screen === "home") {
    if (entityId.startsWith("calendar.")) return true;
    const sec = (config.sections.security && config.sections.security.entities) || [];
    const sys = (config.sections.system && config.sections.system.entities) || [];
    if (sec.includes(entityId) || sys.includes(entityId)) return true;
  }
  if (screen === "status" && entityId.startsWith("sensor.") &&
      (entityId.endsWith("_print_status") || entityId.includes("print_progress") || entityId.includes("remaining_time"))) {
    return true;
  }
  return false;
```

  (The suffix checks mirror the printer discovery logic at lines 1250/1254-1255: `id.endsWith("_print_status")`, `x.includes("print_progress")`, `x.includes("remaining_time")`.)

- [ ] Make the radar map init-once per bound element. First add a tracking variable — before (lines 839-840):

```js
let radarMap = null;
let radarAnimInterval = null;
```

  After:

```js
let radarMap = null;
let radarMapEl = null;
let radarAnimInterval = null;
```

- [ ] Replace the teardown at the top of `initRadarMap()` with the element-identity guard. Before (lines 841-845):

```js
async function initRadarMap() {
  const el = document.getElementById("radar-map");
  if (!el || !window.L || !haConfig) return;
  if (radarMap) { radarMap.remove(); radarMap = null; }
  if (radarAnimInterval) { clearInterval(radarAnimInterval); radarAnimInterval = null; }
```

  After:

```js
async function initRadarMap() {
  const el = document.getElementById("radar-map");
  if (!el || !window.L || !haConfig) return;
  // Init once per #radar-map element: renderHomeScreen() replaces the element
  // on a full home re-render, in which case we rebuild; plain state updates
  // leave the element (and the map) untouched.
  if (radarMap && radarMapEl === el) return;
  if (radarMap) { radarMap.remove(); radarMap = null; radarMapEl = null; }
  if (radarAnimInterval) { clearInterval(radarAnimInterval); radarAnimInterval = null; }
```

- [ ] Record the bound element when the map is created. Before (lines 882-883):

```js
    setTimeout(() => map.invalidateSize(), 150);
    radarMap = map;
```

  After:

```js
    setTimeout(() => map.invalidateSize(), 150);
    radarMap = map;
    radarMapEl = el;
```

- [ ] Validate: `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"` (this checks HTML structure; also open the browser console after a hard refresh and confirm no JS syntax errors).
- [ ] Manual verification: hard-refresh the dashboard; open/close the front door (or flip any `binary_sensor.living_room_front_door` state in Developer Tools > States) and watch the HOME screen Doors panel update without switching screens; watch a room temperature update in ROOM MONITORS; confirm the radar map no longer flickers/reloads when a `sensor.home_assistant_core_cpu_percent`-class system sensor updates while on HOME.
- [ ] Commit (only with user approval): `fix(ai-dashboard): route door/env/calendar/printer state events to the right screens; init radar map once`

---

### Task 5: index.html — render configured dock items (B3)

**Files:** Modify `www/ai-dashboard/index.html` (`renderDock()` at lines 915-920; insert a helper next to `renderBottomButton` at lines 910-913).

**Interfaces:** None. `toggleEntity()` (lines 653-664) already maps `scene`/`script` domains to `turn_on`, which is exactly the service path the dock items need.

- [ ] Insert `renderDockItem()` after `renderBottomButton()` (after line 913):

```js
function renderDockItem(item) {
  const icon = item.icon ? escapeHtml(item.icon) + " " : "";
  const label = escapeHtml(item.label || item.entityId || "");
  if (item.action === "settings") {
    return `<button class="bottom-btn" onclick="openSettings()">${icon}${label}</button>`;
  }
  if (item.entityId) {
    return `<button class="bottom-btn" onclick="toggleEntity('${item.entityId}')">${icon}${label}</button>`;
  }
  return "";
}
```

- [ ] Rewrite `renderDock()` to append configured items after the screen switcher. Before (lines 915-920):

```js
function renderDock() {
  return renderBottomButton("HOME", "home", currentScreen === "home") +
    renderBottomButton("CONTROL HUB", "control", currentScreen === "control") +
    renderBottomButton("SECURITY", "security", currentScreen === "security") +
    renderBottomButton("STATUS MONITOR", "status", currentScreen === "status");
}
```

  After:

```js
function renderDock() {
  const screens = renderBottomButton("HOME", "home", currentScreen === "home") +
    renderBottomButton("CONTROL HUB", "control", currentScreen === "control") +
    renderBottomButton("SECURITY", "security", currentScreen === "security") +
    renderBottomButton("STATUS MONITOR", "status", currentScreen === "status");
  const items = ((config.dock && config.dock.items) || []).map(renderDockItem).join("");
  return screens + items;
}
```

- [ ] Validate: `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
- [ ] Manual verification: hard-refresh; the dock now shows HOME / CONTROL HUB / SECURITY / STATUS MONITOR plus "💡 All off", "🌙 Goodnight", "⚙️ Settings". Tap "All off" — lights turn off (`scene.turn_on` over the WS proxy); tap "Goodnight" — the script runs; tap "Settings" — the settings modal opens.
- [ ] Commit (only with user approval): `fix(ai-dashboard): render configured dock quick-action buttons`

---

### Task 6: purge dead config keys (B4)

**Files:** Modify `www/ai-dashboard/index.html` (`DEFAULT_CONFIG` at lines 282-305; `collectReferencedIds` at lines 1705-1721; `removeMissingEntity` at lines 1732-1748) and `www/ai-dashboard/config.json` (layout at lines 14-19; entities at lines 21-29).

**Interfaces:** Task 7's label editor reads `config.labels` (untouched here). No other task reads `layout.left/center/right`, `entities.temperatures`, or `entities.summaryChips` — verified: the only references in index.html are the ones edited below.

- [ ] In `DEFAULT_CONFIG`, remove the dead layout keys. Before (line 284):

```js
  layout: { left: ["home", "environment", "presence"], center: ["clock", "radar", "forecast"], right: ["scenes", "quickControls", "security", "system", "cameras"], clock24h: false },
```

  After:

```js
  layout: { clock24h: false },
```

- [ ] In `DEFAULT_CONFIG`, remove the dead entity keys. Before (lines 285-290):

```js
  entities: {
    weather: "weather.forecast_home",
    temperatures: ["sensor.hobeian_zg_204zx_temperature", "sensor.hobeian_zg_204zx_temperature_2"],
    summaryChips: [],
    mediaPlayer: "media_player.living_room_fire_tv_living_room"
  },
```

  After:

```js
  entities: {
    weather: "weather.forecast_home",
    mediaPlayer: "media_player.living_room_fire_tv_living_room"
  },
```

- [ ] In `config.json`, remove the dead layout keys. Before (lines 14-19):

```json
  "layout": {
    "left": ["home", "environment", "presence"],
    "center": ["clock", "radar", "forecast"],
    "right": ["scenes", "quickControls", "security", "system", "cameras"],
    "clock24h": false
  },
```

  After:

```json
  "layout": {
    "clock24h": false
  },
```

- [ ] In `config.json`, remove the dead entity keys. Before (lines 21-29):

```json
  "entities": {
    "weather": "weather.forecast_home",
    "temperatures": [
      "sensor.hobeian_zg_204zx_temperature",
      "sensor.hobeian_zg_204zx_temperature_2"
    ],
    "summaryChips": [],
    "mediaPlayer": "media_player.living_room_fire_tv_living_room"
  },
```

  After:

```json
  "entities": {
    "weather": "weather.forecast_home",
    "mediaPlayer": "media_player.living_room_fire_tv_living_room"
  },
```

- [ ] In `collectReferencedIds()`, remove the dead-key loops. Before (lines 1707-1712):

```js
  if (config.entities) {
    if (config.entities.weather) ids.add(config.entities.weather);
    if (config.entities.mediaPlayer) ids.add(config.entities.mediaPlayer);
    for (const t of (config.entities.temperatures || [])) ids.add(t);
    for (const t of (config.entities.summaryChips || [])) ids.add(t);
  }
```

  After:

```js
  if (config.entities) {
    if (config.entities.weather) ids.add(config.entities.weather);
    if (config.entities.mediaPlayer) ids.add(config.entities.mediaPlayer);
  }
```

- [ ] In `removeMissingEntity()`, remove the dead-key cleanup lines. Before (lines 1737-1742):

```js
  if (config.entities) {
    if (config.entities.weather === id) config.entities.weather = "";
    if (config.entities.mediaPlayer === id) config.entities.mediaPlayer = "";
    config.entities.temperatures = (config.entities.temperatures || []).filter(x => x !== id);
    config.entities.summaryChips = (config.entities.summaryChips || []).filter(x => x !== id);
  }
```

  After:

```js
  if (config.entities) {
    if (config.entities.weather === id) config.entities.weather = "";
    if (config.entities.mediaPlayer === id) config.entities.mediaPlayer = "";
  }
```

- [ ] Validate: `python -m json.tool www/ai-dashboard/config.json > /dev/null` and `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
- [ ] Manual verification: hard-refresh; open Settings > Layout and confirm the palette "only entities not on dashboard" toggle and the MISSING block still work; export JSON from Settings > Data and confirm `left`/`center`/`right`/`temperatures`/`summaryChips` are gone.
- [ ] Commit (only with user approval): `chore(ai-dashboard): remove dead layout/temperatures/summaryChips config keys`

---

### Task 7: labels end-to-end — CONFIG_KEYS + Settings label editor (B5)

**Files:** Modify `custom_components/ai_dashboard_proxy/http.py:347` (one line) and `www/ai-dashboard/index.html` (`SETTINGS_TABS` at line 1389; `buildSettings` at lines 1403-1418; insert new functions after `wireAppearanceTab` at lines 1433-1436).

**Interfaces:** Edits `http.py`, which Task 8 also edits. The changes are in disjoint regions (line 347 vs. lines 166-250/373-405), so order does not matter, but whichever task runs second must re-read `http.py` first. `friendlyName()` (index.html:450) already consumes `config.labels`; this task only makes it writable and persistable.

- [ ] In `custom_components/ai_dashboard_proxy/http.py`, add `"labels"` to `CONFIG_KEYS`. Before (line 347):

```python
CONFIG_KEYS = {"theme", "layout", "entities", "sections", "sectionOrder", "dock", "presenceLabels"}
```

  After:

```python
CONFIG_KEYS = {"theme", "layout", "entities", "sections", "sectionOrder", "dock", "presenceLabels", "labels"}
```

- [ ] In `index.html`, add the Labels tab name. Before (line 1389):

```js
const SETTINGS_TABS = ["Layout", "Appearance", "Data"];
```

  After:

```js
const SETTINGS_TABS = ["Layout", "Appearance", "Labels", "Data"];
```

- [ ] Add the Labels branch in `buildSettings()`. Before (lines 1409-1417):

```js
  if (settingsTab === "Layout") {
    body.innerHTML = renderLayoutTab();
    initLayoutEditor();
  } else if (settingsTab === "Appearance") {
    body.innerHTML = renderAppearanceTab();
    wireAppearanceTab();
  } else {
    body.innerHTML = renderDataTab();
  }
```

  After:

```js
  if (settingsTab === "Layout") {
    body.innerHTML = renderLayoutTab();
    initLayoutEditor();
  } else if (settingsTab === "Appearance") {
    body.innerHTML = renderAppearanceTab();
    wireAppearanceTab();
  } else if (settingsTab === "Labels") {
    body.innerHTML = renderLabelsTab();
  } else {
    body.innerHTML = renderDataTab();
  }
```

- [ ] Insert the Labels tab renderer and handlers immediately after `wireAppearanceTab()` (after line 1436):

```js
function renderLabelsTab() {
  const labels = config.labels || {};
  const rows = Object.keys(labels).sort().map(id => `
    <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
      <span style="flex:1;min-width:200px;font-size:0.85rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(id)}">${escapeHtml(id)}</span>
      <input value="${escapeHtml(labels[id])}" onchange="setLabelOverride('${escapeHtml(id)}', this.value)" style="min-width:180px;">
      <button class="btn" onclick="removeLabelOverride('${escapeHtml(id)}')">×</button>
    </div>`).join("");
  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">Label overrides</h3>
      <p style="color:var(--text-muted);font-size:0.85rem;">Override the display name shown for an entity anywhere on the dashboard. Clear a label's text (or press ×) to remove the override.</p>
      ${rows || "<p style='color:var(--text-muted);font-size:0.85rem;'>No label overrides yet.</p>"}
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-top:12px;flex-wrap:wrap;">
        <select id="cfg-label-entity" style="min-width:220px;"><option value="">-- pick entity --</option>${entityOptionTags(null)}</select>
        <input id="cfg-label-text" placeholder="Display label" style="min-width:180px;">
        <button class="btn" onclick="addLabelOverride()">Add</button>
      </div>
    </div>
  `;
}

function setLabelOverride(id, value) {
  config.labels = config.labels || {};
  if (value) config.labels[id] = value;
  else delete config.labels[id];
  renderAll();
}

function removeLabelOverride(id) {
  if (config.labels) delete config.labels[id];
  renderAll();
  buildSettings();
}

function addLabelOverride() {
  const sel = document.getElementById("cfg-label-entity");
  const txt = document.getElementById("cfg-label-text");
  if (!sel || !sel.value) return;
  if (txt && txt.value) {
    config.labels = config.labels || {};
    config.labels[sel.value] = txt.value;
  }
  renderAll();
  buildSettings();
}
```

  (`entityOptionTags(null)` at lines 1397-1401 already handles a null filter — it lists every entity. Entity IDs contain only `[a-z0-9_.]`, so interpolating them into the single-quoted `onchange`/`onclick` handlers is safe.)

- [ ] Validate: `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`, `flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503`, `python -m compileall custom_components/ai_dashboard_proxy -q`
- [ ] Manual verification: restart Home Assistant (required for the `http.py` change), then hard-refresh the dashboard; open Settings > Labels; add an override (e.g. `sensor.ha_disk_usage` → "Disk") and Save & Apply — confirm the save succeeds (no 400 in the browser console / no "SAVE FAILED" status), the new label shows on the STATUS MONITOR screen, and `config.json` on disk contains the entry under `"labels"`. Reload the page and confirm the override persists.
- [ ] Commit (only with user approval): `feat(ai-dashboard): labels overrides editor; accept labels key in proxy config saves`

---

### Task 8: http.py — proxy hardening (C1-C5)

**Files:** Modify `custom_components/ai_dashboard_proxy/http.py` (imports at lines 4-21; `websocket_handler` at lines 166-250; `write_file` in `config_save_handler` at lines 373-386; `async_setup_http` at lines 395-405).

**Interfaces:** Edits the same file as Task 7 (disjoint regions; re-read the file before editing if Task 7 already landed). All changes here require an HA restart to take effect.

- [ ] C1 — add a WebSocket heartbeat. Before (line 176):

```python
    ws = web.WebSocketResponse()
```

  After:

```python
    ws = web.WebSocketResponse(heartbeat=30)
```

- [ ] C5 — harden `forward_event()`: skip closed sockets and swallow future exceptions. Before (lines 179-196):

```python
    @callback
    def forward_event(event: Any) -> None:
        new_state = event.data.get("new_state")
        if new_state is None:
            return
        asyncio.run_coroutine_threadsafe(
            ws.send_json(
                {
                    "type": "event",
                    "event": {
                        "event_type": EVENT_STATE_CHANGED,
                        "data": {"new_state": new_state},
                    },
                },
                dumps=json_dumps,
            ),
            hass.loop,
        )
```

  After:

```python
    @callback
    def forward_event(event: Any) -> None:
        new_state = event.data.get("new_state")
        if new_state is None or ws.closed:
            return
        future = asyncio.run_coroutine_threadsafe(
            ws.send_json(
                {
                    "type": "event",
                    "event": {
                        "event_type": EVENT_STATE_CHANGED,
                        "data": {"new_state": new_state},
                    },
                },
                dumps=json_dumps,
            ),
            hass.loop,
        )

        def _silence_future(fut: Any) -> None:
            # Retrieve the result so send failures on closing sockets do not
            # surface as "Future exception was never retrieved" log noise.
            # concurrent.futures.CancelledError is a subclass of Exception.
            try:
                fut.result()
            except Exception:
                pass

        future.add_done_callback(_silence_future)
```

- [ ] C2 — add the service-call domain allowlist. First add the constant; put it near `CONFIG_KEYS`. Before (line 347, assuming Task 7 landed; otherwise the same line without `"labels"`):

```python
CONFIG_KEYS = {"theme", "layout", "entities", "sections", "sectionOrder", "dock", "presenceLabels", "labels"}
```

  After:

```python
CONFIG_KEYS = {"theme", "layout", "entities", "sections", "sectionOrder", "dock", "presenceLabels", "labels"}

ALLOWED_SERVICE_DOMAINS = {
    "light",
    "switch",
    "scene",
    "script",
    "media_player",
    "vacuum",
    "siren",
    "lock",
    "cover",
    "fan",
    "climate",
    "input_boolean",
}
```

- [ ] C2 — enforce the allowlist in the WS `call_service` handler. Before (lines 225-231):

```python
            if msg_type == "call_service":
                domain = data.get("domain")
                service = data.get("service")
                service_data = data.get("service_data", {})
                hass.async_create_task(
                    hass.services.async_call(domain, service, service_data)
                )
```

  After:

```python
            if msg_type == "call_service":
                domain = data.get("domain")
                service = data.get("service")
                service_data = data.get("service_data", {})
                if domain not in ALLOWED_SERVICE_DOMAINS:
                    await ws.send_json(
                        {
                            "id": data.get("id", 0),
                            "type": "result",
                            "success": False,
                            "error": {
                                "code": "domain_not_allowed",
                                "message": (
                                    f"Service domain '{domain}' is not allowed "
                                    "through the dashboard proxy"
                                ),
                            },
                        },
                        dumps=json_dumps,
                    )
                    continue
                hass.async_create_task(
                    hass.services.async_call(domain, service, service_data)
                )
```

- [ ] C3 — prune old config backups in `write_file()`. Before (lines 373-384):

```python
        def write_file() -> None:
            if os.path.isfile(config_path):
                stamp = dt_util.now().strftime("%Y%m%d_%H%M%S")
                with open(config_path, "rb") as src:
                    data = src.read()
                with open(f"{config_path}.bak.{stamp}", "wb") as dst:
                    dst.write(data)
            tmp_path = config_path + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(body, f, indent=2, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp_path, config_path)
```

  After:

```python
        def write_file() -> None:
            if os.path.isfile(config_path):
                stamp = dt_util.now().strftime("%Y%m%d_%H%M%S")
                with open(config_path, "rb") as src:
                    data = src.read()
                with open(f"{config_path}.bak.{stamp}", "wb") as dst:
                    dst.write(data)
            tmp_path = config_path + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(body, f, indent=2, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp_path, config_path)
            # Keep only the newest 10 backups.
            directory = os.path.dirname(config_path)
            prefix = os.path.basename(config_path) + ".bak."
            backups = sorted(
                (
                    os.path.join(directory, f)
                    for f in os.listdir(directory)
                    if f.startswith(prefix)
                ),
                key=os.path.getmtime,
                reverse=True,
            )
            for old in backups[10:]:
                try:
                    os.remove(old)
                except OSError:
                    pass
```

- [ ] C4 — rebuild the area map on registry changes. Add the event imports. Before (lines 18-19):

```python
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import HomeAssistant, callback
```

  After:

```python
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.area_registry import EVENT_AREA_REGISTRY_UPDATED
from homeassistant.helpers.entity_registry import EVENT_ENTITY_REGISTRY_UPDATED
```

  Note: these constants are string event types (`"area_registry_updated"` / `"entity_registry_updated"`) exported by the respective helper modules in HA core.

- [ ] C4 — subscribe in `async_setup_http()`. Before (lines 395-399):

```python
async def async_setup_http(hass: HomeAssistant, secret: str | None) -> None:
    """Register the dashboard routes on the Home Assistant HTTP app."""
    app = hass.http.app
    app["ai_dashboard_secret"] = secret
    app["ai_dashboard_areas"] = await async_load_entity_areas(hass)
```

  After:

```python
async def async_setup_http(hass: HomeAssistant, secret: str | None) -> None:
    """Register the dashboard routes on the Home Assistant HTTP app."""
    app = hass.http.app
    app["ai_dashboard_secret"] = secret
    app["ai_dashboard_areas"] = await async_load_entity_areas(hass)

    async def _refresh_areas(event: Any) -> None:
        """Rebuild the entity->area map when the area/entity registry changes."""
        app["ai_dashboard_areas"] = await async_load_entity_areas(hass)

    hass.bus.async_listen(EVENT_AREA_REGISTRY_UPDATED, _refresh_areas)
    hass.bus.async_listen(EVENT_ENTITY_REGISTRY_UPDATED, _refresh_areas)
```

  Note: `async_load_entity_areas()` reads the `.storage` registry files, and HA persists registry changes to those files with a short delay after firing the event; the map therefore converges on the *next* registry change at the latest. Acceptable for a dashboard area label.

- [ ] Validate: `flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503` and `python -m compileall custom_components/ai_dashboard_proxy -q`
- [ ] Manual verification (after HA restart): hard-refresh the dashboard and confirm it connects and updates; in the browser console run `ws.send(JSON.stringify({id: 99, type: "call_service", domain: "homeassistant", service: "restart", service_data: {}}))` and confirm a `{success: false, error: {code: "domain_not_allowed"}}` result comes back and HA does NOT restart; confirm `ws.send(JSON.stringify({id: 100, type: "call_service", domain: "light", service: "toggle", service_data: {entity_id: "light.ceiling_fan"}}))` still works; in Settings press Save & Apply twice and confirm `www/ai-dashboard/` keeps at most 10 `config.json.bak.*` files; rename an entity's area in HA and reload the dashboard page — the new area name appears without another restart; check HA logs for absence of "Future exception was never retrieved" after sleeping/waking a wall iPad.
- [ ] Commit (only with user approval): `feat(ai-dashboard-proxy): heartbeat, service domain allowlist, backup pruning, live area map, dead-socket future cleanup`

---

### Task 9: index.html — client WS handshake cleanup, JSON.parse guards, fetchRegistry skip (C6 + D2 + D3)

**Files:** Modify `www/ai-dashboard/index.html` (`fetchRegistry` at lines 677-688; `connectProxy` at lines 1801-1830; `connect` at lines 1832-1863).

**Interfaces:** Depends on the server behavior already present in `http.py` (auto-sends full states as `{id: 1, type: "result"}` at lines 202-210 and forwards all state events without needing `subscribe_events`) — no server change needed. Task 10 and Task 11 edit nearby functions (`updateClock`, `updateCard`) but not these regions; re-read the file between tasks.

- [ ] C6 — stop the proxy-mode client from sending its own `get_states`/`subscribe_events`. Before (lines 1805-1809):

```js
  ws.onopen = () => {
    setStatus("connected");
    ws.send(JSON.stringify({ id: 1, type: "get_states" }));
    ws.send(JSON.stringify({ id: 2, type: "subscribe_events", event_type: "state_changed" }));
  };
```

  After:

```js
  ws.onopen = () => {
    setStatus("connected");
    // The proxy pushes the full state list ({id: 1, type: "result"}) on connect
    // and forwards every state_changed event unprompted, so the client sends
    // neither get_states nor subscribe_events here.
  };
```

- [ ] D2 — guard `JSON.parse` in `connectProxy`'s `onmessage`. Before (lines 1810-1811):

```js
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
```

  After:

```js
  ws.onmessage = async (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      console.warn("dropping malformed WS frame", e);
      return;
    }
```

- [ ] D2 — guard `JSON.parse` in `connect`'s `onmessage` (direct HA websocket mode). Before (lines 1838-1839):

```js
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
```

  After:

```js
  ws.onmessage = async (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      console.warn("dropping malformed WS frame", e);
      return;
    }
```

- [ ] D3 — skip registry REST calls in proxy mode. Before (lines 677-688):

```js
async function fetchRegistry() {
  const [aRes, eRes] = await Promise.all([
    apiFetch("/api/config/area_registry/list"),
    apiFetch("/api/config/entity_registry/list")
  ]);
  areas = aRes || [];
  entities = eRes || [];
  areaMap = {};
  for (const a of areas) areaMap[a.area_id] = a.name;
  entityById = {};
  for (const e of entities) entityById[e.entity_id] = e;
}
```

  After:

```js
async function fetchRegistry() {
  if (window.HA_INTEGRATION_PROXY) {
    // Proxied dashboard has no HA token; the registry endpoints would 401.
    // window.HA_AREAS (injected by the proxy) already covers area lookups.
    areas = [];
    entities = [];
    areaMap = {};
    entityById = {};
    return;
  }
  const [aRes, eRes] = await Promise.all([
    apiFetch("/api/config/area_registry/list"),
    apiFetch("/api/config/entity_registry/list")
  ]);
  areas = aRes || [];
  entities = eRes || [];
  areaMap = {};
  for (const a of areas) areaMap[a.area_id] = a.name;
  entityById = {};
  for (const e of entities) entityById[e.entity_id] = e;
}
```

- [ ] Validate: `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
- [ ] Manual verification: hard-refresh; in the browser Network tab confirm the WS connection receives exactly one full-state result frame on connect (no client-sent `get_states`/`subscribe_events` frames); confirm the console no longer shows 401 errors for `/api/config/area_registry/list` and `/api/config/entity_registry/list`; confirm states still update live.
- [ ] Commit (only with user approval): `fix(ai-dashboard): drop duplicate WS handshake, guard JSON.parse, skip token-less registry fetches when proxied`

---

### Task 10: index.html — small JS fixes: history TTL, clock measurement, connection banner, radar timestamp, Quick Controls switches (D1 + D6 + D7 + D8 + D9)

**Files:** Modify `www/ai-dashboard/index.html` (`fetchHistory` lines 377-388; `renderSparkline` line 758; radar animation lines 871-880; `renderControlScreen` lines 1176-1206; `updateClock` lines 1358-1377; `renderHomeScreen` tail lines 1171-1174; status LED/banner markup lines 254-255; `setStatus` lines 640-651; `init` lines 1867-1898).

**Interfaces:** Task 10's new `renderSwitchCard` is consumed by Task 11's targeted DOM updater. The clock-measure helper is called from `renderHomeScreen` (also touched by nothing else) and a resize listener added in `init`. Re-read the file between tasks.

- [ ] D1 — add a 30-minute TTL to the history cache. Before (lines 377-388):

```js
async function fetchHistory(entityIds, hours = 24) {
  const missing = entityIds.filter(id => !historyCache[id]);
  if (!missing.length) return;
  const res = await apiCall("POST", "/ai-dashboard/api/history", {
    entity_ids: missing,
    hours: hours
  });
  if (!res) return;
  for (const id of missing) {
    if (Array.isArray(res[id])) historyCache[id] = res[id];
  }
}
```

  After:

```js
async function fetchHistory(entityIds, hours = 24) {
  const now = Date.now();
  const stale = entityIds.filter(id =>
    !historyCache[id] || (now - historyCache[id].fetchedAt) > 30 * 60 * 1000
  );
  if (!stale.length) return;
  const res = await apiCall("POST", "/ai-dashboard/api/history", {
    entity_ids: stale,
    hours: hours
  });
  if (!res) return;
  for (const id of stale) {
    if (Array.isArray(res[id])) historyCache[id] = { fetchedAt: now, data: res[id] };
  }
}
```

- [ ] D1 — update the only cache reader, `renderSparkline()`. Before (line 758):

```js
  const data = historyCache[entityId];
```

  After:

```js
  const data = historyCache[entityId] && historyCache[entityId].data;
```

- [ ] D8 — label the radar animation with the displayed frame's time. Before (line 879, inside the `setInterval`):

```js
      timestamp.textContent = "RADAR UPDATED " + new Date(useFrames[useFrames.length - 1].time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
```

  After:

```js
      timestamp.textContent = "RADAR UPDATED " + new Date(useFrames[idx].time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
```

  Also make the initial label (line 873) consistent. Before:

```js
    timestamp.textContent = "RADAR UPDATED " + new Date(useFrames[useFrames.length - 1].time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
```

  After:

```js
    timestamp.textContent = "RADAR UPDATED " + new Date(useFrames[idx].time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
```

  (`idx` is initialized to `layers.length - 1` at line 871, i.e. the latest frame, so the initial label is unchanged.)

- [ ] D7 — add the connection-lost banner element. Insert immediately after the status text div (line 255):

```html
<div id="conn-banner" style="display:none;position:fixed;top:0;left:0;right:0;z-index:60;background:rgba(255,174,0,0.12);border:1px solid var(--amber);color:var(--amber);font-family:var(--font-mono);padding:10px 14px;letter-spacing:0.05em;text-align:center;">! CONNECTION LOST — RETRYING</div>
```

  (Inline styles mirror `renderAlertBanner` at lines 717-721.)

- [ ] D7 — toggle the banner in `setStatus()`. Before (lines 640-651):

```js
function setStatus(cls) {
  const led = document.getElementById("status-led");
  const text = document.getElementById("status-text");
  if (text) text.textContent = cls.toUpperCase();
  if (led) {
    led.className = "status-led";
    if (cls === "connected") led.classList.add("on");
    else if (cls === "disconnected") led.classList.add("danger");
    else led.classList.add("warn");
  }
  if (cls === "connected") reconnectDelay = 1000;
}
```

  After:

```js
function setStatus(cls) {
  const led = document.getElementById("status-led");
  const text = document.getElementById("status-text");
  if (text) text.textContent = cls.toUpperCase();
  if (led) {
    led.className = "status-led";
    if (cls === "connected") led.classList.add("on");
    else if (cls === "disconnected") led.classList.add("danger");
    else led.classList.add("warn");
  }
  const banner = document.getElementById("conn-banner");
  if (banner) banner.style.display = cls === "connected" ? "none" : "block";
  if (cls === "connected") reconnectDelay = 1000;
}
```

- [ ] D6 — measure the clock width on render/resize instead of every second. First add the cache variable near the other globals (after line 327, `let currentScreen = "home";`):

```js
let clockFontSize = null;
```

- [ ] D6 — add the measurement helper immediately before `updateClock()` (before line 1358):

```js
function measureClock() {
  const el = document.getElementById("clock");
  if (!el) { clockFontSize = null; return; }
  // Fit the time on one line: start from the clamp(4rem, 9vw, 6.5rem) size,
  // then shrink proportionally until it fits the column width.
  const preferred = Math.min(Math.max(64, window.innerWidth * 0.09), 104);
  el.style.fontSize = preferred + "px";
  const avail = el.parentElement.clientWidth - 16;
  const need = el.scrollWidth;
  clockFontSize = need > avail && need > 0 ? Math.max(28, Math.floor(preferred * avail / need)) : preferred;
  el.style.fontSize = clockFontSize + "px";
}
```

- [ ] D6 — slim down `updateClock()` to text-only updates. Before (lines 1358-1374):

```js
function updateClock() {
  const now = new Date();
  const opts = config.layout.clock24h ? { hour: "2-digit", minute: "2-digit", hour12: false } : { hour: "numeric", minute: "2-digit" };
  const el = document.getElementById("clock");
  if (el) {
    const timeStr = now.toLocaleTimeString([], opts);
    el.innerHTML = escapeHtml(timeStr).replace(/:/g, '<span class="colon">:</span>');
    // Fit the time on one line: start from the clamp(4rem, 9vw, 6.5rem) size,
    // then shrink proportionally until it fits the column width.
    const preferred = Math.min(Math.max(64, window.innerWidth * 0.09), 104);
    el.style.fontSize = preferred + "px";
    const avail = el.parentElement.clientWidth - 16;
    const need = el.scrollWidth;
    if (need > avail && need > 0) {
      el.style.fontSize = Math.max(28, Math.floor(preferred * avail / need)) + "px";
    }
  }
```

  After:

```js
function updateClock() {
  const now = new Date();
  const opts = config.layout.clock24h ? { hour: "2-digit", minute: "2-digit", hour12: false } : { hour: "numeric", minute: "2-digit" };
  const el = document.getElementById("clock");
  if (el) {
    const timeStr = now.toLocaleTimeString([], opts);
    el.innerHTML = escapeHtml(timeStr).replace(/:/g, '<span class="colon">:</span>');
    if (clockFontSize != null) el.style.fontSize = clockFontSize + "px";
  }
```

- [ ] D6 — measure after the home screen renders. Before (lines 1171-1174):

```js
  document.getElementById("home-screen").innerHTML = main;
  initRadarMap();
  lastRecentDoorKey = recentDoorIds().join(",");
}
```

  After:

```js
  document.getElementById("home-screen").innerHTML = main;
  initRadarMap();
  measureClock();
  lastRecentDoorKey = recentDoorIds().join(",");
}
```

- [ ] D6 — re-measure on window resize. In `init()`, after the existing `setInterval(updateClock, 1000);` line (line 1886), add:

```js
  window.addEventListener("resize", measureClock);
```

- [ ] D9 — add a switch card renderer. Insert immediately after `renderLightCard()` (after line 741):

```js
function renderSwitchCard(entityId) {
  const state = states[entityId];
  const offline = isUnavailable(state);
  const active = state ? isActive(state.state) : false;
  return `<div class="terminal-panel" data-entity-id="${entityId}">
    <div class="panel-body" style="display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;" onclick="toggleEntity('${entityId}')">
      <div>${renderStatusLed(offline ? "unavailable" : (active ? "on" : "off"))} <span style="font-family:var(--font-mono);">${escapeHtml(friendlyName(entityId))}</span></div>
      <div style="color:var(--text-muted);font-family:var(--font-mono);">${offline ? "OFFLINE" : (active ? "ON" : "OFF")}</div>
    </div>
  </div>`;
}
```

  (Same shape as `renderLightCard` minus the brightness slider; `toggleEntity()` already calls `switch.toggle` for the `switch` domain.)

- [ ] D9 — render switches in Quick Controls. Before (lines 1184-1185):

```js
  const lightIds = quick.filter(id => id.startsWith("light."));
  const lightCards = lightIds.map(id => renderLightCard(id)).join("");
```

  After:

```js
  const lightIds = quick.filter(id => id.startsWith("light."));
  const switchIds = quick.filter(id => id.startsWith("switch."));
  const lightCards = lightIds.map(id => renderLightCard(id)).join("");
  const switchCards = switchIds.map(id => renderSwitchCard(id)).join("");
  const controlCards = lightCards + switchCards;
```

- [ ] D9 — use the combined cards in the template. Before (line 1194):

```js
          ${renderTerminalPanel(sectionTitle("quickControls"), `<div class="stretch-cards" style="display:flex;flex-direction:column;gap:10px;height:100%;">${lightCards || "<div style='color:var(--text-muted)'>NO LIGHTS</div>"}</div>`, "fill")}
```

  After:

```js
          ${renderTerminalPanel(sectionTitle("quickControls"), `<div class="stretch-cards" style="display:flex;flex-direction:column;gap:10px;height:100%;">${controlCards || "<div style='color:var(--text-muted)'>NO CONTROLS</div>"}</div>`, "fill")}
```

- [ ] Validate: `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"` (plus a browser console check for JS syntax errors after hard-refresh).
- [ ] Manual verification: hard-refresh; on STATUS MONITOR confirm sparklines render (cache format change) — switch away and back within 30 min and confirm no duplicate history fetch in the Network tab, then again after 30+ min and confirm a refetch; on HOME confirm the clock still fits on one line and the radar timestamp now changes as the animation cycles frames; disable Wi-Fi on the client briefly and confirm the amber "CONNECTION LOST — RETRYING" banner appears full-width and disappears on reconnect; add a `switch.*` entity to the `quickControls` section via Settings > Layout and confirm it renders as a toggle card that calls `switch.toggle`.
- [ ] Commit (only with user approval): `fix(ai-dashboard): history TTL, cached clock measure, connection banner, per-frame radar time, switch quick controls`

---

### Task 11: index.html — targeted DOM updates in updateCard (D4)

**Files:** Modify `www/ai-dashboard/index.html` (`updateCard` at lines 1342-1348; insert a new helper before it).

**Interfaces:** Consumes the per-card `data-entity-id` attributes already emitted by `renderLightCard` (line 734), `renderSwitchCard` (added in Task 10), `renderMetricCard` (line 751), and the `#doors-panel` wrapper (line 1127). Consumes Task 4's expanded `entityBelongsToScreen`. This is the riskiest change in the plan — do it after Tasks 4/9/10 and verify manually per the checklist below.

Design: `updateCard` first tries `updateEntityCardInPlace(entityId)`, which replaces exactly one card (or the doors panel) via `outerHTML`/`innerHTML`. It returns `true` when it handled the update, `false` when the change is potentially structural (printer cards appearing, presence cards whose battery text depends on other entities, sparkline-bearing env metrics, security scene-btns without `data-entity-id`, weather panel without `data-entity-id`) — in which case `updateCard` falls back to the current full-screen re-render.

- [ ] Insert the helper immediately before `updateCard()` (before line 1342):

```js
function updateEntityCardInPlace(entityId) {
  const el = document.querySelector(`[data-entity-id="${CSS.escape(entityId)}"]`);
  const domain = entityId.split(".")[0];
  if (currentScreen === "home") {
    if (domain === "calendar") return false; // on-call panel appears/disappears: structural
    const doors = (config.sections.doors && config.sections.doors.entities) || [];
    if (doors.includes(entityId)) {
      const panel = document.getElementById("doors-panel");
      if (!panel) return false;
      panel.innerHTML = renderTerminalPanel(sectionTitle("doors"), renderDoors());
      lastRecentDoorKey = recentDoorIds().join(",");
      return true;
    }
    // Weather panel, presence cards (battery reads sibling sensors), and room
    // monitors (per-area cells, not per-entity) are not addressable per entity.
    return false;
  }
  if (!el) return false;
  // Never yank the DOM out from under an active slider drag.
  if (document.activeElement && el.contains(document.activeElement)) return true;
  let html = null;
  if (currentScreen === "control") {
    if (domain === "light") html = renderLightCard(entityId);
    else if (domain === "switch") html = renderSwitchCard(entityId);
    else if (entityId === (config.entities.mediaPlayer || "")) html = renderMediaCard(entityId);
  } else if (currentScreen === "security") {
    if (["sensor", "binary_sensor"].includes(domain)) html = renderMetricCard(entityId);
    // switch/siren/button/script render as scene-btns without data-entity-id: structural fallback
  } else if (currentScreen === "status") {
    // Env metrics embed sparklines; printer cards read sibling sensors;
    // vacuum cards exist but printer progress must not be missed: keep fallback.
    return false;
  }
  if (html) {
    el.outerHTML = html;
    return true;
  }
  return false;
}
```

- [ ] Rewrite `updateCard()` to try the in-place update first. Before (lines 1342-1348):

```js
async function updateCard(state) {
  if (!entityBelongsToScreen(state.entity_id, currentScreen)) return;
  if (currentScreen === "home") renderHomeScreen();
  else if (currentScreen === "control") renderControlScreen();
  else if (currentScreen === "security") renderSecurityScreen();
  else if (currentScreen === "status") await renderStatusScreen();
}
```

  After:

```js
async function updateCard(state) {
  if (!entityBelongsToScreen(state.entity_id, currentScreen)) return;
  if (updateEntityCardInPlace(state.entity_id)) return;
  if (currentScreen === "home") renderHomeScreen();
  else if (currentScreen === "control") renderControlScreen();
  else if (currentScreen === "security") renderSecurityScreen();
  else if (currentScreen === "status") await renderStatusScreen();
}
```

- [ ] Validate: `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"` (plus browser console syntax check).
- [ ] Manual verification (the critical one — spec flags this as riskiest):
  - Hard-refresh; open/close the front door and confirm only the Doors panel redraws (scroll positions elsewhere on HOME are kept).
  - On CONTROL HUB, drag a light brightness slider slowly while state events arrive (e.g. have a sensor update every second, or toggle another light from the HA app): the slider must not jump or reset mid-drag, and the light card must not disappear.
  - Scroll the SECURITY screen's sensor grid, trigger a battery-sensor update, confirm scroll position is retained.
  - Start/finish a print (or set `sensor.p1s_01p00a412300832_print_status` in Developer Tools > States) on the STATUS MONITOR screen and confirm the printer card still updates (full re-render fallback path).
  - Flip a `switch.*` quick control (if configured in Task 10) and confirm its card toggles in place.
  - Toggle a person between home/not_home and confirm the presence card updates (fallback full home re-render, radar map rebuilt per Task 4's element guard).
- [ ] Commit (only with user approval): `fix(ai-dashboard): update changed entity cards in place instead of re-rendering whole screens`

---

### Task 12: vendor Leaflet (D5)

**Files:** Create `www/ai-dashboard/vendor/leaflet/leaflet.js`, `www/ai-dashboard/vendor/leaflet/leaflet.css`, and marker images under `www/ai-dashboard/vendor/leaflet/images/`; modify `www/ai-dashboard/index.html:7-8`.

**Interfaces:** None. The proxy's `dashboard_handler` (`http.py` lines 121-131) already serves `.js`/`.css` with correct content types and falls back to `mimetypes.guess_type` for `.png`, so no proxy change is needed. Relative URLs work both via the proxy (`/ai-dashboard/`) and via `/local/ai-dashboard/`. Google Fonts (line 9) stays on the CDN per the spec's user decision.

Spec note: the spec cited `index.html:7-9`; lines 7-8 are the Leaflet references and line 9 is Google Fonts, which intentionally stays.

- [ ] Download Leaflet 1.9.4 and its image assets (run from `//HOMEASSISTANT/config/`):

```bash
mkdir -p www/ai-dashboard/vendor/leaflet/images
curl -fsSL -o www/ai-dashboard/vendor/leaflet/leaflet.js https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
curl -fsSL -o www/ai-dashboard/vendor/leaflet/leaflet.css https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
curl -fsSL -o www/ai-dashboard/vendor/leaflet/images/marker-icon.png https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png
curl -fsSL -o www/ai-dashboard/vendor/leaflet/images/marker-icon-2x.png https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png
curl -fsSL -o www/ai-dashboard/vendor/leaflet/images/marker-shadow.png https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png
curl -fsSL -o www/ai-dashboard/vendor/leaflet/images/layers.png https://unpkg.com/leaflet@1.9.4/dist/images/layers.png
curl -fsSL -o www/ai-dashboard/vendor/leaflet/images/layers-2x.png https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png
```

  (leaflet.css references its images via relative `images/...` paths, so they resolve correctly from `vendor/leaflet/`. The dashboard adds no markers today, but vendoring the images keeps the CSS self-contained.)

- [ ] Verify the downloads are real files, not error pages:

```bash
ls -la www/ai-dashboard/vendor/leaflet www/ai-dashboard/vendor/leaflet/images
head -c 200 www/ai-dashboard/vendor/leaflet/leaflet.js
grep -c "L.marker" www/ai-dashboard/vendor/leaflet/leaflet.js
```

  `leaflet.js` should be ~145 KB unminified or start with the Leaflet 1.9.4 banner comment; `grep -c` should print a non-zero count.

- [ ] Update the references in `index.html`. Before (lines 7-8):

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
```

  After:

```html
<link rel="stylesheet" href="vendor/leaflet/leaflet.css" />
<script src="vendor/leaflet/leaflet.js"></script>
```

- [ ] Validate: `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
- [ ] Manual verification: hard-refresh with the browser console open; confirm `vendor/leaflet/leaflet.js` and `vendor/leaflet/leaflet.css` load with 200s and no unpkg requests remain (RainViewer and CartoCDN tile requests are expected — only the Leaflet library itself is vendored); confirm the radar map still renders and animates on HOME.
- [ ] Commit (only with user approval): `chore(ai-dashboard): vendor Leaflet 1.9.4 assets locally`

---

## Final validation (after all tasks)

- [ ] `python scripts/validate_ha_yaml.py`
- [ ] `python -m json.tool www/ai-dashboard/config.json > /dev/null`
- [ ] `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
- [ ] `flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503`
- [ ] `python -m compileall custom_components/ai_dashboard_proxy -q`
- [ ] Restart Home Assistant (picks up Task 7/8 proxy changes), hard-refresh the dashboard, and run through each task's manual verification list once end-to-end.

## Spec coverage

| Spec item | Task |
|---|---|
| A1 remove backyard night motion | Task 1 |
| A2 wall panel `scene.` → `script.living_room_lights_on` | Task 2 |
| A3 printer automations phone notify (×4) | Task 1 |
| A4 backup scripts `notify_failure` | Task 3 |
| B1 `entityBelongsToScreen` doors/env/calendar/printer | Task 4 |
| B2 radar init-once guard | Task 4 |
| B3 render `config.dock.items` | Task 5 |
| B4 purge dead config keys | Task 6 |
| B5 labels in `CONFIG_KEYS` + settings editor | Task 7 |
| C1 WS heartbeat=30 | Task 8 |
| C2 service-call domain allowlist | Task 8 |
| C3 prune config backups to 10 | Task 8 |
| C4 area map rebuild on registry events | Task 8 |
| C5 dead-socket future exceptions | Task 8 |
| C6 drop duplicate WS handshake | Task 9 |
| D1 history cache 30-min TTL | Task 10 |
| D2 JSON.parse try/catch | Task 9 |
| D3 skip fetchRegistry when proxied | Task 9 |
| D4 targeted DOM updates | Task 11 |
| D5 vendor Leaflet | Task 12 |
| D6 clock measurement on render/resize | Task 10 |
| D7 connection-lost banner | Task 10 |
| D8 radar per-frame timestamp | Task 10 |
| D9 Quick Controls switches | Task 10 |

## Deviations from the spec (all grounded in the real code)

1. **A3 line ranges:** spec cited `automations.yaml:137-167, 182-212`; the four automations actually span lines 124-212 (actions blocks at 137-143, 161-167, 182-188, 206-212). Same targets, tighter ranges.
2. **A4 API path:** the scripts can only reach the Supervisor API at `http://supervisor`; the HA Core API is proxied under `/core/api/...`. The notify call therefore uses `/core/api/services/notify/mobile_app_traviss_iphone`, not the spec's `/api/services/...`.
3. **B2 guard shape:** a plain `if (radarMap) return;` would permanently break the radar because `renderHomeScreen()` replaces the `#radar-map` element on every full home re-render. The guard tracks the bound element (`radarMapEl === el`) instead; the spec's end state (state events never re-init the map) is reached once Task 11 lands.
4. **B4 line cites:** dead keys in `config.json` are at lines 15-17 (`layout.left/center/right`) and 23-27 (`entities.temperatures`/`summaryChips`), not `14-19, 27` exactly. Same content.
5. **D5 line cites:** `index.html:7-8` are the Leaflet references; line 9 is Google Fonts, which stays on the CDN per the spec itself.
6. **D7 location:** the spec cited "WS close handling at `index.html:640-651`" — lines 640-651 are actually `setStatus()`; the banner toggle lives there, and the banner element is inserted next to the status LED markup at lines 254-255. Same intent.
7. **D4 fallback conservatism:** the status screen always falls back to full re-render because env metric cards embed sparklines and printer cards read sibling sensor entities (`print_progress` / `remaining_time`), so per-card in-place updates would go stale. The spec's fallback clause explicitly allows this.
