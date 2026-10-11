# Budget Bill Tracking + Coverage Checking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two users track bills (due dates, amounts, splits) in Billy and get an AI-dashboard banner warning when the checking account can't cover everything due in the next 30 days.

**Architecture:** Billy (HACS) stores bills in `.storage/bill_tracker.expenses`; a `command_line` sensor runs `scripts/billy_due_next_30_days.py` to sum unpaid bills (due ≤ today+30, including overdue) plus computed future recurring occurrences in the window. SimpleFIN (core integration) supplies the checking balance. Template sensors derive coverage amount and a covered/not-covered binary, which surface in the AI dashboard's existing `config.alerts` banner and on a new YAML-managed "Budget" Lovelace dashboard of Billy widget cards.

**Tech Stack:** Home Assistant 2026.10 YAML config, Jinja2 templates, Python 3 (HA container), Billy integration, SimpleFIN core integration, AI dashboard `config.json`.

**Spec:** `docs/superpowers/specs/2026-10-11-budget-bill-tracking-design.md`

## Global Constraints

- Coverage window: exactly 30 days (rolling, from today).
- Coverage account: exactly one checking account; connect only that account in SimpleFIN.
- Alerts: AI dashboard `config.alerts` banner only — no Echo announcements, no phone push, no automations.
- File tools (Read/Write/Edit) need absolute paths: `//HOMEASSISTANT/config/<file>`. Bash works with relative paths.
- Never edit files under `.storage/`; the script reads `.storage/bill_tracker.expenses` read-only.
- Billy (`custom_components/bill_tracker/`) is HACS-managed and git-ignored — never commit it.
- YAML: 2-space indent, validate with `python scripts/validate_ha_yaml.py` (covers `configuration.yaml`) and the Node YAML parse check for `budget-dashboard.yaml`.
- `www/ai-dashboard/config.json` must stay valid JSON (`python -m json.tool`).
- Any `configuration.yaml` change requires an HA restart (done once, at the end).

## Review Focus

1. **Billy storage schema change on update** — script must exit non-zero (sensor goes stale → banner warns) rather than print a wrong 0. Pinned by Task 3 step "missing data key" run.
2. **Multiple accounts connected in SimpleFIN** — entity discovery becomes ambiguous; prevented by the Global Constraint to connect only the coverage account, checked in Task 2 step 1.
3. **Recurring rule with end_date / installments** — occurrences after end_date must not count. Pinned by Task 3 fixture rule "Ended".
4. **Unpaid bill with no due_date** — excluded from the sum (cannot be scheduled); visible in Billy UI but never in coverage math. Pinned by Task 3 fixture bill "NoDate".
5. **SimpleFIN Age sensor format unknown until live** — timestamp vs numeric hours; Task 2 step 2 records the format and Task 4 picks the matching `fresh` expression. Wrong pick → `bills_covered` stuck off → banner shows (safe direction).

---

### Task 1: Manual prerequisites (user performs)

**Files:** none (Home Assistant UI only)

**Interfaces:**
- Produces: live entities — Billy's `sensor.billy_total_bills` (exact ID verified in Task 2), SimpleFIN balance/age/problem entities; Billy storage file `/config/.storage/bill_tracker.expenses` exists with real bills.

- [ ] **Step 1: Create the SimpleFIN account (user)**

Sign up at <https://beta-bridge.simplefin.org/> ($1.50/mo), connect the bill-paying checking account **only**, create an app, and record the claim token (shown once).

- [ ] **Step 2: Add the SimpleFin integration (user)**

HA UI → Settings → Devices & services → Add Integration → **SimpleFin** → paste claim token. Confirm a device appears with Balance, Age, and Problem sensors.

- [ ] **Step 3: Install Billy via HACS (user)**

HACS → ⋮ menu → Custom repositories → add `https://github.com/robin994/billy`, category **Integration** → Download → **restart Home Assistant** → Settings → Devices & services → Add Integration → **Billy**.

- [ ] **Step 4: Configure Billy (user)**

Open the `/billy` sidebar app → Settings → add payers **Travis** and **Bobbie** with the household default split → add 2–3 real recurring bills (amount, cadence, due date, payer) so live data exists for later verification.

- [ ] **Step 5: Commit nothing — no file changes in this task**

---

### Task 2: Entity discovery (user reports, executor records)

**Files:** none (fills the ID table below; every later task references these names)

**Interfaces:**
- Produces: three IDs used verbatim in Tasks 4–6: `BALANCE_ID`, `AGE_ID`, `PROBLEM_ID`, plus `AGE_FORMAT` (`timestamp` or `numeric`).

- [ ] **Step 1: Find the SimpleFIN entity IDs (user)**

HA UI → Settings → Devices & services → SimpleFin → the checking-account device → copy the entity IDs of the **Balance** sensor, the **Age** sensor, and the **Problem** binary sensor. Expected shapes: `sensor.<account>_balance`, `sensor.<account>_age`, `binary_sensor.<account>_problem`. If more than one account device exists, remove the extra accounts in the SimpleFIN web UI — only the checking account may be connected (Global Constraints).

- [ ] **Step 2: Check the Age sensor format (user)**

Developer Tools → States → select the Age entity. If its state looks like `2026-10-11T08:30:00+00:00`, record `AGE_FORMAT = timestamp`. If it is a bare number (hours), record `AGE_FORMAT = numeric`.

- [ ] **Step 3: Record values**

| Name | Value |
|---|---|
| `BALANCE_ID` | e.g. `sensor.checking_balance` (from step 1) |
| `AGE_ID` | e.g. `sensor.checking_age` (from step 1) |
| `PROBLEM_ID` | e.g. `binary_sensor.checking_problem` (from step 1) |
| `AGE_FORMAT` | `timestamp` or `numeric` (from step 2) |
| Billy total sensor | e.g. `sensor.billy_total_bills` — confirm it exists and has a numeric state |

---

### Task 3: `billy_due_next_30_days.py` script

**Files:**
- Create: `scripts/billy_due_next_30_days.py`

**Interfaces:**
- Consumes: `/config/.storage/bill_tracker.expenses` (HA Store JSON: top-level `data` key holding `expenses`, `recurring_expenses`, `recurring_occurrences`).
- Produces: stdout = one decimal number (total due in next 30 days). CLI: `billy_due_next_30_days.py [store_path] [today_YYYY-MM-DD]` — both args optional, used by the fixture test. Exit 2 with a stderr message if `data` is missing (schema change guard). Used by the `command_line` sensor in Task 4.

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""Print the total of bills and recurring charges due in the next 30 days.

Reads Billy's storage file read-only. Unpaid bills with a due_date on or
before today+30d count (overdue included); bills without a due_date are
excluded. Active recurring rules contribute their computed occurrences in
[today, today+30d] — Billy only materializes occurrences up to today, so
future occurrences are derived from each rule's cadence.
"""
import json
import sys
from calendar import monthrange
from datetime import date, timedelta

DEFAULT_STORE = "/config/.storage/bill_tracker.expenses"
WINDOW_DAYS = 30


def add_months(d, months):
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    return date(y, m, min(d.day, monthrange(y, m)[1]))


def recurring_occurrences(rule, today, horizon):
    """Yield due dates in [today, horizon] for one recurring rule."""
    if not rule.get("active", True) or not rule.get("start_date"):
        return
    start = date.fromisoformat(rule["start_date"])
    end = date.fromisoformat(rule["end_date"]) if rule.get("end_date") else None
    interval = int(rule.get("interval_months") or 1)
    due = start
    while due < today:
        due = add_months(due, interval)
    while due <= horizon:
        if end is None or due <= end:
            yield due
        due = add_months(due, interval)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_STORE
    today = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else date.today()
    with open(path, encoding="utf-8") as f:
        data = json.load(f).get("data")
    if not isinstance(data, dict):
        sys.exit("bill_tracker storage has no 'data' object — schema changed?")
    horizon = today + timedelta(days=WINDOW_DAYS)
    total = 0.0
    for bill in data.get("expenses", []):
        if bill.get("paid") or not bill.get("due_date"):
            continue
        if date.fromisoformat(bill["due_date"]) <= horizon:
            total += float(bill.get("amount") or 0)
    for rule in data.get("recurring_expenses", []):
        count = sum(1 for _ in recurring_occurrences(rule, today, horizon))
        total += count * float(rule.get("amount") or 0)
    print(round(total, 2))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write the fixture**

Run from the config directory:

```bash
python3 - <<'EOF'
import json
fixture = {"version": 1, "minor_version": 1, "key": "bill_tracker.expenses", "data": {
    "expenses": [
        {"amount": 100.0, "paid": False, "due_date": "2026-10-16"},
        {"amount": 200.0, "paid": True,  "due_date": "2026-10-16"},
        {"amount": 300.0, "paid": False, "due_date": "2026-11-20"},
        {"amount": 50.0,  "paid": False, "due_date": "2026-10-08"},
        {"amount": 75.0,  "paid": False},
    ],
    "recurring_expenses": [
        {"name": "Monthly sub", "amount": 25.0, "interval_months": 1, "active": True,
         "start_date": "2026-10-01", "end_date": None},
        {"name": "Paused", "amount": 999.0, "interval_months": 1, "active": False,
         "start_date": "2026-10-01", "end_date": None},
        {"name": "Ended", "amount": 500.0, "interval_months": 1, "active": True,
         "start_date": "2026-08-01", "end_date": "2026-09-01"},
    ],
    "recurring_occurrences": [],
}}
open("tmp/billy_fixture.json", "w").write(json.dumps(fixture))
print("fixture written")
EOF
```

- [ ] **Step 3: Run the fixture test**

Run: `python3 scripts/billy_due_next_30_days.py tmp/billy_fixture.json 2026-10-11`

Expected: `175.0`

Breakdown with `today = 2026-10-11` (horizon 2026-11-10): unpaid bill due 10-16 = $100; paid bill excluded; bill due 11-20 outside window; overdue bill due 10-08 = $50; no-due-date bill excluded. Monthly sub: occurrences 10-01 (< today, skipped) then 11-01 (in window) = 1 × $25. Paused excluded. Ended produces no occurrences after its end_date. Total = 100 + 50 + 25 = **175.0**.

- [ ] **Step 4: Schema-change guard test**

Run: `echo '{"version":1}' > tmp/billy_bad.json && python3 scripts/billy_due_next_30_days.py tmp/billy_bad.json; echo "exit=$?"`

Expected: stderr message containing `no 'data' object`, `exit=2` — never a silent `0.0`.

- [ ] **Step 5: Live smoke test (after Task 1 is done)**

Run: `python3 scripts/billy_due_next_30_days.py`

Expected: a number ≥ the sum of the recurring bills entered in Task 1 step 4 that fall in the window (they may print as e.g. `145.0`). If the file does not exist yet, Billy was not set up — return to Task 1.

- [ ] **Step 6: Commit**

```bash
git add scripts/billy_due_next_30_days.py
git commit -m "Add script summing Billy bills due in the next 30 days"
```

---

### Task 4: Coverage sensors in `configuration.yaml`

**Files:**
- Modify: `configuration.yaml` — extend the existing `command_line:` block (currently lines 82–99) and `template:` block (currently lines 168–227)

**Interfaces:**
- Consumes: `BALANCE_ID`, `AGE_ID`, `PROBLEM_ID`, `AGE_FORMAT` from Task 2; the script from Task 3.
- Produces: `sensor.bills_due_next_30_days`, `sensor.bills_coverage_amount`, `binary_sensor.bills_covered` — referenced by Tasks 5 and 6.

- [ ] **Step 1: Add the command_line sensor**

Append a third entry to the existing `command_line:` list in `configuration.yaml` (keep the comment style of the existing entries):

```yaml
  # Sum of Billy bills + recurring charges due in the next 30 days — backs the
  # bills-coverage binary sensor and the AI dashboard shortfall banner.
  - sensor:
      name: "Bills due next 30 days"
      unique_id: bills_due_next_30_days
      command: "python3 /config/scripts/billy_due_next_30_days.py"
      unit_of_measurement: "$"
      value_template: "{{ value | float }}"
      scan_interval: 3600
```

- [ ] **Step 2: Add the coverage template sensors**

Append to the `template:` block in `configuration.yaml`, after the existing `binary_sensor:` entry. Substitute the Task 2 IDs where marked:

```yaml
  # Bill coverage: does the checking account cover everything due in the next
  # 30 days? Stale SimpleFIN data counts as NOT covered — a dead bank sync must
  # never silently suppress the warning.
  - sensor:
      - name: "Bills coverage amount"
        unique_id: bills_coverage_amount
        unit_of_measurement: "$"
        state: >
          {{ (states('BALANCE_ID') | float(0)
              - states('sensor.bills_due_next_30_days') | float(0)) | round(2) }}
        availability: >
          {{ states('BALANCE_ID') | float(none) is not none
             and states('sensor.bills_due_next_30_days') | float(none) is not none }}

  - binary_sensor:
      - name: "Bills covered"
        unique_id: bills_covered
        state: >
          {% set coverage = states('sensor.bills_coverage_amount') | float(none) %}
          {% set problem = states('PROBLEM_ID') %}
          {% if AGE_FORMAT == 'timestamp' %}
          {% set age_ts = as_timestamp(states('AGE_ID'), none) %}
          {% set fresh = age_ts is not none and now().timestamp() - age_ts < 172800 %}
          {% else %}
          {% set fresh = states('AGE_ID') | float(9999) < 48 %}
          {% endif %}
          {{ coverage is not none and coverage >= 0 and fresh and problem == 'off' }}
```

`{% if AGE_FORMAT == 'timestamp' %}` is plan-level instruction, not Jinja: keep the timestamp branch if Task 2 recorded `timestamp`, otherwise delete it and keep the numeric branch (`float(9999) < 48`), removing the `{% if %}`/`{% else %}`/`{% endif %}` lines.

- [ ] **Step 3: Validate YAML**

Run: `python scripts/validate_ha_yaml.py`
Expected: no errors (`configuration.yaml` parses).

- [ ] **Step 4: Verify template math in Developer Tools (user, or executor if HA access exists)**

Developer Tools → Template: paste the `bills_covered` state template (with real IDs) → expect `True` when balance > due sum. Then Developer Tools → States: confirm all three new entities exist after the restart in Task 5 (template/command_line entities appear only after reload/restart).

- [ ] **Step 5: Commit**

```bash
git add configuration.yaml
git commit -m "Add bill coverage sensors backed by Billy and SimpleFIN"
```

---

### Task 5: Budget Lovelace dashboard

**Files:**
- Create: `budget-dashboard.yaml`
- Modify: `configuration.yaml` — add a `lovelace:` block (none exists today; `mode: storage` preserves the existing UI-managed dashboard)

**Interfaces:**
- Consumes: Billy's globally-registered Lovelace cards (`custom:billy-*`), Task 4 entities, `BALANCE_ID` from Task 2.
- Produces: sidebar dashboard at `/budget-dashboard/`.

- [ ] **Step 1: Register the dashboard**

Add to `configuration.yaml` (place after the `frontend:` block):

```yaml
lovelace:
  mode: storage
  dashboards:
    budget-dashboard:
      mode: yaml
      title: Budget
      icon: mdi:currency-usd
      show_in_sidebar: true
      filename: budget-dashboard.yaml
```

- [ ] **Step 2: Create `budget-dashboard.yaml`**

```yaml
title: Budget
views:
  - type: sections
    title: Overview
    path: overview
    max_columns: 3
    theme: Google Dark Theme
    sections:
      - type: grid
        cards:
          - type: custom:billy-summary-card
            title: Billy
          - type: custom:billy-upcoming-card
            title: Due in the next 30 days
            days: 30
            limit: 10
          - type: custom:billy-recurring-card
            title: Recurring
            limit: 10
            active_only: true
      - type: grid
        cards:
          - type: custom:billy-spending-card
            title: Spending
            months: 12
            forecast_months: 3
            show_recurring: true
          - type: custom:billy-breakdown-card
            title: This month
            limit: 8
            show_recurring: true
          - type: custom:billy-balances-card
            title: Who owes whom
            limit: 6
            show_paypal: true
      - type: grid
        cards:
          - type: tile
            entity: sensor.bills_coverage_amount
            name: Coverage (balance minus 30d)
          - type: tile
            entity: binary_sensor.bills_covered
            name: Bills covered
          - type: tile
            entity: BALANCE_ID
            name: Checking balance
```

Substitute `BALANCE_ID` with the Task 2 value.

- [ ] **Step 3: Validate both files**

```bash
python scripts/validate_ha_yaml.py
.tools/node/node.exe -e "const YAML = require('yaml'); YAML.parse(require('fs').readFileSync('budget-dashboard.yaml', 'utf8')); console.log('budget-dashboard.yaml valid')"
```

Expected: no errors; second command prints `budget-dashboard.yaml valid`. (Fallback if node fails: `py -c "import yaml; yaml.safe_load(open('budget-dashboard.yaml', encoding='utf-8')); print('budget-dashboard.yaml valid')"`.)

- [ ] **Step 4: Restart Home Assistant (user)**

Developer Tools → YAML → **Check configuration** → must report valid → Restart. (Single restart covering Tasks 4 and 5.)

- [ ] **Step 5: Verify (user)**

Sidebar shows **Budget**; the view renders Billy cards (with the bills entered in Task 1) and the three tiles. Developer Tools → States shows `binary_sensor.bills_covered` = `on`.

- [ ] **Step 6: Commit**

```bash
git add configuration.yaml budget-dashboard.yaml
git commit -m "Add YAML-managed Budget dashboard with Billy widgets"
```

---

### Task 6: AI dashboard banner alerts

**Files:**
- Modify: `www/ai-dashboard/config.json` — append three rules to the existing `alerts` array (currently 4 entries)

**Interfaces:**
- Consumes: `binary_sensor.bills_covered`, `sensor.bills_coverage_amount` (Task 4), `PROBLEM_ID` (Task 2).
- Produces: HOME-screen banner entries. Rule shape follows the existing entries: `{ entity, <one condition>, label }`; `{state}` interpolates the entity state.

- [ ] **Step 1: Append the alert rules**

Append to the `alerts` array in `www/ai-dashboard/config.json` (substitute `PROBLEM_ID`):

```json
{
  "entity": "binary_sensor.bills_covered",
  "equals": "off",
  "label": "Bills at risk — check bank balance"
},
{
  "entity": "sensor.bills_coverage_amount",
  "below": 0,
  "label": "Bill shortfall ${state}"
},
{
  "entity": "PROBLEM_ID",
  "equals": "on",
  "label": "Bank sync stale — balance unverified"
}
```

(This is exactly what Settings → Alerts produces; editing the file directly keeps the change in git. `config.json.bak.*` backups are only made by UI saves, so the git commit below is the backup.)

- [ ] **Step 2: Validate JSON**

Run: `python -m json.tool www/ai-dashboard/config.json > /dev/null && echo "config.json valid"`
Expected: `config.json valid`.

- [ ] **Step 3: Verify on the wall dashboard (user)**

Hard-refresh the dashboard (`Ctrl+Shift+R`). With a healthy state, no new banner appears. Then in Developer Tools → States, temporarily set `binary_sensor.bills_covered` to `off` (the "set state" gear) — the amber banner shows **Bills at risk — check bank balance** within a few seconds. Set it back (or wait for the next template evaluation to restore it).

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/config.json
git commit -m "Add bill coverage alerts to AI dashboard banner"
```

---

### Task 7: Docs and end-to-end

**Files:**
- Modify: `docs/hacs-inventory.md` — add Billy row to the Integrations table
- Modify: `AGENTS.md` — Custom Integrations list, Device/Entity Inventory, Dashboards section

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Update `docs/hacs-inventory.md`**

Add to the Integrations table (fill in the version shown in HACS at install time):

```markdown
| Billy | `custom_components/bill_tracker` | <https://github.com/robin994/billy> | v0.13.x |
```

- [ ] **Step 2: Update `AGENTS.md`**

- Custom Integrations section: add Billy (HACS, bill tracking, sidebar app at `/billy`, storage at `.storage/bill_tracker.expenses` — read-only by `scripts/billy_due_next_30_days.py`) and a note that **SimpleFIN** is a core integration (bank balances; only the checking account is connected).
- Device/Entity Inventory: add a finance bullet — `sensor.bills_due_next_30_days`, `sensor.bills_coverage_amount`, `binary_sensor.bills_covered`, `sensor.billy_total_bills`, SimpleFIN `Balance`/`Age`/`Problem` entities.
- Dashboards section: note the YAML-managed `budget-dashboard.yaml` (Billy widgets + coverage tiles) alongside the AI dashboard.

- [ ] **Step 3: End-to-end test (user)**

In `/billy`, add a test bill with an amount **larger than the checking balance**, due 7 days out. Within one hour (the command_line scan interval; force immediately via Developer Tools → Services → `homeassistant.update_entity` on `sensor.bills_due_next_30_days`), expect: `binary_sensor.bills_covered` → `off`, banner appears on the AI dashboard HOME screen, the Budget dashboard tile shows the negative coverage. Delete the test bill in `/billy`, update the entity again → banner clears, `bills_covered` → `on`.

- [ ] **Step 4: Pre-commit and final commit**

```bash
pre-commit run --all-files
git add docs/hacs-inventory.md AGENTS.md
git commit -m "Document Billy/SimpleFIN budget tracking setup"
```

Expected: pre-commit passes (yamllint, HA YAML validation, JSON check, no ignored files staged).
