# AI Dashboard: Door Activity Alerts & Ring Camera Snapshot Design

Date: 2026-08-15
Status: Approved by user (2026-08-15)

## Problem

1. The HOME screen alert banner constantly shows front door and backdoor "last activity"
   entries (e.g. `Front Door Last activity · 2 hours ago`). This duplicates the Doors
   section and never clears, so the banner is effectively permanent noise.
2. On the SECURITY screen, `camera.front_door_live_view` is a battery-powered Ring
   doorbell. Streaming it live (`camera_proxy_stream`) drains the battery and adds no
   value — the user only wants the last motion/ring snapshot, refreshed on events,
   with a slow fallback poll when idle.

## Decisions (from user)

- Door activity is **removed from the alert banner entirely**. Instead, the Doors
  section highlights a door whose activity happened within the last 10 minutes; the
  highlight dismisses itself after 10 minutes.
- The front door camera shows a still snapshot: prefer
  `camera.front_door_last_recording`, fall back to the `camera.front_door_live_view`
  still image. `camera.downstairs_live_view` (backyard) keeps its live stream.

## Changes

All changes are in `www/ai-dashboard/index.html` and `www/ai-dashboard/config.json`.
No Python changes; no HA restart required.

### 1. Alert banner / Doors

- **`getAlerts()`** (index.html ~line 832): delete the `last_activity` sensor block
  (currently ~lines 850-854). Motion, siren, low-battery, and update-available
  alerts are unchanged.
- **`renderDoors()`** (~line 910): for each door, if its mapped last-activity sensor
  (`config.sections.doors.lastActivity[doorId]`) has a timestamp within the last
  10 minutes, add a visual highlight to the door card: amber left border and a small
  `RECENT` badge next to the relative-time line. Otherwise render as today.
- **Auto-dismiss**: add a 30-second `setInterval` that recomputes the set of
  "recent" doors. If the set changed since the last render, re-render only the doors
  panel (give the doors panel container a stable `id` so it can be re-rendered in
  place) — not the whole screen, so the radar map is not torn down. State-change
  renders (existing `updateCard` path) continue to re-render the full screen as
  before.

### 2. Front door Ring camera snapshot

- **`config.json`** — extend `sections.cameras` with an optional `snapshot` map:
  ```json
  "cameras": {
    "title": "Cameras",
    "icon": "📷",
    "entities": ["camera.front_door_live_view", "camera.downstairs_live_view"],
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
  }
  ```
  Also update the embedded default config in `index.html` (~line 296) to match.
- **`renderCameraFeed(entityId)`** (~line 701): if `entityId` has a `snapshot` entry:
  - Resolve the image source: use `preferEntity` if it exists in `states` and is
    available; otherwise use the camera entity itself.
  - Render a still image `/api/camera_proxy/<sourceEntity>?ts=<cacheBuster>`
    (token query param preserved when `window.HA_INTEGRATION_PROXY` is not set,
    matching the existing fallback) instead of the MJPEG stream.
  - Show `LAST EVENT <relativeTime>` under the title, using the most recent
    timestamp among `activityEntities` (event entities carry their timestamp as
    state; the sensor is a timestamp device_class).
  - Offline handling stays as-is when the source entity is unavailable.
- **Refresh logic** (client-side, module-level per camera):
  - On a state change to any entity in `activityEntities`: refresh the snapshot
    `img.src` (new cache-buster) ~20 seconds later, giving Ring time to upload the
    new image. Multiple events within the window coalesce into one refresh.
  - Fallback poll: every 5 minutes, if the most recent activity is older than
    60 minutes and the snapshot has not been refreshed in the last 30 minutes,
    refresh it.
- **Prerequisite (manual, user)**: `camera.front_door_last_recording` is disabled by
  the Ring integration (requires a Ring Protect plan). The user may enable it in HA
  (Settings → Devices → Ring → Front Door → disabled entities). Until then the
  dashboard silently falls back to the live_view still — no error shown.

## Error handling

- Missing/unknown entities in the `snapshot` config are ignored; the camera renders
  as a normal live feed.
- If both `preferEntity` and the camera entity are unavailable, the existing
  "CAMERA OFFLINE" panel renders.
- Snapshot refresh failures just keep the last successfully loaded image.

## Testing / validation

- HTML parse check per AGENTS.md:
  `py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
- JSON check: `python -m json.tool www/ai-dashboard/config.json > /dev/null`
- Manual verification in browser (hard refresh):
  - Banner no longer lists door last-activity entries.
  - Open/close a door → its Doors card shows the RECENT highlight; after 10 min it clears.
  - SECURITY screen: front door shows a still image with LAST EVENT label; backyard
    still streams live; triggering front door motion refreshes the snapshot.
