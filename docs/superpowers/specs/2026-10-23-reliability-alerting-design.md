# Reliability Alerting Pack — Design

Date: 2026-10-23

## Goal

Close the silent-failure gaps found in the 2026-10-23 ops survey: things that
can break with no notification today (bank feed, add-on crashes, cloud,
updates, wall panel). Notification style is **hybrid**: immediate push for
critical failures, a daily digest for soft/degraded items.

## Constraints

- All changes live in `automations.yaml` (plus one comment touch-up). No new
  integrations, no Python, no HA restart required — automations reload via
  Developer Tools.
- Follow existing alert conventions: `notify.mobile_app_traviss_iphone` +
  `persistent_notification.create` (pattern from `stale_backup_alert`,
  `automations.yaml:307`).
- Debounce every trigger so a quick add-on restart or brief cloud flap does
  not page anyone.
- Exact entity IDs must be verified against `.storage/core.entity_registry`
  at implementation time; the IDs below come from the survey.

## New automations

### 1. `bank_feed_stale_alert` (immediate)

The budget "safe to spend" numbers silently go wrong when SimpleFIN dies.

- Triggers:
  - `binary_sensor.west_gate_bank_checking_2075_possible_error` → `on`
    (immediate).
  - Daily 09:00 check (time trigger) — catches gradual staleness.
- Condition: data age over 48 h, computed the same way
  `binary_sensor.bills_covered` does (`configuration.yaml:304-305`:
  `now().timestamp() - as_timestamp(states('sensor.west_gate_bank_checking_2075_data_age')) > 172800`),
  OR `possible_error` is `on`.
- Action: phone + persistent notification: "Bank feed stale — safe-to-spend
  numbers may be wrong."

### 2. `infrastructure_watchdog` (immediate, one automation with trigger IDs)

| Trigger ID | Entity | Threshold | Why |
|---|---|---|---|
| `ring_mqtt` | `binary_sensor.ring_mqtt_with_video_streaming_running` → off | 10 min | Kills all camera recording/archiving |
| `mqtt` | `binary_sensor.mosquitto_broker_running` → off | 5 min | Takes ring-mqtt and Bambu LAN mode down |
| `cloud` | `binary_sensor.remote_ui` → off | 15 min | Remote access, Alexa exposure, cloud TTS |
| `power` | `binary_sensor.raspberry_pi_power_status` → on | immediate | Pi undervoltage corrupts SD cards |

- Single `choose:` action keyed on `trigger.id`; message names the component.
- Phone + persistent notification per firing.

### 3. `daily_health_digest` (09:00, digest — one notification only if non-empty)

Template builds a list; skips notification when empty. Items:

- **Pending updates** — `update.*` entities with state `on`, listed by
  friendly name (39 exist today; nothing surfaces them).
- **Voice add-ons down** — `binary_sensor.whisper_running` /
  `binary_sensor.piper_running` off (with a 15-min `for:` on a state trigger
  is not possible inside a digest; the digest simply reports current state at
  09:00, which is the desired digest behavior).
- **Wall panel offline** — `light.crowpanel_hasp_display_backlight`
  `unavailable` (panel dead or flashing; digest-only since the panel is not
  critical infrastructure).

## Comment touch-up

`stale_backup_alert` (`automations.yaml:307-309`): update its comment to note
that with native daily backups enabled, the sensor tracks the newest of BOTH
backup systems, and weekly-script failures are covered by the scripts' own
failure notifications (fixed 2026-10-23). No behavior change.

## Non-goals

- command_line sensor failure detection (`billy_*`, `last_backup_age`) —
  they hold their last value on failure by design; no clean mechanism short
  of a log watcher. Documented as accepted risk.
- A weekly-script-specific staleness sensor — superseded by the restored
  script failure notifications.
- Zigbee/ZHA device-unavailable sweeps — battery devices are already swept
  daily; a general "any Zigbee device dark" alert needs tuning against
  sleepy-device false positives. Separate future item if wanted.

## Verification

- `python scripts/validate_ha_yaml.py` passes.
- yamllint passes on `automations.yaml`.
- Templates render: paste each template into Developer Tools → Template and
  confirm expected output (digest list, bank-feed condition).
- User reloads automations (Developer Tools → YAML → Automations) to activate.
