# AI Dashboard Home Screen Security Alerts Enhancement

## Background

The AI dashboard's Home screen already shows an alert banner for active motion, sirens, low batteries, and available updates. The Home screen also has a Doors panel that shows only OPEN/CLOSED status. Several security-related entities are not being used.

## Problem

- Doorbell ding and motion `event.*` entities are not surfaced on the Home screen.
- Door last-activity timestamps (`sensor.front_door_last_activity`, `sensor.downstairs_last_activity`) are not shown.
- The Doors panel gives no indication of when each door last changed state.

## Goal

Enhance the Home screen security alerts by showing recent door/motion events in the alert banner and by adding last-activity timestamps to the Doors panel.

## Approach

Approach 1 from brainstorming: extend `config.json` with the new security entities and a `lastActivity` map on the Doors section, then update `index.html` to:

1. Add a `relativeTime()` helper for human-readable timestamps.
2. Extend `getAlerts()` to include recent `event.*` and `sensor.*_last_activity` alerts.
3. Extend `renderDoors()` to look up and display a last-activity timestamp under each door.

## Detailed Changes

### `www/ai-dashboard/config.json`

#### `sections.security.entities`

Append these entities to the existing security list:

```json
[
  "event.front_door_ding",
  "event.front_door_motion",
  "event.downstairs_motion",
  "sensor.front_door_last_activity",
  "sensor.downstairs_last_activity"
]
```

The full list becomes:

```json
[
  "switch.front_door_motion_detection",
  "switch.downstairs_motion_detection",
  "sensor.front_door_battery",
  "sensor.downstairs_battery",
  "siren.downstairs_siren",
  "siren.downstairs_siren_2",
  "event.front_door_ding",
  "event.front_door_motion",
  "event.downstairs_motion",
  "sensor.front_door_last_activity",
  "sensor.downstairs_last_activity"
]
```

#### `sections.doors`

Add a `lastActivity` mapping:

```json
"doors": {
  "title": "Doors",
  "icon": "🚪",
  "entities": [
    "binary_sensor.living_room_front_door",
    "binary_sensor.backdoor"
  ],
  "lastActivity": {
    "binary_sensor.living_room_front_door": "sensor.front_door_last_activity",
    "binary_sensor.backdoor": "sensor.downstairs_last_activity"
  }
}
```

### `www/ai-dashboard/index.html`

#### `DEFAULT_CONFIG`

Mirror the config.json changes in the embedded `DEFAULT_CONFIG` object.

#### New helper: `relativeTime(isoString)`

Add near the other formatting helpers:

```javascript
function relativeTime(isoString) {
  if (!isoString || isoString === "unknown" || isoString === "unavailable") return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

#### `getAlerts()`

After the existing security loop, add handling for `event.*` and `sensor.*_last_activity`:

```javascript
for (const id of sec) {
  const state = states[id];
  if (!state) continue;
  const domain = id.split(".")[0];

  // Existing motion/siren/battery checks remain here.

  if (domain === "event" && !isUnavailable(state)) {
    const label = friendlyName(id);
    const when = relativeTime(state.state);
    alerts.push(when ? `${label} · ${when}` : label);
  }

  if (domain === "sensor" && id.includes("last_activity") && !isUnavailable(state)) {
    const label = friendlyName(id);
    const when = relativeTime(state.state);
    if (when) alerts.push(`${label} · ${when}`);
  }
}
```

Keep the existing system/update loop unchanged.

#### `renderDoors()`

For each door ID, look up `config.sections.doors.lastActivity[doorId]`. If a matching sensor exists and has a valid timestamp, render it below the status text:

```javascript
const lastActivityId = (config.sections.doors.lastActivity || {})[id];
const lastActivityState = lastActivityId && states[lastActivityId];
const lastActivity = lastActivityState && !isUnavailable(lastActivityState)
  ? relativeTime(lastActivityState.state)
  : "";
```

Display `lastActivity` under the OPEN/CLOSED status in a smaller, muted font.

## Validation

- `python -m json.tool www/ai-dashboard/config.json`
- `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
- Confirm no dashboard entity references are missing from the registry.
- Browser smoke test:
  - Hard-refresh `/ai-dashboard/`.
  - Trigger or wait for a door/motion event.
  - Confirm the alert banner shows the event with a relative timestamp.
  - Confirm the Doors panel shows "OPEN/CLOSED" with a "X ago" line below it.

## Out of Scope

- Adding presence/mobile-status/network/sun/backup panels to the Home screen.
- Changing the Control Hub, Security, or Status screens.
- Styling changes beyond the last-activity timestamp display.
