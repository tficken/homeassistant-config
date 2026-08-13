# Update README.md and AGENTS.md

## Goal

Keep `README.md` and `AGENTS.md` accurate after adding Alexa Media Player, Home Assistant Cloud Alexa exposure, PagerDuty incident light flash, and door/window open announcements.

## Background

Recent changes added:
- `custom_components/alexa_media/` — Alexa Media Player integration (HACS-installed, configured).
- `cloud.alexa.filter` in `configuration.yaml` — exposes useful entities to Alexa.
- `PD New Incident` automation — flashes office ceiling fan red 3 times on new PagerDuty incidents.
- `Door/window open announcement` automation — announces openings on Alexa devices.

Neither `README.md` nor `AGENTS.md` currently reflect these additions.

## Design

### README.md updates

1. **Custom integrations section** — add `alexa_media` bullet describing its purpose.
2. **Automations section** — add bullets for:
   - PagerDuty incident → office ceiling fan red flash + restore
   - Door/window open → Alexa announcement + conditional phone notification
3. **Configuration architecture section** — add a bullet about Home Assistant Cloud Alexa exposure filter.
4. **Stack table** — add a row for voice assistants (Alexa / Echo).

### AGENTS.md updates

1. **Repository layout** — add `alexa_media/` under `custom_components/`.
2. **Custom integrations section** — add an `alexa_media` subsection with purpose, version, and key notes.
3. **Entity inventory** — add Alexa Media Player media player prefixes.
4. **Notes for future agents** — add a note that Echo announcements use `notify.alexa_media_<device>` with `type: announce`, and Fire TV devices do not reliably support announce.

## Files to change

- `README.md`
- `AGENTS.md`

## Validation

- Visual review of rendered Markdown.
- No YAML/JSON validation needed.
