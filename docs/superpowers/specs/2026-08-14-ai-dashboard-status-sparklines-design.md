# AI Dashboard Status Monitor Sparklines

## Background

The Status Monitor screen shows environment metrics as static numbers. The user wants a simple 24-hour trend line behind (below) the temperature and humidity values so patterns are visible at a glance.

## Goal

Add minimal 24-hour SVG sparklines to temperature and humidity cards on the Status Monitor, fetched through the dashboard proxy so the browser does not need a separate Home Assistant token.

## Approach

Approach 1 from brainstorming: add a server-side history endpoint to the dashboard proxy, fetch history when the Status screen renders, and draw a small SVG line in `renderEnvMetric()` for temperature and humidity metrics.

## Detailed Changes

### `custom_components/ai_dashboard_proxy/http.py`

#### New `history_handler`

Add an async handler for `POST /ai-dashboard/api/history`.

Request body:

```json
{
  "entity_ids": ["sensor.hobeian_zg_204zx_temperature", "sensor.hobeian_zg_204zx_humidity"],
  "hours": 24
}
```

Behavior:

- Reuse `_is_authorized()` for access control.
- Parse `entity_ids` and `hours` (default 24).
- Compute `start_time = now - hours`.
- Import and call `homeassistant.components.history.get_significant_states` to fetch history for the requested entities.
- Return a JSON object keyed by entity ID, where each value is an array of `{state, last_changed}` objects.

Response example:

```json
{
  "sensor.hobeian_zg_204zx_temperature": [
    {"state": "72.5", "last_changed": "2026-08-13T20:00:00+00:00"},
    ...
  ]
}
```

#### Route registration

In `async_setup_http()`, add:

```python
app.router.add_post("/ai-dashboard/api/history", history_handler)
```

### `www/ai-dashboard/index.html`

#### State/cache

Add near the other top-level variables:

```javascript
let historyCache = {};
```

#### History fetch helper

Add an async function:

```javascript
async function fetchHistory(entityIds, hours = 24) {
  const missing = entityIds.filter(id => !historyCache[id]);
  if (!missing.length) return;
  const res = await apiCall("POST", "/ai-dashboard/api/history", { entity_ids: missing, hours });
  if (res) {
    for (const id of missing) {
      if (Array.isArray(res[id])) historyCache[id] = res[id];
    }
  }
}
```

#### Update `renderStatusScreen()`

Before rendering environment metrics, identify temperature/humidity sensors and call `fetchHistory()` for them.

#### Update `renderEnvMetric()`

For device classes `temperature` and `humidity`:

- Look up `historyCache[entityId]`.
- If present, parse numeric states and timestamps.
- Compute min/max over the 24-hour window.
- Render a small SVG line chart below the value, normalized to the card width/height.
- Use a subtle line color such as `rgba(20, 254, 23, 0.4)`.

The card layout becomes:

```
+---------------+
|  72°F         |
|  TEMP         |
|  ~sparkline~  |
+---------------+
```

Illuminance and other device classes remain unchanged.

## Validation

- `python -m compileall custom_components/ai_dashboard_proxy`
- `flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503`
- `python -m json.tool www/ai-dashboard/config.json`
- `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
- Browser smoke test: open the Status Monitor and confirm small sparklines appear under temperature and humidity cards.

## Out of Scope

- Sparklines for system sensors, vacuums, or printers.
- Axes, labels, tooltips, or hover interactions on the sparkline.
- Fetching history for screens other than Status Monitor.
- Adding a third-party charting library.
