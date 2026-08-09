import json
import os
import urllib.request
import urllib.error


def get_config():
    return {
        "ha_url": os.environ.get("HA_URL", "http://homeassistant.local:8123").rstrip("/"),
        "ha_token": os.environ.get("HA_TOKEN", ""),
    }


def api_request(url, token, path):
    req = urllib.request.Request(
        f"{url}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_entities(ha_url, ha_token):
    entities = api_request(ha_url, ha_token, "/api/config/entity_registry/list")
    states = api_request(ha_url, ha_token, "/api/states")
    return {"entities": entities, "states": states}


EXCLUDED_DOMAINS = {"update", "device_tracker", "person", "sensor.home_assistant_core_", "sensor.home_assistant_host_", "sensor.home_assistant_supervisor_"}
EXCLUDED_ENTITY_GLOBS = {"*firmware*", "*developer_lan_mode*", "*mqtt_encryption*"}


def is_interesting(entity, state_by_id):
    domain = entity.get("entity_id", "").split(".")[0]
    if domain in EXCLUDED_DOMAINS:
        return False
    state = state_by_id.get(entity.get("entity_id"))
    if state and state.get("state") in ("unavailable", "unknown", None):
        return False
    return True


def summarize_entities(entity_data):
    states = {s["entity_id"]: s for s in entity_data["states"]}
    summary = []
    for e in entity_data["entities"]:
        eid = e.get("entity_id")
        if not is_interesting(e, states):
            continue
        state = states.get(eid, {})
        summary.append({
            "entity_id": eid,
            "domain": eid.split(".")[0],
            "name": e.get("original_name") or e.get("name") or eid,
            "state": state.get("state"),
            "unit": state.get("attributes", {}).get("unit_of_measurement"),
        })
    summary.sort(key=lambda x: (x["domain"], x["name"]))
    return summary


DASHBOARD_INSTRUCTIONS = """
You are a Home Assistant dashboard designer. Using the entity list below, generate a single self-contained HTML file with embedded CSS and vanilla JavaScript that renders a modern, dark-themed dashboard.

Requirements:
- Group related entities by domain or room (lights, switches, climate, sensors, media players, vacuums, printers, etc.).
- Use a responsive grid, large touch-friendly cards, and a dark color scheme.
- Display sensor values and toggle lights/switches.
- Connect to Home Assistant's WebSocket API using a relative URL based on `location.host` (e.g., `wss://${location.host}/api/websocket` or `ws://${location.host}/api/websocket`).
- Ask the user for a long-lived access token on first load (window.prompt), store it in localStorage, and use it to authenticate.
- Subscribe to state_changed events and update card contents live.
- Each interactive element should have a data-entity-id attribute matching the entity_id.
- Include a status indicator showing connection state.
- Do not use external CSS/JS libraries or images.
- Output ONLY the complete HTML file content, starting with <!DOCTYPE html>.

Here are the available entities:
"""


def build_prompt(entity_data):
    summary = summarize_entities(entity_data)
    lines = [f"{s['domain']}: {s['name']} ({s['entity_id']}) state={s['state']}" for s in summary]
    return DASHBOARD_INSTRUCTIONS + "\n" + "\n".join(lines)


if __name__ == "__main__":
    import sys
    config = get_config()
    if "--dry-run" in sys.argv:
        data = fetch_entities(config["ha_url"], config["ha_token"])
        print(f"Fetched {len(data['entities'])} entities and {len(data['states'])} states")
    else:
        print("Run with --dry-run to test HA connectivity")
