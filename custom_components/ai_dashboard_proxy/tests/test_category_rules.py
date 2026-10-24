"""Verify user category rules: store, precedence, determinism, unmatched totals."""
import os

from history_store import load_rules, save_rules
from statement_parser import KNOWN_CATEGORIES, categorize


def test_category_rules_store_roundtrip_and_corrupt_heal(tmp_path):
    config = str(tmp_path)

    assert load_rules(config) == {}
    save_rules(config, {"AMAZON": "groceries"})
    assert load_rules(config) == {"AMAZON": "groceries"}
    with open(os.path.join(config, "budget", "category_rules.json"), "w") as f:
        f.write("{broken")
    assert load_rules(config) == {}
    print("rules store + corrupt heal: OK")


TXS = [
    {"date": "2026-09-01", "type": "DBT CRD", "merchant": "AMAZON.COM*5O93H", "amount": 18.22, "direction": "debit"},
    {"date": "2026-09-02", "type": "DBT CRD", "merchant": "MOONSHOT AI", "amount": 20.00, "direction": "debit"},
    {"date": "2026-09-03", "type": "DBT CRD", "merchant": "MOONSHOT", "amount": 5.00, "direction": "debit"},
    {"date": "2026-09-04", "type": "DBT CRD", "merchant": "RANDOM MERCHANT X", "amount": 9.99, "direction": "debit"},
]


def test_user_rule_overrides_builtin():
    # User rule beats built-in (AMAZON built-in -> shopping; user -> groceries).
    out = categorize(TXS, rules={"AMAZON": "groceries"})
    assert out["categories"]["groceries"]["total"] == 18.22, out["categories"]
    assert "shopping" not in out["categories"]
    print("user rule overrides built-in: OK")


def test_longest_keyword_wins_deterministically():
    # Longest keyword wins deterministically:
    # MOONSHOT AI (20.00) hits the longer rule -> subscriptions;
    # MOONSHOT (5.00) hits the shorter rule -> other.
    out = categorize(TXS, rules={"MOONSHOT": "other", "MOONSHOT AI": "subscriptions"})
    assert out["categories"]["subscriptions"]["total"] == 20.00, out["categories"]
    assert out["categories"]["other"]["total"] == 14.99, out["categories"]  # 5.00 + 9.99
    print("longest-keyword-first: OK")


def test_unmatched_totals():
    # unmatched now carries totals.
    out = categorize(TXS)
    assert out["unmatched"]["RANDOM MERCHANT X"] == {"total": 9.99, "count": 1}
    print("unmatched totals: OK")


def test_known_categories_and_no_rules_backward_compat():
    # KNOWN_CATEGORIES sanity + no-rules backward compat.
    assert "food_delivery" in KNOWN_CATEGORIES and "other" in KNOWN_CATEGORIES
    out2 = categorize(TXS, rules=None)
    assert out2["categories"]["subscriptions"]["total"] == 25.00  # both MOONSHOT txs via built-in
    print("backward compat: OK")
