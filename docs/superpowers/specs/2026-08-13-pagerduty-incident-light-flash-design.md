# PagerDuty Incident Office Light Flash

## Goal

When a new PagerDuty incident is assigned to the user, flash the office ceiling fan lights red three times, then restore them to their exact previous state (on/off, brightness, color temperature/color).

## Background

A first attempt at this automation exists in `automations.yaml` as `PD New Incident` (id `1786652844327`). It does not work because it uses a `numeric_state` trigger on the `assigned_incidents` attribute of `sensor.pagerduty_p2wm8b3_pagerduty_assigned_incidents`. That attribute is a list of incident objects, not a number, so the `above: 0` comparison never evaluates to true.

## Entities involved

- `sensor.pagerduty_p2wm8b3_pagerduty_assigned_incidents`
  - State is an integer count of incidents currently assigned to the user.
  - Attribute `assigned_incidents` is a list of incident detail objects.
- `light.ceiling_fan`
  - Entity registry name: **Office ceiling fan**.
  - Area: `travis_office`.
  - Platform: `group`.
  - Supports `color_temp` and `xy` color modes.

## Design

### Trigger

Use a `state` trigger on `sensor.pagerduty_p2wm8b3_pagerduty_assigned_incidents`. This fires every time PagerDuty coordinator refreshes and the count changes.

### Condition

Only act when the assigned-incident count **increases**:

```jinja2
{{ trigger.to_state.state | int(0) > trigger.from_state.state | int(0) }}
```

This means a single flash occurs for each newly assigned incident. If the count goes from 0→1, 1→2, etc., the automation fires. It does not fire on count decrease (incident resolved) or on unchanged refresh.

### Actions

1. **Snapshot current light state**
   - `scene.create` with `snapshot_entities: light.ceiling_fan` and a known `scene_id` (e.g., `scene.pagerduty_flash_restore`).
   - This captures on/off, brightness, color mode, color temp, and XY color.

2. **Flash sequence**
   - `repeat` with `count: 3`:
     - `light.turn_on`
       - `entity_id: light.ceiling_fan`
       - `brightness_pct: 100`
       - `color_name: red`
     - `delay: 00:00:00.500`
     - `light.turn_off`
       - `entity_id: light.ceiling_fan`
     - `delay: 00:00:00.500`

3. **Restore previous state**
   - `scene.turn_on` with `entity_id: scene.pagerduty_flash_restore`.

### Mode

`single` is sufficient. Multiple new incidents in quick succession will queue or be ignored, avoiding overlapping flash loops.

## Alternative considered

A `numeric_state` trigger with `above: 0` on the sensor state was considered. It would only fire when the count transitions from 0 to 1+, missing additional incidents while one is already open. The state-change-with-increasing-count trigger is more faithful to "when I get a new incident".

## Files to change

- `automations.yaml` — replace the broken `PD New Incident` automation.

## Validation

- Run `python scripts/validate_ha_yaml.py` to ensure `automations.yaml` parses.
- Reload automations in Home Assistant and watch the trace when the next incident arrives.
