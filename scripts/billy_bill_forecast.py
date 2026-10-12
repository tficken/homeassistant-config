#!/usr/bin/env python3
"""Print JSON: per-month bill forecast for the next 6 months.

Reads Billy's storage file read-only and builds a forward bill calendar:
- Unpaid expenses with due dates are actuals for their month (Billy
  materializes future bills early, so next month may already have actuals).
- Active recurring rules contribute computed occurrences per their cadence.
- Every other current bill is treated as monthly-recurring on the same
  day-of-month with the same amount; those future entries are estimates
  (estimated: true) until Billy materializes a real bill that replaces them.

Output: {"months": [{"month", "partial", "total", "items": [
  {"name", "amount", "due_date", "estimated"}]}], "typical_month": <float>}
Month 0 is the current month and contains only bills due from today forward
plus overdue unpaid bills (partial: true).
"""
import json
import sys
from calendar import monthrange
from datetime import date, timedelta

DEFAULT_STORE = "/config/.storage/bill_tracker.expenses"
MONTHS = 6


def add_months(d, months):
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    return date(y, m, min(d.day, monthrange(y, m)[1]))


def month_start(d):
    return date(d.year, d.month, 1)


def bill_name(bill):
    return bill.get("provider") or bill.get("category_id") or "Bill"


def rule_occurrences(rule, today, horizon):
    """Yield due dates in [today, horizon] for one recurring rule.

    Mirrors Billy's scheduler (same logic as billy_due_next_30_days.py):
    index-anchored to the start day; auto-renewing rules continue past
    end_date; occurrences before today are skipped.
    """
    if not rule.get("active", True) or not rule.get("start_date"):
        return
    start = date.fromisoformat(rule["start_date"])
    end = None
    if rule.get("end_date") and not rule.get("auto_renew", False):
        end = date.fromisoformat(rule["end_date"])
    interval = int(rule.get("interval_months") or 1)
    k = 0
    while True:
        due = add_months(start, k * interval)
        if due > horizon or (end is not None and due > end):
            break
        if due >= today:
            yield due
        k += 1


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_STORE
    today = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else date.today()
    with open(path, encoding="utf-8") as f:
        data = json.load(f).get("data")
    if not isinstance(data, dict):
        print("bill_tracker storage has no 'data' object — schema changed?", file=sys.stderr)
        sys.exit(2)

    first = month_start(today)
    horizon = add_months(first, MONTHS) - timedelta(days=1)

    # Per-month buckets: month offset -> {name_key -> item}
    buckets = {i: {} for i in range(MONTHS)}

    def offset_of(d):
        return (d.year - first.year) * 12 + d.month - first.month

    def put(d, item):
        off = offset_of(d)
        if 0 <= off < MONTHS:
            buckets[off][item["name"].casefold()] = item

    # 1) Actual unpaid expenses with due dates.
    profile = {}  # name_key -> {"name", "amount", "day"}
    rule_names = {
        (r.get("name") or "").casefold()
        for r in data.get("recurring_expenses", [])
    }
    for bill in data.get("expenses", []):
        if bill.get("paid") or not bill.get("due_date"):
            continue
        due = date.fromisoformat(bill["due_date"])
        name = bill_name(bill)
        amount = round(float(bill.get("amount") or 0), 2)
        if due >= today or offset_of(due) == 0:
            put(due, {"name": name, "amount": amount, "due_date": due.isoformat(), "estimated": False})
        if name.casefold() not in rule_names:
            profile[name.casefold()] = {"name": name, "amount": amount, "day": due.day}

    # 2) Recurring rule occurrences (skip month-0 slots an actual already fills).
    for rule in data.get("recurring_expenses", []):
        name = rule.get("name") or "Recurring"
        amount = round(float(rule.get("amount") or 0), 2)
        for due in rule_occurrences(rule, today, horizon):
            key = name.casefold()
            off = offset_of(due)
            if 0 <= off < MONTHS and key not in buckets[off]:
                put(due, {"name": name, "amount": amount, "due_date": due.isoformat(), "estimated": False})

    # 3) Estimated monthly recurrence for months without an actual/rule entry.
    for off in range(1, MONTHS):
        mstart = add_months(first, off)
        for key, p in profile.items():
            if key in buckets[off]:
                continue
            day = min(p["day"], monthrange(mstart.year, mstart.month)[1])
            due = date(mstart.year, mstart.month, day)
            put(due, {"name": p["name"], "amount": p["amount"], "due_date": due.isoformat(), "estimated": True})

    months = []
    for off in range(MONTHS):
        mstart = add_months(first, off)
        items = sorted(buckets[off].values(), key=lambda x: x["due_date"])
        total = round(sum(i["amount"] for i in items), 2)
        months.append({
            "month": mstart.isoformat()[:7],
            "partial": off == 0,
            "estimated": any(i["estimated"] for i in items),
            "total": total,
            "items": items,
        })

    # First month whose items are all estimates is the typical month.
    typical = next(
        (m["total"] for m in months[1:] if m["items"] and not any(not i["estimated"] for i in m["items"])),
        months[1]["total"] if len(months) > 1 else 0,
    )
    print(json.dumps({"months": months, "typical_month": typical}))


if __name__ == "__main__":
    main()
