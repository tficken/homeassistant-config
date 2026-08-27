# Enhanced Goodnight Routine Implementation Plan

> **Note (2026-08-26):** Motion detection is no longer disabled at sunrise (stays on 24/7); see the design spec's note for details.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing `script.goodnight` with a modular routine that checks doors/windows, smoothly dims lights, stops media, arms overnight monitoring, plays brown noise, and resets itself in the morning.

**Architecture:** A single `input_boolean.night_mode` coordinates the new behavior. Three small helper scripts handle door checks, dimming, and security. The main `script.goodnight` orchestrates them, and one new morning-reset automation cleans up at sunrise. The existing door-open announcement automation is updated to phone-alert at night even when people are home.

**Tech Stack:** Home Assistant YAML, Alexa Media Player (`media_player.master_bedroom_echo_dot`), standard `light`, `switch`, `notify`, and `input_boolean` platforms.

## Global Constraints

- YAML uses 2-space indentation.
- New/changed scripts and automations follow the existing style in `scripts.yaml` and `automations.yaml`.
- All changes must pass `scripts/validate_ha_yaml.py` and the local YAML parser.
- No git mutations without explicit user approval.
- The live Home Assistant instance loads these files directly; validate before reloading.

---

## File structure

| File | Responsibility |
|------|----------------|
| `configuration.yaml` | Add `input_boolean.night_mode`. |
| `scripts.yaml` | Add three helper scripts and rewrite the main `goodnight` script. |
| `automations.yaml` | Update the door-open announcement condition; add the morning-reset automation. |

---

### Task 1: Add `input_boolean.night_mode`

**Files:**
- Modify: `configuration.yaml`

**Interfaces:**
- Produces: `input_boolean.night_mode`, used by `script.goodnight_enable_security`, the updated door-open automation, and the morning-reset automation.

- [ ] **Step 1: Add the helper toggle**

  In `configuration.yaml`, locate the existing `input_boolean:` block and add `night_mode` under it:

  ```yaml
  input_boolean:
    voice_mute:
      name: Voice mute
      icon: mdi:microphone-off
      initial: false

    night_mode:
      name: Night mode
      icon: mdi:weather-night
      initial: false
  ```

- [ ] **Step 2: Validate YAML syntax**

  Run:
  ```bash
  py -c "import yaml; yaml.safe_load(open('configuration.yaml', encoding='utf-8')); print('configuration.yaml valid')"
  ```
  Expected: prints `configuration.yaml valid` with no errors.

---

### Task 2: Add helper scripts

**Files:**
- Modify: `scripts.yaml`

**Interfaces:**
- Produces: `script.goodnight_door_check`, `script.goodnight_dim_lights`, `script.goodnight_enable_security`.
- Consumes: `binary_sensor.living_room_front_door`, `binary_sensor.backdoor`, all `light.*` entities, `switch.front_door_motion_detection`, `switch.downstairs_motion_detection`, `input_boolean.night_mode`.

- [ ] **Step 1: Add `script.goodnight_door_check`**

  Append to `scripts.yaml`:

  ```yaml
  goodnight_door_check:
    alias: Goodnight door/window check
    sequence:
      - variables:
          any_open: >-
            {{ is_state('binary_sensor.living_room_front_door', 'on')
               or is_state('binary_sensor.backdoor', 'on') }}
          open_names: >
            {% set open = [] %}
            {% if is_state('binary_sensor.living_room_front_door', 'on') %}
              {% set open = open + ['Front door'] %}
            {% endif %}
            {% if is_state('binary_sensor.backdoor', 'on') %}
              {% set open = open + ['Back door'] %}
            {% endif %}
            {{ open | join(', ') }}
      - if:
          - condition: template
            value_template: "{{ any_open }}"
        then:
          - action: persistent_notification.create
            data:
              title: Goodnight warning
              message: "Left open: {{ open_names }}"
              notification_id: goodnight_door_check
            continue_on_error: true
          - action: media_player.volume_set
            target:
              entity_id: media_player.master_bedroom_echo_dot
            data:
              volume_level: 0.7
            continue_on_error: true
          - action: notify.alexa_media_master_bedroom_echo_dot
            data:
              message: "Goodnight warning: {{ open_names }} left open."
              data:
                type: announce
            continue_on_error: true
    mode: single
    icon: mdi:door-open
  ```

- [ ] **Step 2: Add `script.goodnight_dim_lights`**

  Append to `scripts.yaml`:

  ```yaml
  goodnight_dim_lights:
    alias: Goodnight dim lights
    sequence:
      - variables:
          lights_on: "{{ states.light | selectattr('state', 'eq', 'on') | map(attribute='entity_id') | list }}"
      - condition: template
        value_template: "{{ lights_on | length > 0 }}"
      - action: light.turn_on
        data:
          entity_id: "{{ lights_on }}"
          brightness_pct: 1
          transition: 10
      - delay: "00:00:11"
      - action: light.turn_off
        data:
          entity_id: "{{ lights_on }}"
          transition: 2
    mode: single
    icon: mdi:brightness-6
  ```

- [ ] **Step 3: Add `script.goodnight_enable_security`**

  Append to `scripts.yaml`:

  ```yaml
  goodnight_enable_security:
    alias: Goodnight enable security
    sequence:
      - action: switch.turn_on
        target:
          entity_id:
            - switch.front_door_motion_detection
            - switch.downstairs_motion_detection
        continue_on_error: true
      - action: input_boolean.turn_on
        target:
          entity_id: input_boolean.night_mode
    mode: single
    icon: mdi:shield-home
  ```

- [ ] **Step 4: Validate `scripts.yaml`**

  Run:
  ```bash
  py -c "import yaml; yaml.safe_load(open('scripts.yaml', encoding='utf-8')); print('scripts.yaml valid')"
  ```
  Expected: `scripts.yaml valid` with no errors.

---

### Task 3: Rewrite the main `script.goodnight`

**Files:**
- Modify: `scripts.yaml`

**Interfaces:**
- Consumes: `script.goodnight_door_check`, `script.goodnight_dim_lights`, `script.goodnight_enable_security`, `media_player.master_bedroom_echo_dot`, `notify.mobile_app_traviss_iphone`.

- [ ] **Step 1: Replace the existing `goodnight` script**

  In `scripts.yaml`, replace the current `goodnight:` entry with:

  ```yaml
  goodnight:
    alias: Goodnight
    sequence:
      - action: script.goodnight_door_check
      - action: script.goodnight_dim_lights
      - action: media_player.media_stop
        target:
          entity_id: all
        continue_on_error: true
      - action: media_player.volume_set
        target:
          entity_id: media_player.master_bedroom_echo_dot
        data:
          volume_level: 0.2
        continue_on_error: true
      - action: media_player.play_media
        target:
          entity_id: media_player.master_bedroom_echo_dot
        data:
          media_content_id: "https://files.noise-foundation.com/brown-noise-528-8h-v2.mp3"
          media_content_type: audio/mpeg
        continue_on_error: true
      - action: script.goodnight_enable_security
      - action: notify.mobile_app_traviss_iphone
        data:
          title: Goodnight
          message: Security armed and brown noise playing. Sleep well.
        continue_on_error: true
    mode: single
    icon: mdi:weather-night
  ```

- [ ] **Step 2: Validate `scripts.yaml`**

  Run:
  ```bash
  py -c "import yaml; yaml.safe_load(open('scripts.yaml', encoding='utf-8')); print('scripts.yaml valid')"
  ```
  Expected: `scripts.yaml valid` with no errors.

---

### Task 4: Update the door-open announcement automation

**Files:**
- Modify: `automations.yaml`

**Interfaces:**
- Consumes: `input_boolean.night_mode`.

- [ ] **Step 1: Update the phone-notification condition**

  In `automations.yaml`, find the `Door/window open announcement` automation. Replace the phone-notification condition from:

  ```yaml
  "{{ is_state('person.woteg', 'not_home') and is_state('person.bobbie', 'not_home') }}"
  ```

  to:

  ```yaml
  "{{ (is_state('person.woteg', 'not_home') and is_state('person.bobbie', 'not_home')) or is_state('input_boolean.night_mode', 'on') }}"
  ```

  The surrounding `choose` block should now look like:

  ```yaml
  - choose:
      - conditions:
          - condition: template
            value_template: "{{ (is_state('person.woteg', 'not_home') and is_state('person.bobbie', 'not_home')) or is_state('input_boolean.night_mode', 'on') }}"
        sequence:
          - action: notify.mobile_app_traviss_iphone
            data:
              title: Door/Window Open
              message: "{{ message }}"
  ```

- [ ] **Step 2: Validate `automations.yaml`**

  Run:
  ```bash
  py -c "import yaml; yaml.safe_load(open('automations.yaml', encoding='utf-8')); print('automations.yaml valid')"
  ```
  Expected: `automations.yaml valid` with no errors.

---

### Task 5: Add the morning-reset automation

**Files:**
- Modify: `automations.yaml`

**Interfaces:**
- Consumes: `input_boolean.night_mode`, `switch.front_door_motion_detection`, `switch.downstairs_motion_detection`, `media_player.master_bedroom_echo_dot`.

- [ ] **Step 1: Append the new automation**

  Add to the end of `automations.yaml`:

  ```yaml
  - id: goodnight_morning_reset
    alias: Goodnight morning reset
    description: Turn off night_mode, disable motion detection, and stop brown noise at sunrise
    triggers:
      - trigger: sun
        event: sunrise
    conditions:
      - condition: state
        entity_id: input_boolean.night_mode
        state: "on"
    actions:
      - action: input_boolean.turn_off
        target:
          entity_id: input_boolean.night_mode
      - action: switch.turn_off
        target:
          entity_id:
            - switch.front_door_motion_detection
            - switch.downstairs_motion_detection
        continue_on_error: true
      - action: media_player.media_stop
        target:
          entity_id: media_player.master_bedroom_echo_dot
        continue_on_error: true
    mode: single
  ```

- [ ] **Step 2: Validate `automations.yaml`**

  Run:
  ```bash
  py -c "import yaml; yaml.safe_load(open('automations.yaml', encoding='utf-8')); print('automations.yaml valid')"
  ```
  Expected: `automations.yaml valid` with no errors.

---

### Task 6: Full validation and manual testing

**Files:**
- Read-only: `configuration.yaml`, `scripts.yaml`, `automations.yaml`

**Interfaces:**
- Consumes: all entities referenced above.

- [ ] **Step 1: Run the HA YAML validator**

  Run:
  ```bash
  python scripts/validate_ha_yaml.py
  ```
  Expected: exits with code 0 and prints a validation-success message.

- [ ] **Step 2: Test the door-check helper**

  Open one door, then run `script.goodnight_door_check` from **Developer Tools > Services**. Verify:
  - A persistent notification appears with the correct door name.
  - The master bedroom Echo Dot announces the warning at 70% volume.

- [ ] **Step 3: Test the dim-lights helper**

  Turn on a few lights, then run `script.goodnight_dim_lights`. Verify they dim smoothly and turn off.

- [ ] **Step 4: Run the full goodnight routine**

  Run `script.goodnight` from **Developer Tools > Services** and inspect the trace. Verify:
  - Door check runs.
  - Lights dim and turn off.
  - Brown noise starts on the master bedroom Echo Dot at 20% volume.
  - `input_boolean.night_mode` turns on.
  - Motion-detection switches turn on.
  - You receive the final phone notification.

- [ ] **Step 5: Verify night-time door alerts**

  With `input_boolean.night_mode` on, open a door. Verify you get both the Alexa announcement and a phone notification.

- [ ] **Step 6: Verify the morning reset**

  Manually trigger `automation.goodnight_morning_reset` from **Developer Tools > Services**. Verify:
  - `input_boolean.night_mode` turns off.
  - Motion-detection switches turn off.
  - Brown noise stops on the Echo Dot.

- [ ] **Step 7: Reload and confirm live behavior**

  In Home Assistant, go to **Developer Tools > YAML > YAML Configuration > Reload scripts, automations, and scenes** (or restart if required). Repeat the manual checks above.

---

## Self-review checklist

- [x] Spec coverage: every requirement from `docs/superpowers/specs/2026-08-13-enhanced-goodnight-design.md` maps to a task.
- [x] Placeholder scan: no TBD/TODO/vague steps; exact YAML and commands are provided.
- [x] Type consistency: entity IDs and script/automation names match across tasks.
