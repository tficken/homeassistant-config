"""Tests for statement_parser.categorize on synthetic fixtures.

Covers: built-in category bucketing (including KPI subtotals and the
unmatched bucket), credit exclusion, and user rule precedence over built-ins.
"""
from statement_fixtures import make_statement
from statement_parser import categorize, parse_statement


def _debits_and_credits():
    text = make_statement(
        "4/20/26", "5/19/26", 500.00,
        credits=[("4/21", "PAYROLL  ACME CORP", 2000.00)],
        debits=[("4/22", "CHECKCARD  0422 DOORDASH*DASH", 30.00, "DOORDASH*DASH"),
                ("4/23", "CHECKCARD  0423 CASEYS", 50.00, "CASEYS #1234"),
                ("4/24", "CHECKCARD  0424 HYVEE", 120.00, "HYVEE #567"),
                ("4/25", "CHECKCARD  0425 NETFLIX.COM", 15.00, "NETFLIX.COM"),
                ("4/26", "ATM W/D", 100.00, ""),
                ("4/27", "CHECKCARD  0427 ZZZ UNKNOWN", 77.00, "ZZZ UNKNOWN MERCHANT")],
    )
    rec = parse_statement(text)
    assert rec["warnings"] == []
    return rec["transactions"]


def test_builtin_categories():
    result = categorize(_debits_and_credits())
    categories = result["categories"]
    kpis = result["kpis"]
    unmatched = result["unmatched"]

    assert categories["food_delivery"] == {"total": 30.00, "count": 1}
    assert categories["gas_fuel"] == {"total": 50.00, "count": 1}
    assert categories["groceries"] == {"total": 120.00, "count": 1}
    assert categories["subscriptions"] == {"total": 15.00, "count": 1}
    assert categories["atm_cash"] == {"total": 100.00, "count": 1}
    assert categories["other"] == {"total": 77.00, "count": 1}

    assert kpis["food_delivery"]["total"] == 30.00
    assert kpis["food_delivery"]["count"] == 1
    assert kpis["food_delivery"]["doordash_total"] == 30.00
    assert kpis["food_delivery"]["doordash_count"] == 1
    assert kpis["atm_cash"] == {"total": 100.00, "count": 1}

    assert unmatched == {"ZZZ UNKNOWN MERCHANT": {"total": 77.00, "count": 1}}

    # Credits are excluded: exactly the 6 debits land in buckets, and the
    # PAYROLL credit never appears anywhere.
    assert sum(b["count"] for b in categories.values()) == 6
    assert "ACME CORP" not in unmatched


def test_user_rule_precedence():
    result = categorize(_debits_and_credits(), rules={"DOORDASH": "dining_out"})
    categories = result["categories"]
    assert categories["dining_out"]["total"] == 30.00
    assert categories["dining_out"]["count"] == 1
    # The built-in food_delivery bucket only keeps non-DoorDash merchants
    # (none in this fixture), and the DoorDash KPI subtotal stays zero.
    assert "food_delivery" not in categories
    assert result["kpis"]["food_delivery"]["doordash_total"] == 0.00
