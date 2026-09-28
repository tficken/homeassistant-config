# Weather Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NWS weather alerts for Lincoln, NE (68528) to the AI dashboard's HOME screen amber banner, filtered to warnings and watches only.

**Architecture:** The [`nws_alerts`](https://github.com/finity69x2/nws_alerts) HACS integration polls the NWS API for the Lincoln area (zone `NEZ066` or home GPS location) and exposes an alerts sensor. A Template sensor filters the alert list to events ending in `Warning` or `Watch`. The AI dashboard's existing `config.alerts` system then displays the count in its amber banner when the filtered count is greater than zero.

**Tech Stack:** Home Assistant YAML, HACS, Jinja2 templates, JSON dashboard config.

**Spec:** `docs/superpowers/specs/2026-09-15-weather-alerts-design.md`

## Global Constraints

- No new Python code or custom integration changes.
- No new automations or notifications; dashboard banner only.
- No changes to the AI dashboard proxy (`custom_components/ai_dashboard_proxy/`).
- No changes to the existing `weather.forecast_home` entity or weather display.
- HACS-managed integration files live in `custom_components/nws_alerts/` and are excluded from git (already covered by `.gitignore`).
- All repo-owned file edits must pass `python scripts/validate_ha_yaml.py` and `python -m json.tool www/ai-dashboard/config.json`.

---

### Task 1: Install the `nws_alerts` integration

**Files:**
- None (HACS installs into the git-ignored `custom_components/nws_alerts/` directory).

**Interfaces:**
- Produces: an NWS Alerts sensor (entity ID depends on the selected location mode) with a capitalized `Alerts` attribute containing active NWS alerts for the Lincoln area.

- [ ] **Step 1: Open HACS in Home Assistant**

  Navigate to **Settings > Devices & Services > HACS** (or the HACS sidebar item).

- [ ] **Step 2: Search for and install `NWS Alerts`**

  In HACS **Integrations**, search for `NWS Alerts` by finity69x2 and click **Download**. If it is not listed, add the custom repository `https://github.com/finity69x2/nws_alerts` with category **Integration**, then install.

- [ ] **Step 3: Restart Home Assistant**

  After the download completes, restart Home Assistant so the integration platform is loaded.

- [ ] **Step 4: Configure the integration for zone NEZ066**

  Go to **Settings > Devices & Services > Add Integration**. Search for `NWS Alerts` and select **Use a Zone ID** (enter `NEZ066` for Lancaster County / Lincoln, NE) or **Use GPS Location** (home coordinates). Complete the config flow. Note the exact entity ID that is created for the next step.

- [ ] **Step 5: Verify the sensor exists**

  Open **Developer Tools > States** and confirm the NWS Alerts sensor is present. Inspect its attributes and note the exact keys used for the alert list (expected: capitalized `Alerts`) and each alert's event name (expected: capitalized `Event`).

---

### Task 2: Add the warnings-and-watches Template sensor

**Files:**
- Modify: `configuration.yaml`

**Interfaces:**
- Consumes: the NWS Alerts sensor attributes (`Alerts`, `Event`).
- Produces: `sensor.nws_warnings_watches` whose state is the count of active warnings and watches.

- [ ] **Step 1: Add the Template sensor block**

  Append to `configuration.yaml`, using the exact entity ID and attribute names observed in Task 1:

  ```yaml
  template:
    - sensor:
        - name: "NWS warnings watches"
          unique_id: nws_warnings_watches
          state: >
            {{ state_attr('sensor.nws_alerts_gps_40_8141_96_7503_nws_alerts_alerts', 'Alerts')
               | default([])
               | selectattr('Event', 'search', '(Warning|Watch)$')
               | list | length }}
          availability: >
            {{ state_attr('sensor.nws_alerts_gps_40_8141_96_7503_nws_alerts_alerts', 'Alerts') is not none }}
  ```

  If the attribute inspection from Task 1 used different entity IDs or keys, adjust the template accordingly before saving.

- [ ] **Step 2: Validate the YAML**

  Run:
  ```bash
  python scripts/validate_ha_yaml.py
  ```
  Expected: no errors.

- [ ] **Step 3: Restart Home Assistant**

  Restart so the Template sensor is created. Then check **Developer Tools > States** for `sensor.nws_warnings_watches` and confirm its value matches the number of active warnings/watches. If the sensor stays `unavailable`, verify the source entity ID and the capitalized `Alerts`/`Event` keys.

---

### Task 3: Add the dashboard alert rule

**Files:**
- Modify: `www/ai-dashboard/config.json`

**Interfaces:**
- Consumes: `sensor.nws_warnings_watches` state.
- Produces: AI dashboard alert banner entry.

- [ ] **Step 1: Add the rule to the alerts array**

  Edit `www/ai-dashboard/config.json` and insert this object into the existing `alerts` array (e.g., after the `binary_sensor.exos_router_wan_status` rule):

  ```json
  {
    "entity": "sensor.nws_warnings_watches",
    "above": 0,
    "label": "Weather alert: {state} active"
  }
  ```

- [ ] **Step 2: Validate the JSON**

  Run:
  ```bash
  python -m json.tool www/ai-dashboard/config.json > /dev/null
  ```
  Expected: no output (success).

- [ ] **Step 3: Hard-refresh the dashboard**

  On the wall tablet or browser viewing `/ai-dashboard/`, hard-refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`) so the updated `config.json` is loaded.

---

### Task 4: End-to-end verification

**Files:**
- None.

- [ ] **Step 1: Confirm normal state**

  With no active warnings/watches for Lincoln, the alert banner should not display the weather alert.

- [ ] **Step 2: Test with an active alert zone (optional)**

  If Lincoln has no active alerts, temporarily reconfigure the `nws_alerts` integration to a zone known to have active warnings or watches. Find one at `https://api.weather.gov/alerts/active/count`. After reconfiguration, update the Template sensor to reference the new entity ID if it changes, confirm `sensor.nws_warnings_watches` rises above zero, and the AI dashboard banner shows `Weather alert: N active`.

- [ ] **Step 3: Revert test configuration (if changed)**

  If you used a test zone in Step 2, reconfigure the integration back to `NEZ066`.

- [ ] **Step 4: Confirm no HA log errors**

  Check **Settings > System > Logs** for errors related to `nws_alerts`, `template`, or `nws_warnings_watches`.

---

## Self-review checklist

- [x] Spec coverage: integration install, zone config, template filter, dashboard rule, validation, and testing are all represented.
- [x] Placeholder scan: no TBD, TODO, or vague steps.
- [x] Type consistency: NWS Alerts sensor attributes (`Alerts`, `Event`) and `sensor.nws_warnings_watches` naming match across tasks.
