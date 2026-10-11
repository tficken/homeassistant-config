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
    """Yield due dates in [today, horizon] for one recurring rule.

    Mirrors Billy's scheduler: dates are anchored to the original start day
    (index-based, so clamped months don't drift), and an auto-renewing rule's
    end_date only ends reimbursement tracking — billing continues past it.
    Occurrences before today are skipped: past recurring charges are typically
    autopays that already debited the account, and Billy stores no per-
    occurrence paid flag to tell them apart.
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
