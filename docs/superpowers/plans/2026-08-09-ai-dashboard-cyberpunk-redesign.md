# AI Dashboard Cyberpunk Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `www/ai-dashboard/index.html` as a dark, Fallout-style green terminal dashboard for a horizontal wall-mounted iPad, with a glance-and-go Home Screen, a Control Hub, and a Status Monitor.

**Architecture:** Keep the existing single-file HTML/CSS/JS structure and WebSocket connection logic. Add a small Python validation harness (`scripts/test_ai_dashboard.py`) that checks the generated `index.html` for required CSS, JS functions, and screen structure. Implement the UI as a set of pure JS render functions that return HTML strings, plus CSS for the CRT terminal aesthetic.

**Tech Stack:** Vanilla HTML/CSS/JS, Python 3 stdlib for validation, Home Assistant WebSocket API, RainViewer iframe for radar.

## Global Constraints

- Single self-contained `www/ai-dashboard/index.html` file.
- Reuse existing WebSocket connection (`/ai-dashboard/ws` proxy or `/api/websocket` direct).
- Reuse existing `www/ai-dashboard/config.json` entity/section configuration.
- Large touch targets for wall-mounted iPad use.
- No new Home Assistant integration or YAML changes.
- Backup existing `index.html` before overwrite.

---

## File Structure

- `www/ai-dashboard/index.html` — redesigned dashboard markup, styles, and logic.
- `www/ai-dashboard/config.json` — updated if new sections/layout keys are needed.
- `scripts/test_ai_dashboard.py` — Python validation harness for the dashboard.
- `docs/superpowers/plans/2026-08-09-ai-dashboard-cyberpunk-redesign.md` — this plan.

---

### Task 1: CSS Foundation — CRT Terminal Theme

**Files:**
- Modify: `www/ai-dashboard/index.html` (replace existing CSS)
- Create: `scripts/test_ai_dashboard.py`
- Test: `python3 scripts/test_ai_dashboard.py`

**Interfaces:**
- Produces: CSS custom properties (`--bg`, `--green`, `--green-dim`, `--text`, `--text-muted`, `--amber`, `--danger`), utility classes (`.terminal-panel`, `.scanlines`, `.vignette`, `.status-led`, `.bottom-btn`), and base layout styles.

- [ ] **Step 1: Write the failing test**

```python
# scripts/test_ai_dashboard.py
import re
from pathlib import Path

INDEX = Path("www/ai-dashboard/index.html")

def read_index():
    assert INDEX.exists(), f"{INDEX} not found"
    return INDEX.read_text(encoding="utf-8")

def test_css_foundation():
    html = read_index()
    required = [
        "--bg:", "--green:", "--green-dim:", "--text:", "--text-muted:",
        ".terminal-panel", ".scanlines", ".vignette", ".status-led", ".bottom-btn"
    ]
    missing = [r for r in required if r not in html]
    assert not missing, f"Missing CSS foundation: {missing}"

if __name__ == "__main__":
    test_css_foundation()
    print("css foundation ok")
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: `AssertionError` because the old CSS does not contain these tokens.

- [ ] **Step 3: Implement the CSS foundation**

Replace the existing `<style>` block in `www/ai-dashboard/index.html` with the CRT terminal CSS:

```css
:root {
  --bg: #030503;
  --bg-glow: #0a140a;
  --green: #14fe17;
  --green-dim: #1a4a1a;
  --green-hover: #2d7a2d;
  --text: #e8ffe8;
  --text-muted: #5a7a5a;
  --amber: #ffae00;
  --danger: #ff3333;
  --panel-bg: rgba(10, 20, 10, 0.85);
  --border: rgba(20, 254, 23, 0.25);
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; width: 100%; height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
body {
  position: relative;
}
#app {
  position: fixed; inset: 0; z-index: 1;
  display: flex; flex-direction: column;
  padding: 18px;
  gap: 16px;
}
.scanlines {
  position: fixed; inset: 0; z-index: 1000; pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0,0,0,0) 0px,
    rgba(0,0,0,0) 2px,
    rgba(0,20,0,0.10) 2px,
    rgba(0,20,0,0.10) 4px
  );
}
.vignette {
  position: fixed; inset: 0; z-index: 999; pointer-events: none;
  background: radial-gradient(circle at center, transparent 55%, rgba(0,0,0,0.55) 100%);
}
.terminal-panel {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  position: relative;
  box-shadow: 0 0 18px rgba(20, 254, 23, 0.08);
}
.terminal-panel::before {
  content: "┌";
  position: absolute; top: -1px; left: 6px;
  color: var(--green); font-family: monospace; font-size: 0.9rem;
}
.terminal-panel::after {
  content: "┐";
  position: absolute; top: -1px; right: 6px;
  color: var(--green); font-family: monospace; font-size: 0.9rem;
}
.panel-title {
  font-family: "JetBrains Mono", "SF Mono", monospace;
  font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--green); padding: 10px 14px 6px;
  text-shadow: 0 0 8px rgba(20, 254, 23, 0.45);
}
.panel-body { padding: 10px 14px 14px; }
.status-led {
  width: 10px; height: 10px; border-radius: 50%; display: inline-block;
  background: var(--text-muted); box-shadow: 0 0 6px var(--text-muted);
}
.status-led.on { background: var(--green); box-shadow: 0 0 10px var(--green); }
.status-led.warn { background: var(--amber); box-shadow: 0 0 10px var(--amber); }
.status-led.danger { background: var(--danger); box-shadow: 0 0 10px var(--danger); }
.bottom-btn {
  flex: 1; display: flex; align-items: center; justify-content: center;
  background: rgba(20, 254, 23, 0.08); border: 1px solid var(--border);
  color: var(--green); font-family: "JetBrains Mono", monospace; font-size: 1.1rem;
  text-transform: uppercase; letter-spacing: 0.1em;
  padding: 18px; cursor: pointer; user-select: none;
  transition: background 0.15s, box-shadow 0.15s;
}
.bottom-btn:hover { background: rgba(20, 254, 23, 0.16); box-shadow: 0 0 18px rgba(20, 254, 23, 0.18); }
.bottom-btn:active { transform: scale(0.98); }
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: `css foundation ok`

- [ ] **Step 5: Commit**

```bash
git add scripts/test_ai_dashboard.py www/ai-dashboard/index.html
git commit -m "feat: add CRT terminal CSS foundation for ai-dashboard redesign"
```

---

### Task 2: Reusable Component Renderers

**Files:**
- Modify: `www/ai-dashboard/index.html` (add JS functions)
- Modify: `scripts/test_ai_dashboard.py` (add tests)
- Test: `python3 scripts/test_ai_dashboard.py`

**Interfaces:**
- Consumes: `states` global, entity IDs, config.
- Produces: JS functions `renderTerminalPanel(title, body)`, `renderStatusLed(state)`, `renderAlertTicker(alerts)`, `renderSceneButton(entityId)`, `renderLightCard(entityId)`, `renderMetricCard(entityId)`, `renderCameraFeed(entityId)`, `renderRadarFrame()`, `renderMediaCard(entityId)`, `renderBottomButton(label, targetScreen)`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/test_ai_dashboard.py`:

```python
COMPONENT_FUNCS = [
    "renderTerminalPanel", "renderStatusLed", "renderAlertTicker",
    "renderSceneButton", "renderLightCard", "renderMetricCard",
    "renderCameraFeed", "renderRadarFrame", "renderMediaCard", "renderBottomButton"
]

def test_component_functions_exist():
    html = read_index()
    missing = [f"function {fn}(" for fn in COMPONENT_FUNCS if f"function {fn}(" not in html]
    assert not missing, f"Missing component functions: {missing}"
```

Update the `__main__` block to call `test_component_functions_exist()`.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: `AssertionError` listing missing functions.

- [ ] **Step 3: Implement the component functions**

Add the following JS functions to `www/ai-dashboard/index.html` inside the existing `<script>` block (replace emoji-based helpers where needed):

```javascript
function renderTerminalPanel(title, bodyHtml) {
  return `<div class="terminal-panel">
    <div class="panel-title">${escapeHtml(title)}</div>
    <div class="panel-body">${bodyHtml}</div>
  </div>`;
}

function renderStatusLed(state) {
  let cls = "";
  const s = String(state || "").toLowerCase();
  if (["on","playing","open","home","heat","cool","auto","active","true","cleaning","docked","idle"].includes(s)) cls = "on";
  else if (["unavailable","unknown","offline"].includes(s)) cls = "danger";
  return `<span class="status-led ${cls}"></span>`;
}

function renderAlertTicker(alerts) {
  if (!alerts || !alerts.length) {
    return `<div class="terminal-panel"><div class="panel-body" style="color:var(--text-muted);font-family:monospace;">SYSTEM NORMAL</div></div>`;
  }
  const items = alerts.slice(0,3).map(a => `<div style="color:var(--amber);font-family:monospace;margin:4px 0;">! ${escapeHtml(a)}</div>`).join("");
  return `<div class="terminal-panel"><div class="panel-body">${items}</div></div>`;
}

function renderSceneButton(entityId) {
  const state = states[entityId];
  const name = friendlyName(entityId);
  const domain = entityId.split(".")[0];
  return `<button class="bottom-btn" style="flex:none;width:100%;margin:4px 0;" onclick="toggleEntity('${entityId}')">${escapeHtml(name)}</button>`;
}

function renderLightCard(entityId) {
  const state = states[entityId];
  const active = state ? isActive(state.state) : false;
  const brightness = state && state.attributes && state.attributes.brightness != null ? state.attributes.brightness : 0;
  const pct = Math.round((brightness / 255) * 100);
  return `<div class="terminal-panel" style="margin-bottom:10px;">
    <div class="panel-body" style="display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;" onclick="toggleEntity('${entityId}')">
      <div>${renderStatusLed(active ? "on" : "off")} <span style="font-family:monospace;">${escapeHtml(friendlyName(entityId))}</span></div>
      <div style="color:var(--text-muted);font-family:monospace;">${active ? "ON" : "OFF"}</div>
    </div>
    ${active ? `<div class="panel-body" style="padding-top:0;"><input type="range" min="0" max="100" value="${pct}" style="width:100%;" onchange="setBrightness('${entityId}', this.value)" onclick="event.stopPropagation();"></div>` : ""}
  </div>`;
}

function renderMetricCard(entityId) {
  const state = states[entityId];
  if (!state) return "";
  const unit = state.attributes && state.attributes.unit_of_measurement ? state.attributes.unit_of_measurement : "";
  return `<div class="terminal-panel" style="text-align:center;padding:8px;">
    <div style="font-family:monospace;font-size:1.4rem;color:var(--green);">${escapeHtml(state.state)}<span style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(unit)}</span></div>
    <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(friendlyName(entityId))}</div>
  </div>`;
}

function renderCameraFeed(entityId) {
  const name = friendlyName(entityId);
  const src = window.HA_INTEGRATION_PROXY ? `/api/camera_proxy_stream/${entityId}` : `/api/camera_proxy_stream/${entityId}?token=${encodeURIComponent(token)}`;
  return `<div class="terminal-panel" style="margin-bottom:10px;">
    <div class="panel-title">${escapeHtml(name)}</div>
    <div class="panel-body" style="padding:0;">
      <img class="camera-feed" src="${src}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#000;" alt="${escapeHtml(name)}">
    </div>
  </div>`;
}

function renderRadarFrame() {
  if (!haConfig || haConfig.latitude == null) return `<div class="terminal-panel"><div class="panel-body" style="color:var(--text-muted);">RADAR UNAVAILABLE</div></div>`;
  const src = `https://www.rainviewer.com/api.html?lat=${haConfig.latitude}&lon=${haConfig.longitude}&z=8&r=true&c=1&d=true`;
  return `<div class="terminal-panel" style="height:100%;display:flex;flex-direction:column;">
    <div class="panel-title">WEATHER RADAR</div>
    <div class="panel-body" style="flex:1;padding:0;min-height:0;">
      <iframe class="radar-frame" src="${src}" style="width:100%;height:100%;border:none;display:block;min-height:200px;" loading="lazy" allow="fullscreen"></iframe>
    </div>
  </div>`;
}

function renderMediaCard(entityId) {
  const state = states[entityId];
  if (!state) return "";
  return `<div class="terminal-panel">
    <div class="panel-title">${escapeHtml(friendlyName(entityId))}</div>
    <div class="panel-body" style="font-family:monospace;">
      <div style="color:var(--green);">${escapeHtml(state.state)}</div>
      <button class="bottom-btn" style="margin-top:10px;padding:10px;font-size:0.9rem;" onclick="toggleEntity('${entityId}')">PLAY / PAUSE</button>
    </div>
  </div>`;
}

function renderBottomButton(label, target) {
  return `<button class="bottom-btn" onclick="showScreen('${target}')">${escapeHtml(label)}</button>`;
}
```

Also add the helper:

```javascript
function setBrightness(entityId, pct) {
  if (!ws) return;
  const value = Math.round((parseInt(pct, 10) / 100) * 255);
  ws.send(JSON.stringify({ id: Date.now(), type: "call_service", domain: "light", service: "turn_on", service_data: { entity_id: entityId, brightness: value } }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/test_ai_dashboard.py www/ai-dashboard/index.html
git commit -m "feat: add reusable CRT component renderers"
```

---

### Task 3: Home Screen

**Files:**
- Modify: `www/ai-dashboard/index.html`
- Modify: `scripts/test_ai_dashboard.py`
- Test: `python3 scripts/test_ai_dashboard.py`

**Interfaces:**
- Consumes: component renderers, config, `config.entities.weather`, `config.sections.home.entities`, `states`.
- Produces: `renderHomeScreen()` function and `#home-screen` container.

- [ ] **Step 1: Write the failing test**

Append to `scripts/test_ai_dashboard.py`:

```python
HOME_MARKERS = ["id=\"home-screen\"", "renderHomeScreen(", "WEATHER RADAR", "PRESENCE", "CONTROL HUB", "STATUS MONITOR"]

def test_home_screen_structure():
    html = read_index()
    missing = [m for m in HOME_MARKERS if m not in html]
    assert not missing, f"Missing home screen markers: {missing}"
```

Update `__main__` to call `test_home_screen_structure()`.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: `AssertionError` listing missing markers.

- [ ] **Step 3: Implement the Home Screen**

Add to the HTML body:

```html
<div class="scanlines"></div>
<div class="vignette"></div>
<div id="status-led" class="status-led" style="position:fixed;top:14px;left:14px;z-index:50;"></div>
<div id="status-text" style="position:fixed;top:12px;left:32px;z-index:50;font-family:monospace;font-size:0.75rem;color:var(--text-muted);">CONNECTING</div>
<button id="settings-btn" style="position:fixed;top:10px;right:14px;z-index:50;background:transparent;border:none;color:var(--text-muted);font-family:monospace;cursor:pointer;" onclick="openSettings()">[ SETTINGS ]</button>

<div id="app">
  <div id="home-screen" class="screen" style="display:none;flex:1;flex-direction:column;gap:14px;"></div>
  <div id="control-screen" class="screen" style="display:none;flex:1;flex-direction:column;gap:14px;"></div>
  <div id="status-screen" class="screen" style="display:none;flex:1;flex-direction:column;gap:14px;"></div>
  <div id="dock" style="display:flex;gap:14px;height:70px;flex-shrink:0;"></div>
</div>
```

Add JS function:

```javascript
function getPresenceEntities() {
  const homeSection = (config.sections && config.sections.home && config.sections.home.entities) || [];
  return homeSection.filter(id => {
    const domain = id.split(".")[0];
    return domain === "person" || domain === "device_tracker";
  });
}

function getAlerts() {
  const alerts = [];
  const sec = config.sections && config.sections.security ? config.sections.security.entities : [];
  for (const id of sec) {
    const state = states[id];
    if (!state) continue;
    const domain = id.split(".")[0];
    if (domain === "binary_sensor" && isActive(state.state)) {
      alerts.push(`${friendlyName(id)} detected`);
    }
    if (domain === "sensor" && state.attributes && state.attributes.device_class === "battery") {
      const val = parseFloat(state.state);
      if (!isNaN(val) && val < 20) alerts.push(`${friendlyName(id)} low`);
    }
  }
  // Add pending updates
  const sys = config.sections && config.sections.system ? config.sections.system.entities : [];
  for (const id of sys) {
    if (id.startsWith("update.") && states[id] && states[id].state === "on") {
      alerts.push(`${friendlyName(id)} available`);
    }
  }
  return alerts;
}

function renderHomeScreen() {
  const weatherId = config.entities.weather || "weather.forecast_home";
  const weather = states[weatherId];
  const temp = weather && weather.attributes && weather.attributes.temperature != null ? `${weather.attributes.temperature}°` : "--";
  const humidity = weather && weather.attributes && weather.attributes.humidity != null ? `${weather.attributes.humidity}%` : "--";
  const condition = weather ? weather.state.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "--";
  const icon = weatherIcon(weather ? weather.state : "");

  const presence = getPresenceEntities().map(id => {
    const state = states[id];
    const home = state ? isActive(state.state) : false;
    return `<div style="display:flex;align-items:center;gap:10px;font-family:monospace;font-size:1.1rem;">
      ${renderStatusLed(home ? "home" : "off")}
      <span>${escapeHtml(friendlyName(id))}</span>
      <span style="color:${home ? 'var(--green)' : 'var(--text-muted)'};">${home ? "HOME" : "AWAY"}</span>
    </div>`;
  }).join("");

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }).toUpperCase();

  const leftCol = `
    <div style="display:flex;flex-direction:column;justify-content:center;height:100%;">
      <div style="font-family:monospace;font-size:clamp(4rem,10vw,7rem);line-height:0.9;color:var(--green);text-shadow:0 0 24px rgba(20,254,23,0.4);">${escapeHtml(timeStr)}</div>
      <div style="font-family:monospace;font-size:1.1rem;color:var(--text-muted);margin-top:8px;">${escapeHtml(dateStr)}</div>
    </div>
    ${renderTerminalPanel("WEATHER", `<div style="display:flex;align-items:center;gap:14px;"><div style="font-size:2.5rem;">${icon}</div><div><div style="font-size:1.8rem;color:var(--green);">${temp}</div><div style="color:var(--text-muted);font-family:monospace;">${escapeHtml(condition)} · HUM ${humidity}</div></div></div>`)}
  `;

  const main = `
    <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:14px;flex:1;min-height:0;">
      <div style="display:flex;flex-direction:column;gap:14px;min-height:0;">${leftCol}</div>
      <div style="min-height:0;">${renderRadarFrame()}</div>
    </div>
    <div>${renderAlertTicker(getAlerts())}</div>
    <div>${renderTerminalPanel("PRESENCE", `<div style="display:flex;gap:24px;flex-wrap:wrap;">${presence}</div>`)}</div>
  `;

  document.getElementById("home-screen").innerHTML = main;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/test_ai_dashboard.py www/ai-dashboard/index.html
git commit -m "feat: add Home Screen with clock, weather, radar, alerts, presence"
```

---

### Task 4: Control Hub

**Files:**
- Modify: `www/ai-dashboard/index.html`
- Modify: `scripts/test_ai_dashboard.py`
- Test: `python3 scripts/test_ai_dashboard.py`

**Interfaces:**
- Consumes: component renderers, `config.sections.scenes`, `config.sections.quickControls`, `config.entities.mediaPlayer`.
- Produces: `renderControlScreen()` function.

- [ ] **Step 1: Write the failing test**

Append to `scripts/test_ai_dashboard.py`:

```python
CONTROL_MARKERS = ["id=\"control-screen\"", "renderControlScreen(", "SCENES", "LIGHTS", "MEDIA"]

def test_control_screen_structure():
    html = read_index()
    missing = [m for m in CONTROL_MARKERS if m not in html]
    assert not missing, f"Missing control screen markers: {missing}"
```

Update `__main__`.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: `AssertionError`.

- [ ] **Step 3: Implement the Control Hub**

Add JS function:

```javascript
function renderControlScreen() {
  const scenes = (config.sections && config.sections.scenes && config.sections.scenes.entities) || [];
  const quick = (config.sections && config.sections.quickControls && config.sections.quickControls.entities) || [];
  const mediaId = config.entities.mediaPlayer || "media_player.living_room_fire_tv_living_room";

  const sceneButtons = scenes.map(id => renderSceneButton(id)).join("");
  const lightIds = quick.filter(id => id.startsWith("light."));
  const lightCards = lightIds.map(id => renderLightCard(id)).join("");
  const quickButtons = scenes.slice(0, 2).map(id => renderSceneButton(id)).join("");

  const main = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;flex:1;min-height:0;">
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
        ${renderTerminalPanel("SCENES", `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${sceneButtons}</div>`)}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
        ${renderTerminalPanel("LIGHTS", lightCards || "<div style='color:var(--text-muted)'>NO LIGHTS</div>")}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
        ${renderMediaCard(mediaId)}
        ${renderTerminalPanel("QUICK", quickButtons)}
      </div>
    </div>
  `;
  document.getElementById("control-screen").innerHTML = main;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/test_ai_dashboard.py www/ai-dashboard/index.html
git commit -m "feat: add Control Hub with scenes, lights, and media"
```

---

### Task 5: Status Monitor

**Files:**
- Modify: `www/ai-dashboard/index.html`
- Modify: `scripts/test_ai_dashboard.py`
- Test: `python3 scripts/test_ai_dashboard.py`

**Interfaces:**
- Consumes: component renderers, `config.sections.cameras`, `config.sections.security`, `config.sections.environment`, `config.sections.system`.
- Produces: `renderStatusScreen()` function.

- [ ] **Step 1: Write the failing test**

Append to `scripts/test_ai_dashboard.py`:

```python
STATUS_MARKERS = ["id=\"status-screen\"", "renderStatusScreen(", "FRONT DOOR", "DOWNSTAIRS", "SECURITY", "ENVIRONMENT", "SYSTEM"]

def test_status_screen_structure():
    html = read_index()
    missing = [m for m in STATUS_MARKERS if m not in html]
    assert not missing, f"Missing status screen markers: {missing}"
```

Update `__main__`.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: `AssertionError`.

- [ ] **Step 3: Implement the Status Monitor**

Add JS function:

```javascript
function renderStatusScreen() {
  const cameras = (config.sections && config.sections.cameras && config.sections.cameras.entities) || [];
  const security = (config.sections && config.sections.security && config.sections.security.entities) || [];
  const environment = (config.sections && config.sections.environment && config.sections.environment.entities) || [];
  const system = (config.sections && config.sections.system && config.sections.system.entities) || [];

  const cameraFeeds = cameras.map(id => renderCameraFeed(id)).join("");
  const securityMetrics = security.map(id => renderMetricCard(id)).join("");
  const envMetrics = environment.map(id => renderMetricCard(id)).join("");
  const sysMetrics = system.filter(id => id.startsWith("sensor.")).map(id => renderMetricCard(id)).join("");

  const vacuumIds = system.filter(id => id.startsWith("vacuum."));
  const vacuumCards = vacuumIds.map(id => {
    const state = states[id];
    return `<div class="terminal-panel" style="margin-bottom:10px;">
      <div class="panel-body" style="display:flex;align-items:center;justify-content:space-between;font-family:monospace;">
        <span>${escapeHtml(friendlyName(id))}</span>
        <span style="color:var(--green);">${state ? escapeHtml(state.state) : "--"}</span>
      </div>
    </div>`;
  }).join("");

  const printerIds = Object.keys(states).filter(id => id.startsWith("sensor.p1s_") && id.includes("print_status"));
  const printerCards = printerIds.map(id => {
    const state = states[id];
    return `<div class="terminal-panel" style="margin-bottom:10px;">
      <div class="panel-body" style="font-family:monospace;">
        <div style="color:var(--green);">${state ? escapeHtml(state.state) : "--"}</div>
        <div style="color:var(--text-muted);font-size:0.8rem;">${escapeHtml(friendlyName(id))}</div>
      </div>
    </div>`;
  }).join("");

  const main = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:1;min-height:0;overflow:hidden;">
      <div style="min-height:0;overflow:hidden;">${cameraFeeds[0] || ""}</div>
      <div style="min-height:0;overflow:hidden;">${cameraFeeds[1] || ""}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;min-height:0;overflow:hidden;">
      <div style="min-height:0;overflow-y:auto;">${renderTerminalPanel("SECURITY", securityMetrics)}</div>
      <div style="min-height:0;overflow-y:auto;">${renderTerminalPanel("ENVIRONMENT", envMetrics)}</div>
      <div style="min-height:0;overflow-y:auto;">${renderTerminalPanel("SYSTEM", sysMetrics + vacuumCards + printerCards)}</div>
    </div>
  `;
  document.getElementById("status-screen").innerHTML = main;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/test_ai_dashboard.py www/ai-dashboard/index.html
git commit -m "feat: add Status Monitor with cameras, security, environment, system"
```

---

### Task 6: Screen Switching and WebSocket Integration

**Files:**
- Modify: `www/ai-dashboard/index.html`
- Modify: `scripts/test_ai_dashboard.py`
- Test: `python3 scripts/test_ai_dashboard.py`

**Interfaces:**
- Consumes: `renderHomeScreen`, `renderControlScreen`, `renderStatusScreen`, existing WebSocket handlers.
- Produces: `showScreen(name)`, `setConnectionStatus(cls, text)`, updated `init()` and render flow.

- [ ] **Step 1: Write the failing test**

Append to `scripts/test_ai_dashboard.py`:

```python
NAV_MARKERS = ["function showScreen(", "home", "control", "status", "CURRENT SCREEN"]

def test_navigation_functions():
    html = read_index()
    missing = [m for m in NAV_MARKERS if m not in html]
    assert not missing, f"Missing navigation markers: {missing}"
```

Update `__main__`.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: `AssertionError`.

- [ ] **Step 3: Implement screen switching and wiring**

Add JS functions:

```javascript
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(el => el.style.display = "none");
  const target = document.getElementById(name + "-screen");
  if (!target) return;
  target.style.display = "flex";
  if (name === "home") renderHomeScreen();
  else if (name === "control") renderControlScreen();
  else if (name === "status") renderStatusScreen();
  currentScreen = name;
}

function setConnectionStatus(cls, text) {
  const led = document.getElementById("status-led");
  const label = document.getElementById("status-text");
  if (led) led.className = "status-led " + cls;
  if (label) label.textContent = text;
}

function entityBelongsToScreen(entityId, screen) {
  const sectionMap = {
    home: [config.entities.weather, ...getPresenceEntities()],
    control: [
      ...((config.sections.scenes && config.sections.scenes.entities) || []),
      ...((config.sections.quickControls && config.sections.quickControls.entities) || []),
      config.entities.mediaPlayer
    ],
    status: [
      ...((config.sections.cameras && config.sections.cameras.entities) || []),
      ...((config.sections.security && config.sections.security.entities) || []),
      ...((config.sections.environment && config.sections.environment.entities) || []),
      ...((config.sections.system && config.sections.system.entities) || [])
    ]
  };
  const ids = sectionMap[screen] || [];
  if (ids.includes(entityId)) return true;
  // Alerts can also trigger home re-render
  if (screen === "home") {
    const sec = (config.sections.security && config.sections.security.entities) || [];
    const sys = (config.sections.system && config.sections.system.entities) || [];
    if (sec.includes(entityId) || sys.includes(entityId)) return true;
  }
  return false;
}

function updateCard(state) {
  if (!entityBelongsToScreen(state.entity_id, currentScreen)) return;
  if (currentScreen === "home") renderHomeScreen();
  else if (currentScreen === "control") renderControlScreen();
  else if (currentScreen === "status") renderStatusScreen();
}
```

Update `init()`:

```javascript
let currentScreen = "home";

async function init() {
  config = await loadConfig();
  applyTheme();
  await fetchHAConfig(); // ensure lat/lon are available for radar
  document.getElementById("dock").innerHTML =
    renderBottomButton("CONTROL HUB", "control") +
    renderBottomButton("STATUS MONITOR", "status");
  showScreen("home");
  if (window.HA_INTEGRATION_PROXY) {
    token = "";
    localStorage.removeItem("ha_token");
    connect();
  } else {
    token = localStorage.getItem("ha_token");
    if (!token) {
      token = prompt("Enter Home Assistant long-lived access token:");
      if (token) localStorage.setItem("ha_token", token);
    }
    if (token) connect();
  }
  setInterval(updateClock, 1000);
}
```

Update the WebSocket handlers to call `setConnectionStatus` and `renderAll`:

```javascript
function renderAll() {
  if (currentScreen === "home") renderHomeScreen();
  else if (currentScreen === "control") renderControlScreen();
  else if (currentScreen === "status") renderStatusScreen();
  updateClock();
}

// In connectProxy / connect:
ws.onopen = () => {
  setConnectionStatus("on", "CONNECTED");
  ws.send(JSON.stringify({ id: 1, type: "get_states" }));
};
ws.onclose = () => {
  setConnectionStatus("danger", "DISCONNECTED");
  // existing reconnect logic
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/test_ai_dashboard.py www/ai-dashboard/index.html
git commit -m "feat: wire screen switching, dock, and connection status"
```

---

### Task 7: Update Config and Back Up Existing Dashboard

**Files:**
- Modify: `www/ai-dashboard/config.json`
- Modify: `www/ai-dashboard/index.html` (settings overlay cleanup if needed)
- Test: `python3 scripts/test_ai_dashboard.py`

**Interfaces:**
- Produces: Updated `config.json` with all required sections/entities for the new layout.

- [ ] **Step 1: Verify config.json has required sections**

Open `www/ai-dashboard/config.json` and confirm it contains:

```json
{
  "entities": {
    "weather": "weather.forecast_home",
    "mediaPlayer": "media_player.living_room_fire_tv_living_room"
  },
  "sections": {
    "home": { "entities": ["person.woteg", "device_tracker.traviss_iphone", "weather.forecast_home"] },
    "scenes": { "entities": ["scene.all_lights_off", "scene.living_room_lights_on", "scene.relax_mode", "scene.movie_mode", "script.goodnight", "script.focus_mode"] },
    "quickControls": { "entities": ["light.ceiling_fan", "light.living_room_ceiling_fan", "media_player.living_room_fire_tv_living_room"] },
    "cameras": { "entities": ["camera.front_door_live_view", "camera.downstairs_live_view"] },
    "security": { "entities": ["switch.front_door_motion_detection", "switch.downstairs_motion_detection", "sensor.front_door_battery", "sensor.downstairs_battery", "siren.downstairs_siren", "siren.downstairs_siren_2"] },
    "environment": { "entities": ["sensor.hobeian_zg_204zx_temperature", "sensor.hobeian_zg_204zx_humidity", "sensor.hobeian_zg_204zx_illuminance", "sensor.hobeian_zg_204zx_temperature_2", "sensor.hobeian_zg_204zx_humidity_2", "sensor.hobeian_zg_204zx_illuminance_2"] },
    "system": { "entities": ["sensor.home_assistant_core_cpu_percent", "sensor.home_assistant_core_memory_percent", "sensor.ha_disk_usage", "vacuum.geordi_la_forge", "vacuum.pooper_litter_box", "update.home_assistant_core_update", "update.home_assistant_operating_system_update", "update.home_assistant_supervisor_update"] }
  }
}
```

If any section is missing, add it.

- [ ] **Step 2: Back up existing index.html**

Before finalizing, ensure a backup is created:

```bash
cp www/ai-dashboard/index.html www/ai-dashboard/index.html.bak.$(date +%Y%m%d_%H%M%S)
```

- [ ] **Step 3: Run the validation suite**

Run:
```bash
python3 scripts/test_ai_dashboard.py
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/config.json www/ai-dashboard/index.html scripts/test_ai_dashboard.py
git commit -m "chore: update config and back up dashboard before redesign finalization"
```

---

### Task 8: Manual Verification

**Files:**
- Test: browser-based manual test of `www/ai-dashboard/index.html`

- [ ] **Step 1: Confirm file is served**

Open in a browser:
```
http://homeassistant.local:8123/local/ai-dashboard/index.html
```

Expected: page loads in CRT terminal theme, defaulting to Home Screen.

- [ ] **Step 2: Confirm Home Screen content**

Expected:
- Large green clock visible.
- Weather block shows condition, temperature, humidity.
- Weather radar iframe loads on the right.
- Presence row shows Woteg and Travis as HOME or AWAY.
- Alerts ticker shows `SYSTEM NORMAL` or active alerts.
- Bottom dock has `[ CONTROL HUB ]` and `[ STATUS MONITOR ]` buttons.

- [ ] **Step 3: Confirm screen switching**

Tap `[ CONTROL HUB ]`.
Expected: Control Hub screen appears with Scenes, Lights, Media, and Quick sections.

Tap `[ STATUS MONITOR ]`.
Expected: Status Monitor appears with cameras, security, environment, and system panels.

Tap the close button or a Home affordance.
Expected: returns to Home Screen.

- [ ] **Step 4: Confirm live updates and control**

Toggle a light from another HA dashboard while watching the Control Hub.
Expected: the light card updates within a few seconds.

Tap a scene button in Control Hub.
Expected: the scene runs in Home Assistant.

- [ ] **Step 5: Confirm camera feeds**

On Status Monitor, wait a few seconds.
Expected: Front Door and Downstairs camera feeds load.

- [ ] **Step 6: Commit any fixes**

If manual testing revealed bugs, fix and commit with a descriptive message.

---

## Self-Review

**Spec coverage:**
- Dark Fallout-style green palette: Task 1 CSS. ✅
- CRT scanlines/vignette: Task 1 CSS. ✅
- Home Screen with time, weather, radar, alerts, presence: Task 3. ✅
- Control Hub with scenes, lights, media: Task 4. ✅
- Status Monitor with cameras, security, environment, system, vacuums, printer: Task 5. ✅
- Bottom dock buttons: Task 6. ✅
- WebSocket live updates: Task 6 reuses existing connection. ✅
- Large touch targets: CSS `.bottom-btn` and scene/light cards. ✅

**Placeholder scan:** No TBD/TODO/fill-in-details. Each task includes concrete code snippets.

**Type consistency:** Function names (`renderHomeScreen`, `renderControlScreen`, `renderStatusScreen`, `showScreen`, `setConnectionStatus`) are consistent across tasks. Config keys match existing `config.json`.
