# Wall-Mounted openHASP Touch Panel Design

## Goal

Turn the 7" GrowCube / CrowPanel-style ESP32-S3 capacitive touch display into a fixed, always-on wall dashboard for Home Assistant. The first screen shows weather and radar; the second screen provides room lighting controls.

## Device

- **Product:** GrowCube ESP32 Display 7" 800×480 capacitive touch (Amazon ASIN B0GWM9D89G)
- **Likely internals:** ESP32-S3, 7" 800×480 panel, capacitive touch
- **Likely openHASP board profile:** `Sunton ESP32-8048S070C` (capacitive). Fallback: `CrowPanel 7" RGB` if touch does not respond.
- **References:**
  - [openHASP CrowPanel HMI RGB docs](https://www.openhasp.com/0.7.0/hardware/elecrow/crowpanel-hmi-rgb/)
  - [openHASP Sunton ESP32-8048S0xx docs](https://www.openhasp.com/0.7.0/hardware/sunton/esp32-8048s0xx/)
  - [openHASP Home Assistant integration howto](https://www.openhasp.com/0.7.0/integrations/home-assistant/howto/)
  - [openHASP nightly web flasher](https://nightly.openhasp.com/)

## Architecture

```
┌─────────────────┐      Wi-Fi       ┌──────────────────────┐
│  ESP32 display  │ ◄─────MQTT─────► │  Home Assistant OS   │
│  (openHASP fw)  │                  │  - Mosquitto add-on  │
└─────────────────┘                  │  - MQTT integration  │
                                     │  - openHASP custom   │
                                     │    component (HACS)  │
                                     └──────────────────────┘
```

## Components

### 1. Firmware on the display

- Flash the latest openHASP nightly from https://nightly.openhasp.com/ over USB-C.
- Initial board profile: **Sunton ESP32-8048S070C**.
- On first boot, join the panel to the home Wi-Fi via the openHASP captive portal.
- Set MQTT broker to the HA host (`homeassistant.local` or its IP) and topic prefix `hasp/wall_panel`.
- Set `idle_off` so the screen never sleeps.

### 2. MQTT backend

- Install the official **Mosquitto Broker** add-on.
- The MQTT integration should auto-discover; if not, add it manually.
- Credentials: default local-user authentication.

### 3. openHASP custom component

- Install via **HACS > Integrations > openHASP**.
- Alternative: manual download of the latest release into `custom_components/openhasp/`.
- This exposes the plate entity (`openhasp.wall_panel`) and services used to push page layouts.

### 4. Page layout (`openhasp/wall_panel/pages.jsonl`)

Two pages, 800×480 landscape.

#### Page 0 — Weather & Radar

- Large label: current condition + temperature from `weather.forecast_home`.
- Smaller labels: high/low, humidity, wind.
- Image object displaying the weather-radar image (URL served by the existing `weather-radar-card` or a static radar GIF/PNG).
- Bottom navigation button to Page 1.

#### Page 1 — Lighting Groups

- Grid of toggle buttons/sliders for the light groups that currently exist in Home Assistant:
  - Living Room → `light.living_room_ceiling_fan`
  - Travis Office → `light.ceiling_fan`
- Each tile shows state and toggles the group; both groups are dimmable, so each also gets a brightness slider.
- Bottom navigation button back to Page 0.
- Additional rooms (Kitchen, Bedroom, Basement, Basement office) can be added to this page once lights are added to those areas.

### 5. Always-on / backlight automation

- Add to `automations.yaml`:
  - At sunrise / 07:00: set panel backlight to ~80%.
  - At 22:00: set panel backlight to ~20%.
  - On HA startup: push `pages.jsonl` to the panel.

## Files to modify/create

- `docs/superpowers/specs/2026-08-03-wall-panel-design.md` — this document.
- `openhasp/wall_panel/pages.jsonl` — new page layout file.
- `automations.yaml` — new backlight and startup-push automations.
- `configuration.yaml` — MQTT snippet only if auto-discovery fails.
- `custom_components/openhasp/` — if installing manually instead of HACS.

## Verification

1. `ha core check` passes after YAML changes.
2. Panel shows as online in MQTT integration and openHASP device list.
3. Page 0 displays weather text and radar image.
4. Page 1 toggles/dims the mapped light groups.
5. Backlight automation changes brightness at scheduled times.

## Out of scope

- Physical wall-mount fabrication or power outlet installation.
- Custom 3D-printed enclosures.
- Advanced widgets (media players, cameras, printer status) beyond the two requested pages.
