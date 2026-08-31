# Ring Cameras: Official Integration vs ring-mqtt Add-on

This instance uses **both** Ring paths, and they have very different capabilities. Read this before touching any camera entity, live view, or recording automation.

## The two paths

- **Official Ring integration** — `camera.front_door_live_view`, `camera.downstairs_live_view`, `event.front_door_*`, `event.downstairs_motion`.
  - **No true live view**: the `camera.*_live_view` entities replay the last cloud recording.
  - Its `event.*_motion` entities are unreliable.
- **ring-mqtt add-on** (`03cabcc9_ring_mqtt`, repo `https://github.com/tsightler/ring-mqtt-ha-addon`, auth via its web UI on ingress port 55123, bundles go2rtc).
  - Bridges Ring's on-demand WebRTC sessions to local RTSP at `rtsp://03cabcc9-ring-mqtt:8554/<camera_id>_live`.
  - Publishes its own `*_snapshot` cameras, motion binary sensors, and per-camera switches over MQTT.

## Hard constraints (Ring-side, not configurable)

- Streams are **on-demand only** — `switch.<cam>_live_stream` must be ON for the RTSP path to exist.
- Ring **kills any stream after ~10 minutes** and **suppresses motion/ding events while streaming**.
- The AI dashboard Security screen turns `switch.downstairs_live_stream` on when opened and off when closed (`livestream` map in the cameras section config). **Never leave these switches on permanently** — and note a tablet that sleeps/crashes mid-view never sends the "close" call, so the stream runs until Ring's ~10-minute kill (with motion suppressed during that window).
- Every live view creates a recording in the Ring app when the account has Ring Protect.

## Recording clips

`camera.record` **fails (HTTP 500) on the official `camera.*_live_view` entities** — their cloud recording URLs aren't streamable sources.

To record clips, use the RTSP path instead:

1. Turn on `switch.<cam>_live_stream`.
2. Wait ~8s for go2rtc to establish the stream.
3. Call `camera.record` on an RTSP-backed entity:
   - `camera.backyard_live_stream` (generic camera, HLS), or
   - `camera.front_door_rtsp_live` (ffmpeg camera in `configuration.yaml`, camera id `343ea435ca6d`).

This is exactly what the `ring_snapshot_archive_*` automations in `automations.yaml` do; clips land under `www/ai-dashboard/snapshots/<key>/` for the AI dashboard's HISTORY modal (see `www/ai-dashboard/AGENTS.md`).

## Camera entities in `configuration.yaml`

- `camera.backyard_rtsp_live` (ffmpeg) — transcodes the ring-mqtt RTSP feed to MJPEG for the AI dashboard's `/ai-dashboard/cam_stream` proxy. Configured with `-vf fps=2 -q:v 6`.
- `camera.front_door_rtsp_live` (ffmpeg) — used only for recording motion/ding clips; the dashboard shows last-activity stills for the front door (battery cam, no live view).

Both use the `ffmpeg` platform rather than `generic` on purpose: generic validates the source at setup and never creates the entity while the stream is off; ffmpeg connects lazily.
