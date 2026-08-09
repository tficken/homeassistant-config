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


if __name__ == "__main__":
    import sys
    config = get_config()
    if "--dry-run" in sys.argv:
        data = fetch_entities(config["ha_url"], config["ha_token"])
        print(f"Fetched {len(data['entities'])} entities and {len(data['states'])} states")
    else:
        print("Run with --dry-run to test HA connectivity")
