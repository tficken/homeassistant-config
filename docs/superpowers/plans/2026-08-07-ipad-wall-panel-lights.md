# iPad Wall Panel — Grouped Ceiling Fan Lights and Larger Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the iPad wall panel dashboard so ceiling fan lights show only grouped entities with larger, easier-to-use slider cards.

**Architecture:** Edit `/config/ipad-wall-panel.yaml` directly. Remove individual Third Reality fan light cards from the Lights view, adjust section `column_span` to make key sections wider, and add `grid_options` with `rows: 2` to light cards in both the Lights and Home views.

**Tech Stack:** Home Assistant Lovelace YAML, Mushroom cards (`custom:mushroom-light-card`), local `yaml` npm package for syntax validation.

## Global Constraints

- Target file: `/config/ipad-wall-panel.yaml`
- Keep `type: sections`, `max_columns: 3`, and `theme: Google Dark Theme` unchanged.
- Keep using `custom:mushroom-light-card` (the installed `lovelace-mushroom-better-sliders` resource enhances it).
- Remove only these individual fan light entities:
  - `light.third_reality_inc_3rcb01057z`
  - `light.third_reality_inc_3rcb01057z_2`
  - `light.third_reality_inc_3rcb01057z_3`
  - `light.third_reality_inc_3rcb01057z_4`
  - `light.third_reality_inc_3rcb01057z_5`
  - `light.third_reality_inc_3rcb01057z_6`
- Keep grouped entities `light.living_room_ceiling_fan` and `light.ceiling_fan`.
- Validate YAML syntax before reloading.
- Reload Lovelace dashboards after validation.

---

### Task 1: Back up the dashboard file

**Files:**
- Read: `/config/ipad-wall-panel.yaml`
- Create: `/config/ipad-wall-panel.yaml.bak.<timestamp>`

**Interfaces:**
- Consumes: Current dashboard YAML.
- Produces: Timestamped backup for rollback.

- [ ] **Step 1: Create a timestamped backup**

Run:
```bash
TS=$(date +%Y%m%d_%H%M%S)
cp /config/ipad-wall-panel.yaml /config/ipad-wall-panel.yaml.bak.${TS}
echo "Backup created: /config/ipad-wall-panel.yaml.bak.${TS}"
```

- [ ] **Step 2: Verify the backup exists**

Run:
```bash
ls -la /config/ipad-wall-panel.yaml.bak.*
```

Expected: One backup file listed.

---

### Task 2: Update the Lights view

**Files:**
- Modify: `/config/ipad-wall-panel.yaml` (Lights view sections)

**Interfaces:**
- Consumes: Backup from Task 1.
- Produces: Lights view with grouped fan lights only and larger cards.

- [ ] **Step 1: Remove individual fan light cards from the Living Room section**

Remove the three `custom:mushroom-light-card` entries for:
- `light.third_reality_inc_3rcb01057z_4`
- `light.third_reality_inc_3rcb01057z_5`
- `light.third_reality_inc_3rcb01057z_6`

Keep only the grouped `light.living_room_ceiling_fan` card.

- [ ] **Step 2: Remove individual fan light cards from the Bedroom section**

Remove the three `custom:mushroom-light-card` entries for:
- `light.third_reality_inc_3rcb01057z`
- `light.third_reality_inc_3rcb01057z_2`
- `light.third_reality_inc_3rcb01057z_3`

Keep only the grouped `light.ceiling_fan` card.

- [ ] **Step 3: Adjust section column spans**

Update the section-level `column_span` values in the Lights view:
- Living Room: `column_span: 2`
- Bedroom: `column_span: 2`
- Travis Office: `column_span: 1`
- All Off: `column_span: 1`

- [ ] **Step 4: Add grid_options to remaining light cards**

For each remaining `custom:mushroom-light-card` in the Lights view (Living Room, Bedroom, Travis Office), add:

```yaml
grid_options:
  columns: 12
  rows: 2
```

- [ ] **Step 5: Verify the Lights view section looks correct**

Read `/config/ipad-wall-panel.yaml` and confirm:
- Living Room contains only `light.living_room_ceiling_fan` with `column_span: 2` and `grid_options.columns: 12`, `rows: 2`.
- Bedroom contains only `light.ceiling_fan` with `column_span: 2` and `grid_options.columns: 12`, `rows: 2`.
- Travis Office contains `light.travis_office_p1s_uno_chamber_light` with `column_span: 1` and `grid_options.columns: 12`, `rows: 2`.
- All Off contains `scene.all_lights_off` with `column_span: 1`.
- No `light.third_reality_inc_3rcb01057z*` entries remain in the Lights view.

---

### Task 3: Update the Home view Quick Controls

**Files:**
- Modify: `/config/ipad-wall-panel.yaml` (Home view Quick Controls section)

**Interfaces:**
- Consumes: Updated Lights view context.
- Produces: Home view light cards with taller sliders.

- [ ] **Step 1: Add grid_options to the Home view light cards**

Locate the two `custom:mushroom-light-card` entries in the Home view Quick Controls section:
- `light.ceiling_fan`
- `light.living_room_ceiling_fan`

Add to each:

```yaml
grid_options:
  columns: 6
  rows: 2
```

Leave the Fire TV tile unchanged.

- [ ] **Step 2: Verify the Home view section looks correct**

Read `/config/ipad-wall-panel.yaml` and confirm:
- Both grouped fan light cards have `grid_options.columns: 6`, `rows: 2`.
- `media_player.living_room_fire_tv_living_room` tile still has `grid_options.columns: 6`, `rows: auto`.

---

### Task 4: Validate and reload

**Files:**
- Read: `/config/ipad-wall-panel.yaml`

**Interfaces:**
- Consumes: Edited dashboard YAML.
- Produces: Validated, reload-ready dashboard.

- [ ] **Step 1: Validate YAML syntax**

Run:
```bash
NODE_PATH=/root/.tools/node_modules node -e "const YAML = require('yaml'); YAML.parse(require('fs').readFileSync('/config/ipad-wall-panel.yaml', 'utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 2: Reload Lovelace dashboards**

In Home Assistant, go to **Developer Tools > YAML > Lovelace Dashboards > Reload**.

- [ ] **Step 3: Verify on the iPad wall panel**

1. Open the **Lights** view on the iPad.
2. Confirm only grouped ceiling fan lights appear (no individual Third Reality bulbs).
3. Confirm the light cards are noticeably taller and wider.
4. Open the **Home** view and confirm the Quick Controls fan light cards are taller.
5. Test the brightness and color-temperature sliders for usability.

- [ ] **Step 4: Commit the changes**

Run:
```bash
cd /config
git add ipad-wall-panel.yaml
git commit -m "feat: group ceiling fan lights and enlarge cards on iPad wall panel"
```

If the backup file was created in `/config/` and is not gitignored, add and commit it as well.
