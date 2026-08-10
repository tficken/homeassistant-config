# AI Dashboard Cyberpunk Redesign

## Goal

Redesign the existing `www/ai-dashboard/index.html` Home Assistant dashboard for a wall-mounted iPad in horizontal orientation. The new design is a dark, retro-cyberpunk / Fallout-style green terminal interface that is easy to read at a glance and provides one-tap access to a Control Hub and a Status Monitor.

## Constraints

- Keep the existing single-file architecture (`index.html` + `config.json`).
- Reuse the existing WebSocket connection logic and entity configuration.
- No new custom integration or add-on.
- Served by Home Assistant from `www/ai-dashboard/`.
- Large touch targets for wall-mounted iPad use.
- Token handling remains unchanged (proxy mode or `localStorage` token).

## Design Direction

**CRT Terminal Mode — Fallout-style green phosphor**

A dark, monochromatic green terminal aesthetic with subtle CRT scanlines, screen-edge vignette, and glowing phosphor text. The layout is intentionally sparse for at-a-glance readability, with chunky terminal buttons for navigation.

## Visual System

### Palette

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#030503` | Main canvas |
| Background glow | `#0a140a` | Subtle radial gradient at top center |
| Primary green | `#14fe17` | Active states, clock, borders, icons |
| Muted green | `#1a4a1a` | Inactive borders, dividers |
| Hover green | `#2d7a2d` | Hover/focus states |
| Text primary | `#e8ffe8` | Headings, primary labels |
| Text muted | `#5a7a5a` | Secondary labels, offline text |
| Warning | `#ffae00` | Non-critical alerts |
| Danger | `#ff3333` | Critical alerts, offline errors |

### Typography

- **UI labels / body**: Inter or system sans-serif.
- **Terminal accents**: JetBrains Mono or SF Mono for clock, alerts, status codes, and entity labels.
- **Clock**: very large monospace, with green phosphor glow.

### Effects

- CRT scanline overlay via CSS `repeating-linear-gradient`, ~10% opacity, toggleable in settings.
- Subtle vignette around screen edges.
- Green text-shadow glow on active elements and the clock.
- Terminal window frames with 1px borders and corner bracket glyphs (`┌ ┐ └ ┘`).

## Screen Architecture

Three screens, only one visible at a time:

1. **Home Screen** — default glance + go view.
2. **Control Hub** — scenes, lights, and media controls.
3. **Status Monitor** — cameras, security, environment, system, vacuums, and printer.

A fixed bottom dock on every screen contains two large buttons:

- `[ CONTROL HUB ]`
- `[ STATUS MONITOR ]`

Each full-screen panel has a top bar with connection status, screen title, and a `[ CLOSE ]` button that returns to Home.

## Home Screen Layout

Horizontal iPad, single full-screen layout:

```
┌─────────────────────────────────────────────────────────────┐
│  ● CONNECTED        10:42 PM              FRI AUG 08       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ██ 10:42        ┌─ WEATHER RADAR ──────────────────────┐ │
│    ██  : 32        │                                     │ │
│    ██ PM           │     [ rainviewer iframe ]            │ │
│                    │                                     │ │
│    ┌─ WEATHER ─┐   └─────────────────────────────────────┘ │
│    │ ⛅  84°   │                                           │
│    │ Hum 62%   │                                           │
│    └───────────┘                                           │
│                                                             │
│         ┌─ ACTIVE ALERTS ─────────────────────┐             │
│         │  ! FRONT DOOR MOTION DETECTED       │             │
│         └─────────────────────────────────────┘             │
│                                                             │
│    ┌─ PRESENCE ───────────────────────────────────────┐     │
│    │  ● WOTEG HOME        ○ TRAVIS AWAY              │     │
│    └───────────────────────────────────────────────────┘     │
│                                                             │
│    [ CONTROL HUB ]                      [ STATUS MONITOR ]  │
└─────────────────────────────────────────────────────────────┘
```

### Components

- **Top bar**: connection status LED + label on the left, current time on the right.
- **Clock**: dominates the left-center area. Monospace, very large, green glow.
- **Weather**: left-side block below the clock with condition glyph, temperature, and one secondary metric (humidity).
- **Weather radar**: right-side panel showing a live RainViewer radar iframe centered on the Home Assistant location from `/api/config`. Maintains a 16:9 aspect ratio inside a terminal frame.
- **Alerts ticker**: center strip below the radar/weather row. Stacks up to 3 active alerts derived from configured entities (e.g. motion sensors, sirens, low batteries, pending updates). Shows `SYSTEM NORMAL` when no alerts are active.
- **Presence**: horizontal row showing `person.woteg` and `device_tracker.traviss_iphone` with green dot for home, dim for away.
- **Dock**: two half-width terminal buttons.

## Control Hub Layout

Three-column terminal-panel layout:

```
┌─────────────────────────────────────────────────────────────┐
│  ● CONNECTED        CONTROL HUB              [ CLOSE ]     │
├──────────────┬──────────────────────┬───────────────────────┤
│ ┌ SCENES ──┐ │ ┌ LIGHTS ──────────┐ │ ┌ MEDIA ────────────┐ │
│ │ [ALL   ] │ │ ┌ CEILING FAN    ┐ │ │  LIVING ROOM FIRE TV │ │
│ │ [LIVING ] │ │ │ ●        [═══] │ │ │  State: Playing      │ │
│ │ [RELAX ] │ │ └────────────────┘ │ │ │  [PLAY] [PAUSE]      │ │
│ │ [MOVIE ] │ │ ┌ LIVING ROOM    ┐ │ │ └────────────────────┘ │
│ │ [NIGHT ] │ │ │ ●        [═══] │ │ │ ┌ QUICK ─────────────┐ │
│ │ [FOCUS ] │ │ └────────────────┘ │ │ │ [ALL OFF] [GOODNIGHT]│ │
│ └──────────┘ │ ┌ OFFICE CHAMBER ┐ │ │ └────────────────────┘ │
│              │ │ ○        [═══] │ │ │                        │
│              │ └────────────────┘ │ │                        │
└──────────────┴──────────────────────┴───────────────────────┘
```

### Components

- **Scenes**: 6 large square/cell buttons in a 2×3 grid:
  - `scene.all_lights_off`
  - `scene.living_room_lights_on`
  - `scene.relax_mode`
  - `scene.movie_mode`
  - `script.goodnight`
  - `script.focus_mode`
- **Lights**: 3 light cards, each showing on/off state, name, and a brightness slider:
  - `light.ceiling_fan`
  - `light.living_room_ceiling_fan`
  - `light.travis_office_p1s_uno_chamber_light`
- **Media**: `media_player.living_room_fire_tv_living_room` with state and play/pause toggle.
- **Quick actions**: large buttons for the two most-used actions (`All Off`, `Goodnight`).

## Status Monitor Layout

Surveillance-and-metrics dashboard:

```
┌─────────────────────────────────────────────────────────────┐
│  ● CONNECTED        STATUS MONITOR           [ CLOSE ]     │
├─────────────────────────────────────────────────────────────┤
│ ┌─ FRONT DOOR ───────────────┐ ┌─ DOWNSTAIRS ──────────────┐ │
│ │  [live camera feed]        │ │  [live camera feed]       │ │
│ └────────────────────────────┘ └───────────────────────────┘ │
├──────────────┬──────────────────────┬───────────────────────┤
│ ┌ SECURITY ──┐ │ ┌ ENVIRONMENT ─────┐ │ ┌ SYSTEM ───────────┐ │
│ │ MOTION: ON │ │ │ TEMP: 74°F       │ │ │ CPU: 12%          │ │
│ │ BAT: 87%   │ │ │ HUM: 62%         │ │ │ MEM: 45%          │ │
│ │ SIREN: OFF │ │ │ LUX: 45%         │ │ │ DISK: 34%         │ │
│ └────────────┘ │ └──────────────────┘ │ │ UPDATES: 2        │ │
│                │                      │ └───────────────────┘ │
│ ┌ VACUUMS ───┐ │ ┌ PRINTER ─────────┐ │                       │
│ │ GEORDI:    │ │ │ P1S: PRINTING    │ │                       │
│ │ DOCKED     │ │ │ 14% / 4h left    │ │                       │
│ │ POOPER:    │ │ └──────────────────┘ │                       │
│ │ CLEANING   │ │                      │                       │
│ └────────────┘ │                      │                       │
└──────────────┴──────────────────────┴───────────────────────┘
```

### Components

- **Cameras**: two live feeds side-by-side:
  - `camera.front_door_live_view`
  - `camera.downstairs_live_view`
- **Security**: motion switches, battery sensors, sirens.
- **Environment**: temperature, humidity, illuminance from the Hobeian sensors.
- **System**: HA core CPU/memory, disk usage, pending updates.
- **Vacuums**: `vacuum.geordi_la_forge`, `vacuum.pooper_litter_box`.
- **Printer**: Bambu Lab P1S print status with progress bar and time remaining.

## Components Library

- `TerminalPanel`: window frame with optional title, close button, scrollable body.
- `StatusLed`: green / amber / red / dim dot.
- `AlertTicker`: scrolling/stacking alerts; `SYSTEM NORMAL` fallback.
- `SceneButton`: large tappable cell with label and icon glyph.
- `LightCard`: toggle + brightness slider.
- `MetricCard`: label + value + unit.
- `CameraFeed`: `<img>` pulling `/api/camera_proxy_stream/<entity_id>`.
- `RadarFrame`: `<iframe>` loading RainViewer centered on Home Assistant latitude/longitude from `/api/config`.
- `MediaCard`: state + play/pause toggle.
- `BottomButton`: half-width dock button with terminal brackets.

## Data Flow

- Reuse the existing WebSocket connection:
  - Proxy mode via `/ai-dashboard/ws` when `window.HA_INTEGRATION_PROXY` is set.
  - Direct `/api/websocket` with `localStorage` token otherwise.
- On connect: fetch all states and render the active screen.
- On `state_changed`: update DOM elements by `data-entity-id`.
- Screen switching is pure DOM/CSS; no extra HA calls.

## Error Handling

- **Connection status**: top-bar LED.
  - Green = connected
  - Amber = connecting
  - Red = disconnected (auto-reconnect with backoff)
- **Missing entity**: renders as `OFFLINE` in dim red; does not crash.
- **Camera failure**: `SIGNAL LOST` placeholder.
- **Empty alerts**: show `SYSTEM NORMAL` in muted green.

## Files to Modify

- `www/ai-dashboard/index.html` — full redesign of markup, CSS, and render functions.
- `www/ai-dashboard/config.json` — update layout/sections if needed to match new screens.
- Create backup before overwrite (existing `.bak.<timestamp>` behavior).

## Out of Scope

- Natural-language re-editing from the browser.
- Multi-user layouts or per-device themes.
- New Home Assistant integration or YAML changes.
- Camera audio or two-way talk.

## Verification

1. Load `/local/ai-dashboard/index.html` on the wall-mounted iPad.
2. Confirm Home Screen shows time, weather, weather radar, presence, and `SYSTEM NORMAL`.
3. Toggle a light from another dashboard; confirm the corresponding card updates.
4. Open Control Hub and run `scene.all_lights_off`.
5. Open Status Monitor and confirm both camera feeds load.
6. Confirm bottom dock buttons switch screens and the close button returns to Home.
