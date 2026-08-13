# Door/Window Open Announcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Home Assistant automation that announces door/window openings over Alexa and notifies the phone only when no one is home.

**Architecture:** Single automation in `automations.yaml` triggered by door/window binary sensors, using `media_player.play_media` with `announce` on `media_player.everywhere`, plus a conditional `notify.mobile_app_traviss_iphone` action based on person presence.

**Tech Stack:** Home Assistant YAML automations, Alexa Media Player, mobile app notifications.

## Global Constraints

- YAML indentation is 2 spaces (matches `automations.yaml`).
- Use the known door/window sensor entities: `binary_sensor.living_room_front_door`, `binary_sensor.backdoor`.
- Use `media_player.everywhere` for Alexa announcements.
- Phone notification only when both `person.woteg` and `person.bobbie` are `not_home`.
- Automation `mode: single`.

---

## File Structure

- `automations.yaml` — append the new automation.
- `docs/superpowers/specs/2026-08-13-door-open-announcement-design.md` — reference design spec (read-only).
- `scripts/validate_ha_yaml.py` — existing validation script.

## Task 1: Add door/window open announcement automation

**Files:**
- Modify: `automations.yaml`

**Interfaces:**
- Consumes: `binary_sensor.living_room_front_door`, `binary_sensor.backdoor`, `person.woteg`, `person.bobbie`, `media_player.everywhere`, `notify.mobile_app_traviss_iphone`.
- Produces: Automation `Door/window open announcement`.

- [ ] **Step 1: Read the end of automations.yaml**

  Read the last few lines of `//HOMEASSISTANT/config/automations.yaml` to confirm the insertion point.

- [ ] **Step 2: Append the automation**

  Append the following YAML block to the end of `automations.yaml`:

  ```yaml
  - id: '1786780000001'
    alias: Door/window open announcement
    description: Announce door/window openings over Alexa and notify phone only when no one is home
    triggers:
    - trigger: state
      entity_id:
      - binary_sensor.living_room_front_door
      - binary_sensor.backdoor
      to: 'on'
      from: 'off'
    conditions: []
    actions:
    - variables:
        name: "{{ trigger.to_state.attributes.friendly_name | default(trigger.to_state.name) }}"
        message: "{{ name }} is open"
    - action: media_player.play_media
      target:
        entity_id: media_player.everywhere
      data:
        media_content_type: announce
        media_content_id: "{{ message }}"
    - choose:
      - conditions:
        - condition: template
          value_template: "{{ is_state('person.woteg', 'not_home') and is_state('person.bobbie', 'not_home') }}"
        sequence:
        - action: notify.mobile_app_traviss_iphone
          data:
            title: Door/Window Open
            message: "{{ message }}"
    mode: single
  ```

- [ ] **Step 3: Validate YAML syntax**

  Run: `py -c "import yaml; yaml.safe_load(open('automations.yaml', encoding='utf-8')); print('automations.yaml valid')"`
  Expected: prints `automations.yaml valid` with no errors.

- [ ] **Step 4: Run HA YAML validation**

  Run: `python scripts/validate_ha_yaml.py`
  Expected: all listed files OK.

- [ ] **Step 5: Commit**

  ```bash
  git add automations.yaml
  git commit -m "feat: add door/window open announcement over Alexa with conditional phone notification"
  ```

## Self-Review

1. **Spec coverage:** The spec requires door/window trigger, Alexa announcement, conditional phone notification based on presence, and validation. Task 1 covers all of these.
2. **Placeholder scan:** No TBD/TODO/"implement later"/"similar to" placeholders remain.
3. **Type consistency:** YAML keys use current Home Assistant action naming (`action:`) consistent with recent entries in `automations.yaml`.
