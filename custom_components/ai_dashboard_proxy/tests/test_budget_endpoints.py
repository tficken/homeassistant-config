"""Import-level smoke check for the new endpoints (HA not running)."""
from ha_stubs import install_ha_stubs

# Stub HA modules so http.py imports standalone.
install_ha_stubs(extra=["aiohttp", "aiohttp.web"])

from ai_dashboard_proxy import http as proxy_http  # noqa: E402


def test_budget_endpoint_handlers_importable():
    assert callable(proxy_http.budget_statement_upload_handler)
    assert callable(proxy_http.budget_history_handler)
    print("endpoint handlers import: OK")
