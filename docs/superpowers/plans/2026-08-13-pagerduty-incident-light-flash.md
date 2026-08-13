# PagerDuty Incident Office Light Flash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `PD New Incident` automation in `automations.yaml` so that every newly assigned PagerDuty incident flashes the office ceiling fan lights red three times and restores their prior state.

**Architecture:** A single Home Assistant automation using a `state` trigger with an increasing-count condition, a `scene.create` snapshot, a `repeat` loop of red on/off flashes, and a final `scene.turn_on` restoration.

**Tech Stack:** Home Assistant YAML automations (`automations.yaml`), standard `light`, `scene`, and `delay` actions.

## Global Constraints

- YAML indentation is 2 spaces (matches `automations.yaml`).
- Use `light.ceiling_fan` as the office ceiling fan group entity.
- Use `sensor.pagerduty_p2wm8b3_pagerduty_assigned_incidents` as the trigger sensor.
- Preserve the existing automation `id: '1786652844327'` and alias `PD New Incident`.
- Automation `mode: single`.

---

## File Structure

- `automations.yaml` — modify the existing `PD New Incident` entry (lines 238-256).
- `docs/superpowers/specs/2026-08-13-pagerduty-incident-light-flash-design.md` — reference design spec (read-only).
- `scripts/validate_ha_yaml.py` — existing validation script to run after changes.

## Task 1: Replace the broken PagerDuty incident automation

**Files:**
- Modify: `automations.yaml:238-256`

**Interfaces:**
- Consumes: `sensor.pagerduty_p2wm8b3_pagerduty_assigned_incidents` state (integer count).
- Produces: Automation `PD New Incident` that flashes `light.ceiling_fan` red 3 times and restores state.

- [ ] **Step 1: Read the current automation block**

  Read `automations.yaml` lines 238-256 to confirm the exact text being replaced.

- [ ] **Step 2: Replace the automation with the new YAML**

  Replace lines 238-256 with:

  ```yaml
  - id: '1786652844327'
    alias: PD New Incident
    description: Flash the office ceiling fan red 3 times when a new PagerDuty incident is assigned, then restore prior state.
    triggers:
    - trigger: state
      entity_id:
      - sensor.pagerduty_p2wm8b3_pagerduty_assigned_incidents
    conditions:
    - condition: template
      value_template: "{{ trigger.to_state.state | int(0) > trigger.from_state.state | int(0) }}"
    actions:
    - action: scene.create
      data:
        scene_id: pagerduty_flash_restore
        snapshot_entities:
        - light.ceiling_fan
    - repeat:
        count: 3
        sequence:
        - action: light.turn_on
          target:
            entity_id: light.ceiling_fan
          data:
            brightness_pct: 100
            color_name: red
        - delay: 00:00:00.500
        - action: light.turn_off
          target:
            entity_id: light.ceiling_fan
        - delay: 00:00:00.500
    - action: scene.turn_on
      target:
        entity_id: scene.pagerduty_flash_restore
    mode: single
  ```

- [ ] **Step 3: Validate YAML syntax**

  Run: `py -c "import yaml; yaml.safe_load(open('automations.yaml', encoding='utf-8')); print('automations.yaml valid')"`
  Expected: prints `automations.yaml valid` with no errors.

- [ ] **Step 4: Run HA YAML validation**

  Run: `python scripts/validate_ha_yaml.py`
  Expected: exits successfully with no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add automations.yaml
  git commit -m "fix: make PagerDuty incident automation flash office ceiling fan red 3 times and restore state"
  ```

## Self-Review

1. **Spec coverage:** The spec requires a state trigger on the assigned-incidents sensor, a condition for increasing count, snapshot/restore via scene, and a 3-time red flash loop. Task 1 covers all of these.
2. **Placeholder scan:** No TBD/TODO/"implement later"/"similar to" placeholders remain.
3. **Type consistency:** YAML keys use current Home Assistant action naming (`action:` rather than `service:`) consistent with recent entries in `automations.yaml`.
