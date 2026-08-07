# Design: iPad Wall Panel — Grouped Ceiling Fan Lights and Larger Cards

## Context

- Dashboard file: `/config/ipad-wall-panel.yaml`
- Dashboard type: Lovelace sections view (`type: sections`, `max_columns: 3`, `theme: Google Dark Theme`)
- The wall panel is displayed on an iPad, so large touch targets are important.
- HACS card installed: `lovelace-mushroom-better-sliders` (enhances `custom:mushroom-light-card` sliders).

## Goal

1. In the **Lights** view, show only the grouped ceiling fan light entities and remove the individual Third Reality bulb entities that compose those groups.
2. Make the light cards roughly double-sized (wider and taller) so brightness/color-temperature sliders are easier to operate on a wall-mounted iPad.
3. Apply the same size increase to the light cards in the **Home** view Quick Controls section.

## Current State

### Lights view sections

- **Living Room** (`column_span: 1`):
  - `light.living_room_ceiling_fan` (group)
  - `light.third_reality_inc_3rcb01057z_4`
  - `light.third_reality_inc_3rcb01057z_5`
  - `light.third_reality_inc_3rcb01057z_6`
- **Bedroom** (`column_span: 1`):
  - `light.ceiling_fan` (group)
  - `light.third_reality_inc_3rcb01057z`
  - `light.third_reality_inc_3rcb01057z_2`
  - `light.third_reality_inc_3rcb01057z_3`
- **Travis Office** (`column_span: 1`):
  - `light.travis_office_p1s_uno_chamber_light`
- **All Off** (`column_span: 1`):
  - `scene.all_lights_off`

### Home view Quick Controls section

- `light.ceiling_fan`
- `light.living_room_ceiling_fan`
- `media_player.living_room_fire_tv_living_room`

The Home view already shows only grouped fan lights; no individual bulbs need removal here.

## Proposed Design

### Lights view

| Section | column_span | Cards to keep | Cards to remove |
|---------|-------------|---------------|-----------------|
| Living Room | 2 | `light.living_room_ceiling_fan` | `light.third_reality_inc_3rcb01057z_4`, `_5`, `_6` |
| Bedroom | 2 | `light.ceiling_fan` | `light.third_reality_inc_3rcb01057z`, `_2`, `_3` |
| Travis Office | 1 | `light.travis_office_p1s_uno_chamber_light` | — |
| All Off | 1 | `scene.all_lights_off` | — |

All remaining light cards use:

```yaml
grid_options:
  columns: 12
  rows: 2
```

This makes each card fill its section width and occupy two grid rows, doubling the vertical space available for sliders and touch targets.

### Home view Quick Controls

The two grouped fan light cards keep their side-by-side layout but become taller:

```yaml
grid_options:
  columns: 6
  rows: 2
```

The Fire TV tile remains unchanged.

### Card type

Continue using `custom:mushroom-light-card`. The installed `lovelace-mushroom-better-sliders` HACS resource overrides/enhances the slider rendering automatically.

## Files to Change

- `/config/ipad-wall-panel.yaml`

## Validation

- Validate YAML syntax with the local `yaml` npm package:
  ```bash
  NODE_PATH=/root/.tools/node_modules node -e "const YAML = require('yaml'); YAML.parse(require('fs').readFileSync('/config/ipad-wall-panel.yaml', 'utf8')); console.log('valid')"
  ```
- Reload Lovelace dashboards from **Developer Tools > YAML > Lovelace Dashboards > Reload**.

## Rollback

- A backup of `ipad-wall-panel.yaml` will be created before editing.
- Restore the backup and reload Lovelace if the new layout is unsatisfactory.
