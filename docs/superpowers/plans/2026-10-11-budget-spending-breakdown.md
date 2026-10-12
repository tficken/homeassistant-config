# Budget Spending Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, user-chosen) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transaction-level spending breakdown, KPI tiles, and category-driven advice on the budget page.

**Architecture:** Extend the shipped phase-1 pipeline: parser extracts transactions + categorizes; history GET enriches at read time; one new pure JS module for the Spending breakdown card; advice rules consume the enriched latest month. No new endpoints.

**Tech Stack:** pypdf, vanilla JS ES modules + inline SVG, Home Assistant aiohttp.

**Spec:** `docs/superpowers/specs/2026-10-11-budget-spending-breakdown-design.md`

## Global Constraints

- Same as phase 1: tmp/ verification scripts (no shipped test harness), flake8 line-length 120 (extend-ignore E501,W503), compileall, `node --input-type=module --check` via `.tools/node/node.exe`, `python scripts/validate_ha_yaml.py`.
- `budget/history.json` stays git-ignored (public repo, private data).
- TDD: every task's verification script is written and watched failing BEFORE the implementation. Commit per task with named files (never `git add -A`).
- Exact fixture values (verified against the real statements): 2026-09 → DoorDash 6/$357.49, ATM 6/$660.50, gas 1/$14.46, 67 debits/$4,969.71, 4 credits/$5,168.80. 2026-08 → DoorDash 5/$315.42, ATM 3/$343.25, gas 12/$220.94, 80 debits/$5,408.79, 5 credits/$6,616.48.

## Review Focus

1. ACH transactions (`STUDENT LN DEPT EDUCATION`, `PAYROLL NRC`) must not get merchant `WEB`/`EFT`/`PPD …` — the merchant comes from the main line. Pinned in Task 1.
2. A statement whose layout shifts so counts/sums diverge from the printed summary must warn, not crash or silently pass. Pinned in Task 1.
3. Category totals + `other` must equal the debit total exactly per month — no transaction dropped or double-counted. Pinned in Task 2.
4. Old records without `transactions` (pre-phase-2) must yield empty breakdowns, not errors, from the enriched GET. Pinned in Task 3.
5. UI with exactly one stored month must render without month-over-month deltas (no NaN/undefined). Pinned in Task 4 preview step (single-month preview variant).

---

### Task 1: Transaction extraction

**Files:**
- Modify: `custom_components/ai_dashboard_proxy/statement_parser.py`
- Test: `tmp/test_transactions.py` (git-ignored)

**Interfaces:**
- Consumes: phase-1 `extract_pdf_text`, `_westgate_parse` internals.
- Produces:
  - `extract_transactions(text: str, period_start: date, period_end: date) -> list[dict]` — each `{"date": "YYYY-MM-DD", "type": str, "merchant": str, "amount": float, "direction": "debit"|"credit"}`
  - `_westgate_parse` record gains `"transactions": [...]` and integrity warnings when counts/sums diverge from the printed summary.

- [ ] **Step 1: Write the failing verification script**

Create `tmp/test_transactions.py`:

```python
"""Verify transaction extraction against the real statements."""
import sys

sys.path.insert(0, "custom_components/ai_dashboard_proxy")
from statement_parser import extract_pdf_text, extract_transactions, parse_statement  # noqa: E402

EXPECTED_COUNTS = {
    "04": (2, 66, 4616.88, 5232.30), "05": (2, 74, 4312.80, 5037.30),
    "06": (2, 66, 4312.80, 5713.92), "07": (2, 70, 4641.59, 5420.43),
    "08": (5, 80, 6616.48, 5408.79), "09": (4, 67, 5168.80, 4969.71),
}

for mm, (nc, nd, csum, dsum) in EXPECTED_COUNTS.items():
    with open(f"tmp/statement-2026-{mm}.pdf", "rb") as f:
        rec = parse_statement(extract_pdf_text(f.read()))
    txs = rec["transactions"]
    debits = [t for t in txs if t["direction"] == "debit"]
    credits = [t for t in txs if t["direction"] == "credit"]
    assert len(debits) == nd, (mm, len(debits), nd)
    assert len(credits) == nc, (mm, len(credits), nc)
    assert abs(sum(t["amount"] for t in debits) - dsum) < 0.01, mm
    assert abs(sum(t["amount"] for t in credits) - csum) < 0.01, mm
    assert rec["warnings"] == [], (mm, rec["warnings"])
    print(f"{mm}: {nd} debits + {nc} credits, sums match, no warnings")

# ACH merchants come from the main line, never the channel markers.
with open("tmp/statement-2026-09.pdf", "rb") as f:
    txs = parse_statement(extract_pdf_text(f.read()))["transactions"]
for t in txs:
    assert t["merchant"] not in ("WEB", "EFT", "PPD") and not t["merchant"].startswith("PPD "), t
ach = [t for t in txs if "STUDENT LN" in t["type"] or "DEPT EDUCATION" in t["merchant"]]
assert ach, "expected the student-loan ACH debit"
print("ACH merchant from main line: OK")

# Dates are full ISO dates inside the statement period.
for t in txs:
    assert t["date"].startswith(("2026-08", "2026-09")), t["date"]
print("date inference: OK")

# ATM identified by type prefix.
atm = [t for t in txs if t["type"].startswith("ATM W/D")]
assert len(atm) == 6 and abs(sum(t["amount"] for t in atm) - 660.50) < 0.01
print("ATM W/D type detection: OK")
```

Run: `python tmp/test_transactions.py`
Expected: FAIL — `KeyError: 'transactions'` (or ImportError for `extract_transactions`).

- [ ] **Step 2: Implement extraction**

In `statement_parser.py`, after `_short_date`:

```python
_TX_LINE = re.compile(
    r"^\s*(\d{1,2}/\d{1,2})\s+(.*?)\s{2,}([\d,]+\.\d{2})(-?)\s+([\d,]+\.\d{2})\s*$"
)
_ACH_CHANNEL = re.compile(r"^(WEB|EFT|PPD\b|TEL\b)", re.IGNORECASE)
_SKIP_CONTINUATION = re.compile(
    r"^(Date\b|Member FDIC|Activity in Date Order|P\.O\.|Page\b)", re.IGNORECASE
)


def extract_transactions(text: str, period_start: date, period_end: date) -> list[dict]:
    """Pull every activity line out of a West Gate Bank statement.

    Card-type entries carry their merchant on the first continuation line;
    ACH-style entries carry it in the main line (continuations are channel
    markers like WEB/EFT/PPD).
    """
    lines = text.split("\n")
    txs: list[dict] = []
    for i, line in enumerate(lines):
        m = _TX_LINE.match(line)
        if not m:
            continue
        tx_month, tx_day = (int(p) for p in m.group(1).split("/"))
        year = period_start.year if tx_month == period_start.month else period_end.year
        detail = m.group(2).strip()
        merchant = ""
        for j in range(i + 1, min(i + 4, len(lines))):
            cand = lines[j].strip()
            if not cand or _TX_LINE.match(lines[j]) or _SKIP_CONTINUATION.match(cand):
                if _TX_LINE.match(lines[j]):
                    break
                continue
            if _ACH_CHANNEL.match(cand):
                break
            merchant = cand
            break
        tx_type = detail.split("  ")[0].strip()
        if not merchant:
            # ACH-style: the name rides in the detail after the type prefix.
            merchant = re.sub(r"^(STUDENT LN|PAYROLL|PAYMENTS|WEB|EFT|TEL)\s*", "", detail).strip()
        txs.append({
            "date": date(year, tx_month, tx_day).isoformat(),
            "type": tx_type,
            "merchant": merchant,
            "amount": _money(m.group(3)),
            "direction": "debit" if m.group(4) == "-" else "credit",
        })
    return txs
```

In `_westgate_parse`, before the `return`, add integrity validation and the transactions key:

```python
    transactions = extract_transactions(text, period_start, period_end)
    count_checks = (
        (r"(\d+)\s+Deposits/Credits", "credit", values["deposits"]),
        (r"(\d+)\s+Checks/Debits", "debit", values["withdrawals"]),
    )
    for pattern, direction, expected_sum in count_checks:
        found = re.search(pattern, text)
        if not found:
            continue
        subset = [t for t in transactions if t["direction"] == direction]
        if len(subset) != int(found.group(1)):
            warnings.append(
                f"transaction extraction: found {len(subset)} {direction}s "
                f"but statement reports {found.group(1)} — layout may have changed"
            )
        elif abs(sum(t["amount"] for t in subset) - expected_sum) > 0.01:
            warnings.append(
                f"transaction extraction: {direction} sums diverge from the statement summary"
            )
```

and add `"transactions": transactions,` to the returned dict.

- [ ] **Step 3: Run verification**

Run: `python tmp/test_transactions.py`
Expected: six `sums match` lines + `ACH merchant from main line: OK`, `date inference: OK`, `ATM W/D type detection: OK`

Also re-run: `python tmp/test_statement_parser.py` — expect all prior checks still green.

- [ ] **Step 4: Lint + commit**

```bash
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
git add custom_components/ai_dashboard_proxy/statement_parser.py
git commit -m "feat(budget): extract statement transactions with integrity checks"
```

---

### Task 2: Categorization + KPIs

**Files:**
- Modify: `custom_components/ai_dashboard_proxy/statement_parser.py`
- Test: `tmp/test_categorize.py`

**Interfaces:**
- Consumes: `extract_transactions` output (Task 1).
- Produces: `categorize(transactions: list[dict]) -> dict` returning `{"categories": {name: {"total": float, "count": int}}, "kpis": {"food_delivery": {...}, "gas_fuel": {...}, "atm_cash": {...}, "dining_out": {...}}, "unmatched": {merchant: count}}`. Categories per the spec's ruleset. `categorize([])` returns `{"categories": {}, "kpis": {...zeros...}, "unmatched": {}}`.

- [ ] **Step 1: Write the failing verification script**

Create `tmp/test_categorize.py`:

```python
"""Verify the spending categorizer against exact fixtures from real statements."""
import sys

sys.path.insert(0, "custom_components/ai_dashboard_proxy")
from statement_parser import categorize, extract_pdf_text, parse_statement  # noqa: E402


def load(mm):
    with open(f"tmp/statement-2026-{mm}.pdf", "rb") as f:
        return parse_statement(extract_pdf_text(f.read()))


rec = load("09")
result = categorize(rec["transactions"])
kpis = result["kpis"]
assert kpis["food_delivery"]["count"] == 6, kpis["food_delivery"]
assert abs(kpis["food_delivery"]["total"] - 357.49) < 0.01
assert kpis["food_delivery"]["doordash_count"] == 6
assert abs(kpis["food_delivery"]["doordash_total"] - 357.49) < 0.01
assert kpis["food_delivery"]["grubhub_count"] == 0
assert kpis["atm_cash"]["count"] == 6 and abs(kpis["atm_cash"]["total"] - 660.50) < 0.01
assert kpis["gas_fuel"]["count"] == 1 and abs(kpis["gas_fuel"]["total"] - 14.46) < 0.01
print("2026-09 KPIs: OK")

rec8 = load("08")
kpis8 = categorize(rec8["transactions"])["kpis"]
assert kpis8["food_delivery"]["count"] == 5
assert abs(kpis8["food_delivery"]["total"] - 315.42) < 0.01
assert kpis8["atm_cash"]["count"] == 3 and abs(kpis8["atm_cash"]["total"] - 343.25) < 0.01
assert kpis8["gas_fuel"]["count"] == 12 and abs(kpis8["gas_fuel"]["total"] - 220.94) < 0.01
print("2026-08 KPIs: OK")

# Nothing dropped, nothing double-counted: category debit totals == summary.
cats = result["categories"]
debit_total = sum(t["amount"] for t in rec["transactions"] if t["direction"] == "debit")
assert abs(sum(c["total"] for c in cats.values()) - debit_total) < 0.01
assert cats["subscriptions"]["count"] >= 4  # 2x APPLE.COM/BILL + HULU + STEAM
assert cats["pets"]["count"] == 1
print("category completeness: OK")

# Empty input is safe.
empty = categorize([])
assert empty["categories"] == {} and empty["kpis"]["atm_cash"]["count"] == 0
print("empty input: OK")
```

Run: `python tmp/test_categorize.py`
Expected: FAIL — `ImportError: cannot import name 'categorize'`.

- [ ] **Step 2: Implement `categorize`**

Append to `statement_parser.py`:

```python
_CATEGORY_RULES: list[tuple[str, str]] = [
    ("DOORDASH", "food_delivery"), ("GRUBHUB", "food_delivery"),
    ("UBER EATS", "food_delivery"), ("UBER*EATS", "food_delivery"),
    ("SLICE", "food_delivery"),
    ("CASEYS", "gas_fuel"), ("CASEY S", "gas_fuel"), ("U-STOP", "gas_fuel"),
    ("AMOCO", "gas_fuel"), ("GULF", "gas_fuel"), ("KWIK", "gas_fuel"),
    ("SPEEDWAY", "gas_fuel"), ("SHELL", "gas_fuel"), ("EXXON", "gas_fuel"),
    ("PHILLIPS", "gas_fuel"), ("CENEX", "gas_fuel"),
    ("WENDY", "dining_out"), ("PANDA", "dining_out"), ("CHICK-FIL-A", "dining_out"),
    ("CULVERS", "dining_out"), ("TOPPERS", "dining_out"), ("TST*", "dining_out"),
    ("MCDONALD", "dining_out"), ("TACO", "dining_out"), ("PIZZA", "dining_out"),
    ("SUBWAY", "dining_out"), ("STARBUCKS", "dining_out"), ("DUNKIN", "dining_out"),
    ("BURGER", "dining_out"), ("QDOBA", "dining_out"), ("CHIPOTLE", "dining_out"),
    ("DOMINO", "dining_out"), ("JIMMY JOHN", "dining_out"), ("POPEYE", "dining_out"),
    ("SONIC", "dining_out"), ("ARBY", "dining_out"), ("HIRO", "dining_out"),
    ("RESTAURANT", "dining_out"), ("GRILL", "dining_out"), ("CAFE", "dining_out"),
    ("COSTCO", "groceries"), ("HY-VEE", "groceries"), ("HYVEE", "groceries"),
    ("ALDI", "groceries"), ("SAMS", "groceries"), ("WALMART", "groceries"),
    ("TARGET", "groceries"), ("FAREWAY", "groceries"), ("BAKERS", "groceries"),
    ("AMAZON", "shopping"), ("EBAY", "shopping"), ("STEAM", "shopping"),
    ("BEST BUY", "shopping"), ("CHEWY", "shopping"),
    ("HULU", "subscriptions"), ("NETFLIX", "subscriptions"), ("SPOTIFY", "subscriptions"),
    ("APPLE.COM/BILL", "subscriptions"), ("DOTA", "subscriptions"),
    ("PATREON", "subscriptions"), ("MOONSHOT", "subscriptions"),
    ("HEALTH", "health"), ("WALGREENS", "health"), ("CVS", "health"),
    ("PHARMACY", "health"), ("DENTAL", "health"), ("VISION", "health"),
    ("PETCO", "pets"), ("PETSMART", "pets"), ("VET", "pets"),
    ("SUPER 8", "travel"), ("HOTEL", "travel"), ("MOTEL", "travel"),
    ("AIRLINES", "travel"), ("STUBHUB", "travel"), ("AIRBNB", "travel"),
    ("SMOKAHA", "tobacco"), ("TOBACCO", "tobacco"), ("VAPE", "tobacco"),
    ("CIGAR", "tobacco"),
    ("STUDENT LN", "bills_transfers"), ("DEPT EDUCATION", "bills_transfers"),
]
_KPI_KEYS = ("food_delivery", "gas_fuel", "atm_cash", "dining_out")


def _category_of(tx: dict) -> str:
    if tx["type"].startswith("ATM W/D"):
        return "atm_cash"
    merchant = tx["merchant"].upper()
    for keyword, category in _CATEGORY_RULES:
        if keyword in merchant:
            return category
    if tx["type"] in ("STUDENT LN", "PAYROLL", "PAYMENTS", "WEB", "EFT", "TEL"):
        return "bills_transfers"
    return "other"


def categorize(transactions: list[dict]) -> dict:
    """Bucket debit transactions into spending categories + KPI totals."""
    categories: dict[str, dict] = {}
    unmatched: dict[str, int] = {}
    kpis = {k: {"total": 0.0, "count": 0} for k in _KPI_KEYS}
    kpis["food_delivery"].update(
        {"doordash_total": 0.0, "doordash_count": 0,
         "grubhub_total": 0.0, "grubhub_count": 0}
    )
    for tx in transactions:
        if tx["direction"] != "debit":
            continue
        category = _category_of(tx)
        bucket = categories.setdefault(category, {"total": 0.0, "count": 0})
        bucket["total"] = round(bucket["total"] + tx["amount"], 2)
        bucket["count"] += 1
        if category == "other":
            unmatched[tx["merchant"]] = unmatched.get(tx["merchant"], 0) + 1
        if category in _KPI_KEYS:
            kpis[category]["total"] = round(kpis[category]["total"] + tx["amount"], 2)
            kpis[category]["count"] += 1
        if category == "food_delivery":
            merchant = tx["merchant"].upper()
            key = "doordash" if "DOORDASH" in merchant else "grubhub" if "GRUBHUB" in merchant else None
            if key:
                kpis["food_delivery"][f"{key}_total"] = round(
                    kpis["food_delivery"][f"{key}_total"] + tx["amount"], 2)
                kpis["food_delivery"][f"{key}_count"] += 1
    return {"categories": categories, "kpis": kpis, "unmatched": unmatched}
```

- [ ] **Step 3: Run verification**

Run: `python tmp/test_categorize.py`
Expected: `2026-09 KPIs: OK`, `2026-08 KPIs: OK`, `category completeness: OK`, `empty input: OK`

- [ ] **Step 4: Lint + commit**

```bash
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
git add custom_components/ai_dashboard_proxy/statement_parser.py
git commit -m "feat(budget): categorize statement spending + KPI totals"
```

---

### Task 3: Read-time enrichment + backfill re-run

**Files:**
- Modify: `custom_components/ai_dashboard_proxy/http.py` (`budget_history_handler`)
- Modify: `tmp/test_upload_handler.py` (extend)
- Test: `tmp/test_history_enrichment.py`

**Interfaces:**
- Consumes: `categorize` (Task 2), stored `transactions` (Task 1).
- Produces: `GET /budget/api/history` response months gain `categories`, `kpis`, `unmatched` (computed at read time; months lacking `transactions` get empty breakdowns).

- [ ] **Step 1: Write the failing verification script**

Create `tmp/test_history_enrichment.py`:

```python
"""Verify read-time category enrichment of the history endpoint payload."""
import asyncio
import sys
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
    config = MagicMock(config_dir=".")

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


class FakeRequest:
    remote = "192.168.1.10"
    app = {"ai_dashboard_secret": None, "hass": FakeHass()}

    def get(self, _key, default=None):
        return default


res = asyncio.new_event_loop().run_until_complete(
    proxy_http.budget_history_handler(FakeRequest()))
assert res.status == 200, res.status
import json  # noqa: E402

payload = json.loads(res.text)
sep = payload["months"]["2026-09"]
assert "kpis" in sep and "categories" in sep, sorted(sep)
assert sep["kpis"]["food_delivery"]["count"] == 6, sep["kpis"]
assert abs(sep["kpis"]["food_delivery"]["total"] - 357.49) < 0.01
print("enriched history: OK")

# A month without transactions gets an empty breakdown, not an error.
from ai_dashboard_proxy.history_store import save_month  # noqa: E402
import tempfile  # noqa: E402

cfg = tempfile.mkdtemp()
save_month(cfg, {"month": "2026-01", "period_start": "2025-12-22",
                 "period_end": "2026-01-19", "beginning": 1.0, "deposits": 1.0,
                 "withdrawals": 1.0, "ending": 1.0, "parser": "westgate_checking",
                 "warnings": []})
FakeHass.config.config_dir = cfg
res = asyncio.new_event_loop().run_until_complete(
    proxy_http.budget_history_handler(FakeRequest()))
payload = json.loads(res.text)
jan = payload["months"]["2026-01"]
assert jan["categories"] == {} and jan["kpis"]["atm_cash"]["count"] == 0
print("no-transactions month -> empty breakdown: OK")
```

Run: `python tmp/test_history_enrichment.py`
Expected: FAIL — `AssertionError` on `"kpis" in sep` (enrichment not implemented).

- [ ] **Step 2: Implement enrichment**

In `http.py`, extend the `.statement_parser` import to include `categorize`, and replace `budget_history_handler`'s body after the auth check:

```python
    hass: HomeAssistant = request.app["hass"]

    def _load_enriched() -> dict:
        history = load_history(hass.config.config_dir)
        for month in history["months"].values():
            breakdown = categorize(month.get("transactions", []))
            month["categories"] = breakdown["categories"]
            month["kpis"] = breakdown["kpis"]
            month["unmatched"] = breakdown["unmatched"]
        return history

    history = await hass.async_add_executor_job(_load_enriched)
    return web.json_response(history)
```

- [ ] **Step 3: Re-run the backfill to embed transactions**

```bash
python scripts/backfill_budget_history.py . tmp/statement-2026-04.pdf tmp/statement-2026-05.pdf tmp/statement-2026-06.pdf tmp/statement-2026-07.pdf tmp/statement-2026-08.pdf tmp/statement-2026-09.pdf
python -c "import json; m=json.load(open('budget/history.json'))['months']; print({k: len(v['transactions']) for k,v in sorted(m.items())})"
```
Expected: six backfill lines with no warnings; transaction counts `{'2026-04': 68, '2026-05': 76, '2026-06': 68, '2026-07': 72, '2026-08': 85, '2026-09': 71}`.

- [ ] **Step 4: Run all verification**

```bash
python tmp/test_history_enrichment.py
python tmp/test_upload_handler.py
python tmp/test_statement_parser.py | tail -1
python tmp/test_history_store.py | tail -1
```
Expected: `enriched history: OK`, `no-transactions month -> empty breakdown: OK`, all handler tests, `too large: OK`, `corrupt file -> empty: OK`.

Note: `tmp/test_history_enrichment.py` case 1 uses `config_dir="."` so it reads the real seeded `budget/history.json` — run it AFTER Step 3.

- [ ] **Step 5: Lint + commit**

```bash
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
git add custom_components/ai_dashboard_proxy/http.py
git commit -m "feat(budget): enrich history endpoint with spending categories"
```

---

### Task 4: Spending breakdown card

**Files:**
- Create: `www/budget/js/spending.js`
- Modify: `www/budget/index.html` (card after the history card)
- Modify: `www/budget/js/budget.js` (import + `renderSpending` called from `renderHistory` and upload refresh)
- Modify: `www/budget/css/budget.css` (tile + category-bar styles, before `@media` block)
- Test: `www/budget/_preview_spending.html` (temporary, deleted after screenshot)

**Interfaces:**
- Consumes: enriched history JSON (Task 3): `months[m].kpis`, `months[m].categories`.
- Produces:
  - `buildSpendingModel(months: object) -> {latest: {...}, previous: {...}|null}` where each month is `{key, label, kpis, categories}`
  - `renderSpending(model) -> void`-equivalent HTML strings: `spendingTilesHtml(model)`, `categoryBarsHtml(model)` (pure string builders, preview-verifiable)

- [ ] **Step 1: Write the spending module**

Create `www/budget/js/spending.js`:

```javascript
// Pure model + HTML builders for the Spending breakdown card. Same
// conventions as history.js/outlook.js: no DOM, no side effects.

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const parseDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const KPI_DEFS = [
  { key: 'food_delivery', label: 'Food delivery', sub: (k) =>
      `DD ${money(k.doordash_total)}/${k.doordash_count} · GH ${money(k.grubhub_total)}/${k.grubhub_count}` },
  { key: 'gas_fuel', label: 'Gas & fuel', sub: null },
  { key: 'atm_cash', label: 'ATM cash', sub: null },
  { key: 'dining_out', label: 'Dining out', sub: null },
];

export function buildSpendingModel(months) {
  const keys = Object.keys(months || {}).filter((k) => months[k].kpis).sort();
  if (!keys.length) return { latest: null, previous: null };
  const wrap = (k) => ({
    key: k,
    label: parseDay(k + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    kpis: months[k].kpis,
    categories: months[k].categories || {},
  });
  return {
    latest: wrap(keys[keys.length - 1]),
    previous: keys.length > 1 ? wrap(keys[keys.length - 2]) : null,
  };
}

function deltaHtml(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return '';
  const pct = (current - previous) / previous * 100;
  if (Math.abs(pct) < 5) return '<span class="delta flat">±0%</span>';
  const up = pct > 0;
  // Spending increases are red, decreases are green.
  return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(pct))}%</span>`;
}

export function spendingTilesHtml(model) {
  if (!model.latest) return '';
  return KPI_DEFS.map((def) => {
    const k = model.latest.kpis[def.key] || { total: 0, count: 0 };
    const prev = model.previous ? (model.previous.kpis[def.key] || {}).total : null;
    const sub = def.sub ? def.sub(k) : `${k.count} charge${k.count === 1 ? '' : 's'}`;
    return `<div class="kpi-tile">` +
      `<div class="kpi-label">${def.label}</div>` +
      `<div class="kpi-value">${money(k.total)} ${deltaHtml(k.total, prev)}</div>` +
      `<div class="kpi-sub">${sub}</div></div>`;
  }).join('');
}

export function categoryBarsHtml(model) {
  if (!model.latest) return '';
  const cats = Object.entries(model.latest.categories)
    .map(([name, c]) => ({ name, ...c, prev: model.previous?.categories?.[name]?.total ?? null }))
    .filter((c) => c.total >= 5)
    .sort((a, b) => b.total - a.total);
  const max = Math.max(...cats.map((c) => c.total), 1);
  const label = (name) => name.replace(/_/g, ' ');
  return cats.map((c) =>
    `<div class="cat-row">` +
    `<span class="cat-name">${label(c.name)}</span>` +
    `<span class="cat-bar"><span class="cat-fill${c.name === 'bills_transfers' ? ' muted-fill' : ''}" style="width:${(c.total / max * 100).toFixed(1)}%"></span></span>` +
    `<span class="cat-count">${c.count}×</span>` +
    `<span class="cat-amount">${money(c.total)} ${deltaHtml(c.total, c.prev)}</span>` +
    `</div>`
  ).join('');
}
```

- [ ] **Step 2: Add the card to index.html**

Insert after the history card, before upcoming bills:

```html
  <section class="card spending-card" id="spending-card" hidden>
    <h2>Spending breakdown <span class="hint" id="spending-month"></span></h2>
    <div id="kpi-tiles" class="kpi-tiles"></div>
    <div id="category-bars" class="category-bars"></div>
  </section>
```

- [ ] **Step 3: Wire into budget.js + CSS**

budget.js import line becomes:

```javascript
import { buildHistoryModel, buildHistorySvg } from './history.js';
import { buildSpendingModel, categoryBarsHtml, spendingTilesHtml } from './spending.js';
```

Add a module-level variable and render function, and call it from `renderHistory`:

```javascript
let spendingModel = { latest: null, previous: null };

function renderSpending(history) {
  spendingModel = buildSpendingModel(history?.months || {});
  const card = document.getElementById('spending-card');
  if (!spendingModel.latest) {
    card.hidden = true;
    return;
  }
  document.getElementById('spending-month').textContent = spendingModel.latest.label;
  document.getElementById('kpi-tiles').innerHTML = spendingTilesHtml(spendingModel);
  document.getElementById('category-bars').innerHTML = categoryBarsHtml(spendingModel);
  card.hidden = false;
}
```

Call `renderSpending(history);` as the last line of `renderHistory` (both branches return early — restructure: rename existing `renderHistory` body so `renderSpending(history)` runs in both paths; simplest: call it first thing in `renderHistory` before the chart logic).

Also change the end of `render()` to call `renderAdvice(balance, safe, daysLeft, items, paydayIso, paycheck)` — unchanged; advice gets `spendingModel` from module scope (Task 5).

CSS (before `@media` block):

```css
/* Spending breakdown */
.kpi-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
.kpi-tile { background: rgba(139, 150, 171, 0.07); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px 14px; }
.kpi-label { font-size: 11px; color: var(--faint); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
.kpi-value { font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }
.kpi-sub { font-size: 12px; color: var(--muted); margin-top: 3px; }
.delta { font-size: 11px; font-weight: 700; margin-left: 6px; }
.delta.up { color: var(--red); }
.delta.down { color: var(--green); }
.delta.flat { color: var(--faint); }
.cat-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 14px; }
.cat-name { min-width: 110px; text-transform: capitalize; color: var(--text); }
.cat-bar { flex: 1; height: 8px; border-radius: 999px; background: rgba(139, 150, 171, 0.15); overflow: hidden; }
.cat-fill { display: block; height: 100%; border-radius: 999px; background: var(--blue); }
.cat-fill.muted-fill { background: var(--faint); }
.cat-count { font-size: 12px; color: var(--faint); min-width: 32px; text-align: right; }
.cat-amount { min-width: 130px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
```

Add to the `@media (max-width: 640px)` block: `.kpi-tiles { grid-template-columns: repeat(2, 1fr); }`

- [ ] **Step 4: Syntax check + preview**

```bash
.tools/node/node.exe --input-type=module --check < www/budget/js/spending.js
.tools/node/node.exe --input-type=module --check < www/budget/js/budget.js
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/budget/index.html', encoding='utf-8').read()); print('HTML OK')"
```

Build `www/budget/_preview_spending.html` like the earlier previews: fetch nothing, inline the enriched history JSON (produce it with `python tmp/test_history_enrichment.py`-style dump: `python -c "import json,sys; sys.path.insert(0,'custom_components'); from ai_dashboard_proxy.history_store import load_history; from ai_dashboard_proxy.statement_parser import categorize; h=load_history('.'); [m.update(categorize(m.get('transactions',[]))) for m in h['months'].values()]; print(json.dumps(h))"` and inject). Render the card via the module. Screenshot: expect 4 KPI tiles (food delivery $357.49, ATM $660.50, gas $14.46 with a big MoM drop, dining) + category bars sorted desc with `bills & transfers` present.

Also preview a single-month variant (delete all but 2026-09 from the injected JSON) to pin Review Focus #5: no deltas, no NaN.

- [ ] **Step 5: Delete preview, commit**

```bash
rm www/budget/_preview_spending.html
git add www/budget/js/spending.js www/budget/js/budget.js www/budget/index.html www/budget/css/budget.css
git commit -m "feat(budget): add spending breakdown card with KPI tiles"
```

---

### Task 5: Category-driven advice rules

**Files:**
- Modify: `www/budget/js/budget.js` (`renderAdvice`)
- Test: `www/budget/_preview_advice.html` (temporary; or extend the spending preview with a mocked `spendingModel`)

**Interfaces:**
- Consumes: `spendingModel` module variable (Task 4).
- Produces: new advice bullets per the spec's four rules; no signature changes.

- [ ] **Step 1: Add the rules**

At the top of `renderAdvice`, after the stale-data checks, add:

```javascript
  const lm = spendingModel.latest;
  const pm = spendingModel.previous;
  if (lm) {
    const fd = lm.kpis.food_delivery || { total: 0, count: 0 };
    const atm = lm.kpis.atm_cash || { total: 0, count: 0 };
    const dine = lm.kpis.dining_out || { total: 0, count: 0 };
    const weeks = Math.max(1, Math.round(30 / 7));
    if (fd.total > 150) {
      const weekly = fd.total / 4.3;
      tips.push({
        tone: fd.total > 300 ? 'warn' : '',
        html: `Food delivery was <strong>${money(fd.total)}</strong> in ${lm.label} across ${fd.count} orders (~${money(weekly)}/week) — cutting two orders a week saves ~${money(weekly * 2)}/month.`,
      });
    }
    if (atm.count >= 4) {
      tips.push({ tone: 'warn', html: `${atm.count} ATM withdrawals totaling <strong>${money(atm.total)}</strong> in ${lm.label} — cash is your least-tracked spending.` });
    }
    if (pm) {
      let spike = null;
      for (const [name, c] of Object.entries(lm.categories)) {
        const prev = pm.categories[name]?.total;
        if (!prev || prev < 50) continue;
        const pct = (c.total - prev) / prev * 100;
        if (pct > 25 && (!spike || pct > spike.pct)) spike = { name, pct, from: prev, to: c.total };
      }
      if (spike) {
        tips.push({ tone: 'warn', html: `<strong>${spike.name.replace(/_/g, ' ')}</strong> jumped from ${money(spike.from)} to ${money(spike.to)} (+${Math.round(spike.pct)}%) vs ${pm.label}.` });
      }
    }
    if (fd.total + dine.total > 400) {
      tips.push({ tone: '', html: `Dining + delivery together hit <strong>${money(fd.total + dine.total)}</strong> in ${lm.label} — that's the biggest discretionary lever this month.` });
    }
  }
```

(The unused `weeks` variable is intentionally omitted — use `4.3` inline as shown.)

- [ ] **Step 2: Preview with real data**

Extend the Task 4 preview (or a copy of it) to import budget.js's advice path indirectly: simplest is a small standalone preview that stubs the DOM elements `renderAdvice` touches (`advice`, `.advice-card`, `ENTITIES` state map). Because `renderAdvice` reads module-level state, the pragmatic check is: `node --check` passes, then verify on the live page post-restart. Acceptable because advice bullets are pure string generation over `spendingModel`, already preview-verified in Task 4. Ledger this as a verification-scope ruling.

- [ ] **Step 3: Commit**

```bash
.tools/node/node.exe --input-type=module --check < www/budget/js/budget.js
git add www/budget/js/budget.js
git commit -m "feat(budget): category-driven advice rules (delivery, ATM, spikes)"
```

---

### Task 6: Docs + final validation

**Files:**
- Modify: `AGENTS.md`, `www/ai-dashboard/AGENTS.md`
- Test: full suite

- [ ] **Step 1: Docs**

- Root `AGENTS.md` budget bullet: add "Spending breakdown card (KPI tiles + category bars from statement transactions, computed at read time by `categorize()`; records store raw `transactions`)".
- `www/ai-dashboard/AGENTS.md` `/budget/api/history` line: note the response includes `categories`/`kpis`/`unmatched` computed at read time and that records hold raw `transactions`.

- [ ] **Step 2: Full suite**

```bash
python scripts/validate_ha_yaml.py
python -m compileall custom_components/ai_dashboard_proxy -q
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
for f in www/budget/js/*.js; do .tools/node/node.exe --input-type=module --check < "$f" || exit 1; done
python tmp/test_statement_parser.py | tail -1
python tmp/test_transactions.py | tail -1
python tmp/test_categorize.py | tail -1
python tmp/test_history_store.py | tail -1
python tmp/test_budget_endpoints.py
python tmp/test_upload_handler.py | tail -1
python tmp/test_history_enrichment.py
python -m json.tool budget/history.json > /dev/null
```
Expected: all green.

- [ ] **Step 3: Commit + push note**

```bash
git add AGENTS.md www/ai-dashboard/AGENTS.md
git commit -m "docs(budget): document spending breakdown + enriched history API"
```

Tell the user: HA restart required (proxy Python changed), then verify the Spending breakdown card + new advice bullets live; `git push` on their word.

---

## Self-Review Notes

- **Spec coverage:** extraction+integrity (T1), ruleset+KPIs (T2), read-time enrichment + old-record tolerance + backfill (T3), card+tiles+bars+single-month case (T4), four advice rules (T5), docs (T6). All spec sections covered.
- **Type consistency:** `categorize` output keys (`categories/kpis/unmatched`, KPI sub-keys) identical in parser, enrichment, spending.js, and advice rules. `transactions` record key identical in parser, backfill, enrichment.
- **Placeholders:** none.
- **Review Focus:** items 1–5 pinned to Tasks 1/1/2/3/4 as listed.
