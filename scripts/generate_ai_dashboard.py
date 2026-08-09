import json
import os
import re
import shutil
import sys
import urllib.request
import urllib.error
from datetime import datetime


FALLBACK_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Dashboard</title>
<style>
body { background: #111; color: #eee; font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }
#status { position: fixed; top: 0.5rem; right: 0.5rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.8rem; }
#status.connecting { background: #f90; color: #000; }
#status.connected { background: #0c0; color: #000; }
#status.disconnected { background: #c00; color: #fff; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; margin-top: 2rem; }
.card { background: #222; border-radius: 0.75rem; padding: 1rem; }
.entity-name { opacity: 0.7; font-size: 0.85rem; }
.entity-state { font-size: 1.5rem; margin-top: 0.25rem; }
button { margin-top: 0.5rem; padding: 0.5rem 1rem; border: none; border-radius: 0.5rem; background: #444; color: #fff; cursor: pointer; }
</style>
</head>
<body>
<div id="status" class="connecting">connecting</div>
<h1>AI Dashboard</h1>
<p>The AI-generated layout could not be parsed. This fallback lists your entities.</p>
<div id="dashboard" class="grid"></div>
<script>
const HA_URL = location.origin;
let ws, token = localStorage.getItem('ha_token');
if (!token) token = prompt('Enter Home Assistant long-lived access token:');
if (token) localStorage.setItem('ha_token', token);
const statusEl = document.getElementById('status');
function setStatus(s,c){ statusEl.textContent=s; statusEl.className=c; }
function escapeHtml(text){
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function renderCards(states){
  const dashboard = document.getElementById('dashboard');
  dashboard.innerHTML = '';
  states.sort((a,b)=>a.entity_id.localeCompare(b.entity_id));
  for(const s of states){
    const name = (s.attributes && s.attributes.friendly_name) || s.entity_id;
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.entityId = s.entity_id;
    div.innerHTML = '<div class="entity-name">'+escapeHtml(name)+'</div><div class="entity-state">'+escapeHtml(s.state)+'</div>';
    dashboard.appendChild(div);
  }
}
function updateState(state){
  const card = document.querySelector('[data-entity-id="'+state.entity_id+'"]');
  if(!card) return;
  const el = card.querySelector('.entity-state');
  if(el) el.textContent = state.state;
}
function connect(){
  setStatus('connecting','connecting');
  ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/websocket');
  ws.onopen = () => ws.send(JSON.stringify({type:'auth',access_token:token}));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if(msg.type==='auth_ok'){ setStatus('connected','connected'); ws.send(JSON.stringify({id:1,type:'get_states'})); ws.send(JSON.stringify({id:2,type:'subscribe_events',event_type:'state_changed'})); }
    if(msg.type==='result' && msg.id===1 && msg.success){ renderCards(msg.result); }
    if(msg.type==='event' && msg.event.event_type==='state_changed') updateState(msg.event.data.new_state);
  };
  ws.onclose = () => { setStatus('disconnected','disconnected'); setTimeout(connect,3000); };
}
connect();
</script>
</body>
</html>"""


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
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print("Authentication failed \u2014 check HA_TOKEN is valid and not expired", file=sys.stderr)
        else:
            reason = e.reason or "unknown error"
            print(f"Home Assistant API error ({e.code}) at {url}{path}: {reason}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Failed to connect to Home Assistant at {url}: {e.reason}", file=sys.stderr)
        sys.exit(1)


def fetch_entities(ha_url, ha_token):
    entities = api_request(ha_url, ha_token, "/api/config/entity_registry/list")
    states = api_request(ha_url, ha_token, "/api/states")
    return {"entities": entities, "states": states}


EXCLUDED_DOMAINS = {"update", "device_tracker", "person", "camera", "alarm_control_panel", "lock"}
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


def write_dashboard(html, www_root="www"):
    out_dir = os.path.join(www_root, "ai-dashboard")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "index.html")
    if os.path.exists(out_path):
        backup = os.path.join(out_dir, f"index.html.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        shutil.copy2(out_path, backup)
        print(f"Backed up existing dashboard to {backup}")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Wrote dashboard to {out_path}")


def generate(config):
    data = fetch_entities(config["ha_url"], config["ha_token"])
    prompt = build_prompt(data)
    try:
        raw = call_llm(prompt, config)
        html = extract_html(raw)
    except Exception as e:
        print(f"LLM/parsing failed ({e}), using fallback template")
        html = FALLBACK_TEMPLATE
    write_dashboard(html)


if __name__ == "__main__":
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
        generate(config)
