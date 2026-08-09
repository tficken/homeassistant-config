import json
import os
import urllib.request


def read_token(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


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


def fetch_states(ha_url, ha_token):
    return api_request(ha_url, ha_token, "/api/states")


def is_interesting(eid, state):
    if state.get("state") in ("unavailable", "unknown", None):
        return False
    domain = eid.split(".")[0]
    if domain in {"update", "device_tracker", "person", "camera", "alarm_control_panel", "lock"}:
        return False
    if eid.startswith(("sensor.home_assistant_core_", "sensor.home_assistant_host_", "sensor.home_assistant_supervisor_")):
        return False
    return True


def summarize(states):
    summaries = []
    for state in states:
        eid = state.get("entity_id")
        if not is_interesting(eid, state):
            continue
        domain = eid.split(".")[0]
        friendly = state.get("attributes", {}).get("friendly_name") or eid
        summaries.append({
            "entity_id": eid,
            "domain": domain,
            "name": friendly,
            "state": state.get("state"),
            "unit": state.get("attributes", {}).get("unit_of_measurement"),
        })
    summaries.sort(key=lambda x: (x["domain"], x["name"]))
    return summaries


def group_by_domain(summaries):
    groups = {}
    for s in summaries:
        groups.setdefault(s["domain"], []).append(s)
    return groups


def render_html(groups):
    sections = []
    domain_order = ["light", "switch", "climate", "fan", "media_player", "vacuum", "sensor", "binary_sensor", "scene", "script", "weather", "number", "select", "button"]
    domains = sorted(groups.keys(), key=lambda d: (domain_order.index(d) if d in domain_order else 99, d))

    for domain in domains:
        items = groups[domain]
        cards = []
        for item in items:
            eid = item["entity_id"]
            name = item["name"]
            state = item["state"]
            unit = item["unit"] or ""
            display_state = f"{state} {unit}".strip()

            if domain in ("light", "switch"):
                cards.append(f"""
                <div class="card actionable" data-entity-id="{eid}" data-domain="{domain}" onclick="toggle(this)">
                  <div class="entity-name">{name}</div>
                  <div class="entity-state">{display_state}</div>
                </div>""")
            else:
                cards.append(f"""
                <div class="card" data-entity-id="{eid}">
                  <div class="entity-name">{name}</div>
                  <div class="entity-state">{display_state}</div>
                </div>""")

        sections.append(f"""
      <section>
        <h2>{domain.replace('_', ' ').title()}</h2>
        <div class="grid">
          {''.join(cards)}
        </div>
      </section>""")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Dashboard</title>
<style>
:root {{ color-scheme: dark; }}
body {{ background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 1rem; }}
#status {{ position: fixed; top: 0.75rem; right: 0.75rem; padding: 0.35rem 0.75rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }}
#status.connecting {{ background: #f0883e; color: #000; }}
#status.connected {{ background: #3fb950; color: #000; }}
#status.disconnected {{ background: #f85149; color: #fff; }}
h1 {{ margin: 0 0 1rem; font-size: 1.75rem; }}
h2 {{ margin: 1.5rem 0 0.75rem; font-size: 1.1rem; text-transform: capitalize; color: #8b949e; border-bottom: 1px solid #30363d; padding-bottom: 0.35rem; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; }}
.card {{ background: #161b22; border: 1px solid #30363d; border-radius: 0.75rem; padding: 1rem; transition: background 0.15s; }}
.card.actionable {{ cursor: pointer; }}
.card.actionable:hover {{ background: #1f242c; }}
.card.on {{ border-color: #3fb950; background: #132a1e; }}
.entity-name {{ font-size: 0.85rem; color: #8b949e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
.entity-state {{ font-size: 1.35rem; font-weight: 600; margin-top: 0.4rem; }}
.logout {{ position: fixed; top: 0.75rem; right: 6rem; padding: 0.35rem 0.75rem; border-radius: 999px; font-size: 0.8rem; background: #30363d; color: #c9d1d9; border: none; cursor: pointer; }}
</style>
</head>
<body>
<div id="status" class="connecting">connecting</div>
<button class="logout" onclick="logout()">Change token</button>
<h1>Home Assistant Dashboard</h1>
{''.join(sections)}
<script>
const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/websocket';
let ws, token = localStorage.getItem('ha_token');
if (!token) token = prompt('Enter Home Assistant long-lived access token:');
if (token) localStorage.setItem('ha_token', token);
const statusEl = document.getElementById('status');
function setStatus(s,c){{ statusEl.textContent = s; statusEl.className = c; }}
function logout(){{ localStorage.removeItem('ha_token'); location.reload(); }}
function toggle(el){{
  const eid = el.dataset.entityId;
  const domain = el.dataset.domain;
  ws.send(JSON.stringify({{ id: Date.now(), type: 'call_service', domain: domain, service: 'toggle', service_data: {{ entity_id: eid }} }}));
}}
function updateState(state){{
  const card = document.querySelector('[data-entity-id="' + state.entity_id + '"]');
  if (!card) return;
  const el = card.querySelector('.entity-state');
  if (!el) return;
  const unit = card.dataset.unit || '';
  el.textContent = (state.state + ' ' + unit).trim();
  if (card.classList.contains('actionable')) {{
    const on = state.state === 'on' || state.state === 'playing' || state.state === 'open' || state.state === 'home';
    card.classList.toggle('on', on);
  }}
}}
function connect(){{
  setStatus('connecting', 'connecting');
  ws = new WebSocket(wsUrl);
  ws.onopen = () => ws.send(JSON.stringify({{ type: 'auth', access_token: token }}));
  ws.onmessage = (ev) => {{
    const msg = JSON.parse(ev.data);
    if (msg.type === 'auth_ok') {{
      setStatus('connected', 'connected');
      ws.send(JSON.stringify({{ id: 1, type: 'subscribe_events', event_type: 'state_changed' }}));
    }}
    if (msg.type === 'event' && msg.event && msg.event.event_type === 'state_changed') {{
      updateState(msg.event.data.new_state);
    }}
  }};
  ws.onclose = () => {{ setStatus('disconnected', 'disconnected'); setTimeout(connect, 3000); }};
}}
// Apply initial on-state styling
document.querySelectorAll('.actionable').forEach(el => {{
  const state = el.querySelector('.entity-state').textContent.trim();
  const on = state === 'on' || state === 'playing' || state === 'open' || state === 'home';
  el.classList.toggle('on', on);
}});
connect();
</script>
</body>
</html>"""
    return html


def main():
    token_path = "/root/config/token.ha"
    ha_url = os.environ.get("HA_URL", "http://homeassistant.local:8123").rstrip("/")
    ha_token = read_token(token_path)

    print("Fetching states...")
    states = fetch_states(ha_url, ha_token)
    summaries = summarize(states)
    groups = group_by_domain(summaries)

    print(f"Found {len(summaries)} interesting entities across {len(groups)} domains")

    html = render_html(groups)
    out_dir = "/root/config/www/ai-dashboard"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "index.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Wrote dashboard to {out_path}")

    # Clean up token file immediately
    os.remove(token_path)
    print(f"Removed {token_path}")


if __name__ == "__main__":
    main()
