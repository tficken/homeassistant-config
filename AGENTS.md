# Agent Guide for This Home Assistant Configuration

This repository is a **Home Assistant configuration directory**. It contains the runtime configuration, custom integrations, themes, blueprints, and supporting files for a single Home Assistant instance. Treat it as a living configuration project rather than a packaged application.

The intended reader of this file is an AI coding agent that has no prior context about the project.

**Deeper guides** (loaded when you work in those areas):

- `www/ai-dashboard/AGENTS.md` — the custom AI dashboard and its `ai_dashboard_proxy` integration.
- `docs/ring-cameras.md` — Ring camera architecture (official integration vs ring-mqtt add-on) and its hard constraints.

---

## Project Overview

- **Type**: Home Assistant configuration + custom integrations.
- **Home Assistant Version**: recorded in `.HA_VERSION`.
- **Primary Language**: English in comments and documentation.
- **Configuration Language**: YAML, with Python used for custom integrations.
- **No Top-Level Package Manager**: No `pyproject.toml`, `package.json`, `requirements.txt`, `Dockerfile`, or `Makefile` at the repository root. Dependency management is handled by Home Assistant and HACS at runtime. A GitHub Actions validation workflow lives in `.github/workflows/validate.yml`.
- **Git Repository**: `//HOMEASSISTANT/config/` is a git repository (remote: GitHub). Git commands are appropriate when the user approves them. The working branch is usually `master`.
- **Agent Workflow**: This project uses the Superpowers skill system. Design docs live in `docs/superpowers/specs/` and implementation plans in `docs/superpowers/plans/`. Scratch workspace for plans is in `.superpowers/sdd/` (git-ignored).

---

## Technology Stack

- **Runtime**: Home Assistant (Python-based home automation platform).
- **Core Configuration**: YAML files parsed by Home Assistant on startup.
- **Custom Integrations**: Python packages under `custom_components/`.
- **Frontend/Theming**: Lovelace themes (`themes/`), community cards (`www/community/`), and frontend extensions (`custom_components/uix/`).
- **Databases**: `home-assistant_v2.db*` (recorder/history), `zigbee.db*` (Zigbee coordinator).
- **Secrets**: `secrets.yaml` stores sensitive placeholders. It must never be committed or shared.
- **Backups**: Weekly full backups via `shell_command.create_weekly_backup` (automation `weekly_backup`), pruned past 14 days locally; off-site copies are handled by Nabu Casa cloud backup. `sensor.ha_last_backup_age` (command_line, from `scripts/last_backup_age.py`) tracks the newest backup's age and the `stale_backup_alert` automation notifies when it exceeds 8 days — this catches the backup never running, which `create_weekly_backup.py`'s own failure notification cannot.

---

## Repository Layout

```
/config/
├── configuration.yaml          # Main Home Assistant configuration
├── automations.yaml            # Automations (included from configuration.yaml)
├── scripts.yaml                # Scripts (loaded by configuration.yaml)
├── scenes.yaml                 # Scenes (loaded by configuration.yaml)
├── secrets.yaml                # Secrets placeholder file (never commit)
├── .HA_VERSION                 # Installed Home Assistant version
├── .storage/                   # Home Assistant runtime registries and auth (do not hand-edit)
├── .tools/                     # Local tooling (portable Node.js, git-ignored)
├── blueprints/                 # Stock HA automation/script blueprints (rarely touched)
├── .github/workflows/          # CI validation (validate.yml)
├── custom_components/          # Custom integrations (most are HACS-managed — see below)
├── themes/google_dark_theme/   # Lovelace theme
├── www/
│   ├── ai-dashboard/           # Custom retro-terminal wall dashboard (see its AGENTS.md)
│   ├── community/              # HACS-downloaded community cards
│   └── media/                  # User media files
├── docs/                       # Notes (ring-cameras.md, device notes) + superpowers specs/plans
├── openhasp/                   # openHASP plate definition (wall_panel.yaml)
├── scripts/                    # Maintenance and validation scripts (backups, HA YAML validation)
└── dashboard-backup-*.json     # Backups of UI-managed dashboards
```

---

## Configuration Architecture

### Main Configuration (`configuration.yaml`)

- Loads the default integration set via `default_config:`.
- Merges themes from `themes/` using `!include_dir_merge_named themes`.
- Configures the `recorder` to purge data after 30 days and excludes noisy diagnostic entities.
- Defines a `command_line` sensor for disk usage (`HA disk usage`).
- Defines two `ffmpeg` cameras (`camera.backyard_rtsp_live`, `camera.front_door_rtsp_live`) backed by the ring-mqtt RTSP feeds — see `docs/ring-cameras.md`.
- Includes `automations.yaml`, `scripts.yaml`, `scenes.yaml`.

### Automations, Scripts, and Scenes

- `automations.yaml`: User automations (e.g., PagerDuty high-urgency Echo alerts, `ring_snapshot_archive_*` Ring motion/ding clip archiving, `ring_live_stream_failsafe`, low-battery notifications, weekly backup + pruning + `stale_backup_alert`, disk space alert).
- `scripts.yaml`: Lighting/media presets and HA actions (e.g., `all_lights_off`, `goodnight`, `movie_mode`).
- `scenes.yaml`: Lighting presets (e.g., `movie_mode`, `focus_mode`, `relax_mode`).

### Themes

- `themes/google_dark_theme/google_dark_theme.yaml`: A Google-app-inspired dark theme by JuanMTech.

---

## Dashboards

- **`www/ai-dashboard/`**: Custom retro-terminal wall dashboard served at `/ai-dashboard/` — the primary wall-tablet UI. **See `www/ai-dashboard/AGENTS.md` for architecture, the Settings editor, layout model, proxy endpoints, and its dev workflow.**
- **Original UI dashboard**: Backed up as `dashboard-backup-*.json` from `.storage/lovelace.dashboard_dashboard`.
- **Retired**: the YAML-managed `ipad-wall-panel.yaml` Lovelace dashboard was removed in favor of the AI dashboard (recoverable from git history if ever needed).

### Lovelace Conventions (for any Lovelace work)

- **Layout mode**: `type: sections` with `max_columns: 3`; large touch targets for wall-mounted iPad use.
- **Theme**: `Google Dark Theme` on all views.
- **Common cards**:
  - `custom:mushroom-light-card` for lights (brightness + color temp controls).
  - `custom:mushroom-switch-card` for switches; `custom:mushroom-vacuum-card` for vacuums.
  - `custom:ha-bambulab-print_status-card`, `custom:ha-bambulab-print_control-card`, `custom:ha-bambulab-ams-card`, `custom:ha-bambulab-spool-card` for Bambu Lab printers.
  - `custom:weather-radar-card` for weather radar.
  - `tile` for sensors, scenes, scripts, media players, and updates.
  - `picture-entity` with `camera_view: live` for cameras; `weather-forecast` for weather; `gauge` for system metrics.

### Lovelace YAML Workflow

1. Edit the YAML dashboard file directly.
2. Validate YAML syntax (see Common Operations below).
3. Reload Lovelace dashboards from **Developer Tools > YAML > Lovelace Dashboards > Reload**, or restart Home Assistant.

---

## Device / Entity Inventory

Common device families in this instance (entity IDs follow these prefixes):

- **Lights / Ceiling fans**: `light.ceiling_fan`, `light.living_room_ceiling_fan`, `light.third_reality_inc_3rcb01057z*`, `light.*_chamber_light`
- **Bedroom bulbs**: Sylvania Smart+ WiFi A19 — Alexa-only, not integrable with HA (Tuya white-label lock). Slated for replacement; see `docs/sylvania-smartplus-wifi-notes.md`.
- **Bambu Lab 3D printers**: `sensor.p1s_*`, `binary_sensor.p1s_*`, `fan.p1s_*`, `light.p1s_*_chamber_light`, `camera.p1s_*_camera`, etc.
- **Cameras**: `camera.front_door_live_view`, `camera.downstairs_live_view` (official Ring — last cloud recording only), `camera.backyard_rtsp_live` / `camera.front_door_rtsp_live` (ffmpeg on ring-mqtt RTSP), `camera.backyard_live_stream` (generic/HLS for the HA UI), `camera.p1s_*_camera`. Details: `docs/ring-cameras.md`.
- **Environmental sensors**: `sensor.hobeian_zg_204zx_*`, `binary_sensor.hobeian_zg_204zx*`
- **Motion / security**: `switch.front_door_motion_detection`, `switch.downstairs_motion_detection`, `event.front_door_*`, `event.downstairs_motion`, `siren.downstairs_siren*`
- **Door / window sensors**: `binary_sensor.living_room_front_door`, `binary_sensor.backdoor`
- **Vacuums**: `vacuum.geordi_la_forge`, `vacuum.pooper_litter_box`
- **Media players**: `media_player.living_room_fire_tv_living_room`, `media_player.travis_office_office_fire_tv`
- **Alexa Media Player devices**: `media_player.master_bedroom_echo_dot`, `media_player.everywhere`, `media_player.travis_s_fire_tv`, `media_player.office_fire`, etc.
- **People / presence**: `person.woteg` (Travis), `person.bobbie` (Bobbie). The iPhone device tracker is the same user as Travis and is not displayed separately in the AI dashboard.
- **Weather**: `weather.forecast_home`
- **Network**: `sensor.exos_router_*`, `binary_sensor.exos_router_wan_status`
- **Host / add-on diagnostics**: `sensor.home_assistant_core_*`, `sensor.home_assistant_host_*`, `sensor.home_assistant_supervisor_*`, `sensor.*_cpu_percent`, `sensor.*_memory_percent`, `sensor.ha_disk_usage`, `sensor.ha_last_backup_age`

For the full current entity list, parse `.storage/core.entity_registry`.

---

## Custom Integrations (`custom_components/`)

Each integration is a standard HA package with a `manifest.json`, `__init__.py`, and platform modules — consult each `manifest.json` for the authoritative version, dependencies, and requirements rather than trusting docs.

**Warning**: HACS-managed integrations (`alexa_media`, `bambu_lab`, `extended_openai_conversation`, `hacs`, `openhasp`, `uix`) have their directories **replaced on update** — never store your own files (including AGENTS.md or notes) inside them.

- **`ai_dashboard_proxy`** (self-written): Serves `/ai-dashboard/` and handles HA auth server-side for the dashboard. Documented in `www/ai-dashboard/AGENTS.md`. **Any Python change requires a Home Assistant restart.**
- **`alexa_media`** (HACS): Announcements/TTS on Echo/Fire TV. Key usage: Echo announcements use `notify.alexa_media_<device_name>` with `data: {type: announce}`. The `media_player.everywhere` group and Fire TV devices are unreliable for announcements; prefer individual Echo devices.
- **`bambu_lab`** (HACS): Bambu Lab 3D printers. Contains the embedded `pybambu/` library with the repo's only tests (see Testing).
- **`extended_openai_conversation`** (HACS): OpenAI-backed conversation agent for chat/voice control.
- **`hacs`** (HACS): Home Assistant Community Store itself.
- **`openhasp`** (HACS): Physical wall plate; plate layout is defined in `openhasp/wall_panel.yaml` (config lives outside the integration dir) and pushed over MQTT.
- **`pagerduty`**: Incidents and on-call data (sensor, calendar, notify); drives the high-urgency Echo alert automations.
- **`uix`** (HACS): UI eXtension for Lovelace/frontend.

---

## Build and Runtime

- **No Build Step**: Home Assistant loads YAML and Python directly; this directory (`/config`) is the configuration path.
- **Validation**: Home Assistant validates YAML and integration manifests on startup. Check the Home Assistant logs for errors after any configuration change.
- **Dependencies**: Runtime Python packages are installed by Home Assistant from each integration's `manifest.json` `requirements`, and by HACS for downloaded integrations/cards.

---

## Testing

There is no top-level test harness. Only the `bambu_lab` integration contains tests:

- **Location**: `custom_components/bambu_lab/pybambu/tests/` (Python `unittest`, JSON mock payloads).
- **How to Run**: Create a venv inside `custom_components/bambu_lab/pybambu/venv/`, `pip install -r tests/requirements.txt`, then run `custom_components/bambu_lab/pybambu/run_tests.sh`.
- The runner script preloads the stdlib `select` module before importing HA platform modules to avoid shadowing by `custom_components/bambu_lab/select.py`.
- Run these tests when a change touches `pybambu/`.

---

## Code Style Guidelines

- Follow Home Assistant conventions for integrations: use `DOMAIN`, `PLATFORMS`, `async_setup_entry`, `async_unload_entry`, and config-entry-based setup.
- Match the existing style in each custom integration when modifying code.
- YAML: use 2-space indentation, consistent quoting, and Home Assistant's `!include`/`!include_dir_*` helpers where appropriate.
- Keep sensitive values in `secrets.yaml` and reference them with `!secret`.
- Do not introduce top-level package manifests unless the project transitions to a packaged application.

---

## Security Considerations

- **`secrets.yaml`**: Never expose it in logs, copy it outside this environment, or commit it to version control.
- **`.storage/`**: Contains authentication, registry, and state files. Runtime-sensitive — do not edit manually.
- **Database Files**: `home-assistant_v2.db*` and `zigbee.db*` contain runtime data. Avoid deleting or modifying them while Home Assistant is running.
- **Custom Integrations**: They execute with the same privileges as Home Assistant. Review any changes carefully, especially network calls, shell commands, or file-system access.
- **AI dashboard auth model**: any LAN client can use the dashboard (by design, for wall tablets) — treat the LAN as the trust boundary and keep the service-call allowlist in `custom_components/ai_dashboard_proxy/http.py` (`ALLOWED_SERVICE_DOMAINS`) minimal.

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
- **Update Integrations**: HACS-managed integrations are updated via HACS, which replaces their directories wholesale — see the warning under Custom Integrations.

---

## CI/CD

GitHub Actions validation runs on every push/PR via `.github/workflows/validate.yml`:

- **YAML lint** — `yamllint -c .yamllint.yaml .` (GitHub workflow files only; HA custom tags break standard parsers).
- **HA YAML syntax** — `python scripts/validate_ha_yaml.py` registers `!include`, `!secret`, etc. as no-ops and parses `configuration.yaml`, `automations.yaml`, `scripts.yaml`, and `scenes.yaml`.
- **JSON** — `python -m json.tool www/ai-dashboard/config.json`.
- **HTML** — Python `html.parser` sanity check on `www/ai-dashboard/index.html`.
- **Python** — `flake8 custom_components/ai_dashboard_proxy` and `python -m compileall custom_components/ai_dashboard_proxy`.

Run the same checks locally before committing:
```bash
pip install yamllint pyyaml flake8
yamllint -c .yamllint.yaml .
python scripts/validate_ha_yaml.py
python -m json.tool www/ai-dashboard/config.json > /dev/null
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
python -m compileall custom_components/ai_dashboard_proxy -q
```

There is no automated deployment to the live Home Assistant instance; deploy manually after validation.

---

## Notes for Future Agents

- This is a personal/single-instance Home Assistant configuration. Changes affect a live home automation system.
- Always prefer minimal, targeted edits.
- Verify YAML changes with Home Assistant's configuration validation before restarting. Use the local Node.js in `.tools/node/` or the Python fallback for syntax checks.
- If you add a new custom integration, include a valid `manifest.json` and follow the Home Assistant integration platform pattern used by the existing components.
- Dashboards can be UI-managed (stored in `.storage/lovelace.*`) or YAML-managed (registered in `configuration.yaml`). No YAML-managed Lovelace dashboards are currently registered; the AI dashboard is file-based under `www/ai-dashboard/`.
- For new features or significant changes, use the Superpowers skill workflow: brainstorm → design spec → implementation plan → subagent-driven execution. Keep specs in `docs/superpowers/specs/` and plans in `docs/superpowers/plans/`.
