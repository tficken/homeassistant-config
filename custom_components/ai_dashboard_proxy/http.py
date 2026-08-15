"""HTTP/WebSocket handlers for the AI Dashboard Proxy."""
from __future__ import annotations

import asyncio
import ipaddress
import json
import mimetypes
import os
import traceback
from datetime import timedelta
from typing import Any

from aiohttp import web

from homeassistant.components.http.const import KEY_AUTHENTICATED
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder import history as recorder_history
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.json import json_dumps
from homeassistant.util import dt as dt_util


def _is_local_ip(ip: str | None) -> bool:
    """Return True if the client IP is on a private/local network."""
    if not ip:
        return False
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


def _is_authorized(request: web.Request, secret: str | None) -> bool:
    """Return True if the request is from LAN, logged into HA, or has the secret."""
    if _is_local_ip(request.remote):
        return True
    if request.get(KEY_AUTHENTICATED):
        return True
    if secret:
        auth_header = request.headers.get("Authorization", "")
        if auth_header == f"Bearer {secret}":
            return True
        if request.query.get("secret") == secret:
            return True
    return False


async def async_load_entity_areas(hass: HomeAssistant) -> dict[str, str]:
    """Build a map of entity_id -> area name from HA registries."""

    def _load() -> dict[str, str]:
        try:
            base = hass.config.config_dir
            with open(
                os.path.join(base, ".storage", "core.area_registry"),
                encoding="utf-8",
            ) as f:
                area_data = json.load(f)
            with open(
                os.path.join(base, ".storage", "core.device_registry"),
                encoding="utf-8",
            ) as f:
                device_data = json.load(f)
            with open(
                os.path.join(base, ".storage", "core.entity_registry"),
                encoding="utf-8",
            ) as f:
                entity_data = json.load(f)
        except Exception:
            return {}

        area_names = {
            a["id"]: a["name"]
            for a in area_data.get("data", {}).get("areas", [])
        }
        device_areas = {
            d["id"]: d["area_id"]
            for d in device_data.get("data", {}).get("devices", [])
            if d.get("area_id")
        }

        entity_areas: dict[str, str] = {}
        for entry in entity_data.get("data", {}).get("entities", []):
            entity_id = entry.get("entity_id")
            if not entity_id:
                continue
            area_id = entry.get("area_id")
            if not area_id:
                area_id = device_areas.get(entry.get("device_id"))
            if area_id:
                entity_areas[entity_id] = area_names.get(area_id, area_id)
        return entity_areas

    return await hass.async_add_executor_job(_load)


async def dashboard_handler(request: web.Request) -> web.StreamResponse:
    """Serve the static dashboard files with the proxy flag injected."""
    try:
        secret = request.app.get("ai_dashboard_secret")
        if not _is_authorized(request, secret):
            return web.Response(status=401, text=f"Unauthorized from {request.remote}")

        hass: HomeAssistant = request.app["hass"]
        path = request.match_info.get("path", "") or "index.html"
        if path.endswith("/"):
            path += "index.html"

        www_root = os.path.join(hass.config.config_dir, "www", "ai-dashboard")
        requested = os.path.join(www_root, path)
        real_root = os.path.realpath(www_root)
        real_requested = os.path.realpath(requested)

        if not real_requested.startswith(real_root + os.sep) and real_requested != real_root:
            return web.Response(status=403, text="Forbidden")

        if not os.path.isfile(real_requested):
            return web.Response(status=404, text="Not found")

        ext = os.path.splitext(real_requested)[1].lower()
        if ext == ".html":
            content_type = "text/html"
        elif ext == ".css":
            content_type = "text/css"
        elif ext == ".js":
            content_type = "application/javascript"
        elif ext == ".json":
            content_type = "application/json"
        else:
            content_type, _ = mimetypes.guess_type(real_requested)
            content_type = content_type or "application/octet-stream"

        def read_file() -> bytes:
            with open(real_requested, "rb") as f:
                return f.read()

        body = await hass.async_add_executor_job(read_file)

        if path == "index.html":
            proxy_script = b'<script>window.HA_INTEGRATION_PROXY=true;</script>\n'
            ha_config = {
                "latitude": hass.config.latitude,
                "longitude": hass.config.longitude,
            }
            config_script = (
                f'<script>window.HA_CONFIG={json_dumps(ha_config)};</script>\n'
            ).encode("utf-8")
            areas = request.app.get("ai_dashboard_areas") or {}
            areas_script = (
                f'<script>window.HA_AREAS={json_dumps(areas)};</script>\n'
            ).encode("utf-8")
            body = body.replace(
                b"</head>",
                proxy_script + config_script + areas_script + b"</head>",
            )

        return web.Response(body=body, content_type=content_type)
    except Exception as e:
        return web.Response(
            status=500,
            text=f"Dashboard proxy error: {e}\n{traceback.format_exc()}",
        )


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    """WebSocket endpoint that proxies HA state events and service calls."""
    try:
        secret = request.app.get("ai_dashboard_secret")
        if not _is_authorized(request, secret):
            return web.Response(status=401, text="Unauthorized")
    except Exception as e:
        return web.Response(status=500, text=f"Auth check failed: {e}\n{traceback.format_exc()}")

    hass: HomeAssistant = request.app["hass"]
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    @callback
    def forward_event(event: Any) -> None:
        new_state = event.data.get("new_state")
        if new_state is None:
            return
        asyncio.run_coroutine_threadsafe(
            ws.send_json(
                {
                    "type": "event",
                    "event": {
                        "event_type": EVENT_STATE_CHANGED,
                        "data": {"new_state": new_state},
                    },
                },
                dumps=json_dumps,
            ),
            hass.loop,
        )

    unsub = hass.bus.async_listen(EVENT_STATE_CHANGED, forward_event)

    try:
        # Send current states immediately so the dashboard can render.
        await ws.send_json(
            {
                "id": 1,
                "type": "result",
                "success": True,
                "result": [state.as_dict() for state in hass.states.async_all()],
            },
            dumps=json_dumps,
        )

        async for msg in ws:
            if msg.type != web.WSMsgType.TEXT:
                continue
            try:
                data = msg.json()
            except ValueError:
                continue

            msg_type = data.get("type")
            if msg_type == "auth":
                # The proxy is already authenticated to HA; ignore client auth.
                continue

            if msg_type == "call_service":
                domain = data.get("domain")
                service = data.get("service")
                service_data = data.get("service_data", {})
                hass.async_create_task(
                    hass.services.async_call(domain, service, service_data)
                )

            elif msg_type == "get_states":
                await ws.send_json(
                    {
                        "id": data.get("id", 0),
                        "type": "result",
                        "success": True,
                        "result": [
                            state.as_dict()
                            for state in hass.states.async_all()
                        ],
                    },
                    dumps=json_dumps,
                )

    finally:
        unsub()

    return ws


async def forecast_handler(request: web.Request) -> web.StreamResponse:
    """Server-side forecast fetch so the dashboard doesn't need its own HA token."""
    try:
        secret = request.app.get("ai_dashboard_secret")
        if not _is_authorized(request, secret):
            return web.Response(status=401, text="Unauthorized")

        hass: HomeAssistant = request.app["hass"]
        try:
            body = await request.json()
        except ValueError:
            return web.Response(status=400, text="Invalid JSON")

        entity_id = body.get("entity_id", "weather.forecast_home")
        forecast_type = body.get("type", "daily")

        try:
            service_response = await hass.services.async_call(
                "weather",
                "get_forecasts",
                {"entity_id": entity_id, "type": forecast_type},
                blocking=True,
                return_response=True,
            )
        except Exception as exc:
            return web.Response(
                status=500,
                text=f"Forecast service failed: {exc}",
            )

        return web.json_response(service_response or {})
    except Exception as e:
        return web.Response(
            status=500,
            text=f"Dashboard proxy error: {e}\n{traceback.format_exc()}",
        )


async def history_handler(request: web.Request) -> web.StreamResponse:
    """Return state history for requested entity IDs."""
    try:
        secret = request.app.get("ai_dashboard_secret")
        if not _is_authorized(request, secret):
            return web.Response(status=401, text="Unauthorized")

        hass: HomeAssistant = request.app["hass"]
        try:
            body = await request.json()
        except ValueError:
            return web.Response(status=400, text="Invalid JSON")

        entity_ids = body.get("entity_ids", [])
        hours = body.get("hours", 24)
        if not isinstance(entity_ids, list) or not entity_ids:
            return web.Response(status=400, text="entity_ids must be a non-empty list")
        if not isinstance(hours, int) or hours < 1 or hours > 168:
            return web.Response(status=400, text="hours must be an integer between 1 and 168")

        end_time = dt_util.utcnow()
        start_time = end_time - timedelta(hours=hours)

        try:
            # get_significant_states is synchronous and opens its own DB
            # session, so it must run in the executor. Defaults (no
            # minimal_response) return LazyState objects for every row.
            history_data = await get_instance(hass).async_add_executor_job(
                recorder_history.get_significant_states,
                hass,
                start_time,
                end_time,
                entity_ids,
            )
        except Exception as exc:
            return web.Response(status=500, text=f"History query failed: {exc}")

        result: dict[str, list[dict[str, str]]] = {}
        for entity_id, states in history_data.items():
            result[entity_id] = [
                {
                    "state": s.state,
                    "last_changed": s.last_changed.isoformat(),
                }
                for s in states
                if s.state not in ("unknown", "unavailable")
            ]

        return web.json_response(result)
    except Exception as e:
        return web.Response(
            status=500,
            text=f"Dashboard proxy error: {e}\n{traceback.format_exc()}",
        )


async def async_setup_http(hass: HomeAssistant, secret: str | None) -> None:
    """Register the dashboard routes on the Home Assistant HTTP app."""
    app = hass.http.app
    app["ai_dashboard_secret"] = secret
    app["ai_dashboard_areas"] = await async_load_entity_areas(hass)
    # Register specific routes before the catch-all static route.
    app.router.add_get("/ai-dashboard/ws", websocket_handler)
    app.router.add_post("/ai-dashboard/api/forecast", forecast_handler)
    app.router.add_post("/ai-dashboard/api/history", history_handler)
    app.router.add_get("/ai-dashboard/{path:.*}", dashboard_handler)
