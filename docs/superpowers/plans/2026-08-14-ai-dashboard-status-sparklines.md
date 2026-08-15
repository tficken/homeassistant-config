# AI Dashboard Status Monitor Sparklines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimal 24-hour SVG sparklines below temperature and humidity values on the Status Monitor, fetched through the dashboard proxy.

**Architecture:** Add a `/ai-dashboard/api/history` endpoint to `custom_components/ai_dashboard_proxy/http.py` that calls Home Assistant's `history.get_significant_states`; update `www/ai-dashboard/index.html` to fetch history when the Status screen renders and draw small SVG sparklines in `renderEnvMetric()`.

**Tech Stack:** Python/aiohttp proxy, Home Assistant history component, vanilla JavaScript, SVG.

## Global Constraints

- Do not modify other dashboard screens (Home, Control Hub, Security) or the dock.
- Keep sensitive values in `secrets.yaml`; the proxy handles auth server-side.
- Validate JSON, HTML, and Python before considering a task complete.
- Hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) to verify changes after editing.

## File Structure

| File | Responsibility |
|------|----------------|
| `custom_components/ai_dashboard_proxy/http.py` | New `/ai-dashboard/api/history` endpoint. |
| `www/ai-dashboard/index.html` | History cache/fetch helper, sparkline renderer, Status screen wiring. |

---

### Task 1: Add history endpoint to the proxy

**Files:**
- Modify: `custom_components/ai_dashboard_proxy/http.py`
- Test: `python -m compileall custom_components/ai_dashboard_proxy` and `flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503`

**Interfaces:**
- Consumes: `request.json()` body with `entity_ids` and optional `hours`; Home Assistant `history.get_significant_states`.
- Produces: `POST /ai-dashboard/api/history` returning JSON `{entity_id: [{state, last_changed}, ...]}`.

- [ ] **Step 1: Add imports**

Add at the top of `custom_components/ai_dashboard_proxy/http.py`:

```python
from datetime import timedelta

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder import history as recorder_history
from homeassistant.util import dt as dt_util
```

Note: in HA 2026.8.x `get_significant_states` lives in `homeassistant.components.recorder.history` (not `homeassistant.components.history`) and is a synchronous function that opens its own DB session, so it must be run via the recorder executor.

- [ ] **Step 2: Add `history_handler`**

Insert before `async_setup_http()`:

```python
async def history_handler(request: web.Request) -> web.StreamResponse:
    """Return 24-hour state history for requested entity IDs."""
    try:
        secret = request.app.get("ai_dashboard_secret")
        if not _is_authorized(request, secret):
            return web.Response(status=401, text="Unauthorized")

        hass: HomeAssistant = request.app["hass"]
        try:
            body = await request.json()
        except ValueError:
            return web.Response(status=400, text="Invalid JSON")

        entity_ids = body.get("entity_ids", [])
        hours = body.get("hours", 24)
        if not isinstance(entity_ids, list) or not entity_ids:
            return web.Response(status=400, text="entity_ids must be a non-empty list")
        if not isinstance(hours, int) or hours < 1 or hours > 168:
            return web.Response(status=400, text="hours must be an integer between 1 and 168")

        end_time = dt_util.utcnow()
        start_time = end_time - timedelta(hours=hours)

        try:
            # get_significant_states is synchronous and opens its own DB
            # session, so it must run in the executor. Defaults (no
            # minimal_response) return LazyState objects for every row.
            history_data = await get_instance(hass).async_add_executor_job(
                recorder_history.get_significant_states,
                hass,
                start_time,
                end_time,
                entity_ids,
            )
        except Exception as exc:
            return web.Response(status=500, text=f"History query failed: {exc}")

        result: dict[str, list[dict[str, str]]] = {}
        for entity_id, states in history_data.items():
            result[entity_id] = [
                {
                    "state": s.state,
                    "last_changed": s.last_changed.isoformat(),
                }
                for s in states
                if s.state not in ("unknown", "unavailable")
            ]

        return web.json_response(result)
    except Exception as e:
        return web.Response(
            status=500,
            text=f"Dashboard proxy error: {e}\n{traceback.format_exc()}",
        )
```

- [ ] **Step 3: Register the route**

In `async_setup_http()`, add the new route before the catch-all dashboard route:

```python
app.router.add_post("/ai-dashboard/api/history", history_handler)
```

- [ ] **Step 4: Validate Python**

Run:

```bash
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
```

Expected: no output from `compileall`; `flake8` reports no errors.

- [ ] **Step 5: Commit**

```bash
git add custom_components/ai_dashboard_proxy/http.py
git commit -m "feat(ai-dashboard-proxy): add /ai-dashboard/api/history endpoint"
```

---

### Task 2: Render sparklines in the dashboard

**Files:**
- Modify: `www/ai-dashboard/index.html`
- Test: `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`

**Interfaces:**
- Consumes: `POST /ai-dashboard/api/history`, `config.sections.environment.entities`, `states[entityId].attributes.device_class`.
- Produces: `historyCache`, `fetchHistory()`, `renderSparkline()`, async `renderStatusScreen()`.

- [ ] **Step 1: Add history cache variable**

Near the other top-level variables (after `forecastCache`), add:

```javascript
let historyCache = {};
```

- [ ] **Step 2: Add `fetchHistory()` helper**

Add near the other API helpers:

```javascript
async function fetchHistory(entityIds, hours = 24) {
  const missing = entityIds.filter(id => !historyCache[id]);
  if (!missing.length) return;
  const res = await apiCall("POST", "/ai-dashboard/api/history", {
    entity_ids: missing,
    hours: hours
  });
  if (!res) return;
  for (const id of missing) {
    if (Array.isArray(res[id])) historyCache[id] = res[id];
  }
}
```

- [ ] **Step 3: Add `renderSparkline()` helper**

Add near the other rendering helpers:

```javascript
function renderSparkline(entityId, width = 100, height = 20) {
  const data = historyCache[entityId];
  if (!data || data.length < 2) return "";
  const values = data.map(d => parseFloat(d.state)).filter(v => !isNaN(v));
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  return `<svg width="${width}" height="${height}" style="display:block;margin-top:4px;"><polyline points="${points}" fill="none" stroke="rgba(20,254,23,0.45)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
```

- [ ] **Step 4: Update `renderEnvMetric()` to include the sparkline**

Find the existing function:

```javascript
function renderEnvMetric(entityId) {
  const state = states[entityId];
  if (!state) return "";
  const unit = state.attributes && state.attributes.unit_of_measurement ? state.attributes.unit_of_measurement : "";
  const deviceClass = state.attributes && state.attributes.device_class;
  const labelMap = { temperature: "TEMP", humidity: "HUM", illuminance: "LIGHT" };
  const label = labelMap[deviceClass] || (deviceClass ? deviceClass.toUpperCase() : entityId.split("_").pop().toUpperCase());
  const offline = isUnavailable(state) ? renderOfflineBadge() : "";
  return `<div class="terminal-panel" style="text-align:center;padding:10px 4px;" data-entity-id="${entityId}">
    <div style="font-family:var(--font-mono);font-size:1.5rem;color:var(--green);">${offline || escapeHtml(state.state)}<span style="font-size:0.75rem;color:var(--text-muted);">${offline ? "" : escapeHtml(unit)}</span></div>
    <div class="metric-label" style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</div>
  </div>`;
}
```

Replace it with:

```javascript
function renderEnvMetric(entityId) {
  const state = states[entityId];
  if (!state) return "";
  const unit = state.attributes && state.attributes.unit_of_measurement ? state.attributes.unit_of_measurement : "";
  const deviceClass = state.attributes && state.attributes.device_class;
  const labelMap = { temperature: "TEMP", humidity: "HUM", illuminance: "LIGHT" };
  const label = labelMap[deviceClass] || (deviceClass ? deviceClass.toUpperCase() : entityId.split("_").pop().toUpperCase());
  const offline = isUnavailable(state) ? renderOfflineBadge() : "";
  const sparkline = (deviceClass === "temperature" || deviceClass === "humidity")
    ? renderSparkline(entityId)
    : "";
  return `<div class="terminal-panel" style="text-align:center;padding:10px 4px;" data-entity-id="${entityId}">
    <div style="font-family:var(--font-mono);font-size:1.5rem;color:var(--green);">${offline || escapeHtml(state.state)}<span style="font-size:0.75rem;color:var(--text-muted);">${offline ? "" : escapeHtml(unit)}</span></div>
    <div class="metric-label" style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</div>
    ${sparkline}
  </div>`;
}
```

- [ ] **Step 5: Make `renderStatusScreen()` async and fetch history**

Find the existing function signature and the `envMetrics` construction. Update to fetch history before building the metrics.

Change:

```javascript
function renderStatusScreen() {
  const environment = (config.sections && config.sections.environment && config.sections.environment.entities) || [];
  const system = (config.sections && config.sections.system && config.sections.system.entities) || [];

  const envGroups = {};
  const envOrder = [];
  for (const id of environment) {
    const area = entityArea(id) || "Other";
    if (!envGroups[area]) {
      envGroups[area] = [];
      envOrder.push(area);
    }
    envGroups[area].push(id);
  }
  const envMetrics = envOrder.map(area => {
    const metrics = envGroups[area].map(id => renderEnvMetric(id)).join("");
    return `<div style="margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:0.8rem;color:var(--green);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${escapeHtml(area)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${metrics}</div>
    </div>`;
  }).join("");
```

To:

```javascript
async function renderStatusScreen() {
  const environment = (config.sections && config.sections.environment && config.sections.environment.entities) || [];
  const system = (config.sections && config.sections.system && config.sections.system.entities) || [];

  const historyIds = environment.filter(id => {
    const s = states[id];
    const dc = s && s.attributes && s.attributes.device_class;
    return dc === "temperature" || dc === "humidity";
  });
  await fetchHistory(historyIds, 24);

  const envGroups = {};
  const envOrder = [];
  for (const id of environment) {
    const area = entityArea(id) || "Other";
    if (!envGroups[area]) {
      envGroups[area] = [];
      envOrder.push(area);
    }
    envGroups[area].push(id);
  }
  const envMetrics = envOrder.map(area => {
    const metrics = envGroups[area].map(id => renderEnvMetric(id)).join("");
    return `<div style="margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:0.8rem;color:var(--green);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${escapeHtml(area)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${metrics}</div>
    </div>`;
  }).join("");
```

- [ ] **Step 6: Update callers of `renderStatusScreen()`**

Find `showScreen()` and update it to be async and await `renderStatusScreen()`:

```javascript
async function showScreen(name) {
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  const target = document.getElementById(name + "-screen");
  if (!target) return;
  target.classList.add("active");
  currentScreen = name;
  document.getElementById("dock").innerHTML = renderDock();
  if (name === "home") renderHomeScreen();
  else if (name === "control") renderControlScreen();
  else if (name === "security") renderSecurityScreen();
  else if (name === "status") await renderStatusScreen();
}
```

Find `updateCard()` and update it:

```javascript
async function updateCard(state) {
  if (!entityBelongsToScreen(state.entity_id, currentScreen)) return;
  if (currentScreen === "home") renderHomeScreen();
  else if (currentScreen === "control") renderControlScreen();
  else if (currentScreen === "security") renderSecurityScreen();
  else if (currentScreen === "status") await renderStatusScreen();
}
```

Find `renderAll()` and update it:

```javascript
async function renderAll() {
  if (currentScreen === "home") renderHomeScreen();
  else if (currentScreen === "control") renderControlScreen();
  else if (currentScreen === "security") renderSecurityScreen();
  else if (currentScreen === "status") await renderStatusScreen();
  updateClock();
}
```

- [ ] **Step 7: Validate HTML**

Run:

```bash
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
```

Expected output: `HTML parse OK`

- [ ] **Step 8: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(ai-dashboard): add 24-hour SVG sparklines to Status Monitor environment cards"
```

---

### Task 3: Verify End-to-End

**Files:**
- Read-only: `custom_components/ai_dashboard_proxy/http.py`, `www/ai-dashboard/index.html`
- Test: browser / Home Assistant dashboard

**Interfaces:**
- Consumes: final proxy endpoint and dashboard code
- Produces: confirmation that sparklines render

- [ ] **Step 1: Re-run all syntax checks**

```bash
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
python -m json.tool www/ai-dashboard/config.json > /dev/null
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
```

- [ ] **Step 2: Browser smoke test**

1. Open the AI dashboard in a browser.
2. Hard-refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`).
3. Tap **STATUS MONITOR**.
4. Verify:
   - Temperature and humidity cards show a small green line below the label.
   - Illuminance cards do **not** show a line.
   - No JavaScript errors in the browser console.

- [ ] **Step 3: Commit any final fixes**

If browser testing required additional tweaks, commit them with a clear message.

---

## Self-Review

- **Spec coverage:**
  - Proxy history endpoint → Task 1.
  - Route registration → Task 1, Step 3.
  - History cache/fetch helper → Task 2, Steps 1–2.
  - Sparkline renderer → Task 2, Step 3.
  - `renderEnvMetric()` update → Task 2, Step 4.
  - `renderStatusScreen()` async + fetch → Task 2, Step 5.
  - Caller updates → Task 2, Step 6.
  - Validation → Task 3.
- **Placeholder scan:** No TBD/TODO/fill-in-details found.
- **Type consistency:** `fetchHistory(entityIds, hours)` and `renderSparkline(entityId, width, height)` use consistent parameter names and types across the plan.
