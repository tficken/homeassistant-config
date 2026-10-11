# Budget Bill Tracking + Coverage Checking — Design

**Date:** 2026-10-11
**Status:** Awaiting user review

## Intent

Two people (Travis, Bobbie) record household bills with due dates and amounts, split costs between them, and get warned on the wall dashboard when the bill-paying bank account does not have enough money to cover everything due in the next 30 days.

## Locked decisions (from user)

1. Coverage window: **next 30 days**.
2. Coverage account: **one bank account** for now (design allows adding more later by extending one template).
3. Alerts: **AI dashboard banner only** — no Echo announcements, no phone push.
4. Include a **dedicated Lovelace budget view** built from Billy's widget cards.

## Components

### 1. Billy — bill tracking (HACS custom repository)

- Repo: <https://github.com/robin994/billy> (install as a HACS custom repository, category: Integration).
- Provides the `/billy` sidebar app where both users enter bills:
  - **Recurring rules** (subscriptions, mortgage, utilities estimates): amount, cadence (monthly / 2/3/4/6-monthly / yearly), due date, payer, split percentages.
  - **One-off / provider bills**: amount, due date, payer, split.
  - Paid/unpaid tracking and per-user reimbursement balances with PayPal/Venmo/Revolut/Cash App links.
- Configure two payers (Travis, Bobbie) with the household's default split in Billy's Settings.
- Billy exposes `sensor.billy_total_bills` (device class monetary): state = current-month total, attributes = a compact summary dict (forecast, recurring equivalents, outstanding, etc.). Exact attribute names are verified against the live instance during implementation (Developer Tools → States) before the coverage template is finalized.
- Email/IMAP auto-import is **out of scope** for this iteration.
- After install, add Billy to `docs/hacs-inventory.md` (HACS-managed, git-excluded like the others).

### 2. SimpleFIN — bank balance (core integration)

- Core integration, no HACS: <https://www.home-assistant.io/integrations/simplefin/>.
- **Manual prerequisite (user):** create a SimpleFIN account ($1.50/mo), connect the bank, generate a claim token.
- Add the integration via Settings → Devices & services → SimpleFin with the claim token.
- Each account becomes a device with a `Balance` sensor, an `Age` sensor (last sync time), and a `Problem` binary sensor (sync failure).
- The bill-paying checking account's Balance sensor is the coverage source. The access URL lives in the HA config entry — nothing goes in `secrets.yaml`.

### 3. Coverage sensors — `configuration.yaml` template sensors

Entity IDs indicative; SimpleFIN's real entity IDs confirmed at implementation time.

- `sensor.bills_due_next_30_days` (monetary) — sum of Billy bills + recurring occurrences with due dates in `[today, today+30d]`, sourced from Billy's summary attributes / upcoming data.
- `sensor.bills_coverage_amount` (monetary) — `checking balance − bills_due_next_30_days`. Negative = shortfall.
- `binary_sensor.bills_covered` — `on` when coverage ≥ 0 **and** balance data is fresh:
  - Fresh = SimpleFIN `Age` sensor < 48h and `Problem` binary sensor off.
  - Stale data sets `bills_covered` to `off` — unverifiable coverage is treated as not covered, so a dead bank sync can never silently suppress the warning.

Template placement: a `template:` block in `configuration.yaml` next to the existing sensor definitions.

### 4. AI dashboard banner — `config.alerts` (no code changes)

The AI dashboard's HOME screen alert banner already evaluates `config.alerts` rules. Added via the built-in Settings editor (Alerts tab), persisted to `www/ai-dashboard/config.json`:

- `{ entity: "binary_sensor.bills_covered", equals: "off", label: "BILLS AT RISK — CHECK BALANCE" }`
- `{ entity: "sensor.bills_coverage_amount", below: 0, label: "BILL SHORTFALL ${state}" }` — shows the actual shortfall amount.
- A rule on the SimpleFIN checking account's `Problem` binary sensor (`equals: "on"`, label `BANK SYNC STALE — BALANCE UNVERIFIED`) so a dead sync is distinguishable from a real shortfall.

No changes to `ai_dashboard_proxy` or dashboard JS — this is config only, editable later from the Settings UI.

### 5. Budget Lovelace view — YAML-managed dashboard

- New file `budget-dashboard.yaml` registered in `configuration.yaml` under `lovelace: dashboards:` (the repo previously used YAML-managed dashboards; none are currently registered).
- `type: sections`, `max_columns: 3`, theme `Google Dark Theme`, title "Budget", icon `mdi:currency-usd`.
- Cards (Billy registers its Lovelace resource globally, so they work in YAML dashboards):
  - `custom:billy-summary-card` — month totals, outstanding, recurring, reimbursements
  - `custom:billy-upcoming-card` (`days: 30`) — the coverage window, visible
  - `custom:billy-recurring-card` — subscriptions/installments with next due dates
  - `custom:billy-balances-card` (`show_paypal: true`) — who owes whom
  - `custom:billy-spending-card` (`months: 12`, `forecast_months: 3`) — history + forecast
  - `tile` cards for `sensor.bills_coverage_amount`, `binary_sensor.bills_covered`, and the SimpleFIN checking balance

## Data flow

```
Billy (user-entered bills) ──► sensor.billy_total_bills (attrs)
                                    │
SimpleFIN (bank) ──► Balance/Age/Problem sensors
                                    │
                     template sensors (configuration.yaml)
                     bills_due_next_30_days · bills_coverage_amount · bills_covered
                                    │
              AI dashboard config.alerts banner + Budget Lovelace view
```

## Error handling

| Failure | Behavior |
|---|---|
| SimpleFIN sync stale (>48h) or Problem sensor on | `bills_covered` → off, banner shows; false alarm is the safe direction |
| Billy attribute schema changes on update | Template breaks visibly (sensor `unknown`) — caught by the banner's stale/unknown handling; verification step in plan guards attribute names |
| Bill entered with no due date / paused recurring rule | Excluded from the 30-day sum by Billy's own due-date logic |
| Negative coverage that later resolves | Banner clears automatically when `bills_covered` returns to `on` |

## Out of scope

- Email/IMAP automatic bill parsing (Billy supports it; possible future iteration).
- Pooling multiple bank accounts into coverage (one-line template change when wanted).
- Echo/phone notifications (user explicitly declined).
- Any changes to `custom_components/ai_dashboard_proxy` or dashboard JS.
- Transaction-level budgeting / spend categorization (Billy forecasts cover planning; this is not a budgeting app).

## Validation

- `python scripts/validate_ha_yaml.py` and `yamllint -c .yamllint.yaml .` for YAML changes.
- `python -m json.tool www/ai-dashboard/config.json` after banner rules are saved.
- Template logic exercised in Developer Tools → Template before saving to `configuration.yaml`.
- End-to-end: enter a test bill due in 7 days larger than the test balance expectation → banner appears on the AI dashboard HOME screen; delete bill → banner clears.
- `pre-commit run --all-files` before committing config changes.

## Implementation prerequisites (manual, user)

1. SimpleFIN account created, bank connected, claim token in hand.
2. Billy installed via HACS (custom repo) and restarted.

The implementation plan sequences these against the file changes so automatable work proceeds first where possible.
