# Remove HACS-Managed Code from Git — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop tracking HACS-managed integrations, Lovelace cards, the downloaded theme, and scratch files in git, and provide a restore inventory so future commits contain only owned configuration and custom code.

**Architecture:** Add directory-level `.gitignore` entries, create a human-readable `docs/hacs-inventory.md` manifest, update `AGENTS.md` to reflect the new policy, then use `git rm -r --cached` to un-track the directories while leaving them intact on disk. No code is deleted; only git index entries change.

**Tech Stack:** Git, GitHub, Home Assistant, HACS.

**Spec:** `docs/superpowers/specs/2026-09-13-remove-hacs-from-git-design.md`

## Global Constraints

- HA must continue to run normally after the change; files must remain on disk.
- Only git index membership changes in this plan; no source files are edited.
- Every task ends with a commit and a validation check.
- `docs/hacs-inventory.md` must list every currently installed HACS integration and card with repository URL and installed version.
- `AGENTS.md` must accurately describe which directories are HACS-managed and reference the inventory for restore.

---

## File Structure

| Path | Role | Change |
|------|------|--------|
| `.gitignore` | Exclude HACS dirs, theme, and `tmp/` | Modify |
| `docs/hacs-inventory.md` | Restore checklist with repo URLs and versions | Create |
| `AGENTS.md` | Document exclusion policy and restore procedure | Modify |
| `custom_components/{alexa_media,bambu_lab,extended_openai_conversation,hacs,openhasp,pagerduty,uix}/` | HACS-managed integrations | Remove from git index only |
| `www/community/*/` | HACS-managed Lovelace cards | Remove from git index only |
| `themes/google_dark_theme/` | Manually downloaded third-party theme | Remove from git index only |
| `tmp/` | Scratch/working files | Remove from git index and ignore |

---

## Task 1: Add HACS directories, theme, and `tmp/` to `.gitignore`

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `.gitignore` entries that cause Git to ignore the listed directories

- [ ] **Step 1: Append the following block to `.gitignore`**

```text
# HACS-managed integrations (reinstalled via HACS; see docs/hacs-inventory.md)
/custom_components/alexa_media/
/custom_components/bambu_lab/
/custom_components/extended_openai_conversation/
/custom_components/hacs/
/custom_components/openhasp/
/custom_components/pagerduty/
/custom_components/uix/

# HACS-managed Lovelace cards
/www/community/

# Downloaded third-party theme
/themes/google_dark_theme/

# Scratch / working files
/tmp/
```

- [ ] **Step 2: Validate the ignore rules**

Run:
```bash
git check-ignore -v custom_components/alexa_media/manifest.json
git check-ignore -v www/community/lovelace-mushroom/mushroom.js
git check-ignore -v themes/google_dark_theme/google_dark_theme.yaml
git check-ignore -v tmp/ha_entries.json
```

Expected: each command prints the matching `.gitignore` line and path.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore HACS-managed code, theme, and tmp/"
```

---

## Task 2: Create `docs/hacs-inventory.md`

**Files:**
- Create: `docs/hacs-inventory.md`

**Interfaces:**
- Consumes: versions from `manifest.json` files and `.storage/hacs.repositories`
- Produces: markdown inventory referenced by `AGENTS.md`

- [ ] **Step 1: Create `docs/hacs-inventory.md` with the following content**

```markdown
# HACS Inventory

This file lists all HACS-managed integrations, Lovelace cards, and downloaded themes used by this Home Assistant instance. These items are excluded from git and must be reinstalled after a fresh restore.

## Integrations

| Name | Path | Repository | Installed Version |
|------|------|------------|-------------------|
| Alexa Media Player | `custom_components/alexa_media` | <https://github.com/alandtse/alexa_media_player> | v5.16.0 |
| Bambu Lab | `custom_components/bambu_lab` | <https://github.com/greghesp/ha-bambulab> | v2.2.26 |
| Extended OpenAI Conversation | `custom_components/extended_openai_conversation` | <https://github.com/jekalmin/extended_openai_conversation> | v2.0.2 |
| HACS | `custom_components/hacs` | <https://github.com/hacs/integration> | v2.0.5 |
| openHASP | `custom_components/openhasp` | <https://github.com/HASwitchPlate/openHASP-custom-component> | v0.7.2 |
| PagerDuty | `custom_components/pagerduty` | <https://github.com/jdrozdnovak/ha_pagerduty> | v1.21.0 |
| UI eXtension (UIX) | `custom_components/uix` | <https://github.com/Lint-Free-Technology/uix> | v8.2.0 |

## Lovelace Cards

| Name | Path | Repository | Installed Version |
|------|------|------------|-------------------|
| Background Graph Entities | `www/community/lovelace-background-graph-entities` | <https://github.com/timmaurice/lovelace-background-graph-entities> | 1.12.0 |
| HA Weather Forecast Card | `www/community/ha-weather-forecast-card` | <https://github.com/troinine/ha-weather-forecast-card> | v1.1.0 |
| Mushroom | `www/community/lovelace-mushroom` | <https://github.com/piitaya/lovelace-mushroom> | v5.2.3 |
| Mushroom Better Sliders | `www/community/lovelace-mushroom-better-sliders` | <https://github.com/phischdev/lovelace-mushroom-better-sliders> | v3.0.2 |
| RadarWise | `www/community/radar-wise` | <https://github.com/TheWillMiller/radar-wise> | v0.8.23 |
| Slider Button Card | `www/community/slider-button-card` | <https://github.com/custom-cards/slider-button-card> | v1.13.0 |
| Swiss Army Knife Card | `www/community/swiss-army-knife-card` | <https://github.com/AmoebeLabs/swiss-army-knife-card> | v2.5.1 |
| Weather Radar Card | `www/community/weather-radar-card` | <https://github.com/jpettitt/weather-radar-card> | v3.7.2 |

## Themes

| Name | Path | Source | Notes |
|------|------|--------|-------|
| Google Dark Theme | `themes/google_dark_theme` | <https://github.com/JuanMTech/Home_Assistant_files> | Manually downloaded; not the `pacjo/google_dark_animated` entry shown in HACS. |

## Restore Procedure

1. Clone this repository into the Home Assistant `/config` directory.
2. Install HACS using the official installer:
   ```bash
   wget -O - https://get.hacs.xyz | bash -
   ```
3. Restart Home Assistant.
4. Open HACS and add each integration above from its repository.
5. Install each Lovelace card above.
6. Copy the Google Dark Theme files into `themes/google_dark_theme/` from the source link.
7. Restart Home Assistant.
8. Re-enter credentials for cloud integrations (Alexa Media Player, Bambu Lab cloud mode if used, Extended OpenAI Conversation, PagerDuty).

## Update Notes

- Run HACS updates through the Home Assistant UI as normal.
- Because these directories are git-ignored, updates will not appear in `git status`.
- Update this file when major versions change or when adding/removing HACS items.
```

- [ ] **Step 2: Verify the file renders and contains all entries**

Run:
```bash
python -m markdown docs/hacs-inventory.md > /dev/null 2>&1 || echo "No markdown module; skipping render test"
grep -c "custom_components/" docs/hacs-inventory.md
grep -c "www/community/" docs/hacs-inventory.md
```

Expected: 7 integration rows, 8 card rows, 1 theme row (counts include header rows; verify visually).

- [ ] **Step 3: Commit**

```bash
git add docs/hacs-inventory.md
git commit -m "docs: add HACS restore inventory"
```

---

## Task 3: Update `AGENTS.md`

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `docs/hacs-inventory.md`
- Produces: updated project guidance

- [ ] **Step 1: Update the Custom Integrations warning section**

Replace the paragraph that reads:

> **Warning**: HACS-managed integrations (`alexa_media`, `bambu_lab`, `extended_openai_conversation`, `hacs`, `openhasp`, `uix`) have their directories **replaced on update** — never store your own files (including AGENTS.md or notes) inside them.

With:

> **Warning**: HACS-managed integrations (`alexa_media`, `bambu_lab`, `extended_openai_conversation`, `hacs`, `openhasp`, `pagerduty`, `uix`) and HACS-downloaded Lovelace cards (`www/community/`) and the theme (`themes/google_dark_theme/`) are **excluded from git**. HACS replaces these directories on update. See `docs/hacs-inventory.md` for the restore checklist. Never store your own files inside HACS-managed directories.

- [ ] **Step 2: Update the Testing section**

Replace the Testing section that references the deleted `bambu_lab/pybambu/tests/` with:

```markdown
## Testing

There is no top-level test harness. The `bambu_lab` integration previously contained tests under `custom_components/bambu_lab/pybambu/tests/`; those files were removed when the integration was restructured and are no longer tracked. The only custom code owned by this repo is `custom_components/ai_dashboard_proxy` and `custom_components/pagerduty` (note: pagerduty is HACS-managed; see `docs/hacs-inventory.md`).

- **Python syntax check**: `python -m compileall custom_components/ai_dashboard_proxy -q`
- **Lint**: `flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503`
```

- [ ] **Step 3: Validate the edits**

Run:
```bash
grep -n "excluded from git" AGENTS.md
grep -n "docs/hacs-inventory.md" AGENTS.md
grep -n "bambu_lab/pybambu/tests/" AGENTS.md || echo "Stale test reference removed"
```

Expected: the new policy line and inventory reference are present; the old test path reference is absent.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for HACS exclusion policy and testing notes"
```

---

## Task 4: Remove HACS-managed directories from the git index

**Files:**
- Modify: git index only (files stay on disk)

**Interfaces:**
- Consumes: `.gitignore` entries from Task 1
- Produces: clean `git status` with deletions only for tracked HACS directories

- [ ] **Step 1: Run `git rm -r --cached` for each HACS directory**

```bash
git rm -r --cached custom_components/alexa_media
git rm -r --cached custom_components/bambu_lab
git rm -r --cached custom_components/extended_openai_conversation
git rm -r --cached custom_components/hacs
git rm -r --cached custom_components/openhasp
git rm -r --cached custom_components/pagerduty
git rm -r --cached custom_components/uix
git rm -r --cached www/community
git rm -r --cached themes/google_dark_theme
```

- [ ] **Step 2: Verify files remain on disk**

Run:
```bash
test -f custom_components/alexa_media/manifest.json && echo "alexa_media on disk"
test -d www/community/lovelace-mushroom && echo "cards on disk"
test -f themes/google_dark_theme/google_dark_theme.yaml && echo "theme on disk"
```

Expected: all three lines print.

- [ ] **Step 3: Verify git status shows only deletions and tracked changes**

Run:
```bash
git status --short
```

Expected:
- `D` lines for each HACS directory, the theme, and `www/community`.
- No `M` lines for files inside those directories.
- No `??` lines for those directories.
- `A` or `M` lines only for `.gitignore`, `docs/hacs-inventory.md`, `docs/superpowers/specs/...`, and `AGENTS.md`.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove HACS-managed code, theme, and cards from git index"
```

---

## Task 5: Remove `tmp/` from the git index

**Files:**
- Modify: git index only

**Interfaces:**
- Consumes: `tmp/` entry in `.gitignore` from Task 1
- Produces: `tmp/` no longer tracked

- [ ] **Step 1: Remove `tmp/` from the git index**

```bash
git rm -r --cached tmp/
```

- [ ] **Step 2: Verify `tmp/` files remain on disk**

Run:
```bash
test -d tmp && echo "tmp/ on disk"
```

Expected: prints `tmp/ on disk`.

- [ ] **Step 3: Verify git status**

Run:
```bash
git status --short
```

Expected: `tmp/` files show as `D` (deleted from index), not `??` (ignored).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove tmp/ scratch files from git index"
```

---

## Task 6: Final validation and push

**Files:**
- none (validation only)

**Interfaces:**
- Consumes: all previous tasks
- Produces: clean remote state

- [ ] **Step 1: Inspect the overall diff summary**

Run:
```bash
git diff --stat HEAD~5..HEAD
```

Expected: large deletions for HACS directories and cards; additions for `.gitignore`, `docs/hacs-inventory.md`, `AGENTS.md`, and the spec/plan docs.

- [ ] **Step 2: Confirm no unexpected tracked modifications remain**

Run:
```bash
git status --short
```

Expected: empty or only untracked files that are legitimately outside scope.

- [ ] **Step 3: Push to GitHub**

```bash
git push
```

- [ ] **Step 4: Optional — restart Home Assistant**

Because no files were deleted from disk, HA does not need a restart. If you want extra confidence, restart from **Developer Tools > YAML > Restart** and confirm no startup errors.

---

## Self-Review

**Spec coverage:**
- `.gitignore` updated to exclude HACS integrations, cards, theme, and `tmp/` → Task 1
- `docs/hacs-inventory.md` created with restore notes → Task 2
- `AGENTS.md` updated to document policy and stale testing section removed → Task 3
- HACS directories removed from git index while staying on disk → Task 4
- `tmp/` removed from git index → Task 5
- Validation and push → Task 6

**Placeholder scan:**
- No TBD/TODO placeholders.
- All commands are exact and runnable.
- Inventory entries use concrete versions and repository URLs.

**Type consistency:**
- Directory paths match between `.gitignore`, inventory, `AGENTS.md`, and `git rm` commands.
- PagerDuty is consistently treated as HACS-managed across all references.
