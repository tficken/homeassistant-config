"""AI Dashboard Proxy integration.

Serves the wall-dashboard static files through a local HTTP endpoint and
exposes a WebSocket endpoint that proxies state events and service calls
without exposing a long-lived access token to the browser.
"""
import voluptuous as vol
import homeassistant.helpers.config_validation as cv
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .http import async_setup_http

CONFIG_SCHEMA = vol.Schema(
    vol.Any(None, {vol.Optional("secret", default=None): vol.Any(None, cv.string)}),
    extra=vol.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the AI Dashboard Proxy integration."""
    conf = config.get("ai_dashboard_proxy") or {}
    secret = conf.get("secret")
    await async_setup_http(hass, secret)
    return True
