# Wall Panel Redesign: ESPHome LVGL Dashboard

## Goal

Redesign the 7" CrowPanel Advance wall-mounted touch display into a cleaner, more useful three-page control panel using ESPHome and LVGL, because the CrowPanel Advance's SC7277 display driver is not supported by openHASP.

## Current State

- The panel is physically a **CrowPanel 7" Advance** with ESP32-S3-WROOM-1-N16R8, SC7277 RGB display driver, GT911 capacitive touch, and an STC8H1K28 backlight controller.
- The user is restoring a previously working ESPHome firmware image.
- The `openhasp:` integration, `openhasp/wall_panel.yaml`, and `openhasp/wall_panel/pages.jsonl` files are inactive and will be removed or deprecated.
- The user has added a physical battery to the panel and wants the battery level shown on screen.

## Target State

- Panel runs **ESPHome** firmware with a working display/touch base.
- Panel displays a **dark, control-first dashboard** with three LVGL pages:
  1. **Home** — clock, weather, household status, alerts
  2. **Lights & Scenes** — scene buttons + light toggles and brightness sliders
  3. **Security** — door/motion status and last-activity timestamps (camera snapshots deferred to a later iteration)
- Battery level shown in the top bar of every page.
- Display dims at night and brightens during the day via HA automations.

## Device

- **Product:** Elecrow CrowPanel 7" Advance HMI Display
- **MCU:** ESP32-S3-WROOM-1-N16R8
- **Display:** 800 × 480 RGB DPI (SC7277 driver)
- **Touch:** GT911 capacitive
- **IO expander / backlight controller:** STC8H1K28 (I²C 0x30) — controls display backlight
- **Battery:** physical LiPo added by user; measured via ADC voltage divider
- **Board profile in ESPHome:** `esp32-s3-devkitc-1` with ESP-IDF framework

## Architecture

```
┌─────────────────┐      Wi-Fi       ┌──────────────────────┐
│  ESP32 display  │ ◄─────API────────►│  Home Assistant OS   │
│  (ESPHome fw)   │                  │  - ESPHome add-on    │
│  LVGL dashboard │                  │  - API / native      │
└─────────────────┘                  └──────────────────────┘
```

The panel runs ESPHome firmware. HA entity state is pulled into ESPHome via `homeassistant.sensor`, `homeassistant.binary_sensor`, and `homeassistant.switch` platforms. Button presses call HA services via `homeassistant.service`. The UI is built with ESPHome's LVGL YAML.

## Visual Design System

Same design language as the openHASP concept, adapted to LVGL:

| Element | Value |
|---------|-------|
| Canvas | 800 × 480 px |
| Top bar | 36 px high, `#0D0D0D` |
| Bottom nav | 48 px high, `#0D0D0D`, 3 equal tabs |
| Content background | `#121212` |
| Card background | `#1E1E1E` |
| Primary accent | `#00BCD4` |
| Active/On | `#4CAF50` |
| Alert | `#FF9800` / `#332211` background |
| Battery low | `#FF9800` below 30%, `#F44336` below 15% |
| Primary text | `#FFFFFF` |
| Secondary text | `#B0BEC5` |
| Card radius | 8 px |
| Button radius | 8 px |

## Page Layout (LVGL)

Three fullscreen LVGL screens (`lvgl.screens` or `lvgl.widgets` with page-like containers), switched by the bottom nav.

### Page 1 — Home

- Top bar: clock left, "Home" center, battery right.
- Greeting label.
- Presence summary.
- Weather card: temperature, condition, humidity/wind.
- Status card: front door, back door, motion-armed.
- Alert banner (hidden when no alerts).

### Page 2 — Lights & Scenes

- Top bar: clock left, "Lights" center, battery right.
- 2×2 scene button grid: All Off, Relax, Movie, Focus.
- Living Room card: name, state, toggle, brightness slider.
- Office card: name, state, toggle, brightness slider.

### Page 3 — Security

- Top bar: clock left, "Security" center, battery right.
- Door status list.
- Motion-detection toggle list.
- Last-activity timestamps for front door and downstairs motion.

Camera snapshots are intentionally out of scope for v1 because ESPHome's dynamic image support for authenticated HA cameras is brittle; they can be added later with `online_image` or a local snapshot file approach.

## ESPHome Configuration Structure

A single ESPHome YAML file for the panel, e.g. `esphome/crowpanel-hasp.yaml` (or the existing device name). The file is managed by the ESPHome add-on and flashed to the device.

### Base hardware section

- `esp32` block with board, framework, sdkconfig for PSRAM and CPU frequency.
- `psram` octal 80 MHz.
- `logger`, `api`, `ota`, `wifi`, `captive_portal`.
- `i2c` on pins 15/16 for STC8H1K28 and GT911.
- `rpi_dpi_rgb` display with Advance-specific pins, `invert_colors: true`, `color_order: RGB`, 18 MHz PCLK.
- `gt911` touchscreen at address `0x5D`.
- `i2c_device` for STC8H1K28 at `0x30`.
- Backlight controlled via STC8H1K28 (template output → monochromatic light).
- Battery ADC sensor with voltage divider.
- Internal `homeassistant` sensors/switches for HA entities.

### LVGL section

- Define fonts (small, medium, large).
- Define reusable styles.
- Define three screens and switch between them with nav button events.
- Bind labels to internal sensors/state.
- Attach `on_click` / `on_value` handlers to buttons and sliders.

## Home Assistant Bindings

### Sensors pulled from HA

- `weather.forecast_home` temperature, condition, humidity, wind speed.
- `person.woteg`, `person.bobbie` for presence.
- `binary_sensor.living_room_front_door`, `binary_sensor.backdoor`.
- `switch.front_door_motion_detection`, `switch.downstairs_motion_detection`.
- `sensor.front_door_last_activity`, `sensor.downstairs_last_activity`.
- Alert sensors: `sensor.ha_last_backup_age`, `sensor.ha_disk_usage`, `binary_sensor.exos_router_wan_status`, `sensor.nws_warnings_watches`.

### Services called from ESPHome

- `scene.turn_on` for `scene.all_lights_off`, `scene.movie_mode`, `scene.relax_mode`.
- `script.turn_on` for `script.goodnight`.
- `light.toggle` / `light.turn_on` for ceiling fan, living room ceiling fan, and fan light entities.
- `switch.toggle` for motion-detection switches.

### Backlight control

- HA automations call a `light.turn_on` service on the panel's backlight entity with different brightness levels for day/night.
- Alternatively, use ESPHome's `on_time` / `sun` triggers if the panel should manage its own backlight.

## Battery Configuration

- Add an `adc` sensor in ESPHome YAML.
- Configure the correct GPIO pin and voltage divider for the user's physical battery.
- Map voltage to percentage (e.g., 3.0 V = 0%, 4.2 V = 100%).
- Show the percentage in the top bar and change color at 30% and 15%.

The exact ADC pin and divider values must be filled in by the user; the implementation plan will include a placeholder with instructions.

## Automations

- **Panel day backlight** — at sunrise / 07:00, set panel backlight to ~80%.
- **Panel night backlight** — at 22:00, set panel backlight to ~20%.
- (Optional) **Panel page refresh** — periodic `homeassistant.update_entity` for sensors if needed.

## Files to Modify/Create

- `esphome/crowpanel-hasp.yaml` — new ESPHome device config with hardware, LVGL dashboard, and HA bindings.
- `automations.yaml` — add/update backlight automations (targeting the panel's backlight entity).
- `configuration.yaml` — remove the inactive `openhasp:` include (optional, but recommended to avoid confusion).
- `openhasp/` directory — optionally archive or remove the now-unused openHASP files.
- `docs/superpowers/specs/2026-09-21-wall-panel-esphome-redesign.md` — this document.

## Verification

1. ESPHome YAML compiles and flashes successfully.
2. Panel boots, display and touch work.
3. Panel connects to HA API and shows online.
4. Page 1 shows time, weather, status, and any active alert.
5. Page 2 toggles/dims Living Room and Office lights; scene buttons run scripts.
6. Page 3 shows door/motion status and last-activity timestamps.
7. Battery level appears in the top bar and changes color below 30% and 15%.
8. Backlight automation changes brightness at scheduled times.

## Out of Scope

- Camera snapshots on the Security page (deferred to v2).
- Physical wall-mount fabrication or power wiring.
- Custom 3D-printed enclosures.
- Advanced widgets such as media players, printer status, or climate controls beyond the three pages above.
- Replacing the AI dashboard; this panel is a separate, simpler control surface.

## References

- Previous openHASP design (deprecated for this hardware): `docs/superpowers/specs/2026-09-21-wall-panel-redesign.md`
- Original August 2026 design: `docs/superpowers/specs/2026-08-03-wall-panel-design.md`
- ESPHome `rpi_dpi_rgb` display docs: https://esphome.io/components/display/rpi_dpi_rgb.html
- ESPHome LVGL docs: https://esphome.io/components/lvgl/
- Working CrowPanel 7" Advance ESPHome example: https://www.tastethecode.com/smart-home-dashboard-with-esphome-and-crowpanel-hmi-advanced-screen
