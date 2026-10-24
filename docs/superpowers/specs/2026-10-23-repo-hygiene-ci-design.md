# Repo Hygiene & CI Coverage Pack — Design

Date: 2026-10-23

## Goal

Close the CI/validation gaps and repo clutter found in the 2026-10-23 hygiene
survey. Everything here is repo-side; nothing touches the running HA config
except deletions of dead files.

## 1. Validation coverage gaps

### `scripts/validate_ha_yaml.py`

Extend `YAML_FILES` to cover:

- `budget-dashboard.yaml` — tracked, live, registered in
  `configuration.yaml:53-61`; currently validated by nothing.
- `blueprints/**/*.yaml` (glob) — 7 tracked files, currently unchecked.
- `esphome/crowpanel-hasp.yaml` — largest hand-edited YAML in the repo.
  ESPHome uses different custom tags than HA: register `!lambda`, `!secret`,
  `!include`, `!extend`, `!args` as no-ops for this file (separate loader
  setup or a per-file tag set).

### CI dashboard job (`.github/workflows/validate.yml`)

- Add `node --input-type=module --check` loop over `www/budget/js/*.js`
  (6 modules: budget, history, outlook, rules, spending, trends), mirroring
  the existing ai-dashboard loop.
- Add the Python `html.parser` sanity check for `www/budget/index.html`.
- Pre-commit config gets the same coverage where hooks are file-driven.

## 2. Budget tests: promote + enforce

- Move `tmp/test_*.py` (9 files covering `statement_parser.py` and
  `history_store.py`) to `custom_components/ai_dashboard_proxy/tests/`.
- Fix import paths (tests likely use sys.path hacks to reach the proxy
  modules from `tmp/`; switch to imports relative to repo root or a
  `conftest.py` that inserts `custom_components/ai_dashboard_proxy`).
- **Run them first.** Fix any failures from bit-rot before committing.
- Add pytest step to CI (`validate.yml`) and a local pre-commit hook.
  Note: statement fixtures in `tmp/` (e.g. `billy_fixture*.json`, statement
  PDFs) — any fixture a test needs must move into `tests/fixtures/` EXCEPT
  bank PDFs (private financial data, public repo). If a test requires a real
  statement PDF, either synthesize a fixture PDF with pypdf or drop that
  test; no real statements in git.
- Update AGENTS.md Testing section: pytest command for the proxy tests.

## 3. Deletions

- Dead scripts (recoverable from git history):
  `scripts/generate_ai_dashboard.py`, `scripts/generate_dashboard_from_token.py`,
  `scripts/redesign_dashboard.py`, `scripts/test_ai_dashboard.py` (asserts
  pre-modularization dashboard; actively misleading).
- `.dashboard-gen/` — delete ONLY if grep confirms no live references
  (belongs to the retired generated-dashboard flow). If referenced anywhere
  live, leave it and note why in the commit.
- `tmp/` purge: 6 statement PDFs (16.3 MB, private data), Sept state dumps
  (`ha_states.json`, `ha_entries.json`, `ws_*.json`), `ws_*.js` probes,
  `billy_*.json` fixtures — EXCEPT anything the promoted tests need
  (see §2). tmp/ is git-ignored; this is disk cleanup, no commit.

## 4. Docs drift

- `docs/hacs-inventory.md`: bump to installed versions — alexa_media 5.17.0,
  bill_tracker 0.14.1, uix 8.4.0 (verify against each `manifest.json`).
- `docs/superpowers/plans/crowpanel-visual-upgrades.md`: add a status header
  (executed 2026-09; icons and weather_bg.png shipped). Undated filename
  stays — renaming breaks no links but gains little; the header is enough.
- AGENTS.md: Testing section gains the pytest line; if `.dashboard-gen/` is
  deleted, drop any mention of it.

## Deferred (explicitly not in this pack)

- `config.json.bak.*` keep-last-N pruning — proxy Python change, requires HA
  restart; separate item.
- `dashboard-backup-2026-08-05.json` — kept as a point-in-time artifact.
- Removing `custom_components/openhasp/` from disk — HACS UI action for the
  user, not a git operation.
- flake8 on `scripts/` — nice-to-have; the existing scripts predate the
  standard and would need a cleanup pass. Only if it comes free.

## Verification

- `pre-commit run --all-files` green.
- CI-equivalent local run of every validate.yml step green.
- `python -m pytest custom_components/ai_dashboard_proxy/tests/` green.
- Grep confirms no live references to deleted files.
