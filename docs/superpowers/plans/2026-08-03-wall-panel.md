# Wall-Mounted openHASP Touch Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install MQTT, openHASP, flash the ESP32 display, and configure a two-page dashboard (weather/radar + lights) with always-on backlight control.

**Architecture:** The Mosquitto broker and MQTT integration provide the message bus. The openHASP custom component maps HA entity state to objects on the plate. Pages are defined in `/config/openhasp/wall_panel/pages.jsonl` and pushed on startup. Backlight is controlled via MQTT commands to the plate.

**Tech Stack:** Home Assistant OS, Mosquitto add-on, openHASP nightly firmware, openHASP custom component 0.7.2, MQTT, JSONL.

## Global Constraints

- Do not modify unrelated Home Assistant configuration.
- All YAML changes must pass `ha core check`.
- Physical wall-mount fabrication and power wiring are out of scope.
- Use plate node name `wall_panel` and MQTT topic prefix `hasp/wall_panel`.
- Screen never sleeps; backlight dims at night and brightens during the day.
- Only create light controls for rooms that already have light groups in HA: Living Room (`light.living_room_ceiling_fan`) and Travis Office (`light.ceiling_fan`).

---

### Task 1: Prepare directories and external-dir allowlist

**Files:**
- Create: `openhasp/wall_panel/` directory
- Modify: `configuration.yaml` (add `homeassistant:` block)

**Interfaces:**
- Consumes: existing `configuration.yaml`
- Produces: authorized path `/config/openhasp` so openHASP can read `pages.jsonl`

- [ ] **Step 1: Create the openHASP directory tree**

```bash
mkdir -p /homeassistant/openhasp/wall_panel
```

- [ ] **Step 2: Add `allowlist_external_dirs` to `configuration.yaml`**

Add a new top-level block near the top of `/homeassistant/configuration.yaml`, before `default_config:` if desired, but it must be a top-level key:

```yaml
homeassistant:
  allowlist_external_dirs:
    - "/config/openhasp"
```

- [ ] **Step 3: Validate**

```bash
ha core check
```

Expected: command exits `0` with no errors.

- [ ] **Step 4: Commit**

```bash
git -C /homeassistant add configuration.yaml openhasp/
git -C /homeassistant commit -m "chore: allow openhasp config directory"
```

---

### Task 2: Install the Mosquitto Broker add-on and MQTT integration

**Files:**
- None (add-on installed via Supervisor)

**Interfaces:**
- Produces: running MQTT broker on port 1883; MQTT integration discovered in HA

- [ ] **Step 1: Install the Mosquitto Broker add-on**

```bash
ha addons install core_mosquitto
```

If it is already installed, this will report that; continue.

- [ ] **Step 2: Start the add-on**

```bash
ha addons start core_mosquitto
```

- [ ] **Step 3: Verify the add-on is running**

```bash
ha addons info core_mosquitto
```

Expected: `state: started`.

- [ ] **Step 4: Confirm the MQTT integration is present**

In Home Assistant, go to **Settings > Devices & Services** and look for **MQTT**. If it did not auto-discover, add it manually with broker `core-mosquitto` and default credentials.

- [ ] **Step 5: Commit nothing yet**

Add-on state lives outside git; no commit needed.

---

### Task 3: Install the openHASP custom component

**Files:**
- Create/replace: `custom_components/openhasp/`

**Interfaces:**
- Consumes: release asset from `HASwitchPlate/openHASP-custom-component`
- Produces: loaded `openhasp` integration

- [ ] **Step 1: Download and extract the 0.7.2 release**

```bash
cd /tmp
curl -L -o openhasp-cc-0.7.2.zip https://github.com/HASwitchPlate/openHASP-custom-component/archive/refs/tags/0.7.2.zip
unzip -o openhasp-cc-0.7.2.zip
rm -rf /homeassistant/custom_components/openhasp
cp -r openHASP-custom-component-0.7.2/custom_components/openhasp /homeassistant/custom_components/openhasp
```

- [ ] **Step 2: Verify the manifest version**

```bash
grep '"version"' /homeassistant/custom_components/openhasp/manifest.json
```

Expected: contains `0.7.2`.

- [ ] **Step 3: Validate**

```bash
ha core check
```

Expected: command exits `0`.

- [ ] **Step 4: Commit**

```bash
git -C /homeassistant add custom_components/openhasp/
git -C /homeassistant commit -m "feat: install openHASP custom component 0.7.2"
```

---

### Task 4: Flash openHASP firmware and discover the plate

**Files:**
- None (physical device step)

**Interfaces:**
- Produces: plate connected to Wi-Fi and MQTT; `openhasp.wall_panel` entity in HA

- [ ] **Step 1: Flash the firmware**

On a PC with the display connected via USB-C:

1. Open https://nightly.openhasp.com/ in Chrome/Edge.
2. Select board **Sunton ESP32-8048S070C** (capacitive 7"). If touch does not work after boot, re-flash with **CrowPanel 7" RGB**.
3. Click **Install** and choose the serial port.
4. Wait for the flash to complete and the device to reboot.

- [ ] **Step 2: Join Wi-Fi and configure MQTT**

1. Connect to the `openHASP-...` captive-portal network if it appears, or find the device's IP from your router.
2. Open the plate web UI (http://openhasp-xxx.local or IP).
3. Set:
   - **Wi-Fi SSID / Password**
   - **MQTT Broker**: your HA host (e.g., `homeassistant.local` or `192.168.x.x`)
   - **MQTT Port**: `1883`
   - **MQTT User/Password**: HA local user credentials
   - **HASP Node Name**: `wall_panel`
   - **Idle**: `off`
   - **Start Page**: `1`
4. Save and reboot the plate.

- [ ] **Step 3: Discover the plate in Home Assistant**

1. In HA go to **Settings > Devices & Services**.
2. The **openHASP** integration should discover a new device named `wall_panel`.
3. Add it and finish the config flow. Note the plate slug (usually `wall_panel`).

- [ ] **Step 4: Verify entity exists**

Check that `openhasp.wall_panel` appears in **Developer Tools > States**.

---

### Task 5: Create the page layout JSONL

**Files:**
- Create: `openhasp/wall_panel/pages.jsonl`

**Interfaces:**
- Consumes: screen resolution 800×480, NOAA radar export URL
- Produces: page definitions loaded by openHASP

- [ ] **Step 1: Write `pages.jsonl`**

Create `/homeassistant/openhasp/wall_panel/pages.jsonl` with exactly these lines:

```jsonl
{"page":0,"id":1,"obj":"obj","x":0,"y":440,"w":800,"h":40,"bg_color":"#263238","click":0}
{"page":0,"id":2,"obj":"btn","x":0,"y":440,"w":400,"h":40,"text":"Weather","bg_color":"#37474F","text_color":"#FFFFFF","radius":0}
{"page":0,"id":3,"obj":"btn","x":400,"y":440,"w":400,"h":40,"text":"Lights","bg_color":"#455A64","text_color":"#FFFFFF","radius":0}
{"page":1,"id":1,"obj":"obj","x":0,"y":0,"w":800,"h":440,"bg_color":"#263238","click":0}
{"page":1,"id":2,"obj":"label","x":0,"y":0,"w":800,"h":40,"text":"Weather","align":1,"bg_color":"#37474F","text_color":"#FFFFFF","text_font":24}
{"page":1,"id":3,"obj":"label","x":10,"y":50,"w":780,"h":70,"text":"--° --","align":1,"text_font":32,"text_color":"#FFFFFF"}
{"page":1,"id":4,"obj":"label","x":10,"y":125,"w":780,"h":35,"text":"--","align":1,"text_font":18,"text_color":"#B0BEC5"}
{"page":1,"id":5,"obj":"img","x":0,"y":170,"w":800,"h":270,"src":"https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity/MapServer/export?bbox=-130,20,-60,50&bboxSR=4326&size=800,480&format=png32&f=image"}
{"page":2,"id":1,"obj":"obj","x":0,"y":0,"w":800,"h":440,"bg_color":"#263238","click":0}
{"page":2,"id":2,"obj":"label","x":0,"y":0,"w":800,"h":40,"text":"Lights","align":1,"bg_color":"#37474F","text_color":"#FFFFFF","text_font":24}
{"page":2,"id":3,"obj":"btn","x":20,"y":60,"w":360,"h":90,"toggle":true,"text":"Living Room","text_font":18,"mode":"break","align":1,"radius":5}
{"page":2,"id":4,"obj":"btn","x":420,"y":60,"w":360,"h":90,"toggle":true,"text":"Office","text_font":18,"mode":"break","align":1,"radius":5}
{"page":2,"id":5,"obj":"slider","x":20,"y":160,"w":360,"h":30,"min":0,"max":255,"val":128}
{"page":2,"id":6,"obj":"slider","x":420,"y":160,"w":360,"h":30,"min":0,"max":255,"val":128}
```

- [ ] **Step 2: Validate JSONL format**

```bash
node -e "require('fs').readFileSync('/homeassistant/openhasp/wall_panel/pages.jsonl','utf8').split('\n').filter(l=>l.trim()).forEach((l,i)=>{try{JSON.parse(l);}catch(e){console.log('BAD line',i+1,e.message);process.exit(1);}});console.log('JSONL OK');"
```

Expected: `JSONL OK`.

- [ ] **Step 3: Commit**

```bash
git -C /homeassistant add openhasp/wall_panel/pages.jsonl
git -C /homeassistant commit -m "feat: add openhasp wall panel page layout"
```

---

### Task 6: Create openHASP plate configuration

**Files:**
- Create: `openhasp/wall_panel.yaml`
- Modify: `configuration.yaml` (include the new directory)

**Interfaces:**
- Consumes: plate slug `wall_panel`, entities `weather.forecast_home`, `light.living_room_ceiling_fan`, `light.ceiling_fan`
- Produces: synchronized objects and touch events

- [ ] **Step 1: Add `openhasp:` include to `configuration.yaml`**

Add this line near the other `!include` lines:

```yaml
openhasp: !include_dir_merge_named openhasp/
```

- [ ] **Step 2: Create `openhasp/wall_panel.yaml`**

Create `/homeassistant/openhasp/wall_panel.yaml` with this content. If the discovered plate slug is not `wall_panel`, replace `wall_panel:` with the actual slug before validating.

```yaml
wall_panel:
  objects:
    # Page navigation overlay (page 0)
    - obj: "p0b2"
      properties:
        bg_color: '{{ "#546E7A" if state_attr("openhasp.wall_panel", "page") == 1 else "#37474F" }}'
      event:
        "down":
          - service: openhasp.change_page
            target:
              entity_id: openhasp.wall_panel
            data:
              page: 1

    - obj: "p0b3"
      properties:
        bg_color: '{{ "#546E7A" if state_attr("openhasp.wall_panel", "page") == 2 else "#455A64" }}'
      event:
        "down":
          - service: openhasp.change_page
            target:
              entity_id: openhasp.wall_panel
            data:
              page: 2

    # Weather page (page 1)
    - obj: "p1b3"
      properties:
        text: >-
          {% set t = state_attr('weather.forecast_home', 'temperature') %}
          {% set c = states('weather.forecast_home') | replace('_', ' ') | title %}
          {{ '%d°' | format(t | int) if t not in [None, 'unknown', 'unavailable'] else '--°' }} {{ c }}

    - obj: "p1b4"
      properties:
        text: >-
          {% set h = state_attr('weather.forecast_home', 'humidity') %}
          {% set w = state_attr('weather.forecast_home', 'wind_speed') %}
          Humidity {{ h }}%   Wind {{ w }}

    # Lights page (page 2) - Living Room
    - obj: "p2b3"
      properties:
        val: '{{ 1 if is_state("light.living_room_ceiling_fan", "on") else 0 }}'
        text: >-
          {{ "Living Room\nOn" if is_state("light.living_room_ceiling_fan", "on") else "Living Room\nOff" }}
        bg_color: '{{ "#4CAF50" if is_state("light.living_room_ceiling_fan", "on") else "#607D8B" }}'
      event:
        "up":
          - service: homeassistant.toggle
            entity_id: light.living_room_ceiling_fan

    - obj: "p2b5"
      properties:
        val: '{{ state_attr("light.living_room_ceiling_fan", "brightness") | int(default=0) }}'
      event:
        "up":
          - service: light.turn_on
            data:
              entity_id: light.living_room_ceiling_fan
              brightness: "{{ val }}"

    # Lights page (page 2) - Office
    - obj: "p2b4"
      properties:
        val: '{{ 1 if is_state("light.ceiling_fan", "on") else 0 }}'
        text: >-
          {{ "Office\nOn" if is_state("light.ceiling_fan", "on") else "Office\nOff" }}
        bg_color: '{{ "#4CAF50" if is_state("light.ceiling_fan", "on") else "#607D8B" }}'
      event:
        "up":
          - service: homeassistant.toggle
            entity_id: light.ceiling_fan

    - obj: "p2b6"
      properties:
        val: '{{ state_attr("light.ceiling_fan", "brightness") | int(default=0) }}'
      event:
        "up":
          - service: light.turn_on
            data:
              entity_id: light.ceiling_fan
              brightness: "{{ val }}"
```

- [ ] **Step 3: Validate**

```bash
ha core check
```

Expected: command exits `0`.

- [ ] **Step 4: Commit**

```bash
git -C /homeassistant add configuration.yaml openhasp/wall_panel.yaml
git -C /homeassistant commit -m "feat: add openhasp wall_panel entity mappings"
```

---

### Task 7: Add startup and backlight automations

**Files:**
- Modify: `automations.yaml`

**Interfaces:**
- Consumes: `openhasp.wall_panel`, `pages.jsonl` path
- Produces: page push on startup; day/night backlight levels

- [ ] **Step 1: Append the three automations to `automations.yaml`**

Add these blocks at the end of `/homeassistant/automations.yaml`:

```yaml
- id: wall_panel_push_pages_on_startup
  alias: Wall panel push pages on startup
  description: Push the pages.jsonl layout to the wall panel after HA starts
  triggers:
    - trigger: homeassistant
      event: start
  conditions: []
  actions:
    - delay: "00:00:10"
    - service: openhasp.load_pages
      target:
        entity_id: openhasp.wall_panel
      data:
        path: /config/openhasp/wall_panel/pages.jsonl
  mode: single

- id: wall_panel_day_backlight
  alias: Wall panel day backlight
  description: Set panel backlight to bright during the day
  triggers:
    - trigger: time
      at: "07:00:00"
    - trigger: sun
      event: sunrise
  conditions:
    - condition: sun
      after: sunrise
      before: sunset
  actions:
    - service: mqtt.publish
      data:
        topic: hasp/wall_panel/command
        payload: "backlight {'state':1,'brightness':200}"
  mode: single

- id: wall_panel_night_backlight
  alias: Wall panel night backlight
  description: Dim panel backlight at night
  triggers:
    - trigger: time
      at: "22:00:00"
  conditions: []
  actions:
    - service: mqtt.publish
      data:
        topic: hasp/wall_panel/command
        payload: "backlight {'state':1,'brightness':50}"
  mode: single
```

- [ ] **Step 2: Validate**

```bash
ha core check
```

Expected: command exits `0`.

- [ ] **Step 3: Commit**

```bash
git -C /homeassistant add automations.yaml
git -C /homeassistant commit -m "feat: add wall panel startup page push and backlight automations"
```

---

### Task 8: Restart Home Assistant and verify

**Files:**
- None

**Interfaces:**
- Produces: working wall panel

- [ ] **Step 1: Restart Home Assistant**

```bash
ha core restart
```

- [ ] **Step 2: Wait for the panel to come online**

Watch **Settings > Devices & Services > openHASP** and confirm `wall_panel` is online.

- [ ] **Step 3: Verify Page 1 (Weather)**

On the panel:
- Current temperature and condition are shown.
- Radar image loads (may take a few seconds; the NOAA URL returns a PNG).

- [ ] **Step 4: Verify Page 2 (Lights)**

Tap **Lights** in the bottom navigation:
- Tap **Living Room**; `light.living_room_ceiling_fan` toggles.
- Drag the Living Room slider; brightness changes.
- Repeat for **Office** (`light.ceiling_fan`).

- [ ] **Step 5: Verify backlight automation**

In **Developer Tools > Services**, call:

```yaml
service: mqtt.publish
data:
  topic: hasp/wall_panel/command
  payload: "backlight {'state':1,'brightness':255}"
```

Expected: panel backlight changes immediately.

- [ ] **Step 6: Final commit if any fixes were needed**

If changes were made during verification, commit them with a descriptive message.
