# AI Dashboard Home Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5-day weather forecast, clean up the presence list (Travis + Bobbie, no duplicate iPhone), and apply the selected visual polish to the AI dashboard home screen.

**Architecture:** The dashboard is a single-page web app served from `www/ai-dashboard/index.html` with a JSON config in `www/ai-dashboard/config.json`. We will extend the existing renderer functions, add a small forecast fetcher that calls HA's `weather.get_forecasts` service, and use a display-name override map in the config to clean up presence labels.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Home Assistant REST/WebSocket API.

## Global Constraints
- Keep the existing retro-green CRT visual theme (Share Tech Mono, green `#14fe17`, scanlines, terminal panels).
- No Home Assistant configuration changes; only dashboard files are modified.
- Fallback gracefully if forecast service is unavailable.
- Preserve existing settings import/export behavior.

---

### Task 1: Update dashboard config

**Files:**
- Modify: `www/ai-dashboard/config.json`

**Interfaces:**
- Adds `presenceLabels` map keyed by entity_id.
- Updates `sections.home.entities` to use `person.woteg`, `person.bobbie`, and `weather.forecast_home`.

- [ ] **Step 1: Edit `config.json`**

Update `sections.home.entities`:
```json
"home": {
  "title": "Home",
  "icon": "🏠",
  "entities": [
    "person.woteg",
    "person.bobbie",
    "weather.forecast_home"
  ]
}
```

Add at the top level:
```json
"presenceLabels": {
  "person.woteg": "Travis",
  "person.bobbie": "Bobbie"
}
```

- [ ] **Step 2: Validate JSON**

Run:
```bash
NODE_PATH=/root/.tools/node_modules node -e "const YAML = require('yaml'); JSON.parse(require('fs').readFileSync('/root/config/www/ai-dashboard/config.json', 'utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add www/ai-dashboard/config.json
git commit -m "config(dashboard): clean presence list and add display labels"
```

---

### Task 2: Add forecast data fetcher

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces:**
- Adds global `forecastCache = { daily: [], fetchedAt: null }`.
- Adds `async function refreshForecast()` that returns nothing but populates `forecastCache`.
- Adds `async function apiCall(method, path, body)` helper for POST requests.

- [ ] **Step 1: Add `apiCall` helper after `apiFetch`**

```javascript
async function apiCall(method, path, body) {
  const headers = token ? { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  try {
    const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error("apiCall failed", method, path, e);
    return null;
  }
}
```

- [ ] **Step 2: Add forecast state and fetcher after `haConfig` declaration**

```javascript
let forecastCache = { daily: [], fetchedAt: null };

async function refreshForecast() {
  const weatherId = config.entities.weather || "weather.forecast_home";
  const state = states[weatherId];
  // Fallback 1: entity attribute
  if (state && state.attributes && Array.isArray(state.attributes.forecast)) {
    forecastCache.daily = state.attributes.forecast.slice(0, 5);
    forecastCache.fetchedAt = Date.now();
    return;
  }
  // Primary: HA service call
  const res = await apiCall("POST", "/api/services/weather/get_forecasts", {
    entity_id: weatherId,
    type: "daily"
  });
  if (res && Array.isArray(res)) {
    const entry = res.find(r => r.entity_id === weatherId);
    if (entry && entry.forecast && Array.isArray(entry.forecast.forecast)) {
      forecastCache.daily = entry.forecast.forecast.slice(0, 5);
      forecastCache.fetchedAt = Date.now();
      return;
    }
  }
  forecastCache.daily = [];
}
```

- [ ] **Step 3: Call `refreshForecast()` before first `renderHomeScreen()`**

In `connectProxy` and `connect` `onmessage` after states are loaded and before `renderAll()`, add:
```javascript
await refreshForecast();
```

- [ ] **Step 4: Set a 15-minute refresh timer**

In `init()` after `showScreen("home")`, add:
```javascript
setInterval(refreshForecast, 15 * 60 * 1000);
```

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(dashboard): fetch daily weather forecast"
```

---

### Task 3: Update weather panel with high/low, wind, and 5-day forecast

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces:**
- Updates `renderHomeScreen()` to build an expanded weather panel.
- Adds helper `formatTemp(value)` returning `"--"` for missing values.

- [ ] **Step 1: Add a small temp formatter**

```javascript
function formatTemp(v) {
  if (v == null || v === "unknown" || v === "unavailable") return "--";
  return `${Math.round(v)}°`;
}
```

- [ ] **Step 2: Replace the WEATHER panel body in `renderHomeScreen()`**

Current weather panel body is inline. Replace it with:
```javascript
const weatherAttr = weather ? weather.attributes || {} : {};
const high = formatTemp(weatherAttr.temperature);
const low = formatTemp(weatherAttr.templow);
const wind = weatherAttr.wind_speed != null ? `${Math.round(weatherAttr.wind_speed)} ${weatherAttr.wind_speed_unit || ""}`.trim() : "--";

const forecastHtml = forecastCache.daily.length
  ? `<div style="display:flex;gap:10px;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
      ${forecastCache.daily.map(day => {
        const date = day.datetime ? new Date(day.datetime) : null;
        const dayName = date ? date.toLocaleDateString([], { weekday: "short" }).toUpperCase() : "--";
        const icon = weatherIcon(day.condition);
        const maxT = formatTemp(day.temperature);
        const minT = formatTemp(day.templow);
        return `<div style="text-align:center;flex:1;">
          <div style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono);">${dayName}</div>
          <div style="font-size:1.4rem;margin:4px 0;">${icon}</div>
          <div style="font-size:0.85rem;color:var(--green);font-family:var(--font-mono);">${maxT}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);">${minT}</div>
        </div>`;
      }).join("")}
    </div>`
  : "";

const weatherPanel = renderTerminalPanel("WEATHER", `
  <div style="display:flex;align-items:center;gap:14px;">
    <div style="font-size:2.5rem;">${icon}</div>
    <div>
      <div style="font-size:1.8rem;color:var(--green);">${temp}</div>
      <div style="color:var(--text-muted);font-family:var(--font-mono);">${escapeHtml(condition)} · HUM ${humidity}</div>
      <div style="color:var(--text-muted);font-family:var(--font-mono);font-size:0.8rem;margin-top:2px;">HI ${high} · LO ${low} · WIND ${wind}</div>
    </div>
  </div>
  ${forecastHtml}
`);
```

- [ ] **Step 3: Use `weatherPanel` in `leftCol`**

Replace the inline `renderTerminalPanel("WEATHER", ...)` with `weatherPanel`.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(dashboard): render 5-day forecast and weather details"
```

---

### Task 4: Redesign presence cards with initials

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces:**
- `getPresenceEntities()` still returns person/device_tracker IDs from `config.sections.home.entities`.
- Adds `presenceLabel(entityId)` that uses `config.presenceLabels` then falls back to friendly name.
- Updates presence rendering in `renderHomeScreen()`.

- [ ] **Step 1: Add `presenceLabel` helper after `friendlyName`**

```javascript
function presenceLabel(entityId) {
  if (config.presenceLabels && config.presenceLabels[entityId]) return config.presenceLabels[entityId];
  return friendlyName(entityId);
}
```

- [ ] **Step 2: Update `getPresenceEntities()` to only include people/device trackers**

The current filter is already correct:
```javascript
return homeSection.filter(id => {
  const domain = id.split(".")[0];
  return domain === "person" || domain === "device_tracker";
});
```

No change needed.

- [ ] **Step 3: Replace the presence block in `renderHomeScreen()`**

```javascript
const presence = getPresenceEntities().map(id => {
  const state = states[id];
  const home = state ? isActive(state.state) : false;
  const label = presenceLabel(id);
  const initial = label.charAt(0).toUpperCase();
  return `
    <div style="flex:1;min-width:120px;max-width:180px;" data-entity-id="${id}">
      <div class="terminal-panel" style="display:flex;align-items:center;gap:14px;padding:14px;">
        <div style="width:48px;height:48px;border-radius:50%;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:1.6rem;color:var(--green);box-shadow:0 0 12px rgba(20,254,23,0.15);">${initial}</div>
        <div style="flex:1;">
          <div style="font-family:var(--font-mono);font-size:1.1rem;color:var(--text);">${escapeHtml(label)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
            ${renderStatusLed(home ? "home" : "off")}
            <span style="font-family:var(--font-mono);font-size:0.85rem;color:${home ? 'var(--green)' : 'var(--text-muted)'};">${home ? "HOME" : "AWAY"}</span>
          </div>
        </div>
      </div>
    </div>`;
}).join("");
```

- [ ] **Step 4: Update the PRESENCE panel wrapper**

Change:
```html
<div>${renderTerminalPanel("PRESENCE", `<div style="display:flex;gap:24px;flex-wrap:wrap;">${presence}</div>`)}</div>
```
to remove the outer terminal panel (each card is already a terminal panel):
```html
<div><div style="display:flex;gap:14px;flex-wrap:wrap;">${presence}</div></div>
```

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(dashboard): large initial-based presence cards"
```

---

### Task 5: Add radar last-updated timestamp

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces:**
- `initRadarMap()` already creates a `.radar-timestamp` element. Update its text to include "RADAR UPDATED: <time>" and refresh when the loop cycles.

- [ ] **Step 1: Update timestamp text in `initRadarMap()`**

Replace:
```javascript
timestamp.textContent = new Date(useFrames[idx].time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
```
with:
```javascript
timestamp.textContent = "RADAR UPDATED " + new Date(useFrames[idx].time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
```

Do the same inside the `setInterval` callback.

- [ ] **Step 2: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(dashboard): show radar last-updated timestamp"
```

---

### Task 6: Verify and push

**Files:**
- None (manual verification)

- [ ] **Step 1: Validate HTML/JSON syntax**

Run:
```bash
NODE_PATH=/root/.tools/node_modules node -e "const YAML = require('yaml'); JSON.parse(require('fs').readFileSync('/root/config/www/ai-dashboard/config.json', 'utf8')); console.log('config.json valid')"
```

- [ ] **Step 2: Reload Lovelace dashboards / refresh the dashboard page**

Open `http://homeassistant.local:8123/local/ai-dashboard/` in a browser and hard-refresh. Confirm:
- Weather panel shows HI/LO/WIND and a 5-day forecast row.
- Presence shows two large cards: **Travis** and **Bobbie**.
- Travis’s iPhone no longer appears.
- Radar timestamp reads "RADAR UPDATED <time>".

- [ ] **Step 3: Push to GitHub**

```bash
git push origin master
```

---

## Self-Review

- **Spec coverage:**
  - 5-day forecast → Task 2 + Task 3.
  - Current high/low + wind → Task 3.
  - Presence: Travis + Bobbie, no iPhone duplicate → Task 1 + Task 4.
  - Large presence cards with initials → Task 4.
  - Radar last-updated timestamp → Task 5.
- **Placeholder scan:** No TBD/TODO; all code snippets include concrete values.
- **Type consistency:** `forecastCache.daily` is always an array; `presenceLabel` falls back to `friendlyName`; `formatTemp` returns strings.
