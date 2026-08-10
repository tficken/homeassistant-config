import re
import os


def parse_existing_dashboard(path):
    """Parse entity cards out of the existing generated dashboard."""
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    items = []
    # Match both actionable and non-actionable cards
    for m in re.finditer(
        r'<div class="card (?:actionable)?" data-entity-id="([^"]+)"(?: data-domain="([^"]+)")?[^>]*>'
        r'\s*<div class="entity-name">([^<]+)</div>'
        r'\s*<div class="entity-state">([^<]+)</div>',
        html,
    ):
        eid = m.group(1)
        domain = m.group(2) or eid.split(".")[0]
        name = m.group(3)
        state_text = m.group(4).strip()
        # Try to split state and unit
        parts = state_text.rsplit(" ", 1)
        if len(parts) == 2 and not parts[1].isalpha() and parts[1] not in ("on", "off", "unknown", "unavailable"):
            state, unit = parts[0], parts[1]
        else:
            state, unit = state_text, ""
        items.append({
            "entity_id": eid,
            "domain": domain,
            "name": name,
            "state": state,
            "unit": unit,
        })
    return items


def group_by_domain(items):
    groups = {}
    for item in items:
        groups.setdefault(item["domain"], []).append(item)
    return groups


def find_entity(groups, domains, substring=None):
    for domain in domains:
        for item in groups.get(domain, []):
            if substring is None or substring.lower() in item["entity_id"].lower() or substring.lower() in item["name"].lower():
                return item
    return None


def card_html(item, actionable=False):
    eid = item["entity_id"]
    domain = item["domain"]
    name = item["name"]
    state = item["state"]
    unit = item["unit"]
    display = f"{state} {unit}".strip()
    active = state.lower() in ("on", "playing", "open", "home", "heat", "cool", "auto")
    action_class = " actionable" if actionable else ""
    onclick = f' onclick="toggle(this)"' if actionable else ""
    return f'''<div class="card{action_class}{' active' if active else ''}" data-entity-id="{eid}" data-domain="{domain}" data-state="{state.lower()}"{onclick}>
            <div class="card-icon">{icon_for(domain, state)}</div>
            <div class="card-info">
              <div class="card-name">{name}</div>
              <div class="card-state">{display}</div>
            </div>
          </div>'''


def icon_for(domain, state):
    icons = {
        "light": "💡",
        "switch": "🔌",
        "climate": "🌡️",
        "fan": "🌀",
        "media_player": "📺",
        "vacuum": "🤖",
        "sensor": "📊",
        "binary_sensor": "🔔",
        "weather": "🌤️",
        "scene": "🎬",
        "script": "▶️",
        "button": "🔘",
        "number": "🔢",
        "select": "☰",
    }
    return icons.get(domain, "●")


def section_html(title, cards):
    if not cards:
        return ""
    return f'''<section class="section">
        <h2 class="section-title">{title}</h2>
        <div class="grid">
          {''.join(cards)}
        </div>
      </section>'''


def render_dashboard(groups):
    domain_order = [
        "weather", "light", "switch", "climate", "fan", "media_player",
        "vacuum", "scene", "script", "sensor", "binary_sensor", "number", "select", "button"
    ]

    weather_item = find_entity(groups, ["weather"])
    clock_html = '''<div class="clock-card">
          <div id="clock" class="clock-time">--:--</div>
          <div id="date" class="clock-date">Loading...</div>
        </div>'''

    header_cards = [clock_html]
    if weather_item:
        header_cards.append(card_html(weather_item, actionable=False))

    sections = []
    for domain in sorted(groups.keys(), key=lambda d: (domain_order.index(d) if d in domain_order else 99, d)):
        if domain == "weather":
            continue
        items = groups[domain]
        actionable = domain in ("light", "switch", "fan", "media_player", "vacuum", "scene", "script")
        cards = [card_html(item, actionable=actionable) for item in items]
        title = domain.replace("_", " ").title() + "s"
        if title == "Binary Sensors":
            title = "Sensors"
        sections.append(section_html(title, cards))

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Home Assistant Wall Dashboard</title>
<style>
:root {{
  --bg: #0b0d10;
  --surface: #151922;
  --surface-2: #1e2330;
  --border: #2a3042;
  --text: #e4e6eb;
  --text-muted: #8b92a8;
  --accent: #3b82f6;
  --accent-on: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --radius: 18px;
  --gap: 14px;
}}
* {{ box-sizing: border-box; }}
html, body {{
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  height: 100%;
  overflow: hidden;
}}
.dashboard {{
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: var(--gap);
  gap: var(--gap);
}}
.header {{
  display: flex;
  gap: var(--gap);
  flex-shrink: 0;
}}
.clock-card, .weather-card {{
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.4rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
}}
.clock-card {{ flex: 1; }}
.clock-time {{ font-size: clamp(2.5rem, 6vw, 5rem); font-weight: 700; line-height: 1; }}
.clock-date {{ font-size: 1rem; color: var(--text-muted); margin-top: 0.4rem; }}
.weather-card {{ min-width: 180px; align-items: flex-start; }}
.weather-card .card-icon {{ font-size: 2.2rem; margin-bottom: 0.3rem; }}
.weather-card .card-state {{ font-size: 1.6rem; font-weight: 700; }}
.weather-card .card-name {{ color: var(--text-muted); font-size: 0.9rem; }}
.scroll-area {{
  flex: 1;
  overflow-y: auto;
  padding-right: 6px;
}}
.scroll-area::-webkit-scrollbar {{ width: 6px; }}
.scroll-area::-webkit-scrollbar-thumb {{ background: var(--border); border-radius: 3px; }}
.section {{ margin-bottom: 1.2rem; }}
.section-title {{
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 0.6rem 0.2rem;
}}
.grid {{
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--gap);
}}
.card {{
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 90px;
  transition: transform 0.1s, background 0.15s, border-color 0.15s;
}}
.card.actionable {{ cursor: pointer; user-select: none; }}
.card.actionable:active {{ transform: scale(0.97); }}
.card.actionable:hover {{ background: var(--surface-2); }}
.card.active {{ border-color: var(--accent-on); background: rgba(16, 185, 129, 0.08); }}
.card.active .card-state {{ color: var(--accent-on); }}
.card-icon {{ font-size: 1.8rem; line-height: 1; }}
.card-info {{ flex: 1; min-width: 0; }}
.card-name {{
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}}
.card-state {{
  font-size: 1.1rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}}
#status {{
  position: fixed;
  top: 10px;
  right: 10px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--warning);
  z-index: 100;
}}
#status.connected {{ background: var(--accent-on); }}
#status.disconnected {{ background: var(--danger); }}
.logout {{
  position: fixed;
  bottom: 10px;
  right: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  z-index: 100;
}}
@media (max-width: 600px) {{
  .grid {{ grid-template-columns: repeat(2, 1fr); }}
  .header {{ flex-direction: column; }}
}}
</style>
</head>
<body>
<div id="status"></div>
<button class="logout" onclick="logout()">Change token</button>
<div class="dashboard">
  <div class="header">
    {''.join(header_cards)}
  </div>
  <div class="scroll-area">
    {''.join(sections)}
  </div>
</div>
<script>
const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/websocket';
let ws, token = localStorage.getItem('ha_token');
if (!token) token = prompt('Enter Home Assistant long-lived access token:');
if (token) localStorage.setItem('ha_token', token);
const statusEl = document.getElementById('status');
function setStatus(c) {{ statusEl.className = c; }}
function logout() {{ localStorage.removeItem('ha_token'); location.reload(); }}
function toggle(el) {{
  const eid = el.dataset.entityId;
  const domain = el.dataset.domain;
  ws.send(JSON.stringify({{ id: Date.now(), type: 'call_service', domain: domain, service: 'toggle', service_data: {{ entity_id: eid }} }}));
}}
function updateState(state) {{
  const card = document.querySelector('[data-entity-id="' + state.entity_id + '"]');
  if (!card) return;
  const stateEl = card.querySelector('.card-state');
  if (stateEl) stateEl.textContent = state.state;
  card.dataset.state = state.state.toLowerCase();
  const on = ['on','playing','open','home','heat','cool','auto'].includes(state.state.toLowerCase());
  card.classList.toggle('active', on);
}}
function updateClock() {{
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString([], {{ hour: 'numeric', minute: '2-digit' }});
  document.getElementById('date').textContent = now.toLocaleDateString([], {{ weekday: 'long', month: 'long', day: 'numeric' }});
}}
setInterval(updateClock, 1000);
updateClock();
function connect() {{
  setStatus('connecting');
  ws = new WebSocket(wsUrl);
  ws.onopen = () => ws.send(JSON.stringify({{ type: 'auth', access_token: token }}));
  ws.onmessage = (ev) => {{
    const msg = JSON.parse(ev.data);
    if (msg.type === 'auth_ok') {{
      setStatus('connected');
      ws.send(JSON.stringify({{ id: 1, type: 'subscribe_events', event_type: 'state_changed' }}));
    }}
    if (msg.type === 'event' && msg.event && msg.event.event_type === 'state_changed') updateState(msg.event.data.new_state);
  }};
  ws.onclose = () => {{ setStatus('disconnected'); setTimeout(connect, 3000); }};
}}
connect();
</script>
</body>
</html>'''
    return html


def main():
    src = "/root/config/www/ai-dashboard/index.html"
    items = parse_existing_dashboard(src)
    if not items:
        print("No entities found in existing dashboard")
        return
    groups = group_by_domain(items)
    html = render_dashboard(groups)
    backup_path = src + ".bak.before-redesign"
    os.replace(src, backup_path)
    with open(src, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Redesigned dashboard written to {src}")
    print(f"Backup saved to {backup_path}")


if __name__ == "__main__":
    main()
