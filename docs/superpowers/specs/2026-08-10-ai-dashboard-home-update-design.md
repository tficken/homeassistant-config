# AI Dashboard Home Update Design

## Goal
Improve the home screen of the retro-green wall-mounted iPad dashboard so it shows a useful day-to-day weather forecast, clean presence status for the household, and a few visual polish items.

## Scope
Changes are limited to the AI dashboard web app (`www/ai-dashboard/index.html` and `www/ai-dashboard/config.json`). No Home Assistant configuration changes are required.

## Home Screen Changes

### 1. Weather Card Enhancements
- Keep the existing current-conditions display (icon, temperature, condition text, humidity).
- Add a detail line below the condition with:
  - Today’s high / low
  - Wind speed
- Add a 5-day forecast row under the current conditions.
  - Each day shows abbreviated weekday, emoji/icon, and high/low.
  - Days are taken from the daily forecast returned by Home Assistant.
- Data source:
  - Primary: HA `weather.get_forecasts` service (`type: "daily"`) called via POST to `/api/services/weather/get_forecasts`.
  - Fallback: `state.attributes.forecast` if the service is unavailable or the entity still exposes it.
  - Refresh on init and every 15 minutes.

### 2. Presence Section
- Display household members only, not duplicate device trackers.
- Final list:
  - `person.woteg` displayed as **Travis**
  - `person.bobbie` displayed as **Bobbie**
- Remove `device_tracker.traviss_iphone` from the presence list.
- Implement a display-name override map in `config.json` so device/tracker labels can be cleaned up without touching HA.
- Visual treatment:
  - Larger presence cards with user initials ("T", "B") in a circle/terminal box.
  - Green pulsing LED and "HOME" text when home, dim LED and "AWAY" text when away.
  - Cards arranged horizontally with equal widths.

### 3. Extra Polish
- Larger presence cards with initials (selected by user).
- Current weather high/low + wind (selected by user).
- Subtle "last updated" timestamp on the radar panel.

## Files to Modify
- `www/ai-dashboard/index.html`
  - Add forecast fetching (`apiCall` POST helper).
  - Add forecast rendering.
  - Update weather panel rendering with high/low/wind.
  - Update `getPresenceEntities()` to use the configured people list + overrides.
  - Update presence rendering to large initial cards.
  - Add radar last-updated timestamp.
- `www/ai-dashboard/config.json`
  - Add `presenceLabels` override map.
  - Update `sections.home.entities` to `["person.woteg", "person.bobbie", "weather.forecast_home"]`.

## Data/Entities
- `weather.forecast_home` — current conditions and forecast source.
- `person.woteg` — Travis.
- `person.bobbie` — Bobbie.

## Risks / Notes
- `weather.get_forecasts` requires the dashboard client to be authenticated. The existing token/localStorage auth path and the integration-proxy path must both work.
- If forecast service fails, the dashboard should silently fall back to attribute forecast or hide the forecast row.
