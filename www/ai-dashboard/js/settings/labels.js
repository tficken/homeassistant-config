// Labels tab of the settings editor: per-entity display-name overrides.
// Circular with editor.js (entityOptionTags, buildSettings) — function
// references at runtime only.
import { state } from '../state.js';
import { escapeHtml } from '../utils.js';
import { renderAll } from '../screens/index.js';
import { entityOptionTags, buildSettings } from './editor.js';

export function renderLabelsTab() {
  const labels = state.config.labels || {};
  const rows = Object.keys(labels).sort().map(id => `
    <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
      <span style="flex:1;min-width:200px;font-size:0.85rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(id)}">${escapeHtml(id)}</span>
      <input value="${escapeHtml(labels[id])}" onchange="setLabelOverride('${escapeHtml(id)}', this.value)" style="min-width:180px;">
      <button class="btn" onclick="removeLabelOverride('${escapeHtml(id)}')">×</button>
    </div>`).join("");
  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">Label overrides</h3>
      <p style="color:var(--text-muted);font-size:0.85rem;">Override the display name shown for an entity anywhere on the dashboard. Clear a label's text (or press ×) to remove the override.</p>
      ${rows || "<p style='color:var(--text-muted);font-size:0.85rem;'>No label overrides yet.</p>"}
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-top:12px;flex-wrap:wrap;">
        <select id="cfg-label-entity" style="min-width:220px;"><option value="">-- pick entity --</option>${entityOptionTags(null)}</select>
        <input id="cfg-label-text" placeholder="Display label" style="min-width:180px;">
        <button class="btn" onclick="addLabelOverride()">Add</button>
      </div>
    </div>
  `;
}

export function setLabelOverride(id, value) {
  state.config.labels = state.config.labels || {};
  if (value) state.config.labels[id] = value;
  else delete state.config.labels[id];
  renderAll();
}

export function removeLabelOverride(id) {
  if (state.config.labels) delete state.config.labels[id];
  renderAll();
  buildSettings();
}

export function addLabelOverride() {
  const sel = document.getElementById("cfg-label-entity");
  const txt = document.getElementById("cfg-label-text");
  if (!sel || !sel.value) return;
  if (txt && txt.value) {
    state.config.labels = state.config.labels || {};
    state.config.labels[sel.value] = txt.value;
  }
  renderAll();
  buildSettings();
}
