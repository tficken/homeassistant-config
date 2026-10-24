# Repo Hygiene & CI Coverage Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close validation gaps (budget dashboard, blueprints, ESPHome YAML, budget JS/HTML), promote the 9 git-ignored budget tests into the repo with pytest enforcement, and purge dead files and private statement PDFs.

**Architecture:** Extend the existing validators rather than adding new tooling: `scripts/validate_ha_yaml.py` gains files, the `validate-dashboard` CI job gains budget-page checks, and tests move from `tmp/` into `custom_components/ai_dashboard_proxy/tests/` running under pytest locally (pre-commit) and in CI.

**Tech Stack:** Python 3.11, PyYAML, pytest, pypdf, aiohttp (test-only), Node 22 (`--check`), yamllint, GitHub Actions, pre-commit.

**Spec:** `docs/superpowers/specs/2026-10-23-repo-hygiene-ci-design.md`

## Global Constraints

- **No real bank statement data in git.** The repo is public. All parser tests must use synthetic statement text built by the fixture helper in Task 5. The `tmp/statement-*.pdf` files are deleted in Task 7, never committed.
- `tmp/` is git-ignored — moving tests out of it is a plain filesystem move, not `git mv`.
- Follow existing conventions: conventional-commit messages, 2-space YAML, `language: system` local pre-commit hooks with `pass_filenames: false` + `always_run: true`.
- The existing tmp tests are script-style (module-level asserts). Promotion = mechanical conversion to pytest test functions; keep assertion logic verbatim unless a step says otherwise.
- Local pytest needs `pip install pytest pypdf aiohttp` (aiohttp is used for real by `test_upload_handler`).

## Review Focus

1. **Real-PDF regression coverage is intentionally dropped.** `extract_pdf_text` was only ever exercised against the 6 real statements; after this plan, CI covers the text path (`parse_statement`/`extract_transactions`/`categorize`) but not PDF decoding. Accepted trade-off — PDF decoding failures surface as upload errors in production. No test to add; noted here so a reviewer doesn't "fix" it by committing a real statement.
2. **Statement format drift.** The synthetic fixtures encode the format as the parser understands it — if the bank changes layout, synthetic tests stay green while real uploads fail. Task 5's missing-field error test pins the failure mode (clear `StatementParseError`, not a traceback).
3. **pytest collection importing `ai_dashboard_proxy/__init__.py`** — it imports `homeassistant`, which is not installed in CI. The `tests/` dir has NO `__init__.py` and `conftest.py` inserts the package dir itself into `sys.path`, so test modules import `statement_parser` as a top-level module without touching `__init__.py`. Task 3 Step 4 proves this by running pytest in a clean checkout equivalent.
4. **`validate_ha_yaml.py` multi-constructor swallowing real errors.** The `!` catch-all returns `None` for every local tag, so a *tag* can never fail — but syntax errors, duplicate keys in strict constructs, and bad indentation still fail. Task 1 Step 3 includes a deliberate-corruption check.
5. **Windows line endings.** Repo files are CRLF-flavored and git warns on commit; this is pre-existing and harmless — do not "fix" line endings in this pack.

---

### Task 1: Extend `validate_ha_yaml.py` coverage

**Files:**
- Modify: `scripts/validate_ha_yaml.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: validator now covers `budget-dashboard.yaml`, `blueprints/**/*.yaml`, `esphome/crowpanel-hasp.yaml`. Same CLI contract: prints `OK: <file>` / `FAIL: <file>`, exit 1 on any failure.

- [ ] **Step 1: Edit the script**

Replace the imports/`HA_TAGS` block and `YAML_FILES` with:

```python
import glob
import sys
from pathlib import Path

import yaml

HA_TAGS = [
    "!include",
    "!include_dir_list",
    "!include_dir_named",
    "!include_dir_merge_list",
    "!include_dir_merge_named",
    "!secret",
    "!env_var",
]

for tag in HA_TAGS:
    yaml.SafeLoader.add_constructor(tag, lambda loader, node: None)

# ESPHome and other files use arbitrary local tags (!lambda, ...).
# Treat every local tag as a no-op so any of these files parse.
yaml.SafeLoader.add_multi_constructor("!", lambda loader, suffix, node: None)

YAML_FILES = [
    "configuration.yaml",
    "automations.yaml",
    "scripts.yaml",
    "budget-dashboard.yaml",
    "esphome/crowpanel-hasp.yaml",
] + sorted(glob.glob("blueprints/**/*.yaml", recursive=True))
```

(The rest of the script — the loop and error handling — is unchanged.)

- [ ] **Step 2: Run it**

Run: `python scripts/validate_ha_yaml.py`
Expected: `OK:` for all 3 original files plus `budget-dashboard.yaml`, `esphome/crowpanel-hasp.yaml`, and each `blueprints/**/*.yaml` file (7 blueprint files today). Exit code 0.

- [ ] **Step 3: Verify it still catches errors**

Run: `printf 'x: [unclosed\n' >> budget-dashboard.yaml && python scripts/validate_ha_yaml.py; git checkout budget-dashboard.yaml`
Expected: `FAIL: budget-dashboard.yaml` printed and non-zero exit; then the file is restored and a re-run is all `OK:`.

- [ ] **Step 4: Commit**

```bash
git add scripts/validate_ha_yaml.py
git commit -m "ci: validate budget dashboard, blueprints, and ESPHome YAML"
```

---

### Task 2: Budget page JS/HTML checks in CI

**Files:**
- Modify: `.github/workflows/validate.yml` (append steps to the `validate-dashboard` job, after the "Validate AI dashboard HTML" step)

**Interfaces:**
- Consumes: existing `validate-dashboard` job (Node 22 + Python already set up there).
- Produces: two new steps in that job.

- [ ] **Step 1: Append the steps**

```yaml
      - name: Budget page JS syntax
        run: |
          for f in $(find www/budget/js -name '*.js'); do
            node --input-type=module --check < "$f" || exit 1
          done
          echo "Budget JS modules OK"
      - name: Validate budget page HTML
        run: python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/budget/index.html', encoding='utf-8').read()); print('Budget HTML parse OK')"
```

- [ ] **Step 2: Verify locally**

Run:
```bash
for f in $(find www/budget/js -name '*.js'); do .tools/node/node.exe --input-type=module --check < "$f" || exit 1; done
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/budget/index.html', encoding='utf-8').read()); print('Budget HTML parse OK')"
```
Expected: no errors; `Budget HTML parse OK`.

- [ ] **Step 3: Validate workflow YAML and commit**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/validate.yml', encoding='utf-8')); print('workflow valid')"`

```bash
git add .github/workflows/validate.yml
git commit -m "ci: syntax-check budget page JS and HTML"
```

---

### Task 3: Test scaffolding + self-contained tests

**Files:**
- Create: `custom_components/ai_dashboard_proxy/tests/conftest.py`
- Create: `custom_components/ai_dashboard_proxy/tests/test_history_store.py` (moved + converted from `tmp/test_history_store.py`)
- Create: `custom_components/ai_dashboard_proxy/tests/test_category_rules.py` (moved + converted from `tmp/test_category_rules.py`)

**Interfaces:**
- Consumes: `tmp/test_history_store.py`, `tmp/test_category_rules.py` (existing, verified-passing scripts).
- Produces: `tests/conftest.py` inserting the proxy dir into `sys.path` (so `import statement_parser` / `import history_store` work without importing the package `__init__.py` — Review Focus item 3). Later tasks' test files rely on this conftest.

- [ ] **Step 1: Create conftest.py**

```python
import sys
from pathlib import Path

# Tests import proxy modules (statement_parser, history_store, http) as
# top-level modules so the package __init__ (which needs homeassistant) is
# never imported.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

Do NOT create `tests/__init__.py`.

- [ ] **Step 2: Convert the two test files**

For each of `tmp/test_history_store.py` and `tmp/test_category_rules.py`:
- Copy into `custom_components/ai_dashboard_proxy/tests/` under the same name.
- Delete the `sys.path.insert(0, "custom_components/ai_dashboard_proxy")` line (conftest handles it); keep the `noqa: E402` imports only if code still precedes them, otherwise drop the noqa.
- Wrap the module-level body in one or more `def test_*():` functions with descriptive names (e.g. `test_history_store_upsert_and_continuity`). Keep every assertion verbatim. Keep `tempfile.mkdtemp()` setup, but convert the `try/finally: shutil.rmtree(config)` into pytest's `tmp_path` fixture where the code allows a drop-in path swap; if the swap is not drop-in, keep the try/finally — do not restructure the assertions.

- [ ] **Step 3: Run pytest**

Run: `python -m pytest custom_components/ai_dashboard_proxy/tests/ -q`
(Install first if needed: `pip install pytest pypdf aiohttp`)
Expected: all tests in the two files pass.

- [ ] **Step 4: Prove no HA dependency**

Run: `python -c "import homeassistant"` → must fail (not installed locally); then re-run the pytest command — still green. This pins Review Focus item 3.

- [ ] **Step 5: Commit**

```bash
git add custom_components/ai_dashboard_proxy/tests/
git commit -m "test(budget): promote history-store and category-rules tests to pytest"
```

---

### Task 4: Promote endpoint/handler tests

**Files:**
- Create: `custom_components/ai_dashboard_proxy/tests/ha_stubs.py`
- Create: `custom_components/ai_dashboard_proxy/tests/test_budget_endpoints.py`, `test_history_enrichment.py`, `test_rules_endpoint.py`, `test_upload_handler.py` (moved + converted from the same-named `tmp/` files)

**Interfaces:**
- Consumes: `tests/conftest.py` from Task 3; the four `tmp/` test scripts.
- Produces: `ha_stubs.install_ha_stubs()` used by all four files; each test file exposes `def test_*():` functions.

- [ ] **Step 1: Extract the shared stub installer**

The four tmp files each begin with a `for name in [...]: sys.modules[name] = MagicMock()` loop stubbing `homeassistant.*` (and in `test_budget_endpoints.py` also `aiohttp` — NOTE: `test_upload_handler.py` uses the REAL aiohttp, so `aiohttp` must only be stubbed for the files that stub it today, not globally). Create `tests/ha_stubs.py`:

```python
"""Install MagicMock stubs for homeassistant modules so http.py imports standalone."""
import sys
from unittest.mock import MagicMock

HA_MODULES = [
    # copied verbatim from the union of the four tmp test files' stub lists
]


def install_ha_stubs(extra: list[str] | None = None) -> None:
    for name in HA_MODULES + (extra or []):
        sys.modules.setdefault(name, MagicMock())
```

Build `HA_MODULES` as the verbatim union of the stub lists in `tmp/test_budget_endpoints.py`, `tmp/test_history_enrichment.py`, `tmp/test_rules_endpoint.py`, and `tmp/test_upload_handler.py` (the loops are near-identical; `test_budget_endpoints.py`'s list is the superset for homeassistant modules but also stubs `aiohttp` — keep `aiohttp` OUT of `HA_MODULES` and pass it via `extra=["aiohttp"]` in `test_budget_endpoints.py` only). Files that configure stub attributes (e.g. `sys.modules["homeassistant.const"].CONF_X = ...` or `HttpRequestMapper` class attributes) keep those lines after calling `install_ha_stubs()`.

- [ ] **Step 2: Convert the four test files**

Same mechanical conversion as Task 3 Step 2: copy to `tests/`, drop the sys.path line, replace each stub loop with `install_ha_stubs(...)` (+ any per-file attribute configuration, kept verbatim), wrap bodies in `def test_*():` functions, keep all assertions and `asyncio.run(...)` calls verbatim. `test_upload_handler.py` must NOT stub aiohttp.

- [ ] **Step 3: Run pytest**

Run: `python -m pytest custom_components/ai_dashboard_proxy/tests/ -q`
Expected: all tests pass (Tasks 3 + 4 files).

- [ ] **Step 4: Commit**

```bash
git add custom_components/ai_dashboard_proxy/tests/
git commit -m "test(budget): promote endpoint and upload-handler tests to pytest"
```

---

### Task 5: Synthetic statement fixtures + parser tests

**Files:**
- Create: `custom_components/ai_dashboard_proxy/tests/statement_fixtures.py`
- Create: `custom_components/ai_dashboard_proxy/tests/test_statement_parser.py`, `test_transactions.py`, `test_categorize.py` (replacements for the PDF-dependent tmp scripts — these are REWRITES, not moves)

**Interfaces:**
- Consumes: `statement_parser.parse_statement(text)`, `extract_transactions(text, period_start: date, period_end: date)`, `categorize(transactions, rules=None)` — all take TEXT, not PDF bytes.
- Produces: `statement_fixtures.make_statement()` used by all three test files.

- [ ] **Step 1: Write the fixture builder**

`tests/statement_fixtures.py`:

```python
"""Synthetic West Gate Bank statement text fixtures (no real bank data).

Layout requirements come from statement_parser.py:
- "West Gate Bank" marker for parser recognition
- "Statement Dates  m/d/yy thru m/d/yy"
- Summary labels: "Balance Last Statement", "Deposits/Credits",
  "Checks/Debits", "Balance this Statement" (each followed by whitespace and
  a 1,234.56 amount)
- Optional count lines: "<n> Deposits/Credits" / "<n> Checks/Debits"
  (digit BEFORE the label) enable extraction-vs-summary consistency checks
- Transaction lines: "m/d  <detail>  <amount>[-]  <running balance>"
  (date without year, 2+ spaces before the amount, "-" suffix = debit)
- Card-type debits carry the merchant on the next non-empty line
"""


def _fmt(amount: float) -> str:
    return f"{amount:,.2f}"


def make_statement(period_start: str, period_end: str, beginning: float,
                   credits: list[tuple[str, str, float]],
                   debits: list[tuple[str, str, float, str]]) -> str:
    """Build synthetic statement text. credits: (date, detail, amount);
    debits: (date, detail, amount, merchant_continuation-or-"").
    The checksum always holds: ending = beginning + credits - debits."""
    deposits = round(sum(a for _, _, a in credits), 2)
    withdrawals = round(sum(a for _, _, a, _ in debits), 2)
    ending = round(beginning + deposits - withdrawals, 2)
    txs = sorted(
        [(d, det, amt, True, "") for d, det, amt in credits]
        + [(d, det, amt, False, merch) for d, det, amt, merch in debits],
        key=lambda t: tuple(int(p) for p in t[0].split("/")),
    )
    lines = [
        "West Gate Bank",
        f"Statement Dates  {period_start} thru {period_end}",
        f"Balance Last Statement  {_fmt(beginning)}",
        f"Deposits/Credits  {_fmt(deposits)}",
        f"Checks/Debits  {_fmt(withdrawals)}",
        f"Balance this Statement  {_fmt(ending)}",
        f"{len(credits)} Deposits/Credits",
        f"{len(debits)} Checks/Debits",
        "Date  Description  Amount  Balance",
    ]
    balance = beginning
    for date_, detail, amount, is_credit, merchant in txs:
        balance = round(balance + amount, 2) if is_credit else round(balance - amount, 2)
        suffix = "" if is_credit else "-"
        lines.append(f"{date_}  {detail}  {_fmt(amount)}{suffix}  {_fmt(balance)}")
        if merchant:
            lines.append(merchant)
    return "\n".join(lines) + "\n"
```

- [ ] **Step 2: Sanity-check the fixture against the real parser before writing tests**

Run a scratch check (do not commit the scratch file):

```bash
python - <<'EOF'
import sys
sys.path.insert(0, "custom_components/ai_dashboard_proxy")
sys.path.insert(0, "custom_components/ai_dashboard_proxy/tests")
from statement_fixtures import make_statement
from statement_parser import parse_statement

text = make_statement(
    "3/23/26", "4/19/26", 1000.00,
    credits=[("3/24", "PAYROLL ACME CORP", 1000.00), ("3/25", "PAYROLL ACME CORP", 1000.00)],
    debits=[("3/26", "CHECKCARD 0325 DOORDASH*DASH", 25.00, "DOORDASH*DASH"),
            ("3/27", "CHECKCARD 0326 CASEYS", 40.00, "CASEYS #1234 LINCOLN NE"),
            ("3/28", "ATM W/D", 100.00, ""),
            ("3/29", "CHECKCARD 0328 HYVEE", 335.00, "HYVEE #567")],
)
rec = parse_statement(text)
assert rec["month"] == "2026-04", rec["month"]
assert rec["beginning"] == 1000.00 and rec["ending"] == 2500.00
assert rec["warnings"] == [], rec["warnings"]
assert len(rec["transactions"]) == 6, len(rec["transactions"])
by_merchant = {t["merchant"]: t for t in rec["transactions"]}
assert by_merchant["DOORDASH*DASH"]["direction"] == "debit"
# ACH-style credits: the parser strips the PAYROLL prefix from the merchant
assert by_merchant["ACME CORP"]["direction"] == "credit"
print("fixture sanity OK")
EOF
```

Expected: `fixture sanity OK`. If an assertion fails, the fixture layout is wrong — fix `make_statement`, not the parser.

- [ ] **Step 3: Write `test_statement_parser.py` (rewrite)**

Test functions:
- `test_parse_two_synthetic_months` — two months built with `make_statement` (vary dates/amounts; month B's beginning = month A's ending). Assert `month`, `period_start`, `period_end`, all four balances, `parser == "westgate_checking"`, `warnings == []`.
- `test_unrecognized_statement` — `parse_statement("ACME BANK\n...")` raises `UnrecognizedStatementError` (use `pytest.raises`).
- `test_missing_field_error` — statement text with the `Balance this Statement` line deleted raises `StatementParseError` whose message names the missing field. This pins Review Focus item 2.
- `test_checksum_warning` — build a statement, then string-replace the ending-balance amount with a wrong value; assert `warnings` contains a "checksum mismatch" entry.

- [ ] **Step 4: Write `test_transactions.py` (rewrite)**

- `test_extract_counts_and_sums` — one synthetic statement with a known mix (≥2 credits, ≥4 debits including one ATM W/D and one ACH-style `STUDENT LN DEPT EDUCATION` debit with NO merchant continuation). Assert: total count, per-direction counts, per-direction sums, every tx has iso `date`/`type`/`merchant`/`amount`/`direction` keys, and the ACH debit's merchant is `DEPT EDUCATION`.
- `test_merchant_continuation` — card debit's merchant comes from the continuation line, not the detail.

- [ ] **Step 5: Write `test_categorize.py` (rewrite)**

- `test_builtin_categories` — synthetic debits with merchants DOORDASH (→ food_delivery), CASEYS (→ gas_fuel), HYVEE (→ groceries), NETFLIX (→ subscriptions), ATM W/D type (→ atm_cash), and `ZZZ UNKNOWN MERCHANT` (→ other). Assert `categories` totals/counts per bucket, `kpis["food_delivery"]["doordash_total"]`, and that `ZZZ UNKNOWN MERCHANT` appears in `unmatched` with the right total. Credits must be excluded (assert a PAYROLL credit does not appear in any bucket).
- `test_user_rule_precedence` — with `rules={"DOORDASH": "dining_out"}`, the DoorDash debit lands in `dining_out` (user rule beats built-in).

- [ ] **Step 6: Run the full suite**

Run: `python -m pytest custom_components/ai_dashboard_proxy/tests/ -q`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add custom_components/ai_dashboard_proxy/tests/
git commit -m "test(budget): synthetic statement fixtures; parser/transaction/categorize tests"
```

---

### Task 6: Wire pytest into CI + pre-commit + AGENTS.md

**Files:**
- Modify: `.github/workflows/validate.yml` (new job)
- Modify: `.pre-commit-config.yaml` (new local hook)
- Modify: `AGENTS.md` (Testing section)

**Interfaces:**
- Consumes: `custom_components/ai_dashboard_proxy/tests/` (Tasks 3–5).
- Produces: enforced test runs locally and in CI.

- [ ] **Step 1: Add the CI job**

Append to the `jobs:` section of `.github/workflows/validate.yml`:

```yaml
  budget-proxy-tests:
    name: Budget proxy tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install pytest pypdf aiohttp
      - run: python -m pytest custom_components/ai_dashboard_proxy/tests/ -q
```

- [ ] **Step 2: Add the pre-commit hook**

Append to the `local` repo's `hooks:` list in `.pre-commit-config.yaml`:

```yaml
      - id: pytest-ai-dashboard-proxy
        name: pytest ai_dashboard_proxy tests
        entry: python -m pytest custom_components/ai_dashboard_proxy/tests/ -q
        language: system
        pass_filenames: false
        always_run: true
```

- [ ] **Step 3: Update AGENTS.md Testing section**

In `AGENTS.md`, under `## Testing`, add after the lint line:

```markdown
- **Unit tests**: `python -m pytest custom_components/ai_dashboard_proxy/tests/ -q` (requires `pip install pytest pypdf aiohttp`)
```

- [ ] **Step 4: Verify**

Run: `pre-commit run --all-files`
Expected: all hooks pass, including the two new ones (the pytest hook is exercised here for the first time via pre-commit).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/validate.yml .pre-commit-config.yaml AGENTS.md
git commit -m "ci: run budget proxy tests in CI and pre-commit"
```

---

### Task 7: Delete dead files, purge tmp/

**Files:**
- Delete (tracked): `scripts/generate_ai_dashboard.py`, `scripts/generate_dashboard_from_token.py`, `scripts/redesign_dashboard.py`, `scripts/test_ai_dashboard.py`
- Delete (untracked/ignored): `.dashboard-gen/`, contents of `tmp/`

**Interfaces:**
- Consumes: nothing.
- Produces: a smaller repo. Everything deleted is recoverable from git history (tracked files) or regenerable (tmp scratch).

- [ ] **Step 1: Confirm no live references (safety check)**

Run:
```bash
grep -rn "generate_ai_dashboard\|generate_dashboard_from_token\|redesign_dashboard\|test_ai_dashboard\|dashboard-gen" scripts/ configuration.yaml automations.yaml scripts.yaml custom_components/ai_dashboard_proxy/ www/ .github/ .pre-commit-config.yaml AGENTS.md 2>/dev/null
```
Expected: no output. If anything appears, STOP and surface it — do not delete the referenced item.

- [ ] **Step 2: Delete tracked dead scripts**

```bash
git rm scripts/generate_ai_dashboard.py scripts/generate_dashboard_from_token.py scripts/redesign_dashboard.py scripts/test_ai_dashboard.py
```

- [ ] **Step 3: Purge tmp/ and .dashboard-gen/**

The promoted tests no longer live in tmp/ and nothing needs the statement PDFs anymore.

```bash
ls tmp/   # review first — anything not in the known-scratch list gets surfaced, not deleted
rm -f tmp/statement-*.pdf tmp/billy_*.json tmp/ha_states.json tmp/ha_entries.json tmp/ws_*.json tmp/ws_*.js tmp/test_*.py
rm -rf .dashboard-gen/
```

- [ ] **Step 4: Verify the suite is still green post-purge**

Run: `python -m pytest custom_components/ai_dashboard_proxy/tests/ -q && python scripts/validate_ha_yaml.py`
Expected: all green — nothing may reference tmp/ anymore.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: delete retired dashboard generator scripts"
git status --short   # expected: clean or only intended remaining edits
```

---

### Task 8: Docs drift fixes + final gate

**Files:**
- Modify: `docs/hacs-inventory.md`
- Modify: `docs/superpowers/plans/crowpanel-visual-upgrades.md` (add status header)

**Interfaces:**
- Consumes: installed `manifest.json` versions.
- Produces: docs matching reality.

- [ ] **Step 1: Verify installed versions**

Run:
```bash
grep -h '"version"' custom_components/alexa_media/manifest.json custom_components/bill_tracker/manifest.json custom_components/uix/manifest.json
```
Expected (per survey): alexa_media 5.17.0, bill_tracker 0.14.1, uix 8.4.0 — use whatever the manifests actually say.

- [ ] **Step 2: Update hacs-inventory.md**

Update the three version cells in `docs/hacs-inventory.md` to the values from Step 1.

- [ ] **Step 3: Add the crowpanel plan status header**

Insert after the `# CrowPanel visual upgrades plan` title line in `docs/superpowers/plans/crowpanel-visual-upgrades.md`:

```markdown
> **STATUS: EXECUTED (2026-09).** Icon PNGs, pressed-style scale animations, `weather_bg.png`, and status indicator dots all shipped in `esphome/crowpanel-hasp.yaml`. Kept for historical reference.
```

- [ ] **Step 4: Final full gate**

Run: `pre-commit run --all-files`
Expected: everything green.

- [ ] **Step 5: Commit**

```bash
git add docs/hacs-inventory.md docs/superpowers/plans/crowpanel-visual-upgrades.md
git commit -m "docs: sync hacs-inventory versions, mark crowpanel plan executed"
```
