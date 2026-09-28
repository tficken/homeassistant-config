# Design: Weather Alerts for 68528

## Objective

Add National Weather Service (NWS) weather alerts for Lincoln, NE (ZIP 68528) to the AI dashboard's existing amber alert banner on the HOME screen. Alerts should be limited to warnings and watches; minor advisories should be ignored.

## Background

- The AI dashboard (`www/ai-dashboard/`) already displays an amber alert banner on the HOME screen driven by `config.alerts` rules.
- Current rules cover backup age, disk usage, and internet status.
- The dashboard already consumes `weather.forecast_home` for weather display, but that integration does not expose NWS alerts.
- The retired Lovelace dashboard used a `weather-forecast` card with `show_alerts: true`, but the active wall UI is the AI dashboard, so alerts must be surfaced there.

## What will be created or modified

### Create

- HACS-managed `nws_alerts` integration configuration (no repo-owned files; installed via HACS).
- Template sensor `sensor.nws_warnings_watches` in `configuration.yaml` to filter out advisories.

### Modify

- `www/ai-dashboard/config.json` — add one rule to the existing `alerts` array.

### Will NOT change

- No new automations or notifications (user requested dashboard banner only).
- No changes to the AI dashboard proxy Python code.
- No changes to the existing weather entity or weather display.

## Data source

Use the [`nws_alerts`](https://github.com/finity69x2/nws_alerts) custom integration by finity69x2, available through HACS.

- It polls the NWS API (`api.weather.gov/alerts/active`) once per minute.
- For the Lincoln area, configure it with NWS forecast zone **`NEZ066`** (Lancaster County) or the home GPS location.
- It creates a sensor whose entity ID reflects the chosen location (e.g. `sensor.nws_alerts_gps_40_8141_96_7503_nws_alerts_alerts` for the home GPS location) whose state is the count of active alerts and whose attributes include a list of alert details.

## Severity filtering

The `nws_alerts` integration returns all active alerts for the zone, including advisories, statements, and emergencies. To honor the "warnings + watches only" requirement, add a Template sensor that counts only alerts whose `Event` ends with `Warning` or `Watch`.

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

The integration exposes the alert list in the capitalized `Alerts` attribute, and each alert uses a capitalized `Event` key; the entity ID depends on the selected location mode (zone or GPS).

## AI dashboard banner rule

Add to `www/ai-dashboard/config.json` under the existing `alerts` array:

```json
{
  "entity": "sensor.nws_warnings_watches",
  "above": 0,
  "label": "Weather alert: {state} active"
}
```

The dashboard's `getAlerts()` function evaluates this rule and displays it in the amber banner at the top of the HOME screen. `{state}` is interpolated with the current sensor state.

## Testing and validation

1. Install `nws_alerts` via HACS and restart Home Assistant.
2. Configure the integration with zone `NEZ066` through the UI.
3. Verify the NWS Alerts sensor appears in Developer Tools → States and has a capitalized `Alerts` attribute.
4. Verify `sensor.nws_warnings_watches` computes the expected count.
5. If no alerts are active locally, temporarily reconfigure the integration to a zone with active alerts (from `https://api.weather.gov/alerts/active/count`) to confirm the banner renders.
6. Validate `www/ai-dashboard/config.json` syntax:
   ```bash
   python -m json.tool www/ai-dashboard/config.json > /dev/null
   ```
7. Validate Home Assistant YAML:
   ```bash
   python scripts/validate_ha_yaml.py
   ```

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| `nws_alerts` not available in HACS | Add the GitHub repository as a custom HACS repository. The integration is widely used and documented. |
| Template sensor attribute path differs from assumption | Verify against the live sensor before committing the template; adjust the Jinja filter chain as needed. |
| Banner shows count instead of alert text | This matches the existing dashboard alert model. A future enhancement could display alert titles by extending `getAlerts()` to read sensor attributes. |
| Integration fails to load | Check Home Assistant logs; ensure HACS is functional and the zone code `NEZ066` is valid. |

## Implementation steps

1. Install `nws_alerts` via HACS.
2. Restart Home Assistant.
3. Configure the integration (zone `NEZ066`) through Settings → Devices & Services.
4. Add the Template sensor block to `configuration.yaml`.
5. Add the alert rule to `www/ai-dashboard/config.json`.
6. Validate YAML and JSON syntax.
7. Restart Home Assistant to load the Template sensor.
8. Verify the sensor states and banner behavior.
