# Sylvania Smart+ WiFi Bulbs — Integration Notes (2026-08-18)

## Summary

The bedroom smart bulbs (**Sylvania Smart+ WiFi A19, marking `3UTI E327386`**) are **not integrable with Home Assistant**. They are Tuya-based WiFi devices locked to the Sylvania Smart (white-label) app. After exhausting every integration path, the decision was to replace them with HA-compatible bulbs and revisit the bedroom presence-lighting project afterward.

## Paths tried (all failed)

- **Official Tuya cloud integration** — config flow's QR login rejects the Sylvania app: red error "Please use the designated APP to scan the code to log in". Only Smart Life / Tuya Smart apps are accepted.
- **Pairing bulbs into Smart Life directly** — app reports "device is not supported by this app". The bulbs are whitelisted to the Sylvania app only.
- **Tuya IoT project account linking** — created cloud project "Home Assistant" (Smart Home / Custom / Western America Data Center, IoT Core + Authorization APIs authorized) at platform.tuya.com. Devices → Link App Account → QR scan with Sylvania app just expires the code; account never links (0 accounts, 0 devices).
- **LocalTuya** — impossible without the account link above, since the local keys can't be extracted.
- **Matter** — this model has no Matter support (no Matter logo or 11-digit setup code on bulb/box; no certification listings).

The unused Tuya IoT project "Home Assistant" still exists under the user's developer account; harmless to leave, safe to delete. The Tuya discovery tile in HA (Settings → Devices & Services) was ignored.

## Next steps (when replacement bulbs arrive)

Recommended replacements, in order of fit for this setup:

1. **Zigbee bulbs** (Sengled, Innr, Third Reality) — pair directly with the existing ZHA coordinator; fully local, no cloud accounts.
2. **TP-Link Kasa / Tapo WiFi bulbs** — native local HA integration if WiFi is preferred.

Then build the **bedroom presence lighting** project:

- Presence: one of the two Hobeian ZG-204ZX sensors is in the bedroom (`binary_sensor.hobeian_zg_204zx` / `_2` — **TODO: identify which one and assign its area**).
- Use the sensor's `illuminance` reading to skip turning lights on when daylight is sufficient.
- Time-of-day brightness/color temp; respect `input_boolean.night_mode` (dim warm or skip entirely at night).
- Turn off a few minutes after presence clears.

Until then the bedroom bulbs remain Alexa-only via the Sylvania skill.
