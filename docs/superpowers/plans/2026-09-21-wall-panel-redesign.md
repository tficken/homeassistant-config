# Wall Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reflash the CrowPanel from ESPHome to openHASP, then deploy a new three-page control-first dashboard with battery, lights/scenes, and security camera snapshots.

**Architecture:** The panel communicates with Home Assistant over MQTT using the openHASP custom component. Page layouts are defined in JSONL and pushed on startup; object state and touch events are bound via `openhasp/wall_panel.yaml`. Camera snapshots are refreshed by automation and served as local files because openHASP image objects cannot authenticate to HA camera streams.

**Tech Stack:** Home Assistant OS, Mosquitto MQTT, openHASP nightly firmware, openHASP custom component 0.7.x, YAML/JSONL.

**Spec:** `docs/superpowers/specs/2026-09-21-wall-panel-redesign.md`

## Global Constraints

- Do not modify unrelated Home Assistant configuration.
- All YAML changes must pass `ha core check`.
- Plate node name must be `wall_panel`; MQTT topic prefix `hasp/wall_panel`.
- Physical wall-mount fabrication and power wiring are out of scope.
- Camera snapshots only; live video streams are out of scope.

## Review Focus

- **Battery source changes after openHASP flash** — the templates assume an attribute of `openhasp.wall_panel`; if openHASP exposes a separate sensor, the binding must be updated before the battery indicator works.
- **Image caching on the Security page** — openHASP may cache the `/local/snapshots/*.jpg` URL; the implementation must either use the `refresh` property or append a changing query string.
- **Overlay page 0 vs. content pages** — the bottom nav lives on page 0 and must not overlap content on pages 1–3; coordinates are 0–432 for content, 432–480 for nav.
- **Touch target sizing** — all buttons and sliders must be large enough for wall-mounted touch; smallest tap targets are 48 px high.
- **Entity availability at render time** — templates must handle `unknown`/`unavailable` states without rendering errors on the panel.

---

### Task 1: Reflash the panel to openHASP and configure MQTT + battery

**Files:**
- None (physical device step)

**Interfaces:**
- Consumes: existing Mosquitto broker, MQTT integration, Wi-Fi credentials
- Produces: plate connected to MQTT as `hasp/wall_panel`; `openhasp.wall_panel` entity in HA; battery reporting enabled

- [ ] **Step 1: Open the openHASP web flasher**

  On a PC with the display connected via USB-C, open https://nightly.openhasp.com/ in Chrome/Edge.

- [ ] **Step 2: Select board and flash**

  Select board **Sunton ESP32-8048S070C** (capacitive 7"). If touch does not respond after boot, re-flash with **CrowPanel 7" RGB**. Click **Install** and choose the serial port.

- [ ] **Step 3: Join Wi-Fi and configure MQTT**

  After reboot, connect to the `openHASP-...` captive portal or find the device's IP from the router. In the plate web UI set:
  - Wi-Fi SSID / Password
  - MQTT Broker: HA host (e.g., `homeassistant.local` or `192.168.x.x`)
  - MQTT Port: `1883`
  - MQTT User/Password: HA local user credentials
  - HASP Node Name: `wall_panel`
  - Idle: `off`
  - Start Page: `1`

- [ ] **Step 4: Enable battery reporting**

  In the openHASP web UI, enable the battery sensor and set the correct ADC pin and voltage divider for the added battery. Save and reboot.

- [ ] **Step 5: Discover the plate in Home Assistant**

  In HA go to **Settings > Devices & Services**. The **openHASP** integration should discover a new device named `wall_panel`. Add it and finish the config flow.

- [ ] **Step 6: Verify entity and battery**

  Check **Developer Tools > States** for `openhasp.wall_panel`. Inspect its attributes; note whether battery is reported as an attribute (e.g., `battery`) or as a separate sensor. Record this for Task 3.

---

### Task 2: Write the new `openhasp/wall_panel/pages.jsonl`

**Files:**
- Create/replace: `openhasp/wall_panel/pages.jsonl`

**Interfaces:**
- Consumes: 800×480 screen resolution, design system from spec
- Produces: page definitions loaded by openHASP on startup

- [ ] **Step 1: Replace the file with the new layout**

  Write `openhasp/wall_panel/pages.jsonl` containing:
  - Page 0 overlay bottom nav (3 tabs)
  - Page 1 Home (clock, title, battery, greeting, presence, weather card, status card, alert banner)
  - Page 2 Lights & Scenes (clock, title, battery, 4 scene buttons, 2 light cards with toggles and sliders)
  - Page 3 Security (clock, title, battery, 2 camera images, 2 motion toggles)

  All coordinates, sizes, colors, and fonts must match the spec's design system and object IDs.

- [ ] **Step 2: Validate JSONL syntax**

  Run:
  ```bash
  node -e "require('fs').readFileSync('openhasp/wall_panel/pages.jsonl','utf8').split('\n').filter(l=>l.trim()).forEach((l,i)=>{try{JSON.parse(l);}catch(e){console.log('BAD line',i+1,e.message);process.exit(1);}});console.log('JSONL OK');"
  ```
  Expected: `JSONL OK`

- [ ] **Step 3: Commit**

  ```bash
  git add openhasp/wall_panel/pages.jsonl
  git commit -m "feat: redesign openhasp wall panel pages"
  ```

---

### Task 3: Update `openhasp/wall_panel.yaml` bindings

**Files:**
- Create/replace: `openhasp/wall_panel.yaml`

**Interfaces:**
- Consumes: `openhasp.wall_panel`, `weather.forecast_home`, `light.living_room_ceiling_fan`, `light.ceiling_fan`, scripts from AI dashboard, door/motion/security entities
- Produces: synchronized objects and touch events for all pages

- [ ] **Step 1: Write the page navigation bindings**

  Bind `p0b2`, `p0b3`, `p0b4` to `openhasp.change_page` services and use templates to highlight the active tab.

- [ ] **Step 2: Write the clock and battery bindings**

  Bind `p1b2`, `p2b2`, `p3b2` to `now().strftime("%-I:%M %p")`.
  Bind `p1b4`, `p2b4`, `p3b4` to the battery source identified in Task 1, with color thresholds at 15% and 30%.
  If the exact battery attribute is not yet known, use `state_attr('openhasp.wall_panel', 'battery')` and add a comment to adjust once Task 1 is complete.

- [ ] **Step 3: Write the Home page bindings**

  Bind `p1b5` (greeting) to a time-of-day template.
  Bind `p1b6` (presence) to `person.woteg` and `person.bobbie`.
  Bind `p1b8`–`p1b10` to `weather.forecast_home` attributes.
  Bind `p1b12`–`p1b14` to door and motion-detection entities.
  Bind `p1b15`/`p1b16` to the alert banner; hide the banner when no alerts are active.

- [ ] **Step 4: Write the Lights page bindings**

  Bind `p2b5`–`p2b8` scene buttons to `script.all_lights_off`, `script.relax_mode`, `script.movie_mode`, `script.focus_mode`.
  Bind `p2b12`/`p2b17` toggles to the two lights.
  Bind `p2b13`/`p2b18` sliders to brightness attributes and `light.turn_on` events.

- [ ] **Step 5: Write the Security page bindings**

  Bind `p3b5`/`p3b7` image objects to `/local/snapshots/front_door.jpg` and `/local/snapshots/backyard.jpg` with `refresh: 30`.
  Bind `p3b9`/`p3b11` toggles to the motion-detection switches.

- [ ] **Step 6: Validate YAML**

  Run:
  ```bash
  ha core check
  ```
  Expected: command exits `0`.

- [ ] **Step 7: Commit**

  ```bash
  git add openhasp/wall_panel.yaml
  git commit -m "feat: add openhasp wall panel entity bindings"
  ```

---

### Task 4: Update `automations.yaml`

**Files:**
- Modify: `automations.yaml`

**Interfaces:**
- Consumes: existing wall panel automations, camera entities
- Produces: startup page push, day/night backlight, snapshot refresh

- [ ] **Step 1: Update the startup push automation**

  Keep `wall_panel_push_pages_on_startup` but verify the `path` points to `/config/openhasp/wall_panel/pages.jsonl` and the target entity is `openhasp.wall_panel`.

- [ ] **Step 2: Update backlight automations**

  Keep `wall_panel_day_backlight` and `wall_panel_night_backlight`. Optionally update brightness values if the new dark theme needs different levels.

- [ ] **Step 3: Add snapshot refresh automation**

  Append a new automation `wall_panel_snapshot_refresh` that calls `camera.snapshot` every 30 seconds for `camera.front_door_live_view` and `camera.backyard_rtsp_live`, saving to:
  - `/config/www/snapshots/front_door.jpg`
  - `/config/www/snapshots/backyard.jpg`

- [ ] **Step 4: Validate YAML**

  Run:
  ```bash
  ha core check
  ```
  Expected: command exits `0`.

- [ ] **Step 5: Commit**

  ```bash
  git add automations.yaml
  git commit -m "feat: update wall panel automations for redesign"
  ```

---

### Task 5: Create the snapshots directory

**Files:**
- Create: `www/snapshots/` directory

**Interfaces:**
- Consumes: Security page image objects
- Produces: writable location for camera snapshots

- [ ] **Step 1: Create the directory**

  ```bash
  mkdir -p www/snapshots
  ```

- [ ] **Step 2: Add placeholder images**

  Create two small placeholder JPGs so the panel has something to render before the automation runs:
  ```bash
  touch www/snapshots/front_door.jpg
  touch www/snapshots/backyard.jpg
  ```
  Note: `camera.snapshot` will overwrite these once active.

- [ ] **Step 3: Verify paths are web-accessible**

  The files should be reachable at:
  - `http://<ha-host>/local/snapshots/front_door.jpg`
  - `http://<ha-host>/local/snapshots/backyard.jpg`

- [ ] **Step 4: Commit**

  ```bash
  git add www/snapshots/
  git commit -m "chore: add snapshot directory for wall panel cameras"
  ```

---

### Task 6: Restart Home Assistant and verify the panel

**Files:**
- None

**Interfaces:**
- Consumes: all previous tasks
- Produces: working redesigned wall panel

- [ ] **Step 1: Restart Home Assistant**

  ```bash
  ha core restart
  ```

- [ ] **Step 2: Wait for the panel to come online**

  In HA, go to **Settings > Devices & Services > openHASP** and confirm `wall_panel` is online.

- [ ] **Step 3: Verify Page 1 (Home)**

  Confirm the panel shows:
  - Current time and battery level
  - Weather temperature and condition
  - Door/motion status
  - Any active alert, or no alert banner

- [ ] **Step 4: Verify Page 2 (Lights & Scenes)**

  Tap **Lights** in the nav:
  - Scene buttons run their scripts
  - Living Room and Office toggles work
  - Brightness sliders change the lights

- [ ] **Step 5: Verify Page 3 (Security)**

  Tap **Security** in the nav:
  - Front Door and Backyard images load
  - Motion toggles change the corresponding switches

- [ ] **Step 6: Verify battery behavior**

  Confirm battery percentage appears and color changes when the level crosses 30% and 15% thresholds.

- [ ] **Step 7: Verify backlight automation**

  In **Developer Tools > Services**, call:
  ```yaml
  service: mqtt.publish
  data:
    topic: hasp/wall_panel/command
    payload: "backlight {'state':1,'brightness':255}"
  ```
  Expected: panel backlight changes immediately.

- [ ] **Step 8: Final commit if any fixes were needed**

  If changes were made during verification, commit them with a descriptive message.

---

## Self-Review

**Spec coverage:**
- Reflash to openHASP → Task 1
- Three-page layout → Task 2
- HA bindings including battery, scenes, lights, cameras → Task 3
- Automations (startup, backlight, snapshot refresh) → Task 4
- Snapshot directory → Task 5
- Verification → Task 6

**Placeholder scan:** No TBD/TODO/"implement later" placeholders; the only open variable is the exact battery entity/attribute, which Task 1 discovers and Task 3 consumes.

**Type consistency:** Object IDs in Task 2 match the bindings in Task 3. Automation IDs in Task 4 match existing IDs from the original design.

**Review Focus coverage:**
- Battery source → Task 1 Step 6 and Task 3 Step 2
- Image caching → Task 3 Step 5 uses `refresh: 30`
- Overlay vs. content coordinates → Task 2 layout follows 432 px split
- Touch target sizing → Task 2 follows 48 px minimum
- Entity availability → Task 3 templates include `default()` and `unknown`/`unavailable` handling
