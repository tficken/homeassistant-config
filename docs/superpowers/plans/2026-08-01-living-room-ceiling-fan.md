# Living Room Ceiling Fan Lights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure three new Living Room ceiling fan lights as a single voice-controllable group with independent scenes and scripts, exposing only the group entity in the UI.

**Architecture:** Add a `light` group helper in YAML for the three bulbs, create Living Room-specific scenes/scripts, update the auto-generated dashboard builder to hide the individual bulbs, and adjust the entity registry so only the group is visible and voice-exposed.

**Tech Stack:** Home Assistant 2026.7.4, YAML configuration, Node.js dashboard generator, ZHA.

## Global Constraints

- Only `light.living_room_ceiling_fan` should be visible/controllable in the UI and voice assistant.
- Living Room scenes/scripts must be independent of the office scenes/scripts.
- All YAML changes must pass `ha core check`.
- The dashboard generator (`.dashboard-gen/build-dashboards.js`) must be re-run after any light entity changes.

---

### Task 1: Add the Living Room ceiling fan light group

**Files:**
- Modify: `/homeassistant/configuration.yaml`

**Interfaces:**
- Consumes: Entity IDs of the three ZHA lights.
- Produces: `light.living_room_ceiling_fan` group entity.

- [ ] **Step 1: Append the light group to configuration.yaml**

Add the following block to the end of `/homeassistant/configuration.yaml`:

```yaml
light:
  - platform: group
    name: Living room ceiling fan
    unique_id: living_room_ceiling_fan
    entities:
      - light.third_reality_inc_3rcb01057z_4
      - light.third_reality_inc_3rcb01057z_5
      - light.third_reality_inc_3rcb01057z_6
```

- [ ] **Step 2: Validate HA configuration**

Run:

```bash
ha core check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add /homeassistant/configuration.yaml
git commit -m "feat: add living room ceiling fan light group"
```

---

### Task 2: Add Living Room scenes

**Files:**
- Modify: `/homeassistant/scenes.yaml`

**Interfaces:**
- Consumes: `light.living_room_ceiling_fan` from Task 1.
- Produces: `scene.living_room_focus_mode`, `scene.living_room_relax_mode`, `scene.living_room_all_lights_off`.

- [ ] **Step 1: Append the new scenes to scenes.yaml**

Add the following block to the end of `/homeassistant/scenes.yaml`:

```yaml
- id: living_room_focus_mode
  name: Living room focus mode
  icon: mdi:desk-lamp-on
  entities:
    light.living_room_ceiling_fan:
      state: "on"
      brightness_pct: 100

- id: living_room_relax_mode
  name: Living room relax mode
  icon: mdi:sofa
  entities:
    light.living_room_ceiling_fan:
      state: "on"
      brightness_pct: 30

- id: living_room_all_lights_off
  name: Living room all lights off
  icon: mdi:lightbulb-off
  entities:
    light.living_room_ceiling_fan:
      state: "off"
```

- [ ] **Step 2: Validate HA configuration**

Run:

```bash
ha core check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add /homeassistant/scenes.yaml
git commit -m "feat: add living room ceiling fan scenes"
```

---

### Task 3: Add Living Room scripts

**Files:**
- Modify: `/homeassistant/scripts.yaml`

**Interfaces:**
- Consumes: `light.living_room_ceiling_fan` from Task 1.
- Produces: `script.living_room_lights_on`, `script.living_room_lights_off`.

- [ ] **Step 1: Append the new scripts to scripts.yaml**

Add the following block to the end of `/homeassistant/scripts.yaml`:

```yaml
living_room_lights_on:
  alias: Living room lights on
  sequence:
    - action: light.turn_on
      target:
        entity_id: light.living_room_ceiling_fan
      data:
        brightness_pct: 100
  mode: single
  icon: mdi:lightbulb-on

living_room_lights_off:
  alias: Living room lights off
  sequence:
    - action: light.turn_off
      target:
        entity_id: light.living_room_ceiling_fan
      data:
        transition: 2
  mode: single
  icon: mdi:lightbulb-off
```

- [ ] **Step 2: Validate HA configuration**

Run:

```bash
ha core check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add /homeassistant/scripts.yaml
git commit -m "feat: add living room ceiling fan scripts"
```

---

### Task 4: Update dashboard generator to hide individual bulbs

**Files:**
- Modify: `/homeassistant/.dashboard-gen/build-dashboards.js`

**Interfaces:**
- Consumes: Entity IDs of the three individual Living Room bulbs.
- Produces: Updated `EXCLUDED_LIGHTS` list used by the dashboard builder.

- [ ] **Step 1: Add the new bulbs to EXCLUDED_LIGHTS**

In `/homeassistant/.dashboard-gen/build-dashboards.js`, update the `EXCLUDED_LIGHTS` array:

```javascript
const EXCLUDED_LIGHTS = [
  'light.third_reality_inc_3rcb01057z',
  'light.third_reality_inc_3rcb01057z_2',
  'light.third_reality_inc_3rcb01057z_3',
  'light.third_reality_inc_3rcb01057z_4',
  'light.third_reality_inc_3rcb01057z_5',
  'light.third_reality_inc_3rcb01057z_6'
];
```

- [ ] **Step 2: Commit**

```bash
git add /homeassistant/.dashboard-gen/build-dashboards.js
git commit -m "feat: hide living room fan bulbs from auto-generated dashboard"
```

---

### Task 5: Configure individual light entities (names, area, hidden, voice exposure)

**Files:**
- Modify: `/homeassistant/.storage/core.entity_registry`

**Interfaces:**
- Consumes: Entity IDs of the three individual Living Room bulbs.
- Produces: Renamed, area-assigned, hidden, non-voice-exposed entities.

**Note:** These settings can also be applied through the Home Assistant UI (Settings → Devices & services → Entities). The registry edits below mirror what the UI does.

- [ ] **Step 1: Update each of the three entity registry entries**

For each of these entity IDs, update the corresponding registry entry:

- `light.third_reality_inc_3rcb01057z_4`
  - `"name": "Living room ceiling fan light 1"`
  - `"area_id": "living_room"`
  - `"hidden_by": "user"`
  - `"options": {"conversation": {"should_expose": false}}`

- `light.third_reality_inc_3rcb01057z_5`
  - `"name": "Living room ceiling fan light 2"`
  - `"area_id": "living_room"`
  - `"hidden_by": "user"`
  - `"options": {"conversation": {"should_expose": false}}`

- `light.third_reality_inc_3rcb01057z_6`
  - `"name": "Living room ceiling fan light 3"`
  - `"area_id": "living_room"`
  - `"hidden_by": "user"`
  - `"options": {"conversation": {"should_expose": false}}`

- [ ] **Step 2: Verify the registry entries**

Run:

```bash
grep -E '"entity_id":"light\.third_reality_inc_3rcb01057z_[456]"' /homeassistant/.storage/core.entity_registry
```

Expected: each entry shows `"area_id":"living_room"`, `"hidden_by":"user"`, and `"should_expose":false`.

- [ ] **Step 3: Commit**

```bash
git add /homeassistant/.storage/core.entity_registry
git commit -m "feat: configure living room fan bulb entities"
```

---

### Task 6: Build dashboards, restart HA, and verify

**Files:**
- Run: `/homeassistant/.dashboard-gen/build-dashboards.js`
- Restart: Home Assistant Core

**Interfaces:**
- Consumes: All changes from Tasks 1–5.
- Produces: Updated dashboard storage files and a running HA instance with the new group.

- [ ] **Step 1: Re-generate dashboards**

Run:

```bash
cd /homeassistant/.dashboard-gen && node build-dashboards.js
```

Expected output:

```
Generated Web dashboard: /homeassistant/.storage/lovelace.dashboard_dashboard
Generated iPad dashboard: /homeassistant/.storage/lovelace.dashboard_ipad
Updated dashboards registry: /homeassistant/.storage/lovelace_dashboards
```

- [ ] **Step 2: Restart Home Assistant Core**

Run:

```bash
ha core restart
```

- [ ] **Step 3: Verify the new group and scenes/scripts**

After HA is running, run:

```bash
ha core logs --lines 200 2>&1 | grep -iE "(living_room|light\.living)" | head -30
```

Expected: `light.living_room_ceiling_fan` appears in setup logs with no errors.

- [ ] **Step 4: Verify only the group is visible**

Run:

```bash
grep -E '"entity_id":"light\.(living_room_ceiling_fan|third_reality_inc_3rcb01057z_[456])"' /homeassistant/.storage/core.entity_registry
```

Expected:

- `light.living_room_ceiling_fan`: `"hidden_by":null`, conversation exposure enabled.
- `light.third_reality_inc_3rcb01057z_4/5/6`: `"hidden_by":"user"`, conversation exposure disabled.

- [ ] **Step 5: Commit generated dashboard files**

```bash
git add /homeassistant/.storage/lovelace.dashboard_dashboard /homeassistant/.storage/lovelace.dashboard_ipad /homeassistant/.storage/lovelace_dashboards
git commit -m "chore: regenerate dashboards for living room ceiling fan"
```

---

## Self-Review

- **Spec coverage:**
  - Individual lights renamed/area-assigned/hidden/non-exposed → Task 5.
  - Group light created → Task 1.
  - Voice exposure for group only → Tasks 1 and 5.
  - Scenes → Task 2.
  - Scripts → Task 3.
  - Dashboard handling → Task 4 and Task 6.
  - Config check passes → validation steps in Tasks 1–3.
- **Placeholder scan:** No TBD/TODO placeholders; all YAML snippets and commands are concrete.
- **Type consistency:** Entity IDs match across Tasks 1–5. Scene/script names match the spec design.
