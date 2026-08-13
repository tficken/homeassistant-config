# Expose Home Assistant Entities to Alexa via Cloud

## Goal

Configure Home Assistant Cloud so that useful entities are exposed to Amazon Alexa, while excluding diagnostic/noisy entities that clutter the Alexa app or are not controllable via voice.

## Background

Home Assistant Cloud is connected (`//HOMEASSISTANT/config/.storage/cloud` shows `alexa_enabled: true`), but `alexa_entity_configs` is empty and no per-entity exposure overrides exist. As a result, Alexa discovers no devices.

Nabu Casa documents that `cloud.alexa.filter` can be configured in `configuration.yaml`; when filters are present, the UI exposure toggles are grayed out and YAML controls exposure.

## Entities to expose

### Included domains

| Domain | Reason |
|--------|--------|
| `alarm_control_panel` | Arm/disarm |
| `binary_sensor` | Door/window/motion contact sensors |
| `button` | Trigger scenes/routines in Alexa |
| `camera` | View cameras in Alexa app |
| `climate` | Thermostat control |
| `cover` | Garage doors, blinds, shades |
| `fan` | Ceiling fans |
| `group` | Grouped lights/switches |
| `input_boolean` | Virtual switches |
| `light` | Lights |
| `lock` | Locks |
| `media_player` | Fire TV / media control |
| `scene` | Activate scenes |
| `script` | Run scripts |
| `sensor` | Temperature, humidity, occupancy sensors |
| `switch` | Switches, outlets |
| `vacuum` | Robot vacuums |

### Excluded domains

| Domain | Reason |
|--------|--------|
| `automation` | Enabling/disabling automations via voice is rarely useful and risky |
| `update` | Not controllable via Alexa |
| `weather` | Not supported as a controllable entity |

### Excluded entity globs

Exclude diagnostic, battery, and integration-specific noisy sensors:

- `sensor.*_battery`
- `sensor.*_cpu_percent`
- `sensor.*_memory_percent`
- `sensor.ha_disk_usage`
- `sensor.home_assistant_*`
- `sensor.exos_router_*`
- `sensor.p1s_*_temperature`
- `sensor.p1s_*_fan_speed`
- `sensor.p1s_*_speed`
- `binary_sensor.p1s_*_firmware`
- `binary_sensor.p1s_*_developer_lan_mode`
- `binary_sensor.p1s_*_mqtt_encryption`
- `binary_sensor.p1s_*_hybrid_mqtt_control_blocked`
- `sensor.sun_*`
- `sensor.backup_*`

## Configuration approach

Add a `cloud:` block to `configuration.yaml` with the `alexa` filter. Home Assistant will merge this with the existing cloud account configuration in `.storage/cloud`.

## Files to change

- `configuration.yaml` — add `cloud.alexa.filter` block.

## Validation

- Run `python scripts/validate_ha_yaml.py` to ensure `configuration.yaml` parses.
- Restart Home Assistant and run **Alexa, discover devices**.

## Risks / notes

- Adding YAML filters disables UI-based per-entity exposure management for Alexa (UI shows grayed-out toggles). Future changes must be made in YAML.
- This change affects only Alexa; Google Assistant exposure is unchanged.
