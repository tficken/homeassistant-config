# Expose Home Assistant Entities to Alexa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cloud.alexa.filter` block to `configuration.yaml` so Alexa discovers useful Home Assistant entities while skipping diagnostic/noisy ones.

**Architecture:** A single YAML filter in `configuration.yaml` that includes useful domains, excludes irrelevant domains, and excludes specific diagnostic entity globs. The existing Home Assistant Cloud account in `.storage/cloud` remains untouched; YAML filters override/extend the Alexa exposure behavior.

**Tech Stack:** Home Assistant YAML, `cloud` integration Alexa filter.

## Global Constraints

- Use 2-space YAML indentation (matches `configuration.yaml`).
- Do not edit `.storage/cloud` or `.storage/core.entity_registry` directly.
- Only Alexa exposure is changed; Google Assistant exposure stays as-is.
- Validate with `python scripts/validate_ha_yaml.py` before claiming complete.

---

## File Structure

- `configuration.yaml` — add `cloud:` block.
- `docs/superpowers/specs/2026-08-13-expose-entities-to-alexa-design.md` — reference design spec (read-only).
- `scripts/validate_ha_yaml.py` — existing validation script.

## Task 1: Add Alexa exposure filter to configuration.yaml

**Files:**
- Modify: `configuration.yaml`

**Interfaces:**
- Consumes: existing Home Assistant Cloud account state in `.storage/cloud`.
- Produces: `cloud:` YAML block that exposes useful entities to Alexa.

- [ ] **Step 1: Read the current configuration.yaml**

  Read `//HOMEASSISTANT/config/configuration.yaml` to find a good insertion point (after `default_config:` and before integration-specific sections).

- [ ] **Step 2: Add the cloud block**

  Insert the following block into `configuration.yaml`:

  ```yaml
  cloud:
    alexa:
      filter:
        include_domains:
          - alarm_control_panel
          - binary_sensor
          - button
          - camera
          - climate
          - cover
          - fan
          - group
          - input_boolean
          - light
          - lock
          - media_player
          - scene
          - script
          - sensor
          - switch
          - vacuum
        exclude_domains:
          - automation
          - update
          - weather
        exclude_entity_globs:
          - sensor.*_battery
          - sensor.*_cpu_percent
          - sensor.*_memory_percent
          - sensor.ha_disk_usage
          - sensor.home_assistant_*
          - sensor.exos_router_*
          - sensor.p1s_*_temperature
          - sensor.p1s_*_fan_speed
          - sensor.p1s_*_speed
          - binary_sensor.p1s_*_firmware
          - binary_sensor.p1s_*_developer_lan_mode
          - binary_sensor.p1s_*_mqtt_encryption
          - binary_sensor.p1s_*_hybrid_mqtt_control_blocked
          - sensor.sun_*
          - sensor.backup_*
  ```

- [ ] **Step 3: Validate YAML syntax**

  Run: `py -c "import yaml; yaml.safe_load(open('configuration.yaml', encoding='utf-8')); print('configuration.yaml valid')"`
  Expected: prints `configuration.yaml valid` with no errors.

- [ ] **Step 4: Run HA YAML validation**

  Run: `python scripts/validate_ha_yaml.py`
  Expected: all listed files OK.

- [ ] **Step 5: Commit**

  ```bash
  git add configuration.yaml
  git commit -m "feat: expose useful entities to Alexa via Home Assistant Cloud filter"
  ```

## Self-Review

1. **Spec coverage:** The spec requires including useful domains, excluding irrelevant/noisy domains, excluding diagnostic entity globs, and validating. Task 1 covers all of these.
2. **Placeholder scan:** No TBD/TODO/"implement later"/"similar to" placeholders remain.
3. **Type consistency:** YAML keys and indentation match the existing `configuration.yaml` style.
