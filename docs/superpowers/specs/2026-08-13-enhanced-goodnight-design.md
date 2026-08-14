# Enhanced Goodnight Routine

## Overview

Replace the existing `script.goodnight` with a modular, voice/dashboard-friendly routine that:

1. Warns about open doors/windows before changing anything.
2. Gradually dims lights instead of snapping them off.
3. Stops all media.
4. Arms overnight monitoring (camera motion detection + door-open phone alerts).
5. Plays brown noise on the master bedroom Echo Dot.
6. Resets itself in the morning.

## Goals

- Make going to bed feel intentional and safe.
- Reduce manual checks (doors, lights, security).
- Keep the design simple enough to maintain in YAML.
- Re-use the existing door-open announcement automation by adding a `night_mode` flag.

## Non-goals

- Climate/bedroom thermostat control (no climate entities currently in scope).
- Smart lock integration (no lock entities currently in scope).
- Complex "are you sure?" confirmations — warnings are one-way.

## Components

### `input_boolean.night_mode`

A single toggle added to `configuration.yaml`.

- Turned **on** at the end of goodnight.
- Turned **off** by the morning reset automation.
- Lets other automations know the house is in sleep mode.

### Helper scripts

All helpers live in `scripts.yaml` and are called by the main `goodnight` script.

#### `script.goodnight_door_check`

- Checks `binary_sensor.living_room_front_door` and `binary_sensor.backdoor`.
- If any are `on`, builds a friendly list of open items.
- Sends:
  - A persistent notification in Home Assistant.
  - An Alexa announcement on `media_player.master_bedroom_echo_dot` at 70% volume.
- Always returns success so the routine continues.

#### `script.goodnight_dim_lights`

- Finds every `light.*` entity that is currently `on`.
- Turns them to 1% brightness with a 10-second transition.
- Waits 11 seconds, then turns them off with a 2-second transition.
- Lights that are already off stay off.

#### `script.goodnight_enable_security`

- Turns on:
  - `switch.front_door_motion_detection`
  - `switch.downstairs_motion_detection`
- Sets `input_boolean.night_mode` to `on`.

### Updated `script.goodnight`

The orchestrator runs in this order:

1. `script.goodnight_door_check`
2. `script.goodnight_dim_lights`
3. `media_player.media_stop` on all media players
4. Set master bedroom Echo Dot volume to 20%
5. `media_player.play_media` on `media_player.master_bedroom_echo_dot`
   - Source: `https://files.noise-foundation.com/brown-noise-528-8h-v2.mp3`
   - Type: `audio/mpeg`
6. `script.goodnight_enable_security`
7. Send a final "Goodnight — security armed" notification to the phone.

### Updated `automation.door_window_open_announcement`

Change the phone-notification condition from:

```yaml
"{{ is_state('person.woteg', 'not_home') and is_state('person.bobbie', 'not_home') }}"
```

to:

```yaml
"{{ (is_state('person.woteg', 'not_home') and is_state('person.bobbie', 'not_home')) or is_state('input_boolean.night_mode', 'on') }}"
```

This keeps daytime behavior unchanged (phone only when nobody is home) but adds a phone alert at night even when someone is home.

### New `automation.goodnight_morning_reset`

Triggered by sunrise.

- Condition: `input_boolean.night_mode` is `on`.
- Actions:
  1. Turn `input_boolean.night_mode` off.
  2. Turn off motion detection switches.
  3. Stop media playback on `media_player.master_bedroom_echo_dot`.

## Data flow

```text
User triggers script.goodnight
        |
        v
script.goodnight_door_check  --warns if doors open-->
        |
        v
script.goodnight_dim_lights  --smoothly dims/off lights-->
        |
        v
media_stop + play brown noise -->
        |
        v
script.goodnight_enable_security -- motion on, night_mode on -->
        |
        v
phone confirmation

Overnight: door open -> Alexa announcement + phone alert (because night_mode is on)

Morning (sunrise): night_mode off, motion off, brown noise stops
```

## Files changed

- `configuration.yaml` — add `input_boolean.night_mode`.
- `scripts.yaml` — update `goodnight`, add three helper scripts.
- `automations.yaml` — update door-open announcement, add morning reset.

## Error handling / safety

- Non-critical actions (announcements, notifications, brown-noise playback) use `continue_on_error: true` so a flaky Alexa/cloud call does not abort the routine.
- Door check always continues; it never blocks lights or security.
- If the brown-noise stream fails, the rest of goodnight still completes. We can fall back to downloading the file to `www/brown_noise.mp3` and using `/local/brown_noise.mp3` if the external URL proves unreliable.
- Motion switches are simply turned on; if already on they stay on. No snapshot/restore complexity.

## Testing plan

1. Validate YAML with the local Node.js parser or Python fallback.
2. Run `script.goodnight_door_check` with a door open and verify the notification + announcement text.
3. Run `script.goodnight_dim_lights` with a few lights on and confirm smooth dimming.
4. Run the full `script.goodnight` and inspect the trace for each step.
5. Open a door after goodnight completes and confirm the phone notification fires because `night_mode` is on.
6. Verify `automation.goodnight_morning_reset` runs at sunrise (or trigger it manually) and stops playback.

## Dependencies / prerequisites

- `media_player.master_bedroom_echo_dot` is available and Alexa Media Player is working.
- External internet access for the brown-noise stream (until a local fallback is implemented).
- `binary_sensor.living_room_front_door` and `binary_sensor.backdoor` remain the door/window sensors of record.

## Future ideas (out of scope)

- Fade brown noise out over 30 seconds in the morning.
- Add a "last person to bed" auto-trigger based on phone charging/location.
- Include window sensors if any are added later.
- Adjust office/living-room ceiling fan behavior based on season.
