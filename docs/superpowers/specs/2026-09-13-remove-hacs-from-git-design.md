# Design: Remove HACS-Managed Code from Git

## Objective

Stop tracking HACS-managed integrations, Lovelace cards, and the downloaded theme in this repository so that future commits contain only configuration and custom code that we own. Provide a small manifest and restore notes so a fresh HA instance can still be rebuilt from this repo.

## Background

Currently the repo tracks everything under `custom_components/` and `www/community/`. HACS updates to `alexa_media`, `bambu_lab`, and other integrations therefore appear as large, noisy diffs that drown out actual config changes. The latest commit (`a0cef33`) is a typical example: it mixed HACS integration updates, test-file restructures, and AI dashboard work into one 101-file changeset.

The AGENTS.md already warns that HACS-managed directories are replaced on update, making them unsuitable places for our own files. Removing them from version control is the natural extension of that policy.

## What will be excluded from git

These directories are installed/managed by HACS and will be added to `.gitignore`:

- `custom_components/alexa_media/` — Alexa Media Player
- `custom_components/bambu_lab/` — Bambu Lab
- `custom_components/extended_openai_conversation/` — Extended OpenAI Conversation
- `custom_components/hacs/` — HACS itself
- `custom_components/openhasp/` — openHASP custom component
- `custom_components/pagerduty/` — PagerDuty (HACS-managed, despite being listed separately in AGENTS.md)
- `custom_components/uix/` — UI eXtension for Lovelace
- `www/community/` — HACS-downloaded Lovelace cards
- `themes/google_dark_theme/` — Google Dark Theme by JuanMTech (downloaded manually; treated as replaceable third-party content)

Also excluded:

- `tmp/` — scratch/working files (e.g., `ws_entries.json`, `ha_entries.json`) that were accidentally committed in the last changeset.

## What stays in git

- `configuration.yaml`, `automations.yaml`, `scripts.yaml`, `secrets.yaml`
- `custom_components/ai_dashboard_proxy/` — self-written integration
- `www/ai-dashboard/` — self-written wall dashboard
- `openhasp/wall_panel.yaml` and related config
- `scripts/` maintenance scripts
- `blueprints/`, `docs/`, CI workflow, `.yamllint.yaml`, `.gitignore`
- `.HA_VERSION` (currently gitignored, but that is a separate decision; this change leaves it alone)

## Inventory file

Create `docs/hacs-inventory.md` listing each HACS-managed item with:

- Directory/path
- Repository URL
- Installed version (from `manifest.json` or HACS UI at time of writing)
- Category (`integration`, `card`, `theme`)
- Notes (e.g., required for restore, dependencies)

Example:

```markdown
## Integrations

| Name | Path | Repository | Version |
|------|------|------------|---------|
| Alexa Media Player | `custom_components/alexa_media` | <https://github.com/alandtse/alexa_media_player> | 5.16.0 |
| Bambu Lab | `custom_components/bambu_lab` | <https://github.com/greghesp/ha-bambulab> | 2.2.26 |
| ... | ... | ... | ... |

## Cards

| Name | Path | Repository | Version |
|------|------|------------|---------|
| Mushroom | `www/community/lovelace-mushroom` | <https://github.com/piitaya/lovelace-mushroom> | (see HACS UI) |
| ... | ... | ... | ... |
```

The inventory is a human-readable reference, not a machine lockfile. Versions are advisory; HACS remains the source of truth for updates.

## Restore procedure

Documented in `docs/hacs-inventory.md`:

1. Clone this repo into the HA `/config` directory.
2. Install HACS using the standard HACS installer script.
3. Restart Home Assistant.
4. Open HACS and add each integration/card/theme from the inventory.
5. Install the versions listed (or newer, if compatible).
6. Restart Home Assistant after integrations are installed.
7. Reconfigure any integration credentials that are not restored from `.storage/` (e.g., Alexa Media Player, Bambu Lab, OpenAI).

Because `.storage/` is already gitignored, this procedure assumes a bare-metal restore; credentials and pairing state live there and must be re-entered anyway.

## Update workflow after this change

- Run HACS updates through the HA UI as usual.
- The updated files will no longer appear in `git status`.
- If an integration update requires a config change (e.g., new entity names, breaking changes), that config change will still be tracked normally.
- Periodically update `docs/hacs-inventory.md` with new versions when major updates happen, or at least when the inventory is next used for restore.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Fresh restore is more steps | The inventory doc lists exact items; restore is a one-time cost versus ongoing noisy commits. |
| HACS item becomes unavailable | Repository URLs in the inventory let you install manually or fork if needed. |
| Forgetting to reinstall an item | The inventory is a checklist; missing items will show as missing entities/cards on restore. |
| CI breaks because it expected excluded files | The CI workflow only validates `custom_components/ai_dashboard_proxy`; no changes needed there. |
| Existing git history still contains old HACS files | Acceptable; we are not rewriting history. Future commits will be clean. |

## Implementation steps

1. Update `.gitignore` with the directories listed above.
2. Create `docs/hacs-inventory.md` with current versions.
3. Update `AGENTS.md`:
   - Add the HACS exclusion policy near the Custom Integrations section.
   - Reference `docs/hacs-inventory.md` for restore.
   - Remove or update the Testing section referencing deleted `bambu_lab/pybambu/tests/`.
4. Run `git rm -r --cached` for each excluded directory to remove them from git tracking while leaving them on disk.
5. Verify `git status` shows only deletions and the new/modified tracked files.
6. Commit with a message like "Remove HACS-managed code from git; add restore inventory".
7. Validate HA still starts normally (files are unchanged on disk; only git tracking changes).

## Validation

- `git status --short` shows no untracked HACS directories and no pending modifications from them.
- The new `.gitignore` entries are syntactically valid.
- `docs/hacs-inventory.md` lists every currently installed HACS integration, card, and theme.
- HA restart succeeds because no files were deleted from disk, only from git index.
