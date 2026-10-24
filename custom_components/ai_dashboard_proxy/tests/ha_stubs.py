"""Install MagicMock stubs for homeassistant modules so http.py imports standalone."""
import sys
from unittest.mock import MagicMock

HA_MODULES = [
    "homeassistant", "homeassistant.components",
    "homeassistant.components.http", "homeassistant.components.http.const",
    "homeassistant.components.recorder", "homeassistant.components.recorder.history",
    "homeassistant.const", "homeassistant.core", "homeassistant.helpers",
    "homeassistant.helpers.area_registry", "homeassistant.helpers.device_registry",
    "homeassistant.helpers.entity_registry", "homeassistant.helpers.json",
    "homeassistant.util", "homeassistant.util.dt", "voluptuous",
    "homeassistant.helpers.config_validation",
    "homeassistant.helpers.typing",
]


def install_ha_stubs(extra: list[str] | None = None) -> None:
    for name in HA_MODULES + (extra or []):
        sys.modules.setdefault(name, MagicMock())
