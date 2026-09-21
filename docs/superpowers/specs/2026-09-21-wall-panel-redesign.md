# Wall Panel Redesign: openHASP Control-First Dashboard

## Goal

Redesign the 7" CrowPanel wall-mounted touch display from its current two-page weather/lights layout into a cleaner, more useful three-page control panel, then reflash it from ESPHome to openHASP so the existing `openhasp/wall_panel.yaml` and `pages.jsonl` configuration actually drives the screen.

## Current State

- The panel is physically a **CrowPanel 7" 800×480 capacitive touch display**.
- It is currently flashed with **ESPHome** firmware and discovered in Home Assistant as the ESPHome device `crowpanel-hasp` at `192.168.1.163`.
- The `openhasp:` integration, `openhasp/wall_panel.yaml`, and `openhasp/wall_panel/pages.jsonl` files from the original August 2026 design exist but are **not active** because the panel is not running openHASP firmware.
- The user has added a physical battery to the panel and wants the battery level shown on screen.

## Target State

- Panel runs **openHASP nightly firmware**.
- Panel displays a **dark, control-first dashboard** with three pages:
  1. **Home** — clock, weather, household status, alerts
  2. **Lights & Scenes** — scene buttons + light toggles and brightness sliders
  3. **Security** — camera snapshots and motion-detection toggles
- Battery level shown in the top bar of every page.
- Day/night backlight automation retained.
- Startup page-push automation retained.

## Device

- **Product:** GrowCube / CrowPanel 7" 800×480 capacitive touch display
- **Board profile in openHASP flasher:** `CrowPanel 7" RGB` first, because the device is branded CrowPanel and the previous attempt had screen/touch-response issues. Fallback to `Sunton ESP32-8048S070C` (capacitive 7") if the display or touch does not respond.
- **Resolution:** 800 × 480 px, landscape
- **MQTT topic prefix:** `hasp/wall_panel`
- **openHASP node name:** `wall_panel`
- **Battery:** physical battery added by user; must be enabled in openHASP firmware config

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

## Visual Design System

| Element | Value |
|---------|-------|
| Canvas | 800 × 480 px |
| Top bar | 36 px high, `#0D0D0D` |
| Bottom nav | 48 px high, `#0D0D0D`, 3 equal tabs |
| Content background | `#121212` |
| Card background | `#1E1E1E` |
| Primary accent | `#00BCD4` (active tab, slider fill, weather highlight) |
| Active/On | `#4CAF50` |
| Alert | `#FF9800` / `#332211` background |
| Battery low | `#FF9800` below 30%, `#F44336` below 15% |
| Primary text | `#FFFFFF` |
| Secondary text | `#B0BEC5` |
| Muted text | `#78909C` |
| Card radius | 8 px |
| Button radius | 8 px |
| Large font | font 32 |
| Medium font | font 24 |
| Body font | font 18 |
| Small font | font 16 |

All touch targets are at least 48 px tall; nav tabs and scene buttons are larger.

## Page Layout (`openhasp/wall_panel/pages.jsonl`)

openHASP page numbers:
- **Page 0** — overlay bottom navigation bar (shown on every page)
- **Page 1** — Home
- **Page 2** — Lights & Scenes
- **Page 3** — Security

### Page 0 — Bottom Navigation Overlay

Three tab buttons, 267 × 48 px each, spanning the bottom of the screen.

```jsonl
{"page":0,"id":1,"obj":"obj","x":0,"y":432,"w":800,"h":48,"bg_color":"#0D0D0D","click":0}
{"page":0,"id":2,"obj":"btn","x":0,"y":432,"w":267,"h":48,"text":"Home","text_color":"#9E9E9E","bg_color":"#0D0D0D","radius":0,"text_font":18}
{"page":0,"id":3,"obj":"btn","x":267,"y":432,"w":266,"h":48,"text":"Lights","text_color":"#9E9E9E","bg_color":"#0D0D0D","radius":0,"text_font":18}
{"page":0,"id":4,"obj":"btn","x":533,"y":432,"w":267,"h":48,"text":"Security","text_color":"#9E9E9E","bg_color":"#0D0D0D","radius":0,"text_font":18}
```

The active tab is highlighted via `wall_panel.yaml` templates based on `state_attr('openhasp.wall_panel', 'page')`.

### Page 1 — Home

Top bar: clock left, "Home" title center, battery right.
Content: greeting, presence, weather card, status card, alert banner.

Object IDs:
- `p1b1` top bar background obj
- `p1b2` clock label
- `p1b3` page title label
- `p1b4` battery label
- `p1b5` greeting label
- `p1b6` presence label
- `p1b7` weather card background
- `p1b8` weather temperature label
- `p1b9` weather condition label
- `p1b10` weather details label
- `p1b11` status card background
- `p1b12` front door status label
- `p1b13` back door status label
- `p1b14` motion status label
- `p1b15` alert banner background
- `p1b16` alert text label

### Page 2 — Lights & Scenes

Top bar: clock left, "Lights" title center, battery right.
Content: 2×2 scene grid, Living Room card with toggle + slider, Office card with toggle + slider.

Object IDs:
- `p2b1` top bar background
- `p2b2` clock
- `p2b3` title
- `p2b4` battery
- `p2b5` scene "All Off" button
- `p2b6` scene "Relax" button
- `p2b7` scene "Movie" button
- `p2b8` scene "Focus" button
- `p2b9` Living Room card background
- `p2b10` Living Room name label
- `p2b11` Living Room state label
- `p2b12` Living Room toggle button
- `p2b13` Living Room brightness slider
- `p2b14` Office card background
- `p2b15` Office name label
- `p2b16` Office state label
- `p2b17` Office toggle button
- `p2b18` Office brightness slider

### Page 3 — Security

Top bar: clock left, "Security" title center, battery right.
Content: two camera snapshot images, motion toggles.

Object IDs:
- `p3b1` top bar background
- `p3b2` clock
- `p3b3` title
- `p3b4` battery
- `p3b5` Front Door image
- `p3b6` Front Door label
- `p3b7` Backyard image
- `p3b8` Backyard label
- `p3b9` Front Door Motion toggle
- `p3b10` Front Door Motion label
- `p3b11` Downstairs Motion toggle
- `p3b12` Downstairs Motion label

Camera snapshots are loaded from `/local/snapshots/front_door.jpg` and `/local/snapshots/backyard.jpg` with a `refresh` interval.

## Home Assistant Bindings (`openhasp/wall_panel.yaml`)

The plate slug is `wall_panel`.

### Page navigation overlay (Page 0)

`p0b2`, `p0b3`, `p0b4` change the page on press:

```yaml
- obj: "p0b2"
  event:
    "down":
      - service: openhasp.change_page
        target:
          entity_id: openhasp.wall_panel
        data:
          page: 1
```

Their `bg_color` and `text_color` update to show the active page:

```yaml
- obj: "p0b2"
  properties:
    bg_color: '{{ "#263238" if state_attr("openhasp.wall_panel", "page") == 1 else "#0D0D0D" }}'
    text_color: '{{ "#FFFFFF" if state_attr("openhasp.wall_panel", "page") == 1 else "#9E9E9E" }}'
```

### Clock (all pages)

`p1b2`, `p2b2`, `p3b2` display the current time:

```yaml
- obj: "p1b2"
  properties:
    text: '{{ now().strftime("%-I:%M %p") }}'
```

### Battery (all pages)

`p1b4`, `p2b4`, `p3b4` show battery level and change color at thresholds. The exact entity or attribute name depends on how openHASP reports the battery (the implementation plan will resolve this once the firmware is configured). Example template using the `openhasp.wall_panel` battery attribute:

```yaml
- obj: "p1b4"
  properties:
    text: '{{ state_attr("openhasp.wall_panel", "battery") | default(0) }}%'
    text_color: >-
      {% set b = state_attr("openhasp.wall_panel", "battery") | int(default=100) %}
      {{ "#F44336" if b < 15 else "#FF9800" if b < 30 else "#4CAF50" }}
```

### Weather (Page 1)

`p1b8` shows temperature and condition, `p1b9` shows condition text, `p1b10` shows humidity and wind.

### Status (Page 1)

`p1b12`–`p1b14` show door and motion-detection states using the same entities as the AI dashboard:
- `binary_sensor.living_room_front_door` → "Front Door" (Open/Closed)
- `binary_sensor.backdoor` → "Back Door" (Open/Closed)
- `switch.front_door_motion_detection` → "Motion" (Armed/Disarmed)

### Alert banner (Page 1)

`p1b15`/`p1b16` show the highest-priority alert from the same set used by the AI dashboard:
- Backup age (`sensor.ha_last_backup_age` > 8)
- Disk usage (`sensor.ha_disk_usage` > 85)
- Internet down (`binary_sensor.exos_router_wan_status` == "off")
- Weather alert (`sensor.nws_warnings_watches`)

Only the first active alert is shown; if none are active the banner is hidden (`hidden: 1`).

### Scenes (Page 2)

`p2b5`–`p2b8` run scripts on press:
- All Off → `script.all_lights_off`
- Relax → `script.relax_mode`
- Movie → `script.movie_mode`
- Focus → `script.focus_mode`

### Lights (Page 2)

`p2b12` toggles `light.living_room_ceiling_fan`; `p2b13` sets its brightness.
`p2b17` toggles `light.ceiling_fan`; `p2b18` sets its brightness.

State labels and slider values are bound to entity state/attributes.

### Security (Page 3)

`p3b5` and `p3b7` are `img` objects pointing to the snapshot files.
`p3b9` toggles `switch.front_door_motion_detection`.
`p3b11` toggles `switch.downstairs_motion_detection`.

## Battery Configuration

During openHASP setup:

1. In the openHASP web UI / config, enable the battery sensor and configure the correct ADC pin and voltage divider for the physical battery.
2. Verify that HA receives battery state via MQTT (likely as an attribute of `openhasp.wall_panel` or a separate sensor).
3. Update the `battery` templates in `wall_panel.yaml` to use the actual entity/attribute.

## Camera Snapshot Refresh

Because openHASP image objects cannot authenticate to HA camera streams, snapshots are served as local files:

1. Create `www/snapshots/` directory.
2. Add an automation that calls `camera.snapshot` every 30 seconds for:
   - `camera.front_door_live_view` (snapshot saved as `front_door.jpg`)
   - `camera.backyard_rtsp_live` (snapshot saved as `backyard.jpg`)
3. Save outputs to:
   - `/config/www/snapshots/front_door.jpg`
   - `/config/www/snapshots/backyard.jpg`
4. openHASP image objects use `src: "/local/snapshots/front_door.jpg"` with `refresh: 30`.

## Automations

Retain and update existing automations from the original design:

- **Wall panel push pages on startup** — push `pages.jsonl` after HA start.
- **Wall panel day backlight** — bright backlight during the day.
- **Wall panel night backlight** — dim backlight at night.

Add:

- **Wall panel snapshot refresh** — periodic `camera.snapshot` calls for the Security page.

## Files to Modify/Create

- `openhasp/wall_panel/pages.jsonl` — replace with the new three-page layout
- `openhasp/wall_panel.yaml` — replace bindings for the new layout, battery, scenes, cameras
- `automations.yaml` — add/update startup/backlight/snapshot automations
- `configuration.yaml` — no changes expected (openhasp include already present)
- `www/snapshots/` — create directory for camera images
- `docs/superpowers/specs/2026-09-21-wall-panel-redesign.md` — this document

## Verification

1. `ha core check` passes after YAML changes.
2. Panel reflashed to openHASP and online in MQTT / openHASP device list.
3. `openhasp.wall_panel` entity exists and `state_attr('openhasp.wall_panel', 'page')` reflects the active page.
4. Page 1 shows time, weather, status, and any active alert.
5. Page 2 toggles/dims Living Room and Office lights; scene buttons run scripts.
6. Page 3 shows refreshed Front Door and Backyard snapshots; motion toggles work.
7. Battery level appears in the top bar and changes color below 30% and 15%.
8. Backlight automation changes brightness at scheduled times.

## Out of Scope

- Physical wall-mount fabrication or power wiring.
- Custom 3D-printed enclosures.
- Live video streams on the panel (snapshots only).
- Advanced widgets such as media players, printer status, or climate controls beyond the three pages above.
- Replacing the AI dashboard; this panel is a separate, simpler control surface.

## References

- Original design: `docs/superpowers/specs/2026-08-03-wall-panel-design.md`
- Original implementation plan: `docs/superpowers/plans/2026-08-03-wall-panel.md`
- openHASP docs: https://www.openhasp.com/0.7.0/
