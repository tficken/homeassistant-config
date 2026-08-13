# homeassistant-config

Personal Home Assistant configuration running on Home Assistant OS `2026.8.1`. This isn't a typical smart home config — it's a platform I've built and maintained over time, including custom Python integrations, event-driven automation logic, production monitoring integrations, and a programmatically generated dashboard system. Validation runs through a GitHub Actions workflow in `.github/workflows/validate.yml`.

---

## What's in here

### Custom Integrations (`custom_components/`)

**`ai_dashboard_proxy`** — A custom Home Assistant integration I wrote in Python that serves a retro-terminal wall dashboard at `/ai-dashboard/`. It exposes a WebSocket proxy that forwards HA state events and service calls server-side, so no long-lived access token is ever exposed to the browser. The dashboard (`www/ai-dashboard/`) is vanilla HTML/CSS/JS: clock, weather, room monitors, presence, radar, and door status on a single landscape home screen.

**`bambu_lab`** — Full Bambu Lab 3D printer integration. Handles MQTT-based communication with two P1S printers, exposes sensor/binary_sensor/camera/light/fan entities, and includes a full coordinator pattern, config flow, device triggers, and diagnostics. I run two P1S units for my 3D printing business (TLF Productions); this integration keeps them monitored from the same platform as the rest of my home systems.

**`extended_openai_conversation`** — OpenAI conversation integration for voice and chat-based control of the HA instance.

**`pagerduty`** — Custom PagerDuty integration. Bridges home automation alerting with the same incident management platform I use professionally at NRC Health.

**`hacs`** — Home Assistant Community Store for managing community components.

---

### Automations (`automations.yaml`)

Event-driven automations written in YAML with Jinja2 templating:

- **Security**: Motion-triggered siren after sunset using sun-position conditions
- **Printer monitoring**: State-transition detection on two Bambu P1S units — alerts on print completion and hardware/HMS errors
- **Battery monitoring**: Multi-device battery check across 5 sensors using Jinja2 list comprehension and conditional messaging
- **Disk health**: Threshold-based alerting when HA disk usage exceeds 85%, with mobile push notification
- **Automated backups**: Weekly full backup via shell command + Python script; nightly cleanup of backups older than 14 days
- **Wall panel**: MQTT-based backlight control with day/night brightness scheduling and startup page-push on HA boot

---

### Dashboard Generation (`.dashboard-gen/build-dashboards.js`)

A Node.js script that programmatically builds Lovelace dashboards by reading the HA entity and device registries directly from `.storage/`. Handles dynamic printer card generation by mapping Bambu Lab device serials to friendly names, filters excluded entity groups, and writes the output back to the registry files. Avoids manual dashboard maintenance as devices are added or removed.

---

### Configuration Architecture (`configuration.yaml`)

- **Database tuning**: Recorder configured to exclude high-frequency diagnostic entities (printer temperatures, fan speeds, camera feeds, router packet counters) to reduce SD card wear and control DB growth
- **Command-line sensors**: Shell-based disk usage sensor with 5-minute polling
- **Log level management**: Per-integration log suppression for noisy components (Bambu MQTT, Bluetooth, Litter Robot transport)
- **OpenHASP**: YAML-managed physical wall panel dashboard with MQTT control surface
- **Custom Lovelace dashboard**: Separate iPad wall panel layout managed in YAML

---

### AI-Assisted Development

This repo includes `AGENTS.md` — a structured guide I maintain so that AI coding agents (Cursor, Claude, etc.) have full context about the project architecture, file layout, and workflow conventions before making changes. The project uses a Superpowers skill system with design specs and implementation plans tracked in `docs/superpowers/`.

---

## Stack

| Layer | Technology |
|---|---|
| Platform | Home Assistant OS 2026.8.1 |
| Config language | YAML + Jinja2 |
| Custom integrations | Python (async, HA component API) |
| Dashboard tooling | Node.js |
| Protocols | MQTT, WebSocket, HTTP, Zigbee |
| Hardware | Bambu Lab P1S × 2, OpenHASP wall panel, Zigbee sensors, Z-Wave devices |
| Monitoring | PagerDuty integration, mobile push, persistent notifications |
| AI tooling | Extended OpenAI Conversation, Claude Code, agent-guided development |
