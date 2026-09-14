// One-shot HA WebSocket query: auth, then run commands passed as JSON on argv[2].
const fs = require('fs');
const token = fs.readFileSync('token.ha', 'utf8').trim();
const commands = JSON.parse(process.argv[2]);
const ws = new WebSocket('ws://homeassistant.local:8123/api/websocket');
let id = 0;
const pending = [];
const results = {};

function sendNext() {
  if (pending.length === 0) {
    console.log(JSON.stringify(results));
    ws.close();
    process.exit(0);
  }
  const type = pending.shift();
  id += 1;
  results[type] = null;
  ws.send(JSON.stringify({ id, type }));
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'auth_required') {
    ws.send(JSON.stringify({ type: 'auth', access_token: token }));
  } else if (msg.type === 'auth_ok') {
    pending.push(...commands);
    sendNext();
  } else if (msg.type === 'auth_invalid') {
    console.error('AUTH FAILED');
    process.exit(1);
  } else if (msg.type === 'result') {
    // find which command this id belongs to: track by order
    const types = Object.keys(results);
    const cur = types[types.length - 1];
    results[cur] = msg.success ? msg.result : { ERROR: msg.error };
    sendNext();
  }
};
ws.onerror = (e) => { console.error('WS ERROR', e.message || ''); process.exit(1); };
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 20000);
