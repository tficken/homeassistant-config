# AI Dashboard Home Screen Security Alerts Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add door/motion event alerts and door last-activity timestamps to the AI dashboard Home screen.

**Architecture:** Extend `www/ai-dashboard/config.json` with new security entities and a `lastActivity` map on the Doors section; update `www/ai-dashboard/index.html` with a `relativeTime()` helper, extend `getAlerts()` for events/activity sensors, and extend `renderDoors()` to show relative timestamps.

**Tech Stack:** Static HTML/JS dashboard, Home Assistant WebSocket API, JSON configuration.

## Global Constraints

- Do not modify other dashboard screens (Control Hub, Security, Status) or the dock.
- Keep sensitive values in `secrets.yaml`; this dashboard uses the proxy's server-side auth, so no tokens are stored in these files.
- Validate JSON and HTML before considering a task complete.
- Hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) to verify changes after editing.

## File Structure

| File | Responsibility |
|------|----------------|
| `www/ai-dashboard/config.json` | Entity-to-section mapping, including the new `lastActivity` map. |
| `www/ai-dashboard/index.html` | Dashboard UI, `DEFAULT_CONFIG`, `relativeTime()`, `getAlerts()`, `renderDoors()`. |

---

### Task 1: Update `www/ai-dashboard/config.json`

**Files:**
- Modify: `www/ai-dashboard/config.json`
- Test: `python -m json.tool www/ai-dashboard/config.json`

**Interfaces:**
- Consumes: none
- Produces: updated `sections.security.entities` and `sections.doors.lastActivity`.

- [ ] **Step 1: Add event and last-activity entities to `sections.security.entities`**

Update the list to:

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

- [ ] **Step 2: Add `lastActivity` map to `sections.doors`**

Update `sections.doors` to:

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

- [ ] **Step 3: Validate JSON syntax**

Run:

```bash
python -m json.tool www/ai-dashboard/config.json > /dev/null
```

Expected: no output and exit code 0.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/config.json
git commit -m "config(ai-dashboard): add security events and door last-activity mapping"
```

---

### Task 2: Update `www/ai-dashboard/index.html`

**Files:**
- Modify: `www/ai-dashboard/index.html`
- Test: `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`

**Interfaces:**
- Consumes: `config.sections.security.entities`, `config.sections.doors.lastActivity`, `states[entityId]`.
- Produces: `relativeTime(isoString)`, updated `getAlerts()`, updated `renderDoors()`.

- [ ] **Step 1: Update `DEFAULT_CONFIG`**

Mirror the config.json changes inside the `const DEFAULT_CONFIG = { ... }` block:

- Update `sections.security.entities` to the same 11 entities listed in Task 1.
- Update `sections.doors` to include the `lastActivity` map.

- [ ] **Step 2: Add `relativeTime()` helper**

Insert near the other formatting helpers (after `formatTemp` is a good location):

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

- [ ] **Step 3: Extend `getAlerts()`**

Find the existing security loop in `getAlerts()`:

```javascript
for (const id of sec) {
  const state = states[id];
  if (!state) continue;
  const domain = id.split(".")[0];
  const deviceClass = state.attributes && state.attributes.device_class;
  if (domain === "binary_sensor" && deviceClass === "motion" && isActive(state.state)) {
    alerts.push(`${friendlyName(id)} detected`);
  }
  if (domain === "siren" && isActive(state.state)) {
    alerts.push(`${friendlyName(id)} active`);
  }
  if (domain === "sensor" && deviceClass === "battery") {
    const val = parseFloat(state.state);
    if (!isNaN(val) && val < 20) alerts.push(`${friendlyName(id)} low`);
  }
}
```

Replace it with:

```javascript
for (const id of sec) {
  const state = states[id];
  if (!state) continue;
  const domain = id.split(".")[0];
  const deviceClass = state.attributes && state.attributes.device_class;
  if (domain === "binary_sensor" && deviceClass === "motion" && isActive(state.state)) {
    alerts.push(`${friendlyName(id)} detected`);
  }
  if (domain === "siren" && isActive(state.state)) {
    alerts.push(`${friendlyName(id)} active`);
  }
  if (domain === "sensor" && deviceClass === "battery") {
    const val = parseFloat(state.state);
    if (!isNaN(val) && val < 20) alerts.push(`${friendlyName(id)} low`);
  }
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

- [ ] **Step 4: Extend `renderDoors()`**

Find the existing `renderDoors()` function:

```javascript
function renderDoors() {
  const doorIds = (config.sections && config.sections.doors && config.sections.doors.entities) || [];
  if (!doorIds.length) return "<div style='color:var(--text-muted);font-family:var(--font-mono);'>NO DOOR DATA</div>";

  const cards = doorIds.map(id => {
    const state = states[id];
    const offline = isUnavailable(state);
    const open = state && String(state.state).toLowerCase() === "on";
    const label = friendlyName(id);
    const statusText = offline ? "OFFLINE" : (open ? "OPEN" : "CLOSED");
    const statusColor = offline ? "var(--text-muted)" : (open ? "var(--danger)" : "var(--green)");
    const ledState = offline ? "off" : (open ? "danger" : "on");
    return `
      <div class="terminal-panel" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;" data-entity-id="${id}">
        <div style="display:flex;align-items:center;gap:10px;">
          ${renderStatusLed(ledState)}
          <span style="font-family:var(--font-mono);font-size:1rem;color:var(--text);">${escapeHtml(label)}</span>
        </div>
        <span style="font-family:var(--font-mono);font-size:1.1rem;color:${statusColor};">${statusText}</span>
      </div>`;
  }).join("");

  return `<div style="display:grid;grid-template-columns:1fr;gap:10px;">${cards}</div>`;
}
```

Replace it with:

```javascript
function renderDoors() {
  const doorIds = (config.sections && config.sections.doors && config.sections.doors.entities) || [];
  if (!doorIds.length) return "<div style='color:var(--text-muted);font-family:var(--font-mono);'>NO DOOR DATA</div>";

  const lastActivityMap = (config.sections && config.sections.doors && config.sections.doors.lastActivity) || {};

  const cards = doorIds.map(id => {
    const state = states[id];
    const offline = isUnavailable(state);
    const open = state && String(state.state).toLowerCase() === "on";
    const label = friendlyName(id);
    const statusText = offline ? "OFFLINE" : (open ? "OPEN" : "CLOSED");
    const statusColor = offline ? "var(--text-muted)" : (open ? "var(--danger)" : "var(--green)");
    const ledState = offline ? "off" : (open ? "danger" : "on");

    const lastActivityId = lastActivityMap[id];
    const lastActivityState = lastActivityId && states[lastActivityId];
    const lastActivity = lastActivityState && !isUnavailable(lastActivityState)
      ? relativeTime(lastActivityState.state)
      : "";

    return `
      <div class="terminal-panel" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;" data-entity-id="${id}">
        <div style="display:flex;align-items:center;gap:10px;">
          ${renderStatusLed(ledState)}
          <div>
            <div style="font-family:var(--font-mono);font-size:1rem;color:var(--text);">${escapeHtml(label)}</div>
            ${lastActivity ? `<div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(lastActivity)}</div>` : ""}
          </div>
        </div>
        <span style="font-family:var(--font-mono);font-size:1.1rem;color:${statusColor};">${statusText}</span>
      </div>`;
  }).join("");

  return `<div style="display:grid;grid-template-columns:1fr;gap:10px;">${cards}</div>`;
}
```

- [ ] **Step 5: Validate HTML**

Run:

```bash
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
```

Expected output: `HTML parse OK`

- [ ] **Step 6: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(ai-dashboard): add security event alerts and door last-activity timestamps"
```

---

### Task 3: Verify End-to-End

**Files:**
- Read-only: `www/ai-dashboard/config.json`, `www/ai-dashboard/index.html`
- Test: browser / Home Assistant dashboard

**Interfaces:**
- Consumes: final `config.json` and `index.html`
- Produces: confirmation that the dashboard renders correctly

- [ ] **Step 1: Re-run all syntax checks**

```bash
python -m json.tool www/ai-dashboard/config.json > /dev/null
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
```

- [ ] **Step 2: Confirm no broken entity references**

Run:

```bash
py - <<'PY'
import json
with open('.storage/core.entity_registry', encoding='utf-8') as f:
    registry = {e['entity_id'] for e in json.load(f)['data']['entities']}
with open('www/ai-dashboard/config.json', encoding='utf-8') as f:
    cfg = json.load(f)
used = set()
for v in cfg.get('entities', {}).values():
    if isinstance(v, str): used.add(v)
    elif isinstance(v, list): used.update(v)
for s in cfg.get('sections', {}).values():
    used.update(s.get('entities', []))
    used.update(s.get('lastActivity', {}).values())
missing = sorted(used - registry)
print('Missing entities:', len(missing))
for e in missing:
    print(' -', e)
PY
```

Expected: `Missing entities: 0`

- [ ] **Step 3: Browser smoke test**

1. Open the AI dashboard in a browser.
2. Hard-refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`).
3. Tap **HOME**.
4. Verify:
   - The Doors panel shows each door status with a relative timestamp below the door name (e.g., "5m ago").
   - Trigger or wait for a door/motion event.
   - The alert banner shows the event with a relative timestamp (e.g., "Front Door Ding · 1m ago").

- [ ] **Step 4: Commit any final fixes**

If browser testing required additional tweaks, commit them with a clear message.

---

## Self-Review

- **Spec coverage:**
  - Add event/activity entities to security section → Task 1, Step 1.
  - Add `lastActivity` map to doors section → Task 1, Step 2.
  - Update `DEFAULT_CONFIG` → Task 2, Step 1.
  - Add `relativeTime()` helper → Task 2, Step 2.
  - Extend `getAlerts()` → Task 2, Step 3.
  - Extend `renderDoors()` → Task 2, Step 4.
  - Validation → Task 3.
- **Placeholder scan:** No TBD/TODO/fill-in-details found.
- **Type consistency:** `relativeTime()` accepts a string and returns a string; `getAlerts()` and `renderDoors()` use it consistently.
