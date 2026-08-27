# homeassistant-config

Personal Home Assistant configuration running on Home Assistant OS `2026.8.3`. This isn't a typical smart home config — it's a platform I've built and maintained over time, including custom Python integrations, event-driven automation logic, production monitoring integrations, and a custom-built retro-terminal wall dashboard. Validation runs through a GitHub Actions workflow in `.github/workflows/validate.yml`.

---

## What's in here

### Custom Integrations (`custom_components/`)

**`ai_dashboard_proxy`** — A custom Home Assistant integration I wrote in Python that serves a retro-terminal wall dashboard at `/ai-dashboard/`. It exposes a WebSocket proxy (with ping/pong watchdog, visibilitychange force-reconnect, and a domain allowlist for service calls) that forwards HA state events and service calls server-side, plus REST helper endpoints for weather forecasts, recorder history, config persistence with automatic backup pruning, authenticated MJPEG camera streaming, and motion-snapshot archive listing — so no long-lived access token is ever exposed to the browser. The dashboard (`www/ai-dashboard/`) is vanilla HTML/CSS/JS with four dock-navigated screens: a home screen (clock, weather, room monitors, presence, radar, door status), a control hub (scenes, scripts, lights, media), a security view (camera feeds + alarm sensors), and a status monitor with 24-hour SVG sparklines drawn from recorder history. It has a built-in settings editor whose Layout tab is a visual preview editor — a scaled live render of each screen where panels can be dragged between columns, entities dragged on/off panels directly, and a measured overflow badge warns when a column exceeds the screen height (the layout model is a `config.panels` screen → columns → panels map with defensive defaults), plus appearance and per-entity label override tabs. It updates cards in place instead of re-rendering on every state event, vendors Leaflet locally so the radar (RainViewer overlay on a keyless Esri dark basemap with city labels) works even when the internet is down, and renders camera feeds above the CRT scanline overlay so video stays crisp.

**Ring cameras** — The official Ring integration has no true live view (its "live" entities replay the last cloud recording), so the **ring-mqtt add-on** bridges Ring's on-demand WebRTC sessions to local RTSP. A small `ffmpeg` camera in `configuration.yaml` transcodes that to MJPEG for the dashboard's backyard feed, which starts when the security screen opens and stops when it closes (Ring caps streams at ~10 minutes and suppresses motion alerts while streaming). Motion and doorbell events also trigger automations that archive timestamped snapshots, browsable from a HISTORY chip on each camera panel (kept 14 days / 100 files per camera).

**`bambu_lab`** — Full Bambu Lab 3D printer integration. Handles MQTT-based communication with two P1S printers, exposes sensor/binary_sensor/camera/light/fan entities, and includes a full coordinator pattern, config flow, device triggers, and diagnostics. I run two P1S units for my 3D printing business (TLF Productions); this integration keeps them monitored from the same platform as the rest of my home systems.

**`extended_openai_conversation`** — OpenAI conversation integration for voice and chat-based control of the HA instance.

**`pagerduty`** — Custom PagerDuty integration. Bridges home automation alerting with the same incident management platform I use professionally at NRC Health.

**`alexa_media`** — Alexa Media Player integration (via HACS). Enables announcements and TTS on Amazon Echo devices through `notify.alexa_media_*` services.

**`openhasp`** — openHASP integration (via HACS) driving a physical wall plate over MQTT; plate layout defined in `openhasp/wall_panel.yaml`.

**`hacs`** — Home Assistant Community Store for managing community components.

**`uix`** — UI eXtension for Home Assistant (via HACS), extending the Lovelace frontend.

---

### Automations (`automations.yaml`)

Event-driven automations written in YAML with Jinja2 templating:

- **Printer monitoring**: State-transition detection on two Bambu P1S units — mobile push + persistent alerts on print completion and hardware/HMS errors
- **Battery monitoring**: Multi-device battery check across 5 sensors using Jinja2 list comprehension and conditional messaging
- **Disk health**: Threshold-based alerting when HA disk usage exceeds 85%, with mobile push notification
- **Automated backups**: Weekly full backup via shell command + Python script; nightly cleanup of backups older than 14 days; both phone me if they fail
- **Wall panel**: MQTT-based backlight control with day/night brightness scheduling and startup page-push on HA boot
- **PagerDuty alerting**: High-urgency incidents flash the office ceiling fan red 3 times (restoring its prior state) and trigger a short Echo announcement ("New PagerDuty Alert") that restores the speaker's prior volume afterwards; low-urgency incidents stay silent
- **Door/window announcements**: Door or window opening is announced over Alexa devices; phone notification is sent only when no one is home
- **Ring snapshot archive**: Motion and doorbell events save timestamped camera snapshots for the dashboard's per-camera history viewer

---

### Configuration Architecture (`configuration.yaml`)

- **Database tuning**: Recorder configured to exclude high-frequency diagnostic entities (printer temperatures, fan speeds, camera feeds, router packet counters) to reduce SD card wear and control DB growth
- **Command-line sensors**: Shell-based disk usage sensor with 5-minute polling
- **Log level management**: Per-integration log suppression for noisy components (Bambu MQTT, Bluetooth, Litter Robot transport)
- **OpenHASP**: YAML-managed physical wall panel dashboard with MQTT control surface
- **Custom Lovelace dashboard**: Separate iPad wall panel layout managed in YAML
- **Alexa exposure**: Home Assistant Cloud filter exposes useful entities to Alexa while excluding diagnostic/noisy sensors

---

### AI-Assisted Development

This repo includes `AGENTS.md` — a structured guide I maintain so that AI coding agents (Kimi Code, Claude Code, Cursor, etc.) have full context about the project architecture, file layout, and workflow conventions before making changes. The project uses a Superpowers skill system with design specs and implementation plans tracked in `docs/superpowers/`.

---

## Stack

| Layer | Technology |
|---|---|
| Platform | Home Assistant OS 2026.8.3 |
| Config language | YAML + Jinja2 |
| Custom integrations | Python (async, HA component API) |
| Add-ons | ring-mqtt (Ring RTSP/snapshot bridge), Mosquitto |
| Validation tooling | Portable Node.js (`.tools/`), yamllint, flake8 |
| Protocols | MQTT, WebSocket, HTTP, Zigbee |
| Hardware | Bambu Lab P1S × 2, OpenHASP wall panel, Zigbee sensors, Z-Wave devices |
| Monitoring | PagerDuty integration, mobile push, persistent notifications |
| Voice assistants | Alexa via Home Assistant Cloud + Alexa Media Player |
| AI tooling | Extended OpenAI Conversation, Kimi Code, Claude Code, agent-guided development |
