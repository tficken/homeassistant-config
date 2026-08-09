import json
import os
import re
import urllib.request
import urllib.error


def get_config():
    return {
        "ha_url": os.environ.get("HA_URL", "http://homeassistant.local:8123").rstrip("/"),
        "ha_token": os.environ.get("HA_TOKEN", ""),
    }


def get_llm_config():
    return {
        "base_url": os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        "api_key": os.environ.get("LLM_API_KEY", ""),
        "model": os.environ.get("LLM_MODEL", "gpt-4o-mini"),
    }


def call_llm(prompt, llm_config):
    payload = {
        "model": llm_config["model"],
        "messages": [
            {"role": "system", "content": "You generate Home Assistant dashboards as a single HTML file."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.4,
    }
    req = urllib.request.Request(
        f"{llm_config['base_url']}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {llm_config['api_key']}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]


def extract_html(text):
    """Extract HTML from markdown code fences or return the raw HTML block."""
    text = text.strip()
    fence = re.search(r"```(?:html)?\s*\n(.*?)\n```", text, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    if text.lower().startswith("<!doctype") or text.lower().startswith("<html"):
        return text
    raise ValueError("LLM response does not contain a recognizable HTML block")


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


EXCLUDED_DOMAINS = {"update", "device_tracker", "person"}
EXCLUDED_PREFIXES = (
    "sensor.home_assistant_core_",
    "sensor.home_assistant_host_",
    "sensor.home_assistant_supervisor_",
)
EXCLUDED_ENTITY_GLOBS = {"*firmware*", "*developer_lan_mode*", "*mqtt_encryption*"}


def _glob_matches(value, pattern):
    """Simple wildcard match treating '*' as any substring."""
    parts = pattern.split("*")
    if not parts:
        return False
    # Check that all non-empty parts appear in order within value.
    pos = 0
    for part in parts:
        if not part:
            continue
        idx = value.find(part, pos)
        if idx == -1:
            return False
        pos = idx + len(part)
    return True


def is_interesting(entity, state_by_id):
    eid = entity.get("entity_id", "")
    domain = eid.split(".")[0]
    if domain in EXCLUDED_DOMAINS:
        return False
    if eid.startswith(EXCLUDED_PREFIXES):
        return False
    if any(_glob_matches(eid, pattern) for pattern in EXCLUDED_ENTITY_GLOBS):
        return False
    state = state_by_id.get(eid)
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
    config = {**get_config(), **get_llm_config()}
    if "--prompt-only" in sys.argv:
        data = fetch_entities(config["ha_url"], config["ha_token"])
        prompt = build_prompt(data)
        print(prompt[:2000])
        print("\n... (truncated)")
    elif "--dry-run" in sys.argv:
        data = fetch_entities(config["ha_url"], config["ha_token"])
        print(f"Fetched {len(data['entities'])} entities and {len(data['states'])} states")
    else:
        print("Usage: python3 scripts/generate_ai_dashboard.py [--dry-run|--prompt-only]")
