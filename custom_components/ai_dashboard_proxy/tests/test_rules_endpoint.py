"""Verify the category-rules endpoint: add/delete/validation + enrichment."""
import asyncio
import json
from unittest.mock import MagicMock

from ha_stubs import install_ha_stubs

install_ha_stubs()

from ai_dashboard_proxy import http as proxy_http  # noqa: E402
from ai_dashboard_proxy.history_store import save_month, save_rules  # noqa: E402


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
        self.content_length = None
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


def test_rules_endpoint_crud_and_validation(tmp_path):
    config = str(tmp_path)

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
        (["not", "a", "dict"], "non-dict body"),
        (None, "null body"),
        ("string", "string body"),
    ]:
        res = run(proxy_http.budget_rules_update_handler(FakeRequest(config, bad)))
        assert res.status == 400, (label, res.status)
        print(f"reject {label}: OK")

    res = run(proxy_http.budget_rules_update_handler(
        FakeRequest(config, {"action": "delete", "keyword": "moonshot ai", "category": ""})))
    assert json.loads(res.text)["rules"] == {}
    print("delete rule (case-insensitive): OK")


def test_rules_enrichment_applies_rules_and_stamps_transaction_category(tmp_path):
    # Enrichment applies rules + stamps per-transaction categories.
    config = str(tmp_path)
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
