"""Verify the budget targets endpoint: get/set/delete + validation."""
import asyncio
import json
from unittest.mock import MagicMock

from ha_stubs import install_ha_stubs

install_ha_stubs()

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
        self.content_length = None
        self.app = {"ai_dashboard_secret": None, "hass": FakeHass(config_dir)}
        self._payload = payload

    def get(self, _key, default=None):
        return default

    async def json(self):
        if self._payload is None:
            raise ValueError("no body")
        return self._payload


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_targets_endpoint_crud(tmp_path):
    config = str(tmp_path)

    res = run(proxy_http.budget_targets_handler(FakeRequest(config)))
    assert res.status == 200
    assert json.loads(res.text)["targets"] == {"overall": None, "categories": {}}
    print("empty targets GET: OK")

    res = run(proxy_http.budget_targets_update_handler(
        FakeRequest(config, {"action": "set", "category": "overall", "amount": 2500})))
    payload = json.loads(res.text)
    assert res.status == 200 and payload["targets"]["overall"] == 2500.0, payload
    print("set overall: OK")

    res = run(proxy_http.budget_targets_update_handler(
        FakeRequest(config, {"action": "set", "category": "dining_out", "amount": 400})))
    payload = json.loads(res.text)
    assert res.status == 200 and payload["targets"]["categories"] == {"dining_out": 400.0}, payload
    print("set category: OK")

    res = run(proxy_http.budget_targets_update_handler(
        FakeRequest(config, {"action": "delete", "category": "dining_out"})))
    payload = json.loads(res.text)
    assert res.status == 200 and payload["targets"]["categories"] == {}, payload
    assert payload["targets"]["overall"] == 2500.0
    print("delete category keeps overall: OK")


def test_targets_endpoint_validation(tmp_path):
    config = str(tmp_path)
    for bad, label in [
        ({"action": "explode", "category": "overall", "amount": 100}, "bad action"),
        ({"action": "set", "category": "nonsense", "amount": 100}, "unknown category"),
        ({"action": "set", "category": "overall"}, "missing amount"),
        ({"action": "set", "category": "overall", "amount": -5}, "negative amount"),
        ({"action": "set", "category": "overall", "amount": "lots"}, "non-numeric amount"),
        ({"action": "set", "category": "overall", "amount": 10**9}, "absurd amount"),
        (["not", "a", "dict"], "non-dict body"),
        (None, "null body"),
        ("string", "string body"),
    ]:
        res = run(proxy_http.budget_targets_update_handler(FakeRequest(config, bad)))
        assert res.status == 400, (label, res.status)
        print(f"reject {label}: OK")
