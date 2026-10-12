# Budget Statement History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add monthly bank-statement upload + spending history to the budget page, pre-seeded with 6 months of real statements.

**Architecture:** A pure-Python statement parser (`statement_parser.py`) and JSON history store (`history_store.py`) live inside `custom_components/ai_dashboard_proxy`, exposed via two new authenticated endpoints (`POST /budget/api/statement`, `GET /budget/api/history`). The budget page gets a History card (upload button + drag-drop + dual-axis bar/line chart). A shipped CLI script backfills history from existing PDFs. No coupling to `bill_tracker`.

**Tech Stack:** Home Assistant custom integration (aiohttp), pypdf, vanilla JS ES modules + inline SVG.

**Spec:** `docs/superpowers/specs/2026-10-11-budget-statement-history-design.md`

## Global Constraints

- Repo has **no test harness** (per AGENTS.md): verification scripts live in `tmp/` (git-ignored, not shipped) and use plain `assert`, run with `python`.
- `custom_components/ai_dashboard_proxy` must pass `python -m compileall -q` and `flake8 --max-line-length=120 --extend-ignore=E501,W503`.
- YAML must pass `python scripts/validate_ha_yaml.py`.
- Budget JS must pass `node --input-type=module --check` (use `.tools/node/node.exe`).
- `bill_tracker` pins `pypdf==6.16.1`; the proxy manifest must pin the **same** version to avoid a resolver conflict.
- Upload cap: 12 MB (`MAX_PDF_BYTES`), extraction bounds: 40 pages / 1,500,000 chars.
- History file: `<config>/budget/history.json` — never under `www/`, never in `.storage/`.
- All `/budget/api/*` routes use the existing `_is_authorized(request, secret)` check and must be registered **before** the `add_get("/budget/{path:.*}", budget_handler)` catch-all in `async_setup_http` (http.py:623-627).
- Git: repo root is `//homeassistant/config`, branch `master`. Commit only files each task names.

## Review Focus

1. Scanned/image-only PDF (no text layer) → must get a clear 422, not a 500. Pinned in Task 1, Step 4.
2. A statement from a different bank (e.g. a Chase PDF) → "unrecognized statement format", not a crash. Pinned in Task 1, Step 4.
3. Re-uploading the same month must replace, not duplicate or error. Pinned in Task 2, Step 3.
4. `history.json` deleted or corrupted on disk → `GET /budget/api/history` returns an empty history, not a 500. Pinned in Task 2, Step 3.
5. Upload body over 12 MB → clean 400, handler must not read unbounded memory. Pinned in Task 3, Step 2 (read with cap + 1).
6. Month-to-month continuity break (beginning ≠ previous stored ending) → stored, but surfaced as a warning. Pinned in Task 2, Step 3.

## Verified Sample Data (from the 6 real statements in `tmp/`)

| File | Period | Beginning | Deposits | Withdrawals | Ending |
|---|---|---|---|---|---|
| `tmp/statement-2026-04.pdf` | 3/23/26–4/19/26 | 4,837.57 | 4,616.88 | 5,232.30 | 4,222.15 |
| `tmp/statement-2026-05.pdf` | 4/20/26–5/17/26 | 4,222.15 | 4,312.80 | 5,037.30 | 3,497.65 |
| `tmp/statement-2026-06.pdf` | 5/18/26–6/21/26 | 3,497.65 | 4,312.80 | 5,713.92 | 2,096.53 |
| `tmp/statement-2026-07.pdf` | 6/22/26–7/19/26 | 2,096.53 | 4,641.59 | 5,420.43 | 1,317.69 |
| `tmp/statement-2026-08.pdf` | 7/20/26–8/23/26 | 1,317.69 | 6,616.48 | 5,408.79 | 2,525.38 |
| `tmp/statement-2026-09.pdf` | 8/24/26–9/20/26 | 2,525.38 | 5,168.80 | 4,969.71 | 2,724.47 |

All checksum (`beginning + deposits − withdrawals == ending`) and chain (each beginning == previous ending) invariants hold. Month key = period end date's `YYYY-MM`. Fingerprint: text contains `westgate.bank` or `West Gate Bank`.

---

### Task 1: Statement parser module

**Files:**
- Create: `custom_components/ai_dashboard_proxy/statement_parser.py`
- Test: `tmp/test_statement_parser.py` (git-ignored verification script)

**Interfaces:**
- Consumes: `pypdf` (already installed locally via `pip install --user pypdf`; manifest pin added in Task 3).
- Produces:
  - `StatementParseError(ValueError)`, `UnrecognizedStatementError(StatementParseError)`
  - `MAX_PDF_BYTES = 12 * 1024 * 1024`
  - `extract_pdf_text(content: bytes) -> str` — raises `StatementParseError`
  - `parse_statement(text: str) -> dict` — returns a month record `{"month": "YYYY-MM", "period_start": "YYYY-MM-DD", "period_end": "YYYY-MM-DD", "beginning": float, "deposits": float, "withdrawals": float, "ending": float, "parser": "westgate_checking", "warnings": list[str]}`; raises `UnrecognizedStatementError` / `StatementParseError`

- [ ] **Step 1: Write the parser module**

Create `custom_components/ai_dashboard_proxy/statement_parser.py`:

```python
"""Bank statement parsing for the budget page's history feature.

Pure stdlib + pypdf so it can be verified outside Home Assistant.
Bank parsers are a registry: each entry has matches(text) and parse(text).
Phase 1 ships West Gate Bank checking only.
"""
from __future__ import annotations

import re
from datetime import date
from io import BytesIO

from pypdf import PdfReader

MAX_PDF_BYTES = 12 * 1024 * 1024
MAX_PAGES = 40
MAX_TEXT_CHARS = 1_500_000

_MONEY = r"([\d,]+\.\d{2})"


class StatementParseError(ValueError):
    """Raised when a statement PDF cannot be parsed."""


class UnrecognizedStatementError(StatementParseError):
    """Raised when no bank parser recognizes the statement text."""


def extract_pdf_text(content: bytes) -> str:
    """Convert a digitally generated PDF to text, with safety bounds."""
    if not content:
        raise StatementParseError("Empty file")
    if len(content) > MAX_PDF_BYTES:
        raise StatementParseError("File is too large (12 MB max)")
    if not content.startswith(b"%PDF"):
        raise StatementParseError("File is not a PDF")
    try:
        reader = PdfReader(BytesIO(content), strict=False)
    except Exception as err:
        raise StatementParseError("Unable to open PDF") from err
    if len(reader.pages) > MAX_PAGES:
        raise StatementParseError("PDF has too many pages")
    chunks: list[str] = []
    size = 0
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception as err:
            raise StatementParseError("Unable to extract text from PDF") from err
        if text:
            chunks.append(text)
            size += len(text)
            if size >= MAX_TEXT_CHARS:
                break
    result = "\n".join(chunks)[:MAX_TEXT_CHARS].strip()
    if len(result) < 20:
        raise StatementParseError(
            "PDF has no extractable text (scanned statements/OCR are not supported)"
        )
    return result


def _money(raw: str) -> float:
    return float(raw.replace(",", ""))


def _short_date(raw: str) -> date:
    """Parse m/d/yy (2-digit year, 20xx)."""
    month, day, year = (int(part) for part in raw.split("/"))
    return date(2000 + year, month, day)


def _westgate_matches(text: str) -> bool:
    return "westgate.bank" in text or "West Gate Bank" in text


def _westgate_parse(text: str) -> dict:
    """Parse a West Gate Bank checking statement summary block."""
    period = re.search(
        r"Statement Dates\s+(\d{1,2}/\d{1,2}/\d{2})\s+thru\s+(\d{1,2}/\d{1,2}/\d{2})",
        text,
    )
    labels = {
        "beginning": r"Balance Last Statement\s+" + _MONEY,
        "deposits": r"Deposits/Credits\s+" + _MONEY,
        "withdrawals": r"Checks/Debits\s+" + _MONEY,
        "ending": r"Balance this Statement\s+" + _MONEY,
    }
    values: dict[str, float] = {}
    missing: list[str] = []
    for key, pattern in labels.items():
        found = re.search(pattern, text)
        if found:
            values[key] = _money(found.group(1))
        else:
            missing.append(key)
    if period is None:
        missing.append("statement period")
    if missing:
        raise StatementParseError(
            "West Gate Bank statement is missing fields: "
            + ", ".join(missing)
            + " — the format may have changed"
        )
    period_start = _short_date(period.group(1))
    period_end = _short_date(period.group(2))
    warnings: list[str] = []
    expected = round(values["beginning"] + values["deposits"] - values["withdrawals"], 2)
    if abs(expected - values["ending"]) > 0.01:
        warnings.append(
            f"checksum mismatch: beginning + deposits - withdrawals = {expected:.2f} "
            f"but statement shows {values['ending']:.2f}"
        )
    return {
        "month": period_end.isoformat()[:7],
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "beginning": values["beginning"],
        "deposits": values["deposits"],
        "withdrawals": values["withdrawals"],
        "ending": values["ending"],
        "parser": "westgate_checking",
        "warnings": warnings,
    }


_PARSERS = [
    {"matches": _westgate_matches, "parse": _westgate_parse},
]


def parse_statement(text: str) -> dict:
    """Run the first bank parser that recognizes the statement text."""
    for parser in _PARSERS:
        if parser["matches"](text):
            return parser["parse"](text)
    raise UnrecognizedStatementError(
        "Unrecognized statement format — only West Gate Bank checking statements are supported"
    )
```

- [ ] **Step 2: Write the verification script**

Create `tmp/test_statement_parser.py`:

```python
"""Verify the statement parser against the 6 real sample statements."""
import sys

sys.path.insert(0, "custom_components/ai_dashboard_proxy")
from statement_parser import (  # noqa: E402
    StatementParseError,
    UnrecognizedStatementError,
    extract_pdf_text,
    parse_statement,
)

EXPECTED = {
    "04": ("2026-04", "2026-03-23", "2026-04-19", 4837.57, 4616.88, 5232.30, 4222.15),
    "05": ("2026-05", "2026-04-20", "2026-05-17", 4222.15, 4312.80, 5037.30, 3497.65),
    "06": ("2026-06", "2026-05-18", "2026-06-21", 3497.65, 4312.80, 5713.92, 2096.53),
    "07": ("2026-07", "2026-06-22", "2026-07-19", 2096.53, 4641.59, 5420.43, 1317.69),
    "08": ("2026-08", "2026-07-20", "2026-08-23", 1317.69, 6616.48, 5408.79, 2525.38),
    "09": ("2026-09", "2026-08-24", "2026-09-20", 2525.38, 5168.80, 4969.71, 2724.47),
}

prev_ending = None
for mm, (month, pstart, pend, beg, deps, wdr, end) in EXPECTED.items():
    with open(f"tmp/statement-2026-{mm}.pdf", "rb") as f:
        rec = parse_statement(extract_pdf_text(f.read()))
    assert rec["month"] == month, (mm, rec["month"])
    assert rec["period_start"] == pstart and rec["period_end"] == pend, mm
    assert rec["beginning"] == beg and rec["deposits"] == deps, mm
    assert rec["withdrawals"] == wdr and rec["ending"] == end, mm
    assert rec["parser"] == "westgate_checking", mm
    assert rec["warnings"] == [], (mm, rec["warnings"])
    if prev_ending is not None:
        assert rec["beginning"] == prev_ending, f"chain break at {mm}"
    prev_ending = rec["ending"]
    print(f"{mm}: OK {rec['month']} in={deps} out={wdr} end={end}")

print("all 6 statements: parse + checksum + chain OK")
```

- [ ] **Step 3: Run verification against the samples**

Run: `python tmp/test_statement_parser.py`
Expected: six `OK` lines + `all 6 statements: parse + checksum + chain OK`

- [ ] **Step 4: Pin the failure modes (append to `tmp/test_statement_parser.py`, rerun)**

```python
# Failure modes: garbage text, missing fields, non-PDF, empty, too large.
try:
    parse_statement("Dear customer, your Chase statement is ready.")
    raise AssertionError("unrecognized text should raise")
except UnrecognizedStatementError:
    print("unrecognized bank: OK")

try:
    parse_statement("West Gate Bank loves you. westgate.bank")
    raise AssertionError("missing fields should raise")
except StatementParseError as err:
    assert "missing fields" in str(err)
    print("missing fields: OK")

for bad, label in [(b"", "empty"), (b"not a pdf at all", "non-PDF"),
                   (b"%PDF" + b" " * (12 * 1024 * 1024), "too large")]:
    try:
        extract_pdf_text(bad)
        raise AssertionError(f"{label} should raise")
    except StatementParseError:
        print(f"{label}: OK")
```

Run: `python tmp/test_statement_parser.py`
Expected: previous output plus `unrecognized bank: OK`, `missing fields: OK`, `empty: OK`, `non-PDF: OK`, `too large: OK`

- [ ] **Step 5: Lint + commit**

```bash
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
git add custom_components/ai_dashboard_proxy/statement_parser.py
git commit -m "feat(budget): add West Gate Bank statement parser"
```

---

### Task 2: History store

**Files:**
- Create: `custom_components/ai_dashboard_proxy/history_store.py`
- Test: `tmp/test_history_store.py` (git-ignored)

**Interfaces:**
- Consumes: month records from Task 1 (`parse_statement` output dict).
- Produces:
  - `load_history(config_dir: str) -> dict` — always returns `{"version": 1, "months": {...}}`, never raises on missing/corrupt file
  - `save_month(config_dir: str, record: dict, filename: str = "") -> tuple[dict, dict]` — upserts the record, returns `(full_history, stored_record)`; `stored_record` includes any cross-month continuity warning appended to `warnings`

- [ ] **Step 1: Write the store module**

Create `custom_components/ai_dashboard_proxy/history_store.py`:

```python
"""JSON-backed monthly statement history for the budget page.

Synchronous file I/O by design — call these from executor jobs in async
code. The file lives at <config>/budget/history.json: not under www/
(web-accessible) and not in .storage/ (HA-managed).
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime

DIRNAME = "budget"
FILENAME = "history.json"

_EMPTY = {"version": 1, "months": {}}


def _path(config_dir: str) -> str:
    return os.path.join(config_dir, DIRNAME, FILENAME)


def load_history(config_dir: str) -> dict:
    """Load history, returning an empty store on any read/parse failure."""
    try:
        with open(_path(config_dir), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {"version": 1, "months": {}}
    if not isinstance(data, dict) or not isinstance(data.get("months"), dict):
        return {"version": 1, "months": {}}
    return data


def _write_atomic(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=1, sort_keys=True)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def save_month(config_dir: str, record: dict, filename: str = "") -> tuple[dict, dict]:
    """Upsert one month record; returns (full_history, stored_record).

    Adds a continuity warning when this month's beginning balance does not
    match the newest earlier stored month's ending balance.
    """
    history = load_history(config_dir)
    stored = dict(record)
    warnings = list(record.get("warnings", []))
    earlier = sorted(m for m in history["months"] if m < record["month"])
    if earlier:
        prev = history["months"][earlier[-1]]
        if abs(prev.get("ending", 0) - record["beginning"]) > 0.01:
            warnings.append(
                f"continuity gap: begins at {record['beginning']:.2f} but "
                f"{earlier[-1]} ended at {prev.get('ending', 0):.2f}"
            )
    stored["warnings"] = warnings
    stored["uploaded_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    if filename:
        stored["filename"] = os.path.basename(filename)
    history["months"][record["month"]] = stored
    _write_atomic(_path(config_dir), history)
    return history, stored
```

- [ ] **Step 2: Write the verification script**

Create `tmp/test_history_store.py`:

```python
"""Verify the history store: upsert, continuity warning, corrupt-file heal."""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, "custom_components/ai_dashboard_proxy")
from history_store import load_history, save_month  # noqa: E402

config = tempfile.mkdtemp()
try:
    # Empty when missing
    assert load_history(config) == {"version": 1, "months": {}}
    print("missing file -> empty: OK")

    aug = {"month": "2026-08", "period_start": "2026-07-20", "period_end": "2026-08-23",
           "beginning": 1317.69, "deposits": 6616.48, "withdrawals": 5408.79,
           "ending": 2525.38, "parser": "westgate_checking", "warnings": []}
    sep = {"month": "2026-09", "period_start": "2026-08-24", "period_end": "2026-09-20",
           "beginning": 2525.38, "deposits": 5168.80, "withdrawals": 4969.71,
           "ending": 2724.47, "parser": "westgate_checking", "warnings": []}

    history, stored = save_month(config, aug, filename="August Statement.pdf")
    assert stored["filename"] == "August Statement.pdf"
    assert stored["uploaded_at"]
    assert stored["warnings"] == []
    print("first save: OK")

    history, stored = save_month(config, sep)
    assert stored["warnings"] == [], stored["warnings"]  # chain is clean
    assert sorted(history["months"]) == ["2026-08", "2026-09"]
    print("clean chain: OK")

    # Re-upload replaces (idempotent), does not duplicate
    history, stored = save_month(config, sep)
    assert len(history["months"]) == 2
    print("re-upload idempotent: OK")

    # Continuity gap warns but stores
    gap = dict(sep, month="2026-10", beginning=9999.00)
    history, stored = save_month(config, gap)
    assert any("continuity gap" in w for w in stored["warnings"]), stored["warnings"]
    assert history["months"]["2026-10"]["beginning"] == 9999.00
    print("continuity warning: OK")

    # Corrupt file heals to empty
    with open(os.path.join(config, "budget", "history.json"), "w") as f:
        f.write("{not json")
    assert load_history(config) == {"version": 1, "months": {}}
    print("corrupt file -> empty: OK")
finally:
    shutil.rmtree(config, ignore_errors=True)
```

- [ ] **Step 3: Run verification**

Run: `python tmp/test_history_store.py`
Expected: `missing file -> empty: OK`, `first save: OK`, `clean chain: OK`, `re-upload idempotent: OK`, `continuity warning: OK`, `corrupt file -> empty: OK`

- [ ] **Step 4: Lint + commit**

```bash
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
git add custom_components/ai_dashboard_proxy/history_store.py
git commit -m "feat(budget): add statement history store"
```

---

### Task 3: Upload + history endpoints and manifest

**Files:**
- Modify: `custom_components/ai_dashboard_proxy/http.py` (imports near line 26; new handlers after `budget_handler` at line 200; route registration at lines 623-627)
- Modify: `custom_components/ai_dashboard_proxy/manifest.json`
- Test: `tmp/test_budget_endpoints.py` (import-level smoke check, git-ignored)

**Interfaces:**
- Consumes: `extract_pdf_text`, `parse_statement`, `StatementParseError`, `MAX_PDF_BYTES` (Task 1); `load_history`, `save_month` (Task 2); existing `_is_authorized` (http.py:44).
- Produces:
  - `budget_statement_upload_handler(request) -> web.Response` — `POST /budget/api/statement`
  - `budget_history_handler(request) -> web.Response` — `GET /budget/api/history`
  - Success JSON: `{"ok": true, "record": <stored_record>}`; error JSON: `{"ok": false, "error": str}` with status 400 (not a file/too large), 401, 422 (parse failures)

- [ ] **Step 1: Add the handlers**

In `custom_components/ai_dashboard_proxy/http.py`, add to the imports after line 26 (`from homeassistant.util import dt as dt_util`):

```python
from .history_store import load_history, save_month
from .statement_parser import (
    MAX_PDF_BYTES,
    StatementParseError,
    extract_pdf_text,
    parse_statement,
)
```

Immediately after `budget_handler` (ends line 200), add:

```python
async def budget_history_handler(request: web.Request) -> web.Response:
    """Return the stored statement history JSON (same auth as the page)."""
    secret = request.app.get("ai_dashboard_secret")
    if not _is_authorized(request, secret):
        return web.Response(status=401, text="Unauthorized")
    hass: HomeAssistant = request.app["hass"]
    history = await hass.async_add_executor_job(load_history, hass.config.config_dir)
    return web.json_response(history)


async def budget_statement_upload_handler(request: web.Request) -> web.Response:
    """Accept a statement PDF, parse it, and upsert it into the history store.

    Accepts multipart/form-data with a `file` field (browser upload) or a
    raw application/pdf body with an optional X-Filename header (scripts).
    """
    secret = request.app.get("ai_dashboard_secret")
    if not _is_authorized(request, secret):
        return web.Response(status=401, text="Unauthorized")
    hass: HomeAssistant = request.app["hass"]

    filename = request.headers.get("X-Filename", "")
    if request.content_type == "multipart/form-data":
        form = await request.post()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "file"):
            return web.json_response(
                {"ok": False, "error": "multipart form is missing a 'file' field"},
                status=400,
            )
        filename = filename or getattr(upload, "filename", "") or ""
        content = upload.file.read(MAX_PDF_BYTES + 1)
    else:
        content = await request.content.read(MAX_PDF_BYTES + 1)
    if not content:
        return web.json_response({"ok": False, "error": "empty upload"}, status=400)
    if len(content) > MAX_PDF_BYTES:
        return web.json_response(
            {"ok": False, "error": "file is too large (12 MB max)"}, status=400
        )

    def _process() -> tuple[dict, dict]:
        text = extract_pdf_text(content)
        record = parse_statement(text)
        return save_month(hass.config.config_dir, record, filename=filename)

    try:
        _history, stored = await hass.async_add_executor_job(_process)
    except StatementParseError as err:
        return web.json_response({"ok": False, "error": str(err)}, status=422)
    except Exception:
        _LOGGER.exception("Statement upload failed")
        return web.json_response(
            {"ok": False, "error": "internal error while processing the statement"},
            status=500,
        )
    _LOGGER.info(
        "Budget statement stored: %s (in %.2f / out %.2f)",
        stored["month"], stored["deposits"], stored["withdrawals"],
    )
    return web.json_response({"ok": True, "record": stored})
```

- [ ] **Step 2: Register the routes before the catch-all**

In `async_setup_http` (http.py:623-627), change:

```python
    # Standalone budget page: same LAN/secret auth, read-only use of the
    # shared WebSocket (states + events; service allowlist still applies).
    app.router.add_get("/budget/ws", websocket_handler)
    app.router.add_get("/budget", budget_handler)
    app.router.add_get("/budget/{path:.*}", budget_handler)
```

to:

```python
    # Standalone budget page: same LAN/secret auth, read-only use of the
    # shared WebSocket (states + events; service allowlist still applies).
    # API routes must be registered before the {path:.*} catch-all.
    app.router.add_get("/budget/ws", websocket_handler)
    app.router.add_post("/budget/api/statement", budget_statement_upload_handler)
    app.router.add_get("/budget/api/history", budget_history_handler)
    app.router.add_get("/budget", budget_handler)
    app.router.add_get("/budget/{path:.*}", budget_handler)
```

- [ ] **Step 3: Pin pypdf in the manifest**

In `custom_components/ai_dashboard_proxy/manifest.json`, change `"requirements": []` to `"requirements": ["pypdf==6.16.1"]` (same pin as `bill_tracker` to avoid a resolver conflict).

- [ ] **Step 4: Smoke-check imports**

Create `tmp/test_budget_endpoints.py`:

```python
"""Import-level smoke check for the new endpoints (HA not running)."""
import sys
from unittest.mock import MagicMock

# Stub HA modules so http.py imports standalone.
for name in ["homeassistant", "homeassistant.components",
             "homeassistant.components.http", "homeassistant.components.http.const",
             "homeassistant.components.recorder", "homeassistant.components.recorder.history",
             "homeassistant.const", "homeassistant.core", "homeassistant.helpers",
             "homeassistant.helpers.area_registry", "homeassistant.helpers.device_registry",
             "homeassistant.helpers.entity_registry", "homeassistant.helpers.json",
             "homeassistant.util", "homeassistant.util.dt", "aiohttp",
             "aiohttp.web"]:
    sys.modules.setdefault(name, MagicMock())

sys.path.insert(0, "custom_components/ai_dashboard_proxy")
import http as proxy_http  # noqa: E402

assert callable(proxy_http.budget_statement_upload_handler)
assert callable(proxy_http.budget_history_handler)
print("endpoint handlers import: OK")
```

Run: `python tmp/test_budget_endpoints.py`
Expected: `endpoint handlers import: OK`

Note: `http.py` uses `from aiohttp import web` — stubbing `aiohttp.web` as a MagicMock makes `web.Request` etc. no-ops at import time, which is all this check needs.

- [ ] **Step 5: Lint + commit**

```bash
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
python -m json.tool custom_components/ai_dashboard_proxy/manifest.json > /dev/null
git add custom_components/ai_dashboard_proxy/http.py custom_components/ai_dashboard_proxy/manifest.json
git commit -m "feat(budget): add statement upload + history endpoints"
```

---

### Task 4: Pre-seed backfill

**Files:**
- Create: `scripts/backfill_budget_history.py`
- Test: run it, inspect `budget/history.json`

**Interfaces:**
- Consumes: Task 1 + 2 modules via `sys.path` insertion relative to the script location; the 6 PDFs in `tmp/`.
- Produces: CLI `python3 scripts/backfill_budget_history.py <config_dir> <pdf> [<pdf>...]` printing one line per stored month; writes `<config_dir>/budget/history.json`.

- [ ] **Step 1: Write the backfill script**

Create `scripts/backfill_budget_history.py`:

```python
#!/usr/bin/env python3
"""Backfill budget statement history from existing statement PDFs.

Usage: python3 scripts/backfill_budget_history.py <config_dir> <pdf> [<pdf>...]

Idempotent: re-running with the same statement replaces its month record.
"""
import os
import sys

sys.path.insert(
    0,
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                 "custom_components", "ai_dashboard_proxy"),
)

from history_store import save_month  # noqa: E402
from statement_parser import StatementParseError, extract_pdf_text, parse_statement  # noqa: E402


def main():
    if len(sys.argv) < 3:
        print(__doc__.strip())
        sys.exit(2)
    config_dir = sys.argv[1]
    failures = 0
    for path in sys.argv[2:]:
        try:
            with open(path, "rb") as f:
                record = parse_statement(extract_pdf_text(f.read()))
            _history, stored = save_month(config_dir, record, filename=path)
            warn = f" WARNINGS: {'; '.join(stored['warnings'])}" if stored["warnings"] else ""
            print(f"{stored['month']}: in {stored['deposits']:.2f} / "
                  f"out {stored['withdrawals']:.2f} / end {stored['ending']:.2f}{warn}")
        except (OSError, StatementParseError) as err:
            print(f"{os.path.basename(path)}: FAILED: {err}", file=sys.stderr)
            failures += 1
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the backfill**

Run (bash):
```bash
python scripts/backfill_budget_history.py . tmp/statement-2026-04.pdf tmp/statement-2026-05.pdf tmp/statement-2026-06.pdf tmp/statement-2026-07.pdf tmp/statement-2026-08.pdf tmp/statement-2026-09.pdf
```
Expected: six lines, months 2026-04 through 2026-09, no WARNINGS (chain is clean).

- [ ] **Step 3: Verify the output file**

Run: `python -m json.tool budget/history.json | head -40`
Expected: `months` keys `2026-04`..`2026-09`, each with deposits/withdrawals/ending/uploaded_at matching the Verified Sample Data table.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill_budget_history.py budget/history.json
git commit -m "feat(budget): backfill 6 months of statement history"
```

Check first that `budget/` is not git-ignored: run `git check-ignore budget/history.json; echo exit=$?` — if it prints the path (exit 0), add `!budget/history.json` handling or force-add with `git add -f`. (`.gitignore` ignores `tmp/` and HACS dirs; `budget/` should be clean.)

---

### Task 5: History UI card

**Files:**
- Create: `www/budget/js/history.js`
- Modify: `www/budget/index.html` (new card between the outlook card and the upcoming-bills card)
- Modify: `www/budget/js/budget.js` (import + `initHistory()` + call near `initStatementBanner()` at the bottom)
- Modify: `www/budget/css/budget.css` (history styles, append before the `@media` block)
- Test: `www/budget/_preview_history.html` (temporary, deleted in Step 5)

**Interfaces:**
- Consumes: `GET /budget/api/history` → `{"version": 1, "months": {"YYYY-MM": {deposits, withdrawals, beginning, ending, uploaded_at, filename, warnings}}}` (Task 3); `POST /budget/api/statement` multipart (Task 3).
- Produces:
  - `buildHistoryModel(months: object) -> array` — sorted ascending `[{key, label, deposits, withdrawals, ending, net, warnings}]`
  - `buildHistorySvg(model) -> string` — dual-axis SVG (bars left axis, ending-balance line right axis, same visual language as `buildOutlookSvg` in `www/budget/js/outlook.js`)
  - `initHistory()` in budget.js — fetches history, renders, wires upload button + drag-drop

- [ ] **Step 1: Write the history chart module**

Create `www/budget/js/history.js`:

```javascript
// Pure model + SVG builders for the statement History card. No DOM access
// and no side effects, so a standalone preview page can import it with
// sample data for visual testing. Same conventions as outlook.js.

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const moneyShort = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1000) return '$' + (n / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'k';
  return '$' + Math.round(n);
};
const parseDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function buildHistoryModel(months) {
  return Object.keys(months || {}).sort().map((key) => {
    const m = months[key];
    return {
      key,
      label: parseDay(key + '-02').toLocaleDateString('en-US', { month: 'short' }),
      year: key.slice(0, 4),
      deposits: m.deposits,
      withdrawals: m.withdrawals,
      ending: m.ending,
      net: m.deposits - m.withdrawals,
      warnings: m.warnings || [],
    };
  });
}

// Grouped bars (income vs spending per statement month) with the statement
// ending balance as a line on a separate right-hand axis.
export function buildHistorySvg(model) {
  const W = 1000, H = 240, padL = 58, padR = 58, padT = 30, padB = 36;
  const plotW = W - padL - padR;
  const groupW = plotW / model.length;
  const cx = (i) => padL + groupW * i + groupW / 2;
  const plotH = H - padT - padB;

  const maxBar = Math.max(...model.map((m) => Math.max(m.deposits, m.withdrawals)), 1);
  const yBar = (v) => padT + (1 - v / maxBar) * plotH;
  const maxEnd = Math.max(...model.map((m) => m.ending));
  const minEnd = Math.min(...model.map((m) => m.ending));
  const endSpan = maxEnd - minEnd || 1;
  const yEnd = (v) => padT + ((maxEnd - v) / endSpan) * plotH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Monthly income versus spending history with statement ending balance">`;

  for (const gv of [0, maxBar / 2, maxBar]) {
    const gy = yBar(gv);
    svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${gv === 0 ? '#3a4763' : '#232d42'}" stroke-width="${gv === 0 ? 1.5 : 1}"${gv === 0 ? '' : ' stroke-dasharray="2 4"'}/>` +
      `<text x="${padL - 8}" y="${gy + 4}" fill="#5c6780" font-size="11" text-anchor="end">${moneyShort(gv)}</text>`;
  }
  for (const gv of [minEnd, maxEnd]) {
    svg += `<text x="${W - padR + 8}" y="${yEnd(gv) + 4}" fill="#60a5fa" font-size="11" text-anchor="start">${moneyShort(gv)}</text>`;
  }

  const barW = Math.min(30, groupW / 4);
  const barBase = yBar(0);
  for (let i = 0; i < model.length; i++) {
    const m = model[i];
    svg += `<rect x="${cx(i) - barW - 3}" y="${yBar(m.deposits)}" width="${barW}" height="${barBase - yBar(m.deposits)}" rx="3" fill="#34d399" fill-opacity="0.85"/>` +
      `<rect x="${cx(i) + 3}" y="${yBar(m.withdrawals)}" width="${barW}" height="${barBase - yBar(m.withdrawals)}" rx="3" fill="#f87171" fill-opacity="0.85"/>` +
      `<text x="${cx(i)}" y="${H - padB + 16}" fill="#8b96ab" font-size="12" text-anchor="middle">${m.label}</text>`;
  }

  const linePts = model.map((m, i) => `${cx(i).toFixed(1)},${yEnd(m.ending).toFixed(1)}`).join(' ');
  svg += `<polyline points="${linePts}" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linejoin="round"/>`;
  for (let i = 0; i < model.length; i++) {
    const m = model[i];
    const warn = m.warnings.length ? ' — warnings: ' + m.warnings.join('; ') : '';
    svg += `<circle cx="${cx(i)}" cy="${yEnd(m.ending)}" r="5.5" fill="#60a5fa" stroke="#60a5fa" stroke-width="2">` +
      `<title>${m.label} ${m.year} — income ${money(m.deposits)}, spending ${money(m.withdrawals)}, net ${money(m.net)}, ending balance ${money(m.ending)}${warn}</title></circle>` +
      `<text x="${cx(i)}" y="${yEnd(m.ending) - 12}" fill="#60a5fa" font-size="11" text-anchor="middle">${moneyShort(m.ending)}</text>`;
  }

  svg += '</svg>';
  return svg;
}
```

- [ ] **Step 2: Add the card to index.html**

In `www/budget/index.html`, insert between the outlook card and the upcoming-bills card:

```html
  <section class="card history-card" id="history-card">
    <h2>History <span class="hint">drag a statement PDF here, or</span>
      <button id="history-upload-btn" class="history-upload-btn" type="button">Upload statement</button>
    </h2>
    <input type="file" id="history-file" accept="application/pdf,.pdf" hidden>
    <div id="history-status" class="history-status" hidden></div>
    <div id="history" class="history"></div>
    <div id="history-legend" class="runway-legend"></div>
  </section>
```

- [ ] **Step 3: Wire upload + render in budget.js, add CSS**

In `www/budget/js/budget.js`, change the import line at the top:

```javascript
import { buildOutlookModel, buildOutlookSvg } from './outlook.js';
```

to:

```javascript
import { buildOutlookModel, buildOutlookSvg } from './outlook.js';
import { buildHistoryModel, buildHistorySvg } from './history.js';
```

Add before `initStatementBanner();` at the bottom:

```javascript
// Statement history card: load stored history, render the chart, and wire
// the statement PDF upload (button + drag-and-drop on the card).
function renderHistory(history) {
  const model = buildHistoryModel(history?.months || {});
  const el = document.getElementById('history');
  const legend = document.getElementById('history-legend');
  if (!model.length) {
    el.innerHTML = '<div class="empty">No history yet — upload your first statement.</div>';
    legend.textContent = '';
    return;
  }
  el.innerHTML = buildHistorySvg(model);
  legend.innerHTML =
    `<span><span class="dot" style="background:#34d399"></span>income</span>` +
    `<span><span class="dot" style="background:#f87171"></span>spending</span>` +
    `<span><span class="dot" style="background:#60a5fa"></span>ending balance</span>`;
}

function historyStatus(text, tone) {
  const el = document.getElementById('history-status');
  el.textContent = text;
  el.className = 'history-status' + (tone ? ' ' + tone : '');
  el.hidden = !text;
}

async function uploadStatement(file) {
  historyStatus(`Parsing ${file.name}…`, '');
  try {
    const form = new FormData();
    form.append('file', file, file.name);
    const res = await fetch('/budget/api/statement', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      historyStatus(data.error || `Upload failed (HTTP ${res.status})`, 'bad');
      return;
    }
    const r = data.record;
    const warn = r.warnings && r.warnings.length ? ` — ${r.warnings.join('; ')}` : '';
    historyStatus(
      `${r.month}: +${money(r.deposits)} in / −${money(r.withdrawals)} out saved${warn}`,
      r.warnings && r.warnings.length ? 'warn' : 'good',
    );
    const res2 = await fetch('/budget/api/history');
    if (res2.ok) renderHistory(await res2.json());
  } catch {
    historyStatus('Upload failed — check the connection and try again', 'bad');
  }
}

function initHistory() {
  fetch('/budget/api/history')
    .then((r) => (r.ok ? r.json() : null))
    .then((h) => { if (h) renderHistory(h); })
    .catch(() => {});
  const btn = document.getElementById('history-upload-btn');
  const input = document.getElementById('history-file');
  const card = document.getElementById('history-card');
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files[0]) uploadStatement(input.files[0]);
    input.value = '';
  });
  card.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    card.classList.add('dragover');
  });
  card.addEventListener('dragleave', () => card.classList.remove('dragover'));
  card.addEventListener('drop', (ev) => {
    ev.preventDefault();
    card.classList.remove('dragover');
    const file = ev.dataTransfer?.files?.[0];
    if (file) uploadStatement(file);
  });
}

initHistory();
initStatementBanner();
connect();
```

(The old trailing lines `initStatementBanner();` and `connect();` are replaced by the three lines above.)

In `www/budget/css/budget.css`, append before the `@media (max-width: 640px)` block:

```css
/* History card */
.history-upload-btn {
  background: none;
  border: 1px solid var(--card-border);
  color: var(--blue);
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.history-upload-btn:hover { border-color: var(--blue); }
.history-card.dragover { border-color: var(--blue); box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25); }
.history-status { font-size: 13px; color: var(--muted); margin-bottom: 10px; }
.history-status.good { color: var(--green); }
.history-status.warn { color: var(--amber); }
.history-status.bad { color: var(--red); }
```

- [ ] **Step 4: Syntax check + standalone visual preview**

```bash
.tools/node/node.exe --input-type=module --check < www/budget/js/history.js
.tools/node/node.exe --input-type=module --check < www/budget/js/budget.js
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/budget/index.html', encoding='utf-8').read()); print('HTML OK')"
```

Then build the preview page from the seeded history (same trick as the outlook preview):

```bash
MONTHS=$(python -c "import json; print(json.dumps(json.load(open('budget/history.json'))['months']))")
cat > www/budget/_preview_history.html <<EOF
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>History preview</title>
<link rel="stylesheet" href="/budget/css/budget.css"></head>
<body><main>
<section class="card history-card" id="history-card">
  <h2>History <span class="hint">preview</span></h2>
  <div id="history" class="history"></div>
  <div id="history-legend" class="runway-legend"></div>
</section>
</main>
<script type="module">
import { buildHistoryModel, buildHistorySvg } from '/budget/js/history.js';
const months = $MONTHS;
document.getElementById('history').innerHTML = buildHistorySvg(buildHistoryModel(months));
</script>
</body></html>
EOF
```

Open `http://homeassistant.local:8123/budget/_preview_history.html` in the browser and screenshot: expect 6 month groups (Apr–Sep) with income/spending bars and an ending-balance line ($4.2k → $2.7k dip to $1.3k in Jul).

- [ ] **Step 5: Delete the preview page, commit**

```bash
rm www/budget/_preview_history.html
git add www/budget/js/history.js www/budget/js/budget.js www/budget/index.html www/budget/css/budget.css
git commit -m "feat(budget): add statement history card with PDF upload"
```

---

### Task 6: Reminder rewiring + docs

**Files:**
- Modify: `www/budget/js/budget.js` (banner text in `initStatementBanner`)
- Modify: `www/budget/index.html` (banner markup)
- Modify: `automations.yaml` (`monthly_statement_reminder`, appended near line 541)
- Modify: `AGENTS.md` (budget page bullet, finance entities, automation description, proxy endpoints note)
- Test: `python scripts/validate_ha_yaml.py`

- [ ] **Step 1: Repoint the banner**

In `www/budget/index.html`, change the banner text:

```html
      <strong>Statement time</strong> — download last month's bank statement and
      <a href="/billy">upload it to Billy</a> to keep bill history current.
```

to:

```html
      <strong>Statement time</strong> — download last month's bank statement and
      drop it on the <a href="#history-card">History card</a> below to keep spending history current.
```

- [ ] **Step 2: Repoint the automation**

In `automations.yaml`, in `monthly_statement_reminder`, change:

```yaml
        message: "Download last month's bank statement and upload it to Billy for bill history."
        data:
          url: /billy
```

to:

```yaml
        message: "Download last month's bank statement and upload it on the budget page."
        data:
          url: /budget/
```

Run: `python scripts/validate_ha_yaml.py` — expect `OK: automations.yaml`.

- [ ] **Step 3: Update AGENTS.md**

Three edits in `AGENTS.md`:

1. Budget page bullet — append to the feature list: "statement History card with PDF upload (`POST /budget/api/statement`), 6-month backfilled spending history (`GET /budget/api/history`, stored at `budget/history.json`)".
2. `monthly_statement_reminder` description — change "upload it to Billy for bill history" to "upload it on the budget page's History card".
3. `ai_dashboard_proxy` bullet — note it now also serves the budget statement endpoints and owns `statement_parser.py` / `history_store.py` (`pypdf` in its manifest requirements).

- [ ] **Step 4: Commit**

```bash
git add www/budget/index.html www/budget/js/budget.js automations.yaml AGENTS.md
git commit -m "feat(budget): point statement reminder at the budget history card"
```

---

### Task 7: Final validation + live verification

**Files:** none (verification only)

- [ ] **Step 1: Full local validation suite**

```bash
python scripts/validate_ha_yaml.py
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
.tools/node/node.exe --input-type=module --check < www/budget/js/budget.js
.tools/node/node.exe --input-type=module --check < www/budget/js/history.js
.tools/node/node.exe --input-type=module --check < www/budget/js/outlook.js
python -m json.tool budget/history.json > /dev/null
python -m json.tool custom_components/ai_dashboard_proxy/manifest.json > /dev/null
python tmp/test_statement_parser.py
python tmp/test_history_store.py
```
Expected: all pass.

- [ ] **Step 2: Home Assistant restart (user action)**

Required to load the new endpoints, `pypdf` requirement, `input_number.paycheck_amount`, and `sensor.billy_bill_forecast`. Tell the user: restart HA, then reload automations (Developer Tools > YAML > Automations).

- [ ] **Step 3: Live verification (after restart)**

With the desktop browser on `http://homeassistant.local:8123/budget/`:
1. History card renders 6 months (Apr–Sep) from the seeded file.
2. `GET /budget/api/history` returns the seeded JSON.
3. Upload `tmp/statement-2026-09.pdf` through the UI (button) → status line shows `2026-09: +$5,168.80 in / −$4,969.71 out saved` with no warnings (idempotent replace).
4. Reload the page → history persists.
5. Confirm the statement banner text points at the History card (banner visible only days 1–7; verify markup instead if outside the window).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(budget): finalize statement history feature" --allow-empty
```

(Only commit if there are stragglers; otherwise the branch is already fully committed.)

---

## Self-Review Notes

- **Spec coverage:** upload endpoint (Task 3), parser + registry (Task 1), storage + atomic writes + continuity (Task 2), manifest pypdf (Task 3 Step 3), History card + upload UI + feedback (Task 5), backfill (Task 4), banner/automation rewiring (Task 6), AGENTS.md (Task 6 Step 3), error table rows (Tasks 1/2/3 failure-mode steps), security bounds (Task 1 extraction limits, Task 3 read cap). All spec sections covered.
- **Type consistency:** `parse_statement` record keys (`month/period_start/period_end/beginning/deposits/withdrawals/ending/parser/warnings`) are used identically in Tasks 1, 2, 4; `save_month` returns `(history, stored)` and is consumed that way in Tasks 3 and 4; `buildHistoryModel`/`buildHistorySvg` names match between history.js and budget.js.
- **Placeholders:** none — all steps carry exact code or exact commands.
- **Review Focus:** items 1–6 each pinned to a named task step (see section above).
