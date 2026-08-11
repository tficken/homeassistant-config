# Agent Guide for This Home Assistant Configuration

This repository is a **Home Assistant configuration directory**. It contains the runtime configuration, custom integrations, themes, blueprints, and supporting files for a single Home Assistant instance. Treat it as a living configuration project rather than a packaged application.

The intended reader of this file is an AI coding agent that has no prior context about the project.

---

## Project Overview

- **Type**: Home Assistant configuration + custom integrations.
- **Home Assistant Version**: `2026.7.4` (recorded in `.HA_VERSION`).
- **Primary Language**: English in comments and documentation.
- **Configuration Language**: YAML, with Python used for custom integrations.
- **No Top-Level Package Manager**: There is no `pyproject.toml`, `package.json`, `requirements.txt`, `Dockerfile`, `docker-compose.yml`, `Makefile`, or CI/CD pipeline at the repository root. Dependency management is handled by Home Assistant and HACS at runtime.
- **Git Repository**: `//HOMEASSISTANT/config/` is a git repository. Git commands are appropriate when the user approves them. The working branch is usually `master`.
- **Agent Workflow**: This project uses the Superpowers skill system. Design docs live in `docs/superpowers/specs/` and implementation plans in `docs/superpowers/plans/`. Scratch workspace for plans is in `.superpowers/sdd/` (git-ignored).

---

## Technology Stack

- **Runtime**: Home Assistant (Python-based home automation platform).
- **Core Configuration**: YAML files parsed by Home Assistant on startup.
- **Custom Integrations**: Python packages under `custom_components/`.
- **Frontend/Theming**: Home Assistant Lovelace themes (`themes/`), community cards (`www/community/`), and frontend extensions (`custom_components/uix/`).
- **Databases**:
  - `home-assistant_v2.db*` — Home Assistant state history and recorder data.
  - `zigbee.db*` — Zigbee coordinator database.
- **Secrets**: `secrets.yaml` stores sensitive placeholders. It must never be committed or shared.

---

## Repository Layout

```
/config/
├── configuration.yaml          # Main Home Assistant configuration
├── automations.yaml            # Automations (included from configuration.yaml)
├── scripts.yaml                # Scripts (loaded by configuration.yaml)
├── scenes.yaml                 # Scenes (loaded by configuration.yaml)
├── secrets.yaml                # Secrets placeholder file
├── .HA_VERSION                 # Installed Home Assistant version
├── home-assistant_v2.db*       # Recorder SQLite database
├── zigbee.db*                  # Zigbee SQLite database
├── .storage/                   # Home Assistant runtime registries and auth
├── .superpowers/               # Superpowers skill scratch workspace (git-ignored)
├── .tools/                     # Local tooling (e.g. portable Node.js, git-ignored)
├── blueprints/                 # Reusable automation and script blueprints
│   ├── automation/homeassistant/
│   └── script/homeassistant/
├── custom_components/          # Custom integrations
│   ├── ai_dashboard_proxy/     # Serves /ai-dashboard/ with server-side HA auth
│   ├── bambu_lab/              # Bambu Lab 3D printer integration
│   ├── hacs/                   # Home Assistant Community Store
│   ├── pagerduty/              # PagerDuty integration
│   └── uix/                    # UI extension for Lovelace
├── themes/                     # Lovelace themes
│   └── google_dark_theme/
├── www/                        # Static web assets served by Home Assistant
│   ├── ai-dashboard/           # Custom retro-terminal wall dashboard
│   ├── community/              # HACS-downloaded community cards
│   └── media/                  # User media files
├── docs/superpowers/           # Design specs and implementation plans
│   ├── specs/
│   └── plans/
├── ipad-wall-panel.yaml        # YAML-managed Lovelace wall panel dashboard
├── dashboard-backup-*.json     # Backups of UI-managed dashboards
├── image/                      # Cached images
└── tts/                        # Cached text-to-speech audio
```

---

## Configuration Architecture

### Main Configuration (`configuration.yaml`)

- Loads the default integration set via `default_config:`.
- Merges themes from `themes/` using `!include_dir_merge_named themes`.
- Configures the `recorder` to purge data after 7 days and excludes noisy diagnostic entities.
- Defines a `command_line` sensor for disk usage (`HA disk usage`).
- Includes:
  - `automations.yaml`
  - `scripts.yaml`
  - `scenes.yaml`

### Automations, Scripts, and Scenes

- `automations.yaml`: Contains user automations (e.g., motion-activated siren, low-battery notifications).
- `scripts.yaml` and `scenes.yaml`: Empty at time of writing but loaded by `configuration.yaml`.

### Blueprints

Stored under `blueprints/`. These are Home Assistant-provided reusable templates:

- `automation/homeassistant/motion_light.yaml`
- `automation/homeassistant/notify_leaving_zone.yaml`
- `script/homeassistant/confirmable_notification.yaml`

### Themes

- `themes/google_dark_theme/google_dark_theme.yaml`: A Google-app-inspired dark theme by JuanMTech.

---

## Dashboards

### Preferred Dashboard Stack

- **Layout mode**: `type: sections` with `max_columns: 3`.
- **Theme**: `Google Dark Theme` on all views.
- **Common cards**:
  - `custom:mushroom-light-card` for lights (brightness + color temp controls).
  - `custom:mushroom-switch-card` for switches.
  - `custom:mushroom-vacuum-card` for vacuums.
  - `custom:ha-bambulab-print_status-card`, `custom:ha-bambulab-print_control-card`, `custom:ha-bambulab-ams-card`, `custom:ha-bambulab-spool-card` for Bambu Lab printers.
  - `custom:weather-radar-card` for weather radar.
  - `tile` for sensors, scenes, scripts, media players, and updates.
  - `picture-entity` with `camera_view: live` for cameras.
  - `weather-forecast` for weather.
  - `gauge` for system metrics.

### Current Dashboards

- **`www/ai-dashboard/`**: Custom retro-terminal wall dashboard served at `/ai-dashboard/`. Built as a standalone HTML/JS/CSS app proxied through `custom_components/ai_dashboard_proxy/`. Designed for landscape wall-mounted iPads / tablets.
- **`ipad-wall-panel.yaml`**: YAML-managed Lovelace dashboard for the wall-mounted iPad in the Living Room. Registered in `configuration.yaml` under `lovelace.dashboards.ipad-wall-panel`.
- **Original UI dashboard**: Backed up as `dashboard-backup-*.json` from `.storage/lovelace.dashboard_dashboard`.

### Dashboard Development Workflow

1. Back up the current UI-managed dashboard from `.storage/lovelace.dashboard_dashboard` if migrating.
2. Edit the YAML dashboard file directly.
3. Validate YAML syntax. A portable Node.js install lives in `.tools/node/`; use it with the local `yaml` package if installed, or use Python's stdlib parser as a fallback:
   ```bash
   # Using local Node.js (Windows/Git Bash)
   .tools/node/node.exe -e "const YAML = require('yaml'); YAML.parse(require('fs').readFileSync('ipad-wall-panel.yaml', 'utf8')); console.log('valid')"

   # Fallback with Python
   py -c "import yaml; yaml.safe_load(open('ipad-wall-panel.yaml', encoding='utf-8')); print('valid')"
   ```
4. Reload Lovelace dashboards from **Developer Tools > YAML > Lovelace Dashboards > Reload**, or restart Home Assistant.

### AI Dashboard Development Workflow

1. Edit `www/ai-dashboard/index.html` and/or `www/ai-dashboard/config.json` directly.
2. Validate HTML syntax with the local Node.js install or Python's `html.parser`:
   ```bash
   # Using local Node.js
   .tools/node/node.exe -e "const HTMLParser = require('node-html-parser'); HTMLParser.parse(require('fs').readFileSync('www/ai-dashboard/index.html', 'utf8')); console.log('HTML parse OK')"

   # Fallback with Python
   py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
   ```
3. Hard-refresh the dashboard in the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) to pick up the latest files. The proxy serves them directly from `www/ai-dashboard/`.

---

## Device / Entity Inventory

Common device families in this instance (entity IDs follow these prefixes):

- **Lights / Ceiling fans**: `light.ceiling_fan`, `light.living_room_ceiling_fan`, `light.third_reality_inc_3rcb01057z*`, `light.*_chamber_light`
- **Bambu Lab 3D printers**: `sensor.p1s_*`, `binary_sensor.p1s_*`, `fan.p1s_*`, `light.p1s_*_chamber_light`, `camera.p1s_*_camera`, etc.
- **Cameras**: `camera.front_door_live_view`, `camera.downstairs_live_view`, `camera.p1s_*_camera`
- **Environmental sensors**: `sensor.hobeian_zg_204zx_*`, `binary_sensor.hobeian_zg_204zx*`
- **Motion / security**: `switch.front_door_motion_detection`, `switch.downstairs_motion_detection`, `event.front_door_*`, `event.downstairs_motion`, `siren.downstairs_siren*`
- **Vacuums**: `vacuum.geordi_la_forge`, `vacuum.pooper_litter_box`
- **Media players**: `media_player.living_room_fire_tv_living_room`, `media_player.travis_office_office_fire_tv`
- **People / presence**: `person.woteg` (Travis), `person.bobbie` (Bobbie). The iPhone device tracker is the same user as Travis and is not displayed separately in the AI dashboard.
- **Weather**: `weather.forecast_home`
- **Network**: `sensor.exos_router_*`, `binary_sensor.exos_router_wan_status`
- **Host / add-on diagnostics**: `sensor.home_assistant_core_*`, `sensor.home_assistant_host_*`, `sensor.home_assistant_supervisor_*`, `sensor.*_cpu_percent`, `sensor.*_memory_percent`, `sensor.ha_disk_usage`

For the full current entity list, parse `//HOMEASSISTANT/config/.storage/core.entity_registry`.

---

## Custom Integrations (`custom_components/`)

Each integration is a Home Assistant standard package with a `manifest.json`, `__init__.py`, and platform modules.

### `ai_dashboard_proxy`

- **Purpose**: Serves the custom `www/ai-dashboard/` app at `/ai-dashboard/` and handles Home Assistant authentication server-side so the dashboard can call HA APIs without exposing a long-lived token in the browser.
- **Key Modules**:
  - `__init__.py` — integration setup.
  - `http.py` — HTTP view that proxies dashboard assets and exposes a forecast helper endpoint.

### `bambu_lab`

- **Purpose**: Integrates Bambu Lab 3D printers.
- **Version**: `2.2.22`.
- **Dependencies**: `device_automation`, `ffmpeg`, `frontend`, `http`, `lovelace`, `mqtt`, `websocket_api`.
- **External Requirement**: `beautifulsoup4`.
- **Platforms**: binary_sensor, button, camera, fan, image, light, number, select, sensor, switch, update.
- **Key Modules**:
  - `__init__.py` — integration setup, services, and a print-history HTTP API view.
  - `coordinator.py` — data update coordinator.
  - `config_flow.py` — UI configuration flow.
  - `definitions.py` — entity descriptions.
  - `pybambu/` — lower-level printer communication library embedded inside the integration.
    - `models.py`, `bambu_client.py`, `bambu_cloud.py`, `commands.py`, `utils.py`, `const.py`
    - `tests/` — unit tests with JSON mock payloads.
- **Services**: Defined in `services.yaml`. Includes `send_command`, `print_project_file`, `skip_objects`, `move_axis`, `extrude_retract`, `load_filament`, `set_filament`, `get_filament_data`, `start_filament_drying`, etc.

### `hacs`

- **Purpose**: Home Assistant Community Store (HACS).
- **Version**: `2.0.5`.
- **Dependencies**: `http`, `websocket_api`, `frontend`, `persistent_notification`, `lovelace`, `repairs`.
- **External Requirement**: `aiogithubapi>=22.10.1`.
- **Key Modules**:
  - `base.py`, `__init__.py`, `coordinator.py`, `data_client.py`
  - `repositories/` — logic for integrations, plugins, themes, appdaemon, python_script, and template repositories.
  - `utils/` — helpers for GitHub, JSON, validation, backups, paths, queues, etc.
  - `validate/` — repository validation rules.
  - `websocket/` — WebSocket API endpoints.
  - `hacs_frontend/` — bundled frontend assets.

### `pagerduty`

- **Purpose**: PagerDuty integration for incidents and on-call data.
- **Version**: `v1.5.0`.
- **External Requirement**: `pagerduty==6.3.0`.
- **Platforms**: sensor, calendar, notify.
- **Key Modules**:
  - `__init__.py` — setup and config entry handling.
  - `sensor.py`, `calendar.py`, `notify.py` — platform implementations.
  - `coordinator.py` — data polling coordinator.
  - `config_flow.py` — UI configuration flow.
- **Services**: `send_notification` defined in `services.yaml`.

### `uix`

- **Purpose**: UI eXtension for Home Assistant (custom Lovelace/frontend extension).
- **Version**: `7.7.1`.
- **Integration Type**: `service`.
- **Key Modules**:
  - `__init__.py` — frontend script registration and cleanup.
  - `frontend.py` — serves `uix.js` and registers extra module URLs.
  - `connection.py` — WebSocket command handlers.
  - `config_flow.py` — configuration flow.
  - `uix.js` / `uix.js.gz` — bundled frontend code.

---

## Build and Runtime

- **No Build Step**: Home Assistant loads YAML and Python directly.
- **Runtime**: Start Home Assistant in the usual way for the installation type (OS, Container, Supervised, or Core). This directory (`/config`) is the configuration path.
- **Validation**: Home Assistant validates YAML and integration manifests on startup. Check the Home Assistant logs for errors after any configuration change.
- **Dependencies**: Runtime Python packages are installed by Home Assistant based on `manifest.json` `requirements` and by HACS for downloaded integrations/cards.
- **`deps/`**: Empty at time of writing. Home Assistant may place runtime-installed Python wheels here depending on the install method.

---

## Testing

There is no top-level test harness. Only the `bambu_lab` integration contains tests.

### Bambu Lab Tests

- **Location**: `custom_components/bambu_lab/pybambu/tests/`
- **Framework**: Python `unittest`.
- **Mock Data**: JSON files such as `P1P.json`, `H2D.json`, `MOCK-*.json`, and `test_ams_ams2_amsht.json`.
- **Test Files**:
  - `test_models.py` — model parsing and state updates.
  - `test_error_lookup.py` — error-code lookup behavior.
  - `test_utils.py` — utility functions and mock MQTT client.
- **Test Requirements**: `custom_components/bambu_lab/pybambu/tests/requirements.txt`
- **How to Run**:
  1. Create and activate a Python virtual environment inside `custom_components/bambu_lab/pybambu/` at `venv/`.
  2. Install test dependencies: `pip install -r tests/requirements.txt`
  3. Run `custom_components/bambu_lab/pybambu/run_tests.sh`

The runner script preloads the stdlib `select` module before importing Home Assistant platform modules to avoid shadowing by `custom_components/bambu_lab/select.py`.

---

## Code Style Guidelines

- Follow Home Assistant conventions for integrations: use `DOMAIN`, `PLATFORMS`, `async_setup_entry`, `async_unload_entry`, and config-entry-based setup.
- Match the existing style in each custom integration when modifying code.
- YAML: use 2-space indentation, consistent quoting, and Home Assistant's `!include`/`!include_dir_*` helpers where appropriate.
- Keep sensitive values in `secrets.yaml` and reference them with `!secret`.
- Do not introduce top-level package manifests unless the project transitions to a packaged application.

---

## Security Considerations

- **`secrets.yaml`**: Contains credentials placeholders. Never expose it in logs, copy it outside this environment, or commit it to version control.
- **`.storage/`**: Contains Home Assistant authentication, registry, and state files (e.g., `auth`, `core.config_entries`, `core.entity_registry`). These are runtime-sensitive and should not be edited manually unless you know exactly what you are doing.
- **Database Files**: `home-assistant_v2.db*` and `zigbee.db*` contain runtime data. Avoid deleting or modifying them while Home Assistant is running.
- **Custom Integrations**: They execute with the same privileges as Home Assistant. Review any changes carefully, especially network calls, shell commands, or file-system access.
- **No CI/CD**: There are no automated checks in this repository. Manual review and local validation are the only safety nets.

---

## Common Operations

- **Restart Home Assistant** after changing `configuration.yaml`, integration code, or adding/removing integrations.
- **Reload YAML** (automations, scripts, scenes, themes, Lovelace dashboards) from Home Assistant's Developer Tools when only those files change.
- **Validate YAML syntax** before restarting:
  ```bash
  .tools/node/node.exe -e "const YAML = require('yaml'); YAML.parse(require('fs').readFileSync('configuration.yaml', 'utf8')); console.log('configuration.yaml valid')"
  # Fallback:
  py -c "import yaml; yaml.safe_load(open('configuration.yaml', encoding='utf-8')); print('configuration.yaml valid')"
  ```
- **Check Logs**: Use Home Assistant's logs to debug integration errors or configuration problems.
- **Update Integrations**: Custom integrations under `custom_components/` are typically updated by replacing their directory contents (often via HACS or manual download). Preserve `manifest.json` and platform structure.

---

## Notes for Future Agents

- This is a personal/single-instance Home Assistant configuration. Changes affect a live home automation system.
- Always prefer minimal, targeted edits.
- Verify any YAML changes with Home Assistant's configuration validation before restarting. Use the local Node.js in `.tools/node/` or the Python fallback for syntax checks.
- When editing the AI dashboard (`www/ai-dashboard/`), validate HTML/JSON syntax and hard-refresh the browser to pick up changes.
- When editing Python custom integrations, run the existing `bambu_lab` tests if the change touches `pybambu/`.
- If you add a new custom integration, include a valid `manifest.json` and follow the Home Assistant integration platform pattern used by the existing components.
- Dashboards can be UI-managed (stored in `.storage/lovelace.*`) or YAML-managed (registered in `configuration.yaml`). The current wall panel is YAML-managed; the AI dashboard is file-based under `www/ai-dashboard/`.
- When the user asks for a Lovelace dashboard change, default to the established pattern: `type: sections`, `max_columns: 3`, `theme: Google Dark Theme`, Mushroom cards for lights/switches/vacuums, and large touch targets for wall-mounted iPad use.
- For new features or significant changes, use the Superpowers skill workflow: brainstorm → design spec → implementation plan → subagent-driven execution. Keep specs in `docs/superpowers/specs/` and plans in `docs/superpowers/plans/`.
