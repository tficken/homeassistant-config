# Wall Panel ESPHome Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the openHASP-based wall panel approach with an ESPHome + LVGL dashboard that works on the CrowPanel 7" Advance (SC7277 display driver).

**Architecture:** The panel runs ESPHome firmware and connects to Home Assistant via the native API. HA entity state is pulled into ESPHome via `homeassistant.*` platforms, and touch events call HA services. The UI is built with ESPHome's LVGL YAML support.

**Tech Stack:** Home Assistant OS, ESPHome add-on, ESP32-S3, LVGL, ESP-IDF framework, I²C (PCA9557 + GT911), RGB DPI display (SC7277).

**Spec:** `docs/superpowers/specs/2026-09-21-wall-panel-esphome-redesign.md`

## Global Constraints

- Do not modify unrelated Home Assistant configuration.
- All YAML changes must pass `ha core check`.
- The panel must remain flashable OTA after the initial USB flash.
- Physical wall-mount fabrication and power wiring are out of scope.
- Camera snapshots on the Security page are out of scope for v1.

## Review Focus

- **Hardware pinout accuracy** — the Advance panel's display, touch, IO expander, and backlight pins must match the known working config; a single wrong pin blanks the screen or breaks touch.
- **LVGL memory use** — three pages with many widgets on an 800×480 screen can exhaust PSRAM/heap if not kept lean.
- **API reconnect behavior** — if HA restarts, the panel should resume without requiring a manual reboot.
- **Battery ADC calibration** — voltage-to-percentage mapping depends on the user's specific voltage divider; wrong values will show incorrect battery level.
- **Touch responsiveness** — the GT911 touch controller can be finicky on startup; the config must initialize it reliably.

---

### Task 1: Restore ESPHome firmware and access the device config

**Files:**
- Potentially create: `esphome/crowpanel-hasp.yaml`

**Interfaces:**
- Consumes: existing ESPHome add-on (to be installed if missing), user's restored firmware
- Produces: working ESPHome device entity and editable YAML config

- [ ] **Step 1: Install the ESPHome add-on if it is not installed**

  In HA go to **Settings > Add-ons > Add-on Store**, search for **ESPHome Device Builder**, and install it. Start it and open the web UI.

- [ ] **Step 2: Verify or adopt the panel in ESPHome**

  If the restored firmware was previously managed by ESPHome, the device should appear in the ESPHome dashboard. If it does not, use **Adopt** if ESPHome discovers it, or create a new device config.

- [ ] **Step 3: Capture the existing config if available**

  If the panel appears in the ESPHome dashboard, open the existing YAML and copy it (or note the key hardware settings: display pins, touch settings, backlight, IO expander). If no existing config is available, the implementer will reconstruct it from the known working Advance example.

- [ ] **Step 4: Confirm the panel is online in HA**

  Check **Settings > Devices & Services > ESPHome** for the panel device and confirm entities such as the backlight are present.

---

### Task 2: Create the ESPHome dashboard YAML

**Files:**
- Create/replace: `esphome/crowpanel-hasp.yaml`

**Interfaces:**
- Consumes: HA entities (weather, lights, doors, motion switches, scripts, people, alerts, battery), working hardware base
- Produces: compiled firmware that renders the three-page LVGL dashboard

- [ ] **Step 1: Write the hardware base**

  Include:
  - `esphome`, `esp32`, `psram`, `logger`, `api`, `ota`, `wifi`, `captive_portal` blocks.
  - `i2c` on pins 15/16.
  - `rpi_dpi_rgb` display with Advance-specific pins, `invert_colors: true`, `color_order: RGB`, 18 MHz PCLK, 800×480 dimensions.
  - `gt911` touchscreen at address `0x5D`.
  - `i2c_device` for PCA9557 at `0x18`.
  - Template output + binary light for backlight control via PCA9557.
  - ADC sensor for battery with placeholder pin and voltage divider.

- [ ] **Step 2: Add internal HA entity mappings**

  Add `homeassistant.sensor`, `homeassistant.binary_sensor`, and `homeassistant.switch` platforms for:
  - weather attributes
  - person presence
  - door sensors
  - motion-detection switches
  - last-activity sensors
  - alert sensors
  - the two dimmable lights

- [ ] **Step 3: Add fonts and LVGL styles**

  Use a single TTF font file at sizes 16, 24, and 32. Define reusable styles for cards, labels, buttons, and the active nav tab.

- [ ] **Step 4: Build the three LVGL pages**

  - **Home page**: clock, greeting, presence, weather card, status card, alert banner.
  - **Lights page**: 2×2 scene grid, two light cards with toggles and sliders.
  - **Security page**: door/motion status list and last-activity timestamps.

  Bind label text to internal sensors and attach `on_click` / `on_value` handlers to call HA services.

- [ ] **Step 5: Validate the YAML**

  Run:
  ```bash
  ha core check
  ```
  Expected: command exits `0`.

  If the ESPHome CLI is available, also run:
  ```bash
  esphome config esphome/crowpanel-hasp.yaml
  ```
  Expected: config validates without errors.

- [ ] **Step 6: Commit**

  ```bash
  git add esphome/crowpanel-hasp.yaml
  git commit -m "feat: add ESPHome LVGL wall panel dashboard"
  ```

---

### Task 3: Update Home Assistant automations for backlight

**Files:**
- Modify: `automations.yaml`

**Interfaces:**
- Consumes: panel backlight entity from ESPHome
- Produces: day/night backlight automations

- [ ] **Step 1: Remove or rename old openHASP backlight automations**

  The existing `wall_panel_day_backlight` and `wall_panel_night_backlight` automations publish MQTT to `hasp/wall_panel/command`. They are no longer valid. Remove them or update them to target the panel's ESPHome backlight light entity.

- [ ] **Step 2: Add new ESPHome backlight automations**

  Add two automations that call `light.turn_on` on the panel's backlight entity (e.g., `light.crowpanel_hasp_backlight`) with brightness 200 for day and 50 for night.

- [ ] **Step 3: Validate YAML**

  Run:
  ```bash
  ha core check
  ```
  Expected: command exits `0`.

- [ ] **Step 4: Commit**

  ```bash
  git add automations.yaml
  git commit -m "feat: update wall panel backlight automations for ESPHome"
  ```

---

### Task 4: Clean up inactive openHASP configuration

**Files:**
- Modify: `configuration.yaml`
- Remove or archive: `openhasp/wall_panel.yaml`, `openhasp/wall_panel/pages.jsonl`

**Interfaces:**
- Consumes: existing openHASP config that is no longer used
- Produces: cleaner HA config with no dead openHASP integration

- [ ] **Step 1: Remove the `openhasp:` include from `configuration.yaml`**

  Comment out or remove:
  ```yaml
  openhasp: !include_dir_merge_named openhasp/
  ```

- [ ] **Step 2: Decide whether to keep or archive the `openhasp/` directory**

  Recommended: move `openhasp/wall_panel.yaml` and `openhasp/wall_panel/pages.jsonl` to an `archive/openhasp/` directory for reference, then remove the `openhasp/` include path from `configuration.yaml`.

- [ ] **Step 3: Validate YAML**

  Run:
  ```bash
  ha core check
  ```
  Expected: command exits `0`.

- [ ] **Step 4: Commit**

  ```bash
  git add configuration.yaml
  git commit -m "chore: remove inactive openhasp integration include"
  ```

---

### Task 5: Compile, flash, and verify the panel

**Files:**
- None

**Interfaces:**
- Consumes: all previous tasks
- Produces: working redesigned wall panel

- [ ] **Step 1: Compile the ESPHome firmware**

  In the ESPHome add-on, click **Install** for the panel device. For the first flash after restoring from openHASP, use **Plug into this computer** (USB-C) because OTA may not be available until ESPHome is running.

- [ ] **Step 2: Flash the panel**

  Connect the panel via USB-C to the PC running the ESPHome add-on (or use the ESPHome web flasher if the add-on cannot access USB). Complete the flash and wait for reboot.

- [ ] **Step 3: Verify the panel is online**

  In HA, confirm the ESPHome device is online and the backlight entity is available.

- [ ] **Step 4: Verify Page 1 (Home)**

  Confirm the panel shows:
  - Current time and battery level
  - Weather temperature and condition
  - Door/motion status
  - Any active alert, or no alert banner

- [ ] **Step 5: Verify Page 2 (Lights & Scenes)**

  Tap **Lights** in the nav:
  - Scene buttons run their scripts
  - Living Room and Office toggles work
  - Brightness sliders change the lights

- [ ] **Step 6: Verify Page 3 (Security)**

  Tap **Security** in the nav:
  - Door and motion statuses are correct
  - Motion toggles change the corresponding switches
  - Last-activity timestamps update

- [ ] **Step 7: Verify battery behavior**

  Confirm battery percentage appears and color changes when the level crosses 30% and 15% thresholds.

- [ ] **Step 8: Verify backlight automation**

  In **Developer Tools > Services**, call:
  ```yaml
  service: light.turn_on
  target:
    entity_id: light.crowpanel_hasp_backlight
  data:
    brightness: 255
  ```
  Expected: panel backlight changes immediately.

- [ ] **Step 9: Final commit if any fixes were needed**

  If changes were made during verification, commit them with a descriptive message.

---

## Self-Review

**Spec coverage:**
- ESPHome hardware base → Task 2 Step 1
- LVGL three-page dashboard → Task 2 Step 4
- HA entity bindings → Task 2 Step 2 and Step 4
- Battery ADC → Task 2 Step 1
- Backlight automations → Task 3
- Cleanup of openHASP → Task 4
- Verification → Task 5

**Placeholder scan:** No TBD/TODO placeholders; battery ADC pin and voltage divider values are documented as user-provided inputs in Task 2 Step 1.

**Type consistency:** Entity IDs in Task 2 match those in the spec and the AI dashboard. Automation target entity in Task 3 matches the ESPHome backlight entity created in Task 2.

**Review Focus coverage:**
- Hardware pinout → Task 2 Step 1 uses the known working Advance example pins
- LVGL memory use → Task 2 Step 4 keeps widgets lean and shares styles
- API reconnect → Task 2 Step 1 includes `api` and `wifi` with standard reconnect behavior
- Battery ADC calibration → Task 2 Step 1 includes placeholder with clear user instructions
- Touch responsiveness → Task 2 Step 1 uses GT911 with interrupt pin and known address
