# AI Dashboard: Door Alerts & Ring Camera Snapshot Implementation Plan

> **Note (2026-08-26):** Completed and shipped (checkboxes were left unchecked during execution). The camera half has since been superseded: ring-mqtt now provides snapshot cameras and reliable motion binary_sensors, the backyard cam is a true live ffmpeg/RTSP feed (`camera.backyard_rtsp_live`), and motion snapshots are archived with a HISTORY viewer. The door-alerts half is still accurate.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop door last-activity entries from permanently occupying the alert banner (show a self-dismissing RECENT highlight in the Doors section instead), and switch the battery-powered front door Ring camera on the SECURITY screen from a live stream to an event-refreshed still snapshot.

**Architecture:** All changes are client-side in `www/ai-dashboard/index.html` (a standalone HTML/JS dashboard served by the `ai_dashboard_proxy` custom component) plus a config addition in `www/ai-dashboard/config.json`. Door recency is derived from the existing `sections.doors.lastActivity` sensor mapping. Camera snapshot mode is driven by a new optional `sections.cameras.snapshot` config map; refreshes hook into the existing WebSocket `state_changed` handler.

**Tech Stack:** Vanilla JS/HTML in a single file, Home Assistant WebSocket API, JSON config.

**Spec:** `docs/superpowers/specs/2026-08-15-ai-dashboard-door-alerts-ring-camera-design.md`

## Global Constraints

- Only touch `www/ai-dashboard/index.html` and `www/ai-dashboard/config.json`. No Python changes, no HA restart.
- Match the existing code style: inline styles, template literals, `escapeHtml()` on all rendered strings, `var(--amber)`/`var(--green)`/`var(--text-muted)` CSS variables.
- After every task, validate:
  - `py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
  - `python -m json.tool www/ai-dashboard/config.json > /dev/null` (after config tasks)
- There is no JS test harness in this project; verification is the syntax checks above plus the manual browser checks listed in each task. Do not invent a test framework.
- `camera.front_door_last_recording` is disabled by the Ring integration; the code must work whether or not the user enables it (automatic fallback, no error UI).

---

### Task 1: Remove door last-activity entries from the alert banner

**Files:**
- Modify: `www/ai-dashboard/index.html:850-854` (inside `getAlerts()`)

**Interfaces:**
- Consumes: existing `getAlerts()` (line 832) and `renderAlertBanner()` (line 627).
- Produces: `getAlerts()` no longer returns door/backdoor `last_activity` entries. No signature changes.

- [ ] **Step 1: Delete the last_activity alert block**

In `getAlerts()`, delete exactly this block (lines 850-854):

```js
    if (domain === "sensor" && id.includes("last_activity") && !isUnavailable(state)) {
      const label = friendlyName(id);
      const when = relativeTime(state.state);
      if (when) alerts.push(`${label} · ${when}`);
    }
```

The remaining branches (motion binary_sensor, siren, battery < 20, update available) stay untouched.

- [ ] **Step 2: Validate HTML**

Run: `py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
Expected: `HTML parse OK`

- [ ] **Step 3: Manual browser check (hard refresh, Ctrl+Shift+R)**

On the HOME screen the alert banner no longer shows `Front Door Last activity · ...` or `Downstairs Last activity · ...`. If no other alert condition is active, the banner is gone entirely.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "Remove door last-activity entries from AI dashboard alert banner"
```

---

### Task 2: RECENT highlight in the Doors section with 10-minute auto-dismiss

**Files:**
- Modify: `www/ai-dashboard/index.html` — `renderDoors()` (line 910), `renderHomeScreen()` doors panel construction (line 1035), `init()` (line 1771)

**Interfaces:**
- Consumes: `config.sections.doors.lastActivity` map, `states`, `relativeTime()`, `isUnavailable()`, `sectionTitle()`, `renderTerminalPanel()`.
- Produces:
  - `DOOR_RECENT_WINDOW_MS` (const, `10 * 60 * 1000`)
  - `recentDoorIds(): string[]` — door entity IDs whose mapped last-activity timestamp is within the window
  - `refreshDoorRecency(): void` — re-renders the `#doors-panel` container in place when the recent set changes
  - A `#doors-panel` wrapper div around the doors panel on the HOME screen

- [ ] **Step 1: Add the recency helpers**

Insert after the `relativeTime()` function (ends line 548):

```js
const DOOR_RECENT_WINDOW_MS = 10 * 60 * 1000;

function recentDoorIds() {
  const map = (config.sections && config.sections.doors && config.sections.doors.lastActivity) || {};
  const recent = [];
  for (const doorId of Object.keys(map)) {
    const s = states[map[doorId]];
    if (!s || isUnavailable(s)) continue;
    const t = new Date(s.state).getTime();
    if (!isNaN(t) && Date.now() - t < DOOR_RECENT_WINDOW_MS) recent.push(doorId);
  }
  return recent;
}

let lastRecentDoorKey = "";
function refreshDoorRecency() {
  const key = recentDoorIds().join(",");
  if (key === lastRecentDoorKey) return;
  lastRecentDoorKey = key;
  const el = document.getElementById("doors-panel");
  if (el && currentScreen === "home") {
    el.innerHTML = renderTerminalPanel(sectionTitle("doors"), renderDoors());
  }
}
```

- [ ] **Step 2: Highlight recent doors in `renderDoors()`**

At the top of `renderDoors()`, after the `lastActivityMap` line (line 914), add:

```js
  const recentDoors = recentDoorIds();
```

Inside the `doorIds.map(id => {` body, after the `lastActivity` const (line 929), add:

```js
    const isRecent = recentDoors.includes(id);
```

Change the card opening div (line 932) from:

```js
      <div class="terminal-panel" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;" data-entity-id="${id}">
```

to:

```js
      <div class="terminal-panel" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;${isRecent ? "border-left:3px solid var(--amber);" : ""}" data-entity-id="${id}">
```

Change the last-activity line (line 937) from:

```js
            ${lastActivity ? `<div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(lastActivity)}</div>` : ""}
```

to:

```js
            ${lastActivity ? `<div style="font-size:0.75rem;color:var(--text-muted);">${isRecent ? '<span style="color:var(--amber);font-family:var(--font-mono);">RECENT&nbsp;</span>' : ""}${escapeHtml(lastActivity)}</div>` : ""}
```

- [ ] **Step 3: Wrap the doors panel in a stable container**

In `renderHomeScreen()`, change line 1035 from:

```js
  const doorsPanel = renderTerminalPanel(sectionTitle("doors"), renderDoors());
```

to:

```js
  const doorsPanel = `<div id="doors-panel">${renderTerminalPanel(sectionTitle("doors"), renderDoors())}</div>`;
```

At the end of `renderHomeScreen()`, after `initRadarMap();` (line 1080), add (keeps the recency key in sync so the interval doesn't immediately re-render):

```js
  lastRecentDoorKey = recentDoorIds().join(",");
```

- [ ] **Step 4: Start the 30-second recheck interval**

In `init()`, after `setInterval(updateClock, 1000);` (line 1790), add:

```js
  setInterval(refreshDoorRecency, 30000);
```

- [ ] **Step 5: Validate HTML**

Run: `py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
Expected: `HTML parse OK`

- [ ] **Step 6: Manual browser check (hard refresh)**

- Doors section renders exactly as before when no door changed in the last 10 minutes.
- Open/close a door (or wait for activity): that door's card gets an amber left border and a `RECENT` prefix on its last-activity line.
- After ~10 minutes without new activity, the highlight disappears on its own (within 30 s of the window expiring) without a page reload.

- [ ] **Step 7: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "Highlight recently-active doors in Doors section with 10-min auto-dismiss"
```

---

### Task 3: Front door Ring camera — still snapshot with event-driven refresh

**Files:**
- Modify: `www/ai-dashboard/config.json` (cameras section, lines 77-84)
- Modify: `www/ai-dashboard/index.html` — `DEFAULT_CONFIG` cameras entry (line 296), new helpers (after `relativeTime()`, ~line 548 area, following the Task 2 helpers), `renderCameraFeed()` (line 701), WebSocket `state_changed` handler (line 1756), `init()` (line 1771)

**Interfaces:**
- Consumes: `config.sections.cameras.snapshot`, `states`, `token`, `window.HA_INTEGRATION_PROXY`, existing ws `state_changed` messages.
- Produces:
  - Config schema: `sections.cameras.snapshot.<cameraEntityId> = { preferEntity: string, activityEntities: string[] }`
  - `cameraSnapshotConfig(cameraId): object|null`
  - `snapshotSourceEntity(cameraId): string` — `preferEntity` when present and available, else `cameraId`
  - `snapshotLastActivityMs(snap): number` — latest timestamp (ms epoch) across `snap.activityEntities`, `0` if none
  - `snapshotImgUrl(srcEntity): string` — cache-busted still-image URL
  - `refreshCameraSnapshot(cameraId): void` — updates the `<img data-snapshot-camera="...">` src in place
  - `scheduleSnapshotRefresh(changedId): void` — coalesced 20 s delayed refresh after activity state changes
  - Snapshot `<img>` elements carry `data-snapshot-camera="<cameraEntityId>"`

- [ ] **Step 1: Add the snapshot config to `config.json`**

Replace the `cameras` section (lines 77-84):

```json
    "cameras": {
      "title": "Cameras",
      "icon": "📷",
      "entities": [
        "camera.front_door_live_view",
        "camera.downstairs_live_view"
      ]
    },
```

with:

```json
    "cameras": {
      "title": "Cameras",
      "icon": "📷",
      "entities": [
        "camera.front_door_live_view",
        "camera.downstairs_live_view"
      ],
      "snapshot": {
        "camera.front_door_live_view": {
          "preferEntity": "camera.front_door_last_recording",
          "activityEntities": [
            "event.front_door_motion",
            "event.front_door_ding",
            "sensor.front_door_last_activity"
          ]
        }
      }
    },
```

- [ ] **Step 2: Mirror the config in `DEFAULT_CONFIG`**

In `index.html`, change line 296 from:

```js
    cameras: { title: "Cameras", icon: "📷", entities: ["camera.front_door_live_view", "camera.downstairs_live_view"] },
```

to:

```js
    cameras: { title: "Cameras", icon: "📷", entities: ["camera.front_door_live_view", "camera.downstairs_live_view"], snapshot: { "camera.front_door_live_view": { preferEntity: "camera.front_door_last_recording", activityEntities: ["event.front_door_motion", "event.front_door_ding", "sensor.front_door_last_activity"] } } },
```

- [ ] **Step 3: Add the snapshot helpers**

Insert after the Task 2 helpers (after the `refreshDoorRecency()` function):

```js
const SNAPSHOT_EVENT_REFRESH_DELAY_MS = 20000;
const SNAPSHOT_IDLE_EVENT_WINDOW_MS = 60 * 60 * 1000;
const SNAPSHOT_IDLE_POLL_MS = 30 * 60 * 1000;
const SNAPSHOT_CHECK_MS = 5 * 60 * 1000;

const snapshotRefreshTimers = {};
const snapshotLastRefresh = {};

function cameraSnapshotConfig(cameraId) {
  const cams = (config.sections && config.sections.cameras) || {};
  return (cams.snapshot && cams.snapshot[cameraId]) || null;
}

function snapshotSourceEntity(cameraId) {
  const snap = cameraSnapshotConfig(cameraId);
  if (!snap) return cameraId;
  const pref = snap.preferEntity;
  if (pref && states[pref] && !isUnavailable(states[pref])) return pref;
  return cameraId;
}

function snapshotLastActivityMs(snap) {
  let latest = 0;
  for (const id of (snap.activityEntities || [])) {
    const s = states[id];
    if (!s || isUnavailable(s)) continue;
    const t = new Date(s.state).getTime();
    if (!isNaN(t) && t > latest) latest = t;
  }
  return latest;
}

function snapshotImgUrl(srcEntity) {
  const st = states[srcEntity];
  let base;
  if (st && st.attributes && st.attributes.entity_picture) {
    base = st.attributes.entity_picture;
  } else if (window.HA_INTEGRATION_PROXY) {
    base = `/api/camera_proxy/${srcEntity}`;
  } else {
    base = `/api/camera_proxy/${srcEntity}?token=${encodeURIComponent(token)}`;
  }
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}ts=${Date.now()}`;
}

function refreshCameraSnapshot(cameraId) {
  const img = document.querySelector(`img.camera-feed[data-snapshot-camera="${cameraId}"]`);
  if (!img) return;
  snapshotLastRefresh[cameraId] = Date.now();
  img.src = snapshotImgUrl(snapshotSourceEntity(cameraId));
}

function scheduleSnapshotRefresh(changedId) {
  const cams = (config.sections && config.sections.cameras) || {};
  const snapMap = cams.snapshot || {};
  for (const cameraId of Object.keys(snapMap)) {
    const acts = snapMap[cameraId].activityEntities || [];
    if (!acts.includes(changedId)) continue;
    clearTimeout(snapshotRefreshTimers[cameraId]);
    snapshotRefreshTimers[cameraId] = setTimeout(() => refreshCameraSnapshot(cameraId), SNAPSHOT_EVENT_REFRESH_DELAY_MS);
  }
}
```

- [ ] **Step 4: Snapshot mode in `renderCameraFeed()`**

Replace the whole `renderCameraFeed()` function (lines 701-727) with:

```js
function renderCameraFeed(entityId) {
  const name = friendlyName(entityId);
  const snap = cameraSnapshotConfig(entityId);
  const srcEntity = snap ? snapshotSourceEntity(entityId) : entityId;
  const state = states[srcEntity];
  const offline = isUnavailable(state);
  if (offline) {
    return `<div class="terminal-panel" style="margin-bottom:10px;" data-entity-id="${entityId}">
      <div class="panel-title">${escapeHtml(name)}${renderOfflineBadge()}</div>
      <div class="panel-body" style="padding:0;">
        <div style="width:100%;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:#000;color:var(--danger);font-family:var(--font-mono);">CAMERA OFFLINE</div>
      </div>
    </div>`;
  }
  let src = "";
  if (snap) {
    src = snapshotImgUrl(srcEntity);
    snapshotLastRefresh[entityId] = Date.now();
  } else if (state && state.attributes && state.attributes.entity_picture) {
    src = state.attributes.entity_picture;
  } else if (window.HA_INTEGRATION_PROXY) {
    src = `/api/camera_proxy_stream/${entityId}`;
  } else {
    src = `/api/camera_proxy_stream/${entityId}?token=${encodeURIComponent(token)}`;
  }
  const lastEventMs = snap ? snapshotLastActivityMs(snap) : 0;
  const lastEventLabel = lastEventMs ? relativeTime(new Date(lastEventMs).toISOString()) : "";
  const titleSuffix = snap && lastEventLabel
    ? ` <span style="color:var(--text-muted);font-size:0.75rem;">· LAST EVENT ${escapeHtml(lastEventLabel)}</span>`
    : "";
  return `<div class="terminal-panel" style="margin-bottom:10px;" data-entity-id="${entityId}">
    <div class="panel-title">${escapeHtml(name)}${titleSuffix}</div>
    <div class="panel-body" style="padding:0;">
      <img class="camera-feed" ${snap ? `data-snapshot-camera="${entityId}"` : ""} src="${src}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#000;" alt="${escapeHtml(name)}">
    </div>
  </div>`;
}
```

Note: this intentionally does NOT use the MJPEG `camera_proxy_stream` for snapshot cameras, and the `<img>` gets `data-snapshot-camera` so `refreshCameraSnapshot()` can update it without re-rendering the screen (which would restart the backyard live stream).

- [ ] **Step 5: Hook activity events into the WebSocket handler**

Change the `state_changed` block (lines 1756-1759) from:

```js
    if (msg.type === "event" && msg.event && msg.event.event_type === "state_changed") {
      const s = msg.event.data.new_state;
      if (s) { states[s.entity_id] = s; updateCard(s); }
    }
```

to:

```js
    if (msg.type === "event" && msg.event && msg.event.event_type === "state_changed") {
      const s = msg.event.data.new_state;
      if (s) { states[s.entity_id] = s; updateCard(s); scheduleSnapshotRefresh(s.entity_id); }
    }
```

- [ ] **Step 6: Start the idle-poll interval**

In `init()`, after `setInterval(refreshDoorRecency, 30000);` (added in Task 2), add:

```js
  setInterval(() => {
    const cams = (config.sections && config.sections.cameras) || {};
    const snapMap = cams.snapshot || {};
    for (const cameraId of Object.keys(snapMap)) {
      const lastEvent = snapshotLastActivityMs(snapMap[cameraId]);
      const idleLongEnough = !lastEvent || (Date.now() - lastEvent) > SNAPSHOT_IDLE_EVENT_WINDOW_MS;
      const stale = (Date.now() - (snapshotLastRefresh[cameraId] || 0)) >= SNAPSHOT_IDLE_POLL_MS;
      if (idleLongEnough && stale) refreshCameraSnapshot(cameraId);
    }
  }, SNAPSHOT_CHECK_MS);
```

- [ ] **Step 7: Validate HTML and JSON**

Run:
```bash
py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
python -m json.tool www/ai-dashboard/config.json > /dev/null && echo "config.json OK"
```
Expected: `HTML parse OK` and `config.json OK`

- [ ] **Step 8: Manual browser check (hard refresh, SECURITY screen)**

- Front door panel shows a still image (not a continuously-reconnecting stream) with a `· LAST EVENT <Xm ago>` label in the title.
- Backyard (`camera.downstairs_live_view`) still streams live.
- Trigger front door motion (or wait for it): the snapshot refreshes roughly 20 s after the event.
- With `camera.front_door_last_recording` still disabled in HA, the image comes from the live_view camera's still — no error is shown. (Optional: enable that entity under Settings → Devices → Ring → Front Door and confirm the source switches over after it becomes available.)

- [ ] **Step 9: Commit**

```bash
git add www/ai-dashboard/index.html www/ai-dashboard/config.json
git commit -m "Show event-refreshed still snapshot for battery Ring doorbell camera"
```
