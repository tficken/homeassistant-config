// Settings editor tab for config-driven alert rules.
import { state } from '../state.js';
import { escapeHtml, friendlyName } from '../utils.js';
import { buildSettings, entityOptionTags, setSettingsStatus } from './editor.js';
import { getAlerts } from '../screens/home.js';

function ensureAlerts() {
  if (!Array.isArray(state.config.alerts)) state.config.alerts = [];
}

function conditionType(rule) {
  if (typeof rule.above === 'number') return 'above';
  if (typeof rule.below === 'number') return 'below';
  if (typeof rule.equals === 'string') return 'equals';
  return 'above';
}

function conditionValue(rule) {
  if (typeof rule.above === 'number') return rule.above;
  if (typeof rule.below === 'number') return rule.below;
  if (typeof rule.equals === 'string') return rule.equals;
  return '';
}

export function validateAlerts() {
  const rules = state.config.alerts || [];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!r.entity) return `Alert rule ${i + 1} is missing an entity.`;
    const hasAbove = typeof r.above === 'number';
    const hasBelow = typeof r.below === 'number';
    const hasEquals = typeof r.equals === 'string';
    const condCount = (hasAbove ? 1 : 0) + (hasBelow ? 1 : 0) + (hasEquals ? 1 : 0);
    if (condCount !== 1) return `Alert rule ${i + 1} must have exactly one condition.`;
    if (r.attribute && (!r.attribute.entity || !r.attribute.name)) {
      return `Alert rule ${i + 1} attribute expansion needs a source entity and attribute name.`;
    }
  }
  return '';
}

export function renderAlertsTab() {
  ensureAlerts();
  const rules = state.config.alerts;
  const active = getAlerts();
  const preview = active.length
    ? `<div style="margin-bottom:14px;padding:10px;border:1px solid var(--amber);background:rgba(255,176,0,0.08);">
         <div style="font-size:0.75rem;color:var(--amber);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Active now (${active.length})</div>
         <div style="display:flex;flex-wrap:wrap;gap:8px;">${active.map(a => `<span style="font-family:var(--font-mono);font-size:0.85rem;color:var(--amber);">${escapeHtml(a)}</span>`).join('')}</div>
       </div>`
    : `<div style="margin-bottom:14px;padding:10px;border:1px solid var(--border);color:var(--text-muted);font-size:0.85rem;">No alerts currently active.</div>`;

  const cards = rules.map((rule, idx) => {
    const type = conditionType(rule);
    const value = conditionValue(rule);
    const hasAttr = rule.attribute && typeof rule.attribute === 'object';
    return `
      <div class="settings-section alert-rule-card" data-idx="${idx}" style="margin-bottom:14px;padding:12px;border:1px solid var(--border);">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
          <select class="alert-entity" style="flex:1;"><option value="">-- entity --</option>${entityOptionTags()}</select>
          <button class="btn alert-up" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn alert-down" ${idx === rules.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn alert-delete" style="color:var(--danger);">✕</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
          <select class="alert-condition">
            <option value="above" ${type === 'above' ? 'selected' : ''}>above</option>
            <option value="below" ${type === 'below' ? 'selected' : ''}>below</option>
            <option value="equals" ${type === 'equals' ? 'selected' : ''}>equals</option>
          </select>
          <input class="alert-value" type="text" value="${escapeHtml(String(value))}" placeholder="value" style="flex:1;min-width:80px;">
        </div>
        <div style="margin-bottom:10px;">
          <input class="alert-label" type="text" value="${escapeHtml(rule.label || '')}" placeholder="Label template ({state} {value})" style="width:100%;">
        </div>
        <details style="margin-bottom:4px;" ${hasAttr ? 'open' : ''}>
          <summary style="font-size:0.8rem;color:var(--text-muted);cursor:pointer;">Attribute list expansion (NWS-style)</summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px;">
            <select class="alert-attr-entity"><option value="">-- source entity --</option>${entityOptionTags()}</select>
            <input class="alert-attr-name" type="text" value="${escapeHtml((hasAttr && rule.attribute.name) || '')}" placeholder="Attribute name (e.g. Alerts)">
            <input class="alert-attr-key" type="text" value="${escapeHtml((hasAttr && rule.attribute.key) || '')}" placeholder="Item key (e.g. Event), optional">
            <input class="alert-attr-filter" type="text" value="${escapeHtml((hasAttr && rule.attribute.filter) || '')}" placeholder="Filter regex (e.g. (Warning|Watch)$), optional">
          </div>
        </details>
      </div>
    `;
  }).join('');

  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0;">Alert Rules</h3>
        <button class="btn" id="alert-add">Add rule</button>
      </div>
      ${preview}
      <div id="alert-rules-list">${cards}</div>
    </div>
  `;
}

function readRule(card) {
  const entity = card.querySelector('.alert-entity').value;
  const condition = card.querySelector('.alert-condition').value;
  const rawValue = card.querySelector('.alert-value').value;
  const label = card.querySelector('.alert-label').value;
  const attrEntity = card.querySelector('.alert-attr-entity').value;
  const attrName = card.querySelector('.alert-attr-name').value.trim();
  const attrKey = card.querySelector('.alert-attr-key').value.trim();
  const attrFilter = card.querySelector('.alert-attr-filter').value.trim();

  const rule = { entity, label };
  if (condition === 'equals') {
    rule.equals = rawValue;
  } else {
    const num = parseFloat(rawValue);
    if (!isNaN(num)) rule[condition] = num;
  }

  if (attrEntity && attrName) {
    rule.attribute = { entity: attrEntity, name: attrName };
    if (attrKey) rule.attribute.key = attrKey;
    if (attrFilter) rule.attribute.filter = attrFilter;
  }
  return rule;
}

export function wireAlertsTab() {
  ensureAlerts();
  const list = document.getElementById('alert-rules-list');

  list.addEventListener('change', () => {
    const cards = Array.from(list.querySelectorAll('.alert-rule-card'));
    state.config.alerts = cards.map(readRule);
    const err = validateAlerts();
    setSettingsStatus(err || '');
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const card = btn.closest('.alert-rule-card');
    const idx = parseInt(card.dataset.idx, 10);
    if (btn.classList.contains('alert-delete')) {
      state.config.alerts.splice(idx, 1);
    } else if (btn.classList.contains('alert-up') && idx > 0) {
      [state.config.alerts[idx - 1], state.config.alerts[idx]] = [state.config.alerts[idx], state.config.alerts[idx - 1]];
    } else if (btn.classList.contains('alert-down') && idx < state.config.alerts.length - 1) {
      [state.config.alerts[idx], state.config.alerts[idx + 1]] = [state.config.alerts[idx + 1], state.config.alerts[idx]];
    } else {
      return;
    }
    // Re-render via buildSettings (switchSettingsTab keeps current tab).
    buildSettings();
  });

  document.getElementById('alert-add').addEventListener('click', () => {
    state.config.alerts.unshift({ entity: '', above: 0, label: '' });
    buildSettings();
  });

  // Set initial selects after rendering.
  const cards = list.querySelectorAll('.alert-rule-card');
  state.config.alerts.forEach((rule, idx) => {
    const card = cards[idx];
    if (card) {
      card.querySelector('.alert-entity').value = rule.entity || '';
      if (rule.attribute && rule.attribute.entity) {
        card.querySelector('.alert-attr-entity').value = rule.attribute.entity;
      }
    }
  });
}
