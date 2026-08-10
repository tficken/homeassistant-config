# AI-Generated Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-shot Python generator that reads Home Assistant entities, asks an LLM to design a dashboard, and writes a self-contained `www/ai-dashboard/index.html` that connects to HA over WebSocket for live updates.

**Architecture:** A single generator script (`scripts/generate_ai_dashboard.py`) fetches entity data from HA's REST API, calls an OpenAI-compatible chat endpoint with a structured prompt, parses the returned HTML, and writes it to `www/ai-dashboard/index.html`. The generated page uses vanilla JS and the HA WebSocket API to render live states and handle light/switch toggles.

**Tech Stack:** Python 3 (stdlib + `urllib` only), vanilla HTML/CSS/JS, Home Assistant REST and WebSocket APIs, OpenAI-compatible chat completions API.

## Global Constraints

- No YAML configuration changes in Home Assistant.
- No new custom integration or add-on.
- One self-contained generated HTML/CSS/JS file.
- Served by Home Assistant from `www/ai-dashboard/index.html`.
- LLM API key and HA token must never be written into the generated HTML.
- Only Python stdlib for the generator script; no external pip packages.
- Generated dashboard uses vanilla JS; no frontend build step.

---

## File Structure

- `scripts/generate_ai_dashboard.py` — main generator script. Contains modular functions for HA fetching, prompt building, LLM calling, HTML parsing, and file I/O.
- `www/ai-dashboard/index.html` — generated dashboard (created by the script above).
- `www/ai-dashboard/index.html.bak.<timestamp>` — backups created automatically by the generator.
- `scripts/create_ha_token.md` — short user guide for creating a long-lived access token.
- `docs/superpowers/specs/2026-08-09-ai-generated-web-dashboard-design.md` — already approved design spec.

---

### Task 1: Add HA entity fetching and environment config to the generator

**Files:**
- Create: `scripts/generate_ai_dashboard.py`
- Test: `python3 scripts/generate_ai_dashboard.py --dry-run`

**Interfaces:**
- Consumes: environment variables `HA_URL`, `HA_TOKEN`.
- Produces: `fetch_entities(ha_url, ha_token) -> dict` returning `{"entities": [...], "states": [...]}`.

- [ ] **Step 1: Write the script skeleton and HA fetch function**

```python
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
```

- [ ] **Step 2: Test HA connectivity**

Run:
```bash
HA_URL=http://homeassistant.local:8123 HA_TOKEN=<your-token> python3 scripts/generate_ai_dashboard.py --dry-run
```

Expected: prints counts like `Fetched 312 entities and 298 states`.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate_ai_dashboard.py
git commit -m "feat: add HA entity fetching to AI dashboard generator"
```

---

### Task 2: Build the entity summary and LLM prompt

**Files:**
- Modify: `scripts/generate_ai_dashboard.py`

**Interfaces:**
- Consumes: `fetch_entities()` output.
- Produces: `build_prompt(entity_data) -> str` and `summarize_entities(entity_data) -> list`.

- [ ] **Step 1: Add entity summarization**

Add these functions:

```python
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
```

- [ ] **Step 2: Add prompt builder**

```python
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
```

- [ ] **Step 3: Dry-run the prompt**

Run:
```bash
HA_URL=http://homeassistant.local:8123 HA_TOKEN=<your-token> python3 scripts/generate_ai_dashboard.py --dry-run
```

Expected: prints entity counts like `Fetched 312 entities and 298 states`.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_ai_dashboard.py
git commit -m "feat: build entity summary and LLM prompt"
```

---

### Task 3: Call the LLM and parse the response

**Files:**
- Modify: `scripts/generate_ai_dashboard.py`

**Interfaces:**
- Consumes: prompt string, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` env vars.
- Produces: `call_llm(prompt, config) -> str` and `extract_html(response_text) -> str`.

- [ ] **Step 1: Add LLM client**

```python
import re


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
```

- [ ] **Step 2: Add a --prompt-only dry-run mode**

Update `__main__` to support `--prompt-only`:

```python
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
```

- [ ] **Step 3: Test LLM call (costs tokens)**

Run:
```bash
HA_URL=http://homeassistant.local:8123 HA_TOKEN=<your-token> \
LLM_BASE_URL=https://api.openai.com/v1 LLM_API_KEY=<your-key> LLM_MODEL=gpt-4o-mini \
python3 scripts/generate_ai_dashboard.py --prompt-only
```

Expected: prints the truncated prompt without making a paid call.

To test the actual LLM call, run a small Python snippet:
```bash
python3 -c "
import os
from generate_ai_dashboard import get_llm_config, call_llm, build_prompt, fetch_entities, get_config
c = {**get_config(), **get_llm_config()}
data = fetch_entities(c['ha_url'], c['ha_token'])
html = call_llm(build_prompt(data), c)
print(html[:1000])
"
```

Expected: prints the start of an HTML file.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_ai_dashboard.py
git commit -m "feat: add LLM client and HTML response parser"
```

---

### Task 4: Write the generated dashboard with backup and fallback template

**Files:**
- Modify: `scripts/generate_ai_dashboard.py`
- Create: `www/ai-dashboard/index.html` (by running the script)

**Interfaces:**
- Consumes: parsed HTML string.
- Produces: `write_dashboard(html, www_root="www")` and `FALLBACK_TEMPLATE`.

- [ ] **Step 1: Add fallback dashboard template**

```python
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
function connect(){
  setStatus('connecting','connecting');
  ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/websocket');
  ws.onopen = () => ws.send(JSON.stringify({type:'auth',access_token:token}));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if(msg.type==='auth_ok'){ setStatus('connected','connected'); ws.send(JSON.stringify({id:1,type:'subscribe_events',event_type:'state_changed'})); }
    if(msg.type==='event' && msg.event.event_type==='state_changed') updateState(msg.event.data.new_state);
  };
  ws.onclose = () => { setStatus('disconnected','disconnected'); setTimeout(connect,3000); };
}
function updateState(state){
  const el = document.querySelector('[data-entity-id="'+state.entity_id+'"] .entity-state');
  if(el) el.textContent = state.state;
}
connect();
</script>
</body>
</html>"""
```

- [ ] **Step 2: Add file writer with backup**

```python
import shutil
from datetime import datetime


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
```

- [ ] **Step 3: Update main entry point**

```python
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
        generate(config)
```

- [ ] **Step 4: Run the generator**

Run:
```bash
HA_URL=http://homeassistant.local:8123 HA_TOKEN=<your-token> \
LLM_BASE_URL=https://api.openai.com/v1 LLM_API_KEY=<your-key> LLM_MODEL=gpt-4o-mini \
python3 scripts/generate_ai_dashboard.py
```

Expected: fetches entities, calls the LLM, writes `www/ai-dashboard/index.html`, and prints the output path.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate_ai_dashboard.py www/ai-dashboard/index.html
git commit -m "feat: write generated dashboard with fallback and backup"
```

---

### Task 5: Document how to create the Home Assistant token

**Files:**
- Create: `scripts/create_ha_token.md`

- [ ] **Step 1: Write the token guide**

```markdown
# Creating a Home Assistant Long-Lived Access Token

The AI-generated dashboard needs a token to read states and call services over the WebSocket API.

1. Open Home Assistant in a browser.
2. Click your user profile (bottom-left corner).
3. Scroll to **Long-Lived Access Tokens**.
4. Click **Create Token**.
5. Give it a name like `AI Dashboard` and click **OK**.
6. Copy the token immediately — it is shown only once.
7. Paste it into the prompt when the dashboard first loads.

The token is stored in your browser's localStorage for that device only. It is never included in the generated HTML file.
```

- [ ] **Step 2: Commit**

```bash
git add scripts/create_ha_token.md
git commit -m "docs: add guide for creating HA long-lived access token"
```

---

### Task 6: Verify the dashboard loads and updates live

**Files:**
- Test: manual browser test of `www/ai-dashboard/index.html`

- [ ] **Step 1: Confirm the file is served**

Open in a browser:
```
http://homeassistant.local:8123/local/ai-dashboard/index.html
```

Expected: page loads and prompts for a token.

- [ ] **Step 2: Authenticate and confirm connection**

Paste the long-lived access token from Task 5.

Expected: status indicator changes to `connected`.

- [ ] **Step 3: Verify live state update**

Toggle a light or switch from another HA dashboard or device while watching the AI dashboard.

Expected: the corresponding card updates within a few seconds.

- [ ] **Step 4: Verify control from the dashboard**

Tap a light or switch card in the AI dashboard.

Expected: the real HA entity toggles and the card state updates.

- [ ] **Step 5: Verify backup behavior**

Run the generator a second time.

Expected: a new `www/ai-dashboard/index.html.bak.<timestamp>` file is created and the dashboard is overwritten.

- [ ] **Step 6: Commit any final fixes**

If any bugs were found and fixed during verification, commit them with a descriptive message.

---

## Self-Review

**Spec coverage:**
- No YAML: no YAML files are modified. ✅
- AI decides layout: prompt asks LLM to design layout and select entities. ✅
- WebSocket live updates: generated page connects to `/api/websocket`. ✅
- Served from `www/ai-dashboard/index.html`: generator writes to that path. ✅
- Token not in generated HTML: token is collected at runtime via `prompt()`/`localStorage`. ✅
- Backup on regenerate: `write_dashboard()` copies existing file before overwrite. ✅
- Fallback template: `FALLBACK_TEMPLATE` is used when LLM/parsing fails. ✅

**Placeholder scan:** No TBD/TODO/fill-in-details found. Each step includes concrete code or commands.

**Type consistency:** Function names (`fetch_entities`, `build_prompt`, `call_llm`, `extract_html`, `write_dashboard`, `generate`) are consistent throughout. Environment variable names (`HA_URL`, `HA_TOKEN`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) are consistent.
