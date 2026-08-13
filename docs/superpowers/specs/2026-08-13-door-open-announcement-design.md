# Door/Window Open Announcement Automation

## Goal

When any monitored door or window opens, announce which one opened over Alexa devices and send a phone notification only when no one is home.

## Background

Two ZHA door/window sensors exist:
- `binary_sensor.living_room_front_door`
- `binary_sensor.backdoor`

Alexa Media Player is now installed and configured, exposing:
- `media_player.everywhere` — multi-room Alexa announcement group
- `media_player.master_bedroom_echo_dot` — single Echo Dot
- Several Fire TV media players via the `alexa_media` platform

Person entities for presence:
- `person.woteg`
- `person.bobbie`

## Design

### Trigger

State change to `'on'` for the known door/window sensors. This fires when a door/window opens.

### Condition

No conditions on the trigger itself — the automation always runs. Notification vs. announcement decisions are handled inside actions.

### Actions

1. **Build the message**
   - Use the triggering entity’s `friendly_name` to build a message like `"Front door is open"`.

2. **Announce over Alexa Everywhere**
   - Use `media_player.play_media` on `media_player.everywhere` with `media_content_type: announce` and the message as `media_content_id`.

3. **Conditional phone notification**
   - Only send `notify.mobile_app_traviss_iphone` when both `person.woteg` and `person.bobbie` are `not_home`.

### Mode

`single` — avoid overlapping announcements if multiple sensors trigger in quick succession.

## Files to change

- `automations.yaml` — add the new automation.

## Validation

- Run `python scripts/validate_ha_yaml.py`.
- Reload automations in Home Assistant.
- Open a door/window and verify the announcement plays on Alexa devices.
