# Budget Phase 3 (Tabs, Trends, Rules) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, user-chosen) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tabbed page organization, per-category spending trends with sliders/toggles, user-managed merchant category rules, and transaction drill-down.

**Architecture:** Pure-frontend tabs; a pure trends module; a server-side rules file applied inside `categorize()` at read time (retroactive by construction); drill-down via per-transaction `category` added during read-time enrichment.

**Tech Stack:** pypdf (unchanged), vanilla JS ES modules + inline SVG, Home Assistant aiohttp.

**Spec:** `docs/superpowers/specs/2026-10-11-budget-tabs-trends-rules-design.md`

## Global Constraints

- Same as phases 1–2: tmp/ verification scripts, flake8 (120, extend-ignore E501,W503), compileall, `node --check` via `.tools/node/node.exe`, validate_ha_yaml.
- `budget/history.json` AND `budget/category_rules.json` stay git-ignored (public repo, habit-revealing data).
- TDD: verification script first, watch it fail, implement, watch it pass. Per-task commits with named files only.
- `categorize(transactions, rules=None)` — the `rules` param defaults to None so all phase-2 callers/tests stay valid.
- `unmatched` shape changes to `{merchant: {"total": float, "count": int}}`; the phase-2 test that asserts on it (`tmp/test_categorize.py` does not; only the spec mentions the old shape) — grep to confirm before editing.

## Review Focus

1. A user rule must win over a built-in rule (e.g. rule `AMAZON → groceries` beats built-in `AMAZON → shopping`). Pinned in Task 1.
2. Two rules where one keyword is a substring of another (`MOONSHOT` vs `MOONSHOT AI`) must resolve longest-keyword-first, deterministically. Pinned in Task 1.
3. Corrupt `category_rules.json` must yield empty rules, not a 500 on the history endpoint. Pinned in Task 1.
4. Rules POST with an unknown category or empty keyword → 400, no file mutation. Pinned in Task 2.
5. Tabs must not break the WS-driven re-renders: switching tabs, then a state event firing `render()`, must leave the active tab intact and hidden sections truly hidden. Pinned in Task 3 (live check).
6. Trends sliders at degenerate ranges (start == end, start > end) must clamp, not crash. Pinned in Task 4 preview.

---

### Task 1: Rules store + `categorize(rules)` + unmatched totals

**Files:**
- Modify: `custom_components/ai_dashboard_proxy/history_store.py`
- Modify: `custom_components/ai_dashboard_proxy/statement_parser.py`
- Test: `tmp/test_category_rules.py` (git-ignored)

**Interfaces:**
- Consumes: phase-2 `categorize`, `_write_atomic`, `load_history` pattern.
- Produces:
  - `load_rules(config_dir: str) -> dict` — `{}` on missing/corrupt
  - `save_rules(config_dir: str, rules: dict) -> None` — atomic
  - `categorize(transactions: list[dict], rules: dict | None = None) -> dict` — user rules first, longest-keyword-first; `unmatched` values become `{"total": float, "count": int}`
  - `KNOWN_CATEGORIES: tuple[str, ...]` in statement_parser (the 13 built-ins + "other") for endpoint validation (Task 2)

- [ ] **Step 1: Write the failing verification script**

Create `tmp/test_category_rules.py`:

```python
"""Verify user category rules: store, precedence, determinism, unmatched totals."""
import os
import shutil
import sys
import tempfile

sys.path.insert(0, "custom_components/ai_dashboard_proxy")
from history_store import load_rules, save_rules  # noqa: E402
from statement_parser import KNOWN_CATEGORIES, categorize  # noqa: E402

config = tempfile.mkdtemp()
try:
    assert load_rules(config) == {}
    save_rules(config, {"AMAZON": "groceries"})
    assert load_rules(config) == {"AMAZON": "groceries"}
    with open(os.path.join(config, "budget", "category_rules.json"), "w") as f:
        f.write("{broken")
    assert load_rules(config) == {}
    print("rules store + corrupt heal: OK")
finally:
    shutil.rmtree(config, ignore_errors=True)

TXS = [
    {"date": "2026-09-01", "type": "DBT CRD", "merchant": "AMAZON.COM*5O93H", "amount": 18.22, "direction": "debit"},
    {"date": "2026-09-02", "type": "DBT CRD", "merchant": "MOONSHOT AI", "amount": 20.00, "direction": "debit"},
    {"date": "2026-09-03", "type": "DBT CRD", "merchant": "MOONSHOT", "amount": 5.00, "direction": "debit"},
    {"date": "2026-09-04", "type": "DBT CRD", "merchant": "RANDOM MERCHANT X", "amount": 9.99, "direction": "debit"},
]

# User rule beats built-in (AMAZON built-in -> shopping; user -> groceries).
out = categorize(TXS, rules={"AMAZON": "groceries"})
assert out["categories"]["groceries"]["total"] == 18.22, out["categories"]
assert "shopping" not in out["categories"]
print("user rule overrides built-in: OK")

# Longest keyword wins deterministically.
out = categorize(TXS, rules={"MOONSHOT": "other", "MOONSHOT AI": "subscriptions"})
assert out["categories"]["subscriptions"]["total"] == 34.99  # 20.00 + built-in 5.00? no:
# MOONSHOT (5.00) hits rule MOONSHOT -> other; MOONSHOT AI (20.00) hits longer rule -> subscriptions
assert out["categories"]["subscriptions"]["total"] == 20.00, out["categories"]
print("longest-keyword-first: OK")

# unmatched now carries totals.
out = categorize(TXS)
assert out["unmatched"]["RANDOM MERCHANT X"] == {"total": 9.99, "count": 1}
print("unmatched totals: OK")

# KNOWN_CATEGORIES sanity + no-rules backward compat.
assert "food_delivery" in KNOWN_CATEGORIES and "other" in KNOWN_CATEGORIES
out2 = categorize(TXS, rules=None)
assert out2["categories"]["subscriptions"]["total"] == 25.00  # both MOONSHOT txs via built-in
print("backward compat: OK")
```

Run: `python tmp/test_category_rules.py`
Expected: FAIL — `ImportError: cannot import name 'load_rules'`.

Note: the script above intentionally contains one "assert then correct" pair — keep the second `subscriptions` assertion (20.00) and delete the first (34.99) when writing it.

- [ ] **Step 2: Implement**

In `history_store.py` (after `load_history`):

```python
RULES_FILENAME = "category_rules.json"


def _rules_path(config_dir: str) -> str:
    return os.path.join(config_dir, DIRNAME, RULES_FILENAME)


def load_rules(config_dir: str) -> dict:
    """Load user merchant->category rules, empty on any read/parse failure."""
    try:
        with open(_rules_path(config_dir), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k).upper(): str(v) for k, v in data.items()}


def save_rules(config_dir: str, rules: dict) -> None:
    _write_atomic(_rules_path(config_dir), rules)
```

In `statement_parser.py`:

- After `_KPI_KEYS`, add:

```python
KNOWN_CATEGORIES = (
    "atm_cash", "food_delivery", "gas_fuel", "dining_out", "groceries",
    "shopping", "subscriptions", "health", "pets", "travel", "tobacco",
    "bills_transfers", "other",
)
```

- Replace `_category_of` and the unmatched accumulation:

```python
def _category_of(tx: dict, rules: dict | None = None) -> str:
    if rules:
        merchant_upper = tx["merchant"].upper()
        for keyword in sorted(rules, key=len, reverse=True):
            if keyword in merchant_upper:
                return rules[keyword]
    if tx["type"].startswith("ATM W/D"):
        return "atm_cash"
    merchant = tx["merchant"].upper()
    for keyword, category in _CATEGORY_RULES:
        if keyword in merchant:
            return category
    if tx["type"] in ("STUDENT LN", "PAYROLL", "PAYMENTS", "WEB", "EFT", "TEL"):
        return "bills_transfers"
    return "other"
```

- `categorize(transactions, rules=None)`: pass `rules` through to `_category_of`; change the unmatched line to:

```python
        if category == "other":
            entry = unmatched.setdefault(tx["merchant"], {"total": 0.0, "count": 0})
            entry["total"] = round(entry["total"] + tx["amount"], 2)
            entry["count"] += 1
```

- [ ] **Step 3: Run verification + regression**

```bash
python tmp/test_category_rules.py
python tmp/test_categorize.py | tail -1
python tmp/test_history_enrichment.py
```
Expected: four OK lines; `empty input: OK`; `enriched history: OK` + `no-transactions month -> empty breakdown: OK`.

- [ ] **Step 4: Lint + commit**

```bash
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
git add custom_components/ai_dashboard_proxy/history_store.py custom_components/ai_dashboard_proxy/statement_parser.py
git commit -m "feat(budget): user category rules store + categorize() rule support"
```

---

### Task 2: Rules endpoint + per-transaction categories

**Files:**
- Modify: `custom_components/ai_dashboard_proxy/http.py`
- Modify: `.gitignore` (add `/budget/category_rules.json`)
- Test: `tmp/test_rules_endpoint.py`

**Interfaces:**
- Consumes: `load_rules`, `save_rules` (Task 1); `KNOWN_CATEGORIES` (Task 1).
- Produces:
  - `budget_rules_handler(request)` — `GET /budget/api/category_rules` → `{"rules": {...}}`
  - `budget_rules_update_handler(request)` — `POST /budget/api/category_rules`, JSON `{"action": "add"|"delete", "keyword", "category"}` → `{"ok": true, "rules": {...}}`; 400 on bad input (unknown category, keyword <2 or >80 chars, bad action, body >64 KB)
  - `_load_enriched` passes `load_rules(...)` into `categorize` and stamps each transaction with `"category"`

- [ ] **Step 1: Write the failing verification script**

Create `tmp/test_rules_endpoint.py` — same fake-harness style as `tmp/test_upload_handler.py` (real aiohttp, stubbed HA modules, FakeHass with temp config_dir, FakeRequest with JSON body via `request.json()`):

```python
"""Verify the category-rules endpoint: add/delete/validation + enrichment."""
import asyncio
import json
import sys
import tempfile
from unittest.mock import MagicMock

for name in ["homeassistant", "homeassistant.components",
             "homeassistant.components.http", "homeassistant.components.http.const",
             "homeassistant.components.recorder", "homeassistant.components.recorder.history",
             "homeassistant.const", "homeassistant.core", "homeassistant.helpers",
             "homeassistant.helpers.area_registry", "homeassistant.helpers.device_registry",
             "homeassistant.helpers.entity_registry", "homeassistant.helpers.json",
             "homeassistant.helpers.config_validation", "homeassistant.helpers.typing",
             "homeassistant.util", "homeassistant.util.dt", "voluptuous"]:
    sys.modules.setdefault(name, MagicMock())

sys.path.insert(0, "custom_components")
from ai_dashboard_proxy import http as proxy_http  # noqa: E402


class FakeHass:
    def __init__(self, config_dir):
        self.config = MagicMock()
        self.config.config_dir = config_dir

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


class FakeRequest:
    def __init__(self, config_dir, payload=None):
        self.remote = "192.168.1.10"
        self.headers = {}
        self.app = {"ai_dashboard_secret": None, "hass": FakeHass(config_dir)}
        self._payload = payload
        self.content = MagicMock()

    def get(self, _key, default=None):
        return default

    async def json(self):
        if self._payload is None:
            raise ValueError("no body")
        return self._payload


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


config = tempfile.mkdtemp()

res = run(proxy_http.budget_rules_handler(FakeRequest(config)))
assert res.status == 200 and json.loads(res.text)["rules"] == {}
print("empty rules GET: OK")

res = run(proxy_http.budget_rules_update_handler(
    FakeRequest(config, {"action": "add", "keyword": "Moonshot AI", "category": "subscriptions"})))
payload = json.loads(res.text)
assert res.status == 200 and payload["rules"] == {"MOONSHOT AI": "subscriptions"}, payload
print("add rule (keyword uppercased): OK")

for bad, label in [
    ({"action": "add", "keyword": "X", "category": "subscriptions"}, "short keyword"),
    ({"action": "add", "keyword": "VALID", "category": "nonsense"}, "unknown category"),
    ({"action": "explode", "keyword": "VALID", "category": "other"}, "bad action"),
]:
    res = run(proxy_http.budget_rules_update_handler(FakeRequest(config, bad)))
    assert res.status == 400, (label, res.status)
    print(f"reject {label}: OK")

res = run(proxy_http.budget_rules_update_handler(
    FakeRequest(config, {"action": "delete", "keyword": "moonshot ai", "category": ""})))
assert json.loads(res.text)["rules"] == {}
print("delete rule (case-insensitive): OK")

# Enrichment applies rules + stamps per-transaction categories.
from ai_dashboard_proxy.history_store import save_month, save_rules  # noqa: E402

save_rules(config, {"RANDOM MERCHANT X": "travel"})
save_month(config, {
    "month": "2026-09", "period_start": "2026-08-24", "period_end": "2026-09-20",
    "beginning": 1.0, "deposits": 1.0, "withdrawals": 1.0, "ending": 1.0,
    "parser": "westgate_checking", "warnings": [],
    "transactions": [
        {"date": "2026-09-01", "type": "DBT CRD", "merchant": "RANDOM MERCHANT X",
         "amount": 9.99, "direction": "debit"},
    ],
})
res = run(proxy_http.budget_history_handler(FakeRequest(config)))
month = json.loads(res.text)["months"]["2026-09"]
assert month["categories"]["travel"]["total"] == 9.99, month["categories"]
assert month["transactions"][0]["category"] == "travel"
print("enrichment applies rules + stamps tx category: OK")
```

Run: `python tmp/test_rules_endpoint.py`
Expected: FAIL — `AttributeError: ... budget_rules_handler`.

- [ ] **Step 2: Implement**

`http.py` imports: add `load_rules, save_rules` to the history_store import; add `KNOWN_CATEGORIES` to the statement_parser import.

In `_load_enriched` (inside `budget_history_handler`):

```python
    def _load_enriched() -> dict:
        history = load_history(hass.config.config_dir)
        rules = load_rules(hass.config.config_dir)
        for month in history["months"].values():
            transactions = month.get("transactions", [])
            breakdown = categorize(transactions, rules)
            for tx in transactions:
                if tx.get("direction") == "debit":
                    tx["category"] = _category_of(tx, rules)
            month["categories"] = breakdown["categories"]
            month["kpis"] = breakdown["kpis"]
            month["unmatched"] = breakdown["unmatched"]
        return history
```

(import `_category_of` too — it's module-private; add a leading-underscore import with a comment, or rename to `category_of` without underscore and update the parser. **Choose the rename**: `category_of` public, update `_category_of` references in parser + any tmp tests.)

New handlers after `budget_history_handler`:

```python
async def budget_rules_handler(request: web.Request) -> web.Response:
    """Return the user's merchant->category rules."""
    secret = request.app.get("ai_dashboard_secret")
    if not _is_authorized(request, secret):
        return web.Response(status=401, text="Unauthorized")
    hass: HomeAssistant = request.app["hass"]
    rules = await hass.async_add_executor_job(load_rules, hass.config.config_dir)
    return web.json_response({"rules": rules})


async def budget_rules_update_handler(request: web.Request) -> web.Response:
    """Add or delete a merchant->category rule.

    Body: {"action": "add"|"delete", "keyword": str, "category": str}.
    """
    secret = request.app.get("ai_dashboard_secret")
    if not _is_authorized(request, secret):
        return web.Response(status=401, text="Unauthorized")
    hass: HomeAssistant = request.app["hass"]
    if request.content_length and request.content_length > 65536:
        return web.json_response({"ok": False, "error": "body too large"}, status=400)
    try:
        data = await request.json()
    except ValueError:
        return web.json_response({"ok": False, "error": "invalid JSON body"}, status=400)
    action = str(data.get("action") or "")
    keyword = str(data.get("keyword") or "").strip().upper()
    category = str(data.get("category") or "")
    if action not in ("add", "delete"):
        return web.json_response({"ok": False, "error": "action must be 'add' or 'delete'"}, status=400)
    if not (2 <= len(keyword) <= 80):
        return web.json_response({"ok": False, "error": "keyword must be 2-80 characters"}, status=400)
    if action == "add" and category not in KNOWN_CATEGORIES:
        return web.json_response({"ok": False, "error": f"unknown category '{category}'"}, status=400)

    def _mutate() -> dict:
        rules = load_rules(hass.config.config_dir)
        if action == "add":
            rules[keyword] = category
        else:
            rules.pop(keyword, None)
        save_rules(hass.config.config_dir, rules)
        return rules

    rules = await hass.async_add_executor_job(_mutate)
    _LOGGER.info("Budget category rule %s: %s -> %s", action, keyword, category or "(removed)")
    return web.json_response({"ok": True, "rules": rules})
```

Route registration (before the `/budget` catch-all, with the other API routes):

```python
    app.router.add_get("/budget/api/category_rules", budget_rules_handler)
    app.router.add_post("/budget/api/category_rules", budget_rules_update_handler)
```

`.gitignore`: add `/budget/category_rules.json` under the history.json line.

- [ ] **Step 3: Run verification + regression**

```bash
python tmp/test_rules_endpoint.py
python tmp/test_categorize.py | tail -1
python tmp/test_history_enrichment.py
python tmp/test_upload_handler.py | tail -1
git check-ignore budget/category_rules.json && echo IGNORED
```
Expected: six OK lines; regressions green; IGNORED.

- [ ] **Step 4: Lint + commit**

```bash
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
git add custom_components/ai_dashboard_proxy/http.py custom_components/ai_dashboard_proxy/statement_parser.py .gitignore
git commit -m "feat(budget): category rules endpoint + per-transaction categories"
```

---

### Task 3: Tabs

**Files:**
- Modify: `www/budget/index.html` (nav row; `data-tab` on sections)
- Modify: `www/budget/css/budget.css` (tab styles + visibility)
- Modify: `www/budget/js/budget.js` (tab switching + hash)
- Test: live page check

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: sections carry `data-tab="overview|spending|settings"`; `initTabs()` called at startup; hash `#overview` (default) / `#spending` / `#settings`.

- [ ] **Step 1: Restructure index.html**

Header gets a nav row after the topbar:

```html
<nav class="tabs">
  <button class="tab active" data-tab-target="overview" type="button">Overview</button>
  <button class="tab" data-tab-target="spending" type="button">Spending</button>
  <button class="tab" data-tab-target="settings" type="button">Settings</button>
</nav>
```

Tag sections: banner (`data-tab="overview"`), hero, advice-card, projection card, outlook-card, bills card → `overview`; history-card, spending-card → `spending` (plus the trends card placeholder from Task 4: add an empty `<section class="card trends-card" id="trends-card" data-tab="spending" hidden></section>` now so Task 4 only fills it); a new `<section class="card settings-card" id="settings-card" data-tab="settings" hidden></section>` placeholder for Task 5.

- [ ] **Step 2: CSS**

```css
.tabs { display: flex; gap: 8px; padding: 0 4px 16px; }
.tab {
  background: none; border: 1px solid var(--card-border); color: var(--muted);
  font-size: 14px; font-weight: 600; padding: 8px 18px; border-radius: 999px; cursor: pointer;
}
.tab:hover { color: var(--text); }
.tab.active { background: rgba(96, 165, 250, 0.12); border-color: var(--blue); color: var(--blue); }
[data-tab].tab-hidden { display: none; }
```

- [ ] **Step 3: JS**

In budget.js, before `initHistory()`:

```javascript
function initTabs() {
  const VALID = ['overview', 'spending', 'settings'];
  const activate = (name) => {
    if (!VALID.includes(name)) name = 'overview';
    document.querySelectorAll('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tabTarget === name));
    document.querySelectorAll('[data-tab]').forEach((s) =>
      s.classList.toggle('tab-hidden', s.dataset.tab !== name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  };
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => activate(t.dataset.tabTarget)));
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)));
  activate(location.hash.slice(1) || 'overview');
}
```

Call `initTabs();` before `initHistory();` at the bottom.

- [ ] **Step 4: Verify live**

`node --check`, then load `/budget/` in the desktop browser: click each tab (sections swap), reload on `#spending` (stays on Spending), fire a state render (advice/history unaffected — Review Focus #5: hidden sections keep `tab-hidden`).

- [ ] **Step 5: Commit**

```bash
git add www/budget/index.html www/budget/css/budget.css www/budget/js/budget.js
git commit -m "feat(budget): tabbed page organization (Overview/Spending/Settings)"
```

---

### Task 4: Trends card

**Files:**
- Create: `www/budget/js/trends.js`
- Modify: `www/budget/index.html` (fill the `trends-card` placeholder from Task 3)
- Modify: `www/budget/js/budget.js` (import + render in `renderSpending`)
- Modify: `www/budget/css/budget.css` (chips + slider styles)
- Test: `www/budget/_preview_trends.html` (temporary, deleted after screenshots incl. degenerate ranges)

**Interfaces:**
- Consumes: enriched history `months[m].categories` (already fetched).
- Produces:
  - `buildTrendsModel(months) -> {monthKeys: [...], labels: [...], series: {cat: [totals...]}, palette: {cat: color}}` (top-5 by all-time total default-enabled)
  - `trendsSvg(model, enabledSet, startIdx, endIdx) -> string` (multi-line, markers, `<title>` tooltips)
  - `chipsHtml(model, enabledSet) -> string`

- [ ] **Step 1: Write the module**

Palette (12): `#60a5fa #34d399 #f87171 #fbbf24 #a78bfa #f472b6 #22d3ee #a3e635 #fb923c #94a3b8 #e879f9 #2dd4bf`.

Model: months ascending from history keys with `categories`; every category seen gets a series (missing month = 0). Chips show all categories, toggled set defaults to top-5 by all-time total. Sliders: two range inputs `0..months.length-1`; clamp `start = min(start, end)`.

SVG (viewBox 1000×240, pads like outlook): y scale 0..max(enabled series in window) (guard 1); x = month index in window; lines + circles with `<title>` `Sep 2026 — food delivery $423.37`; month labels at bottom; right-side max label optional (keep left-axis gridlines like outlook: 0/mid/max).

- [ ] **Step 2: Card markup + wiring**

Fill the placeholder:

```html
<section class="card trends-card" id="trends-card" data-tab="spending" hidden>
  <h2>Spending trends <span class="hint" id="trends-window"></span></h2>
  <div id="trends-chips" class="trends-chips"></div>
  <div id="trends" class="trends"></div>
  <div class="trends-sliders">
    <input type="range" id="trends-start" min="0" value="0">
    <input type="range" id="trends-end" min="0" value="0">
  </div>
</section>
```

budget.js: `import { buildTrendsModel, chipsHtml, trendsSvg } from './trends.js';` — a `renderTrends(history)` called from `renderSpending` (same re-render points); module-level `trendsState = {enabled: null, start: 0, end: 0}` preserving slider/chip choices across re-renders (only recompute defaults when month count changes). Chip clicks toggle; slider input re-renders; window label `Apr 2026 – Sep 2026`.

CSS: `.trends-chips` (flex wrap gap 6), `.trends-chip` (pill, colored left dot, `.off` dimmed), `.trends-sliders` (flex gap 12, inputs flex 1), `.trends svg` full width.

- [ ] **Step 3: Preview**

Build `_preview_trends.html` with the enriched months JSON (same generation as the spending preview). Screenshots: default view; a chip toggled off; start slider dragged past end (clamps — Review Focus #6); single-month slice. Delete previews after.

- [ ] **Step 4: Commit**

```bash
.tools/node/node.exe --input-type=module --check < www/budget/js/trends.js
.tools/node/node.exe --input-type=module --check < www/budget/js/budget.js
rm www/budget/_preview_trends.html
git add www/budget/js/trends.js www/budget/js/budget.js www/budget/index.html www/budget/css/budget.css
git commit -m "feat(budget): spending trends chart with range sliders + category toggles"
```

---

### Task 5: Settings card (rules manager) + drill-down

**Files:**
- Create: `www/budget/js/rules.js` (pure builders)
- Modify: `www/budget/index.html` (fill `settings-card`; drill-down container in spending card)
- Modify: `www/budget/js/budget.js` (rules CRUD wiring, drill-down toggles)
- Modify: `www/budget/css/budget.css` (rules table + drill-down styles)
- Test: `www/budget/_preview_settings.html` (temporary)

**Interfaces:**
- Consumes: `GET/POST /budget/api/category_rules` (Task 2); `months[m].unmatched` totals + `months[m].transactions[].category` (Task 2).
- Produces:
  - `rulesRowsHtml(rules) -> string`, `unmatchedRowsHtml(aggregated, categories) -> string`
  - budget.js: `initSettings()` (fetch rules + render, add/delete via POST, then `initHistory`-style refetch of history to re-render everything)
  - Drill-down: clicking a `.cat-row` toggles a `.tx-list` under it (latest month transactions for that category)

- [ ] **Step 1: rules.js**

```javascript
// Pure builders for the Settings (category rules) card.
export function aggregateUnmatched(months) {
  const agg = {};
  for (const m of Object.values(months || {})) {
    for (const [merchant, info] of Object.entries(m.unmatched || {})) {
      const e = agg[merchant] || { total: 0, count: 0 };
      e.total = Math.round((e.total + info.total) * 100) / 100;
      e.count += info.count;
      agg[merchant] = e;
    }
  }
  return Object.entries(agg).sort((a, b) => b[1].total - a[1].total);
}

export function rulesRowsHtml(rules) { /* rows: keyword, category label, Delete btn (data-kw) */ }
export function unmatchedRowsHtml(agg, categories) { /* rows: merchant, total, count, <select> of categories, Add btn (data-merchant) */ }
```

- [ ] **Step 2: Settings card markup**

```html
<section class="card settings-card" id="settings-card" data-tab="settings" hidden>
  <h2>Category rules</h2>
  <p class="hint">Assign merchants to categories. Rules apply to all months and future uploads instantly.</p>
  <div id="rules-status" class="history-status" hidden></div>
  <h3 class="settings-sub">Your rules</h3>
  <div id="rules-list"></div>
  <h3 class="settings-sub">Uncategorized merchants</h3>
  <div id="unmatched-list"></div>
</section>
```

- [ ] **Step 3: Wiring**

`initSettings()`: fetch rules, render both lists. Add: POST `{action:'add', keyword, category}` from the row's select; Delete: POST `{action:'delete', keyword}`. On success: re-render lists + refetch `/budget/api/history` → `renderHistory(h); render();` (retroactive). Status line reuses `historyStatus` styles (rename nothing; reuse class).

Drill-down in `categoryBarsHtml` output rows: budget.js adds a delegated click listener on `#category-bars` — toggle a `.tx-list` div under the row listing latest-month transactions with that category (date, merchant, amount) from the fetched history (module-level `lastHistory` set in renderHistory). Rows get `data-cat` attributes (add in spending.js `categoryBarsHtml`: `<div class="cat-row" data-cat="${c.name}">`).

CSS: `.rule-row`/`.unmatched-row` (flex, like bill-row), `.settings-sub` (13px muted uppercase margin-top), `.tx-list` (indented, smaller, muted), `.cat-row { cursor: pointer; }`.

- [ ] **Step 4: Preview + commit**

Preview `_preview_settings.html` with real unmatched data; screenshot; delete.

```bash
for f in www/budget/js/*.js; do .tools/node/node.exe --input-type=module --check < "$f" || exit 1; done
rm www/budget/_preview_settings.html
git add www/budget/js/rules.js www/budget/js/spending.js www/budget/js/budget.js www/budget/index.html www/budget/css/budget.css
git commit -m "feat(budget): category rules manager + transaction drill-down"
```

---

### Task 6: Docs + final validation

**Files:** `AGENTS.md`, `www/ai-dashboard/AGENTS.md`

- [ ] **Step 1: Docs** — tabs; trends card; rules endpoint + `category_rules.json` (git-ignored); drill-down.
- [ ] **Step 2: Full suite** — validate_ha_yaml, compileall, flake8, node --check all budget JS, all tmp scripts (statement_parser, transactions, categorize, category_rules, history_store, budget_endpoints, upload_handler, history_enrichment, rules_endpoint), json.tool on manifest + history.json.
- [ ] **Step 3: Commit** — `git add AGENTS.md www/ai-dashboard/AGENTS.md docs/superpowers/specs/2026-10-11-budget-tabs-trends-rules-design.md docs/superpowers/plans/2026-10-11-budget-tabs-trends-rules.md && git commit -m "docs(budget): phase 3 tabs/trends/rules"`
- [ ] **Step 4: Final review** — dispatch fresh-context reviewer (strongest model) over `git diff <phase-3 base>..HEAD` with spec/plan/ledger; fix Critical/Important in one pass; then tell the user: HA restart (proxy changed) + push on their word.

---

## Self-Review Notes

- **Spec coverage:** tabs (T3), trends+sliders+toggles (T4), rules storage/categorize/endpoint/settings UI (T1/T2/T5), drill-down (T5), docs (T6), unmatched totals (T1), error table rows (T1/T2 tests).
- **Type consistency:** `load_rules/save_rules`, `categorize(txs, rules)`, `KNOWN_CATEGORIES`, endpoint payload shapes (`{rules}`, `{action,keyword,category}`), `category_of` rename applied everywhere including tmp tests.
- **Placeholders:** rules.js row builders are the only skeleton code — shapes are fully specified by the wiring steps; acceptable since Task 5's executor implements one focused module with its consumers defined.
- **Review Focus:** items 1–6 pinned to T1/T1/T1/T2/T3/T4 as listed.
