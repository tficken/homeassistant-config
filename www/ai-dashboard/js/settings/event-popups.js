// Settings editor tab for event-triggered camera popups.
import { state } from '../state.js';
import { escapeHtml, friendlyName } from '../utils.js';
import { buildSettings, entityOptionTags, setSettingsStatus } from './editor.js';
import { showEventPopup } from '../components/event-popup.js';

function ensurePopups() {
  if (!Array.isArray(state.config.eventPopups)) state.config.eventPopups = [];
}

function renderMultiSelect(selected, domainFilter) {
  let list = Object.values(state.states);
  if (domainFilter) list = list.filter(s => domainFilter.includes(s.entity_id.split('.')[0]));
  return list.map(s => {
    const sel = selected.includes(s.entity_id) ? ' selected' : '';
    return `<option value="${s.entity_id}"${sel}>${escapeHtml(friendlyName(s.entity_id))} (${s.entity_id})</option>`;
  }).join('');
}

export function validatePopups() {
  const popups = state.config.eventPopups || [];
  for (let i = 0; i < popups.length; i++) {
    const p = popups[i];
    if (!p.events || !p.events.length) return `Popup rule ${i + 1} needs at least one event entity.`;
    if (!p.camera) return `Popup rule ${i + 1} needs a camera entity.`;
  }
  return '';
}

export function renderEventPopupsTab() {
  ensurePopups();
  const popups = state.config.eventPopups;
  const cards = popups.map((popup, idx) => `
    <div class="settings-section popup-rule-card" data-idx="${idx}" style="margin-bottom:14px;padding:12px;border:1px solid var(--border);">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="flex:1;font-size:0.85rem;color:var(--green);text-transform:uppercase;letter-spacing:0.1em;">Popup ${idx + 1}</span>
        <button class="btn popup-up" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn popup-down" ${idx === popups.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn popup-delete" style="color:var(--danger);">✕</button>
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">Event entities</label>
        <select class="popup-events" multiple style="width:100%;min-height:80px;">${renderMultiSelect(popup.events || [], ['event', 'binary_sensor'])}</select>
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">Camera entity</label>
        <select class="popup-camera"><option value="">-- camera --</option>${entityOptionTags(['camera'])}</select>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <input class="popup-title" type="text" value="${escapeHtml(popup.title || '')}" placeholder="Title" style="flex:1;">
        <input class="popup-timeout" type="number" value="${escapeHtml(String(popup.timeout || 30))}" placeholder="sec" style="width:80px;">
      </div>
      <button class="btn popup-test">Test popup</button>
    </div>
  `).join('');

  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0;">Event Popups</h3>
        <button class="btn" id="popup-add">Add popup</button>
      </div>
      <div id="popup-rules-list">${cards}</div>
    </div>
  `;
}

function readPopup(card) {
  const events = Array.from(card.querySelector('.popup-events').selectedOptions).map(o => o.value);
  const camera = card.querySelector('.popup-camera').value;
  const title = card.querySelector('.popup-title').value;
  const timeout = parseInt(card.querySelector('.popup-timeout').value, 10);
  return {
    events,
    camera,
    title,
    timeout: isNaN(timeout) || timeout <= 0 ? 30 : timeout,
  };
}

export function wireEventPopupsTab() {
  ensurePopups();
  const list = document.getElementById('popup-rules-list');

  list.addEventListener('change', () => {
    const cards = Array.from(list.querySelectorAll('.popup-rule-card'));
    state.config.eventPopups = cards.map(readPopup);
    const err = validatePopups();
    setSettingsStatus(err || '');
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const card = btn.closest('.popup-rule-card');
    const idx = parseInt(card.dataset.idx, 10);
    if (btn.classList.contains('popup-delete')) {
      state.config.eventPopups.splice(idx, 1);
    } else if (btn.classList.contains('popup-up') && idx > 0) {
      [state.config.eventPopups[idx - 1], state.config.eventPopups[idx]] = [state.config.eventPopups[idx], state.config.eventPopups[idx - 1]];
    } else if (btn.classList.contains('popup-down') && idx < state.config.eventPopups.length - 1) {
      [state.config.eventPopups[idx], state.config.eventPopups[idx + 1]] = [state.config.eventPopups[idx + 1], state.config.eventPopups[idx]];
    } else if (btn.classList.contains('popup-test')) {
      showEventPopup(readPopup(card));
      return;
    } else {
      return;
    }
    buildSettings();
  });

  document.getElementById('popup-add').addEventListener('click', () => {
    state.config.eventPopups.push({ events: [], camera: '', title: 'EVENT', timeout: 30 });
    buildSettings();
  });

  // Set initial selects.
  const cards = list.querySelectorAll('.popup-rule-card');
  state.config.eventPopups.forEach((popup, idx) => {
    const card = cards[idx];
    if (card) card.querySelector('.popup-camera').value = popup.camera || '';
  });
}
