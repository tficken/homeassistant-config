# ESPHome Devices

This directory holds ESPHome device configurations and their associated assets.

---

## CrowPanel HASP — 7" Wall-Mounted Touch Dashboard

`crowpanel-hasp.yaml` is the firmware for an **Elecrow CrowPanel 7" (ESP32-S3)** wall panel. It replaces the earlier openHASP/MQTT-based wall plate with a self-contained ESPHome + LVGL dashboard that talks directly to Home Assistant.

### Hardware

- **Board**: Elecrow CrowPanel ESP32 Display 7.0" (Advance series), SKU D1S202170A v1.4
- **SoC**: ESP32-S3 (esp32-s3-devkitc-1)
- **Display**: 800 × 480 RGB DPI panel driven by `rpi_dpi_rgb`
- **Touch**: Goodix GT911 (`gt911`) on I2C address `0x5D`
- **Backlight controller**: STC8H1K28 MCU on I2C address `0x30`
  - Inverted scale: `0x00` = full brightness, `0xF5` = off
  - Controlled through a `template` output that writes a single byte over the same `i2c_bus`
- **Battery monitoring**: MAX17043 I2C fuel gauge on the back `I2C-OUT` header
  - SDA → GPIO15, SCL → GPIO16
  - Provides `sensor.panel_battery_voltage` and `sensor.panel_battery` (%)
  - A HA Template binary sensor (`binary_sensor.panel_charging`) infers charging when voltage is held above 4.15 V
- **PSRAM**: 8 MB octal PSRAM at 80 MHz, used for fonts/images

### Pages

| Page | Purpose |
|------|---------|
| **Home** | Clock/date, weather card, door/motion status, room climate monitors, alert banner |
| **Lights** | Scene buttons (All Off, Relax, Movie, Goodnight) and two ceiling-fan toggles with brightness sliders |
| **Security** | Master motion arm/disarm, front/back door status, per-zone motion toggles, last-activity timestamps |
| **Screensaver** | Black screen with large dim-red clock and date; wakes on touch |

### Key Features

- **Top bar** — clock/date left, page title center, Wi-Fi signal (4-bar cellular style), battery icon + percentage right, charging bolt when USB-powered.
- **Weather card** — dynamic icon mapped from `weather.forecast_home`'s condition attribute; shows temperature, condition, high/low, humidity, wind, and pressure.
- **Screensaver** — fully black background (shared bottom layer also turns black), dim-red clock/date at 10% backlight. Daytime timeout 5 min, nighttime timeout 60 s. Clock shifts a few pixels every minute for burn-in mitigation.
- **Service calls** — the panel is allowed to call HA services (light, switch, script) so toggles and sliders work without an intermediary automation.

### Assets

Local PNGs in this directory are baked into the firmware:

- `weather_bg.png` — background for the Home weather card
- `icon_*.png` — weather icons (sun, moon, clouds, rain, snow, thunder, fog)
- `lock_closed.png` / `lock_open.png` — door state icons
- `shield.png` / `warning.png` — motion/security state icons
- `icon_scene_*.png` — scene button icons
- `icon_light_fan.png` — fan/light toggle icon

All images use `platform: file` with `type: RGB` and `transparency: alpha_channel`.

### Flashing

1. Open `wall-panel.yaml` in the ESPHome Device Builder / Dashboard.
2. Make sure the PNG assets above are in the same directory as the YAML.
3. Install / flash to the panel over USB-C.
4. In Home Assistant, go to **Settings > Devices & services > ESPHome > CrowPanel HASP > Configure** and enable **"Allow the device to make Home Assistant service calls"**.

### Required Home Assistant Entities

The panel imports these entities from HA. If any are unavailable, the corresponding widget shows `--` or stays at its default state.

- `weather.forecast_home`
- `sensor.weather_forecast_high_today` / `sensor.weather_forecast_low_today`
- `sensor.ha_last_backup_age`
- `sensor.ha_disk_usage`
- `sensor.nws_warnings_watches`
- `person.woteg` / `person.bobbie`
- `binary_sensor.living_room_front_door` / `binary_sensor.backdoor`
- `switch.front_door_motion_detection` / `switch.downstairs_motion_detection`
- `sensor.front_door_last_activity` / `sensor.downstairs_last_activity`
- `light.living_room_ceiling_fan` / `light.ceiling_fan`
- `binary_sensor.panel_charging` (HA Template binary sensor)
- Room climate sensors from Hobeian Zigbee sensors

### Gotchas / Notes

- The `rpi_dpi_rgb` display driver is deprecated in newer ESPHome, but it is the proven working driver for this panel; do not switch to `mipi_rgb` unless you are prepared to retune timing.
- Backlight dimming is done by writing directly to the STC8 I2C register; the `light.turn_on` brightness path was unreliable on this hardware.
- The panel uses a single `i2c_bus` (GPIO15/16) shared by the touch controller, backlight MCU, and MAX17043.
- If the MAX17043 is not wired yet, the battery percentage will show `--%` until the fuel gauge is connected.
