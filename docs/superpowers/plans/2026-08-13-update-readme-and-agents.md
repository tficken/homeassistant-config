# Update README.md and AGENTS.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `README.md` and `AGENTS.md` to reflect recent additions: Alexa Media Player, Home Assistant Cloud Alexa exposure, PagerDuty incident light flash, and door/window open announcements.

**Architecture:** Direct edits to two Markdown files, adding minimal, focused entries that match existing style and structure.

**Tech Stack:** Markdown.

## Global Constraints

- Match the existing tone and formatting of each file.
- Keep additions minimal and factual.
- Do not reorder unrelated sections.

---

## File Structure

- `README.md` — update custom integrations, automations, configuration architecture, and stack sections.
- `AGENTS.md` — update repository layout, custom integrations, entity inventory, and future-agent notes.
- `docs/superpowers/specs/2026-08-13-update-readme-and-agents-design.md` — reference spec (read-only).

## Task 1: Update README.md

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: spec sections for README.md.
- Produces: Updated `README.md`.

- [ ] **Step 1: Read current README.md**

  Read `//HOMEASSISTANT/config/README.md` to confirm exact insertion points.

- [ ] **Step 2: Add alexa_media to custom integrations**

  After the `pagerduty` bullet in the Custom Integrations section, add:

  ```markdown
  **`alexa_media`** — Alexa Media Player integration (via HACS). Enables announcements and TTS on Amazon Echo devices through `notify.alexa_media_*` services.
  ```

- [ ] **Step 3: Add new automations**

  In the Automations section, after the Wall panel bullet, add:

  ```markdown
  - **PagerDuty alerting**: New incident flashes the office ceiling fan red 3 times and restores its prior state.
  - **Door/window announcements**: Door or window opening is announced over Alexa devices; phone notification is sent only when no one is home.
  ```

- [ ] **Step 4: Add Alexa exposure bullet**

  In the Configuration Architecture section, after the OpenHASP bullet, add:

  ```markdown
  - **Alexa exposure**: Home Assistant Cloud filter exposes useful entities to Alexa while excluding diagnostic/noisy sensors.
  ```

- [ ] **Step 5: Add voice row to stack table**

  In the Stack table, after the Monitoring row, add:

  ```markdown
  | Voice assistants | Alexa via Home Assistant Cloud + Alexa Media Player |
  ```

## Task 2: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: spec sections for AGENTS.md.
- Produces: Updated `AGENTS.md`.

- [ ] **Step 1: Read current AGENTS.md**

  Read `//HOMEASSISTANT/config/AGENTS.md` to confirm exact insertion points.

- [ ] **Step 2: Add alexa_media to repository layout**

  In the `custom_components/` list, after `pagerduty`, add:

  ```markdown
  │   ├── alexa_media/            # Alexa Media Player (HACS)
  ```

- [ ] **Step 3: Add alexa_media custom integration subsection**

  After the `pagerduty` subsection, add:

  ```markdown
  ### `alexa_media`

  - **Purpose**: Alexa Media Player integration (HACS-installed). Enables announcements and TTS on Amazon Echo/Fire TV devices.
  - **Version**: `5.15.7`.
  - **Platforms**: media_player, sensor, switch, alarm_control_panel, binary_sensor, light.
  - **Key usage for agents**: Echo announcements use `notify.alexa_media_<device_name>` with `data: {type: announce}`. Fire TV devices do not reliably support `type: announce`; use Echo devices for spoken announcements.
  ```

- [ ] **Step 4: Add Alexa Media Player prefixes to entity inventory**

  In the Device / Entity Inventory section, after the Media players bullet, add:

  ```markdown
  - **Alexa Media Player devices**: `media_player.master_bedroom_echo_dot`, `media_player.everywhere`, `media_player.travis_s_fire_tv`, `media_player.office_fire`, etc.
  ```

- [ ] **Step 5: Add future-agent note about Alexa announcements**

  In the Notes for Future Agents section, after the dashboard note, add:

  ```markdown
  - For Alexa announcements, use per-device `notify.alexa_media_<entity>` services with `data: {type: announce}`. The `media_player.everywhere` group and Fire TV devices are unreliable for announcements; prefer individual Echo devices.
  ```

## Self-Review

1. **Spec coverage:** README and AGENTS updates all map to spec sections.
2. **Placeholder scan:** No TBD/TODO/"implement later"/"similar to" placeholders remain.
3. **Type consistency:** Markdown formatting matches surrounding content.
