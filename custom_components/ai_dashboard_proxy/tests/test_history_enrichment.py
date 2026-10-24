"""Verify read-time category enrichment of the history endpoint payload."""
import asyncio
import json
from unittest.mock import MagicMock

from ha_stubs import install_ha_stubs

install_ha_stubs()

from ai_dashboard_proxy import http as proxy_http  # noqa: E402
from ai_dashboard_proxy.history_store import save_month  # noqa: E402


class FakeHass:
    config = MagicMock(config_dir=".")

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


class FakeRequest:
    remote = "192.168.1.10"
    app = {"ai_dashboard_secret": None, "hass": FakeHass()}

    def get(self, _key, default=None):
        return default


def test_enriched_history_payload(tmp_path):
    # Synthesized September fixture — 8 food-delivery debits totaling 423.37 —
    # so the assertions below hold without the live budget/ data files.
    cfg = str(tmp_path)
    food = [
        ("2026-09-01", "DOORDASH*A1", 52.92),
        ("2026-09-02", "DOORDASH*B2", 52.93),
        ("2026-09-03", "DOORDASH*C3", 52.90),
        ("2026-09-05", "DOORDASH*D4", 53.00),
        ("2026-09-08", "DOORDASH*E5", 52.90),
        ("2026-09-10", "DOORDASH*F6", 52.92),
        ("2026-09-12", "DOORDASH*G7", 52.90),
        ("2026-09-15", "DOORDASH*H8", 52.90),
    ]
    save_month(cfg, {
        "month": "2026-09", "period_start": "2026-08-24", "period_end": "2026-09-20",
        "beginning": 1.0, "deposits": 1.0, "withdrawals": 1.0, "ending": 1.0,
        "parser": "synthetic", "warnings": [],
        "transactions": [
            {"date": day, "type": "DBT CRD", "merchant": merchant,
             "amount": amount, "direction": "debit"}
            for day, merchant, amount in food
        ],
    })
    FakeHass.config.config_dir = cfg
    res = asyncio.new_event_loop().run_until_complete(
        proxy_http.budget_history_handler(FakeRequest()))
    assert res.status == 200, res.status

    payload = json.loads(res.text)
    sep = payload["months"]["2026-09"]
    assert "kpis" in sep and "categories" in sep, sorted(sep)
    assert sep["kpis"]["food_delivery"]["count"] == 8, sep["kpis"]
    assert abs(sep["kpis"]["food_delivery"]["total"] - 423.37) < 0.01
    print("enriched history: OK")


def test_month_without_transactions_gets_empty_breakdown(tmp_path):
    # A month without transactions gets an empty breakdown, not an error.
    cfg = str(tmp_path)
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
