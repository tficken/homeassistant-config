# Reliability Alerting Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add silent-failure alerting to the Home Assistant config: bank-feed staleness, infrastructure watchdog (ring-mqtt/MQTT/cloud/Pi power), and a daily health digest (updates, voice add-ons, wall panel).

**Architecture:** Three new automations appended to `automations.yaml`, following the existing alert pattern (phone via `notify.mobile_app_traviss_iphone` + `persistent_notification.create`, as in `stale_backup_alert` at `automations.yaml:307`). Hybrid notification style: immediate push for critical failures with debounce; one 09:00 digest for soft items. No new integrations, no Python, no restart — automations reload from Developer Tools.

**Tech Stack:** Home Assistant automations (modern `triggers:`/`conditions:`/`actions:` syntax), Jinja templates.

**Spec:** `docs/superpowers/specs/2026-10-23-reliability-alerting-design.md`

## Global Constraints

- Only `automations.yaml` is modified. No other config files.
- All entity IDs below were verified against `.storage/core.entity_registry` on 2026-10-23 — use them verbatim.
- Match the existing automation style: `id`, `alias`, `description`, `triggers`, `conditions`, `actions`, `mode`. 2-space YAML indent. Quote all `on`/`off` states (`to: "on"`) to avoid YAML boolean coercion.
- New automations are appended at the end of `automations.yaml`.
- Every task ends with `python scripts/validate_ha_yaml.py` passing.
- Commit per task with conventional-commit messages (`feat(alerts): ...`).

## Review Focus

Inputs/conditions the spec implies but YAML validation cannot exercise — each gets a manual template check in its owning task:

1. **`data_age` sensor holding a non-timestamp value** (SimpleFIN glitches) — the bank-feed condition must treat it as stale, not crash. Covered by Task 1 Step 3's template check with a forced bogus value in Developer Tools.
2. **Add-on flapping** (restart loop) — debounce windows must suppress sub-window blips. Covered by construction (`for:` on triggers); Task 2 Step 3 confirms each `for:` parses by reloading automations and checking the automation's traces show no fire on a brief stop/start.
3. **Digest when zero `update.*` entities are on** — must send nothing. Covered by Task 3 Step 3 rendering the template on a normal day.
4. **Pi power sensor toggling during boot** — undervoltage flags can flicker at boot; the digest/immediate split means a single real event notifies once (persistent notification has a fixed `notification_id`, so repeats overwrite instead of stacking).
5. **Multiple simultaneous failures** (MQTT down takes ring-mqtt down too) — `mode: parallel` plus per-trigger `notification_id` means each failure notifies independently rather than one masking the other.

---

### Task 1: Bank feed stale alert

**Files:**
- Modify: `automations.yaml` (append at end)

**Interfaces:**
- Consumes: `binary_sensor.west_gate_bank_checking_2075_possible_error`, `sensor.west_gate_bank_checking_2075_data_age` (both exist; same pair `binary_sensor.bills_covered` uses at `configuration.yaml:304-306`).
- Produces: automation `automation.bank_feed_stale_alert`.

- [ ] **Step 1: Append the automation**

```yaml
- id: bank_feed_stale_alert
  alias: Bank feed stale alert
  description: Notify when the SimpleFIN bank feed stops updating — safe-to-spend numbers go stale silently otherwise
  triggers:
    - trigger: state
      entity_id: binary_sensor.west_gate_bank_checking_2075_possible_error
      to: "on"
      id: error
    - trigger: time
      at: "09:00:00"
      id: daily
  conditions:
    - condition: template
      value_template: >
        {% set age_ts = as_timestamp(states('sensor.west_gate_bank_checking_2075_data_age'), none) %}
        {{ states('binary_sensor.west_gate_bank_checking_2075_possible_error') == 'on'
           or age_ts is none
           or now().timestamp() - age_ts > 172800 }}
  actions:
    - action: persistent_notification.create
      data:
        title: Bank feed stale
        message: "SimpleFIN data for West Gate checking is stale or erroring (last update: {{ states('sensor.west_gate_bank_checking_2075_data_age') }}) — safe-to-spend numbers may be wrong."
        notification_id: bank_feed_stale_alert
    - action: notify.mobile_app_traviss_iphone
      data:
        title: Bank feed stale
        message: "SimpleFIN data for West Gate checking is stale or erroring — safe-to-spend numbers may be wrong."
  mode: single
```

Note: the `as_timestamp(..., none)` default argument is copied verbatim from the proven `bills_covered` template (`configuration.yaml:304`) — do not "fix" it.

- [ ] **Step 2: Validate**

Run: `python scripts/validate_ha_yaml.py`
Expected: `OK: automations.yaml`

- [ ] **Step 3: Manual template check (human or live HA)**

Developer Tools → Template, paste the condition `value_template` body. Expected on a healthy system: `False`. Then replace the entity id with `sensor.nonexistent` — expected: `True` (treated as stale, not an error). This pins Review Focus item 1.

- [ ] **Step 4: Commit**

```bash
git add automations.yaml
git commit -m "feat(alerts): bank feed staleness alert (SimpleFIN)"
```

---

### Task 2: Infrastructure watchdog

**Files:**
- Modify: `automations.yaml` (append at end)

**Interfaces:**
- Consumes: `binary_sensor.ring_mqtt_with_video_streaming_running`, `binary_sensor.mosquitto_broker_running`, `binary_sensor.remote_ui`, `binary_sensor.raspberry_pi_power_status` (all verified in the entity registry).
- Produces: automation `automation.infrastructure_watchdog`.

- [ ] **Step 1: Append the automation**

```yaml
- id: infrastructure_watchdog
  alias: Infrastructure watchdog
  description: Immediate alert when critical infrastructure fails (debounced so quick add-on restarts stay silent)
  triggers:
    - trigger: state
      entity_id: binary_sensor.ring_mqtt_with_video_streaming_running
      to: "off"
      for: "00:10:00"
      id: ring_mqtt
    - trigger: state
      entity_id: binary_sensor.mosquitto_broker_running
      to: "off"
      for: "00:05:00"
      id: mqtt
    - trigger: state
      entity_id: binary_sensor.remote_ui
      to: "off"
      for: "00:15:00"
      id: cloud
    - trigger: state
      entity_id: binary_sensor.raspberry_pi_power_status
      to: "on"
      id: power
  conditions: []
  actions:
    - variables:
        component: >
          {{ {"ring_mqtt": "ring-mqtt add-on (camera recording is down)",
              "mqtt": "Mosquitto MQTT broker (ring-mqtt and Bambu LAN control go down with it)",
              "cloud": "Nabu Casa remote UI (remote access, Alexa exposure, cloud TTS)",
              "power": "Raspberry Pi power problem (undervoltage — SD card corruption risk)"}[trigger.id] }}
    - action: persistent_notification.create
      data:
        title: Infrastructure failure
        message: "{{ component }} has failed."
        notification_id: "infrastructure_{{ trigger.id }}"
    - action: notify.mobile_app_traviss_iphone
      data:
        title: Infrastructure failure
        message: "{{ component }} has failed."
  mode: parallel
```

`mode: parallel` is deliberate: an MQTT outage takes ring-mqtt down too, and both notifications must fire (Review Focus item 5).

- [ ] **Step 2: Validate**

Run: `python scripts/validate_ha_yaml.py`
Expected: `OK: automations.yaml`

- [ ] **Step 3: Manual check (human or live HA)**

Developer Tools → Template, render the `component` mapping with a sample: `{{ {"ring_mqtt": "x", "mqtt": "y", "cloud": "z", "power": "w"}["mqtt"] }}` → `y`. After automations reload, restart the Mosquitto add-on briefly and confirm in the automation's trace that a sub-5-minute stop does NOT fire (Review Focus item 2).

- [ ] **Step 4: Commit**

```bash
git add automations.yaml
git commit -m "feat(alerts): infrastructure watchdog (ring-mqtt, MQTT, cloud, Pi power)"
```

---

### Task 3: Daily health digest

**Files:**
- Modify: `automations.yaml` (append at end)

**Interfaces:**
- Consumes: `update.*` domain, `binary_sensor.whisper_running`, `binary_sensor.piper_running`, `light.crowpanel_hasp_display_backlight` (all verified in the entity registry).
- Produces: automation `automation.daily_health_digest`.

- [ ] **Step 1: Append the automation**

```yaml
- id: daily_health_digest
  alias: Daily health digest
  description: 09:00 digest of soft issues — pending updates, voice add-ons down, wall panel offline. Sends nothing when all is well.
  triggers:
    - trigger: time
      at: "09:00:00"
  variables:
    digest_body: >
      {% set items = namespace(list=[]) %}
      {% set updates = states.update | selectattr('state', 'eq', 'on') | map(attribute='name') | list %}
      {% if updates | count > 0 %}
        {% set items.list = items.list + [updates | count ~ ' update(s) pending: ' ~ updates | join(', ')] %}
      {% endif %}
      {% for e in ['binary_sensor.whisper_running', 'binary_sensor.piper_running'] %}
        {% if is_state(e, 'off') %}
          {% set items.list = items.list + [states[e].name ~ ' is not running (voice pipeline degraded)'] %}
        {% endif %}
      {% endfor %}
      {% if is_state('light.crowpanel_hasp_display_backlight', 'unavailable') %}
        {% set items.list = items.list + ['CrowPanel wall panel is offline'] %}
      {% endif %}
      {{ items.list | join('\n') }}
  conditions:
    - condition: template
      value_template: "{{ digest_body | trim != '' }}"
  actions:
    - action: persistent_notification.create
      data:
        title: Daily health digest
        message: "{{ digest_body }}"
        notification_id: daily_health_digest
    - action: notify.mobile_app_traviss_iphone
      data:
        title: Daily health digest
        message: "{{ digest_body }}"
  mode: single
```

Automation-level `variables:` are evaluated before conditions, so `digest_body` is available in the condition template. The body is a plain string (not a list) to avoid native-type rendering fragility.

- [ ] **Step 2: Validate**

Run: `python scripts/validate_ha_yaml.py`
Expected: `OK: automations.yaml`

- [ ] **Step 3: Manual template check (human or live HA)**

Developer Tools → Template, paste the `digest_body` template body. Expected on a healthy day: empty string (condition then suppresses the notification — Review Focus item 3). Temporarily change `'on'` to `'off'` in the `selectattr` line to confirm the update branch produces a readable list.

- [ ] **Step 4: Commit**

```bash
git add automations.yaml
git commit -m "feat(alerts): daily health digest (updates, voice add-ons, wall panel)"
```

---

### Task 4: stale_backup_alert comment + activation

**Files:**
- Modify: `automations.yaml:307-309`

**Interfaces:**
- Consumes: nothing new.
- Produces: updated comment only — no behavior change.

- [ ] **Step 1: Update the description**

Replace the `description:` line of `stale_backup_alert` (currently "Notify when the newest backup is more than 8 days old (catches the weekly backup never running, which the backup script itself cannot report)") with:

```yaml
  description: Notify when the newest backup is more than 8 days old. With native daily backups enabled this sensor tracks the newest of BOTH backup systems; weekly-script failures are covered by the scripts' own failure notifications (restored 2026-10-23 via /config/token.ha).
```

- [ ] **Step 2: Validate**

Run: `python scripts/validate_ha_yaml.py`
Expected: all three `OK:` lines.

- [ ] **Step 3: Commit**

```bash
git add automations.yaml
git commit -m "docs(alerts): stale_backup_alert covers newest of both backup systems"
```

- [ ] **Step 4: Activate (human)**

Developer Tools → YAML → Automations → Reload. Then Settings → Automations: confirm the three new automations appear enabled. Optionally trigger `automation.daily_health_digest` manually once to see the digest (it will send only if something is pending).
