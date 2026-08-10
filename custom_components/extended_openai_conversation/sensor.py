"""Token usage sensor for Extended OpenAI Conversation."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfInformation
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN

SIGNAL_TOKEN_USAGE_UPDATED = f"{DOMAIN}_token_usage_updated"


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up token usage sensor."""
    async_add_entities([TokenUsageSensor(hass, config_entry)], update_before_add=True)


class TokenUsageSensor(SensorEntity):
    """Sensor reporting the last Kimi/OpenAI token usage."""

    _attr_name = "Token usage"
    _attr_has_entity_name = True
    _attr_native_unit_of_measurement = "tokens"
    _attr_should_poll = False

    def __init__(self, hass: HomeAssistant, config_entry: ConfigEntry) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._config_entry = config_entry
        self._attr_unique_id = f"{config_entry.entry_id}_token_usage"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, config_entry.entry_id)},
        }
        self._attr_extra_state_attributes = {}

    async def async_added_to_hass(self) -> None:
        """Register update dispatcher."""
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_TOKEN_USAGE_UPDATED,
                self._handle_update,
            )
        )

    async def _handle_update(self) -> None:
        """Handle token usage update."""
        data = self.hass.data.get(DOMAIN, {}).get(self._config_entry.entry_id, {})
        usage = data.get("token_usage", {})
        self._attr_native_value = usage.get("total_tokens")
        self._attr_extra_state_attributes = {
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "model": usage.get("model"),
        }
        self.async_write_ha_state()
