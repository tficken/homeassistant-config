// Appearance tab of the settings editor: accent color, 24-hour clock, and the
// weather/media-player entity pickers.
import { state } from '../state.js';
import { entityOptionTags } from './editor.js';

export function renderAppearanceTab() {
  return `
    <div class="settings-section" style="margin-bottom:22px;"><h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">Appearance</h3>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">Accent color</label><input id="cfg-accent" type="color" value="${state.config.theme.accentColor}"></div>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">24-hour clock</label><input id="cfg-24h" type="checkbox" ${state.config.layout.clock24h ? "checked" : ""}></div>
    </div>
    <div class="settings-section" style="margin-bottom:22px;"><h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">Layout</h3>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">Weather entity</label><select id="cfg-weather"><option value="">-- none --</option>${entityOptionTags(["weather"])}</select></div>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">Media player</label><select id="cfg-media"><option value="">-- none --</option>${entityOptionTags(["media_player"])}</select></div>
    </div>
  `;
}

export function wireAppearanceTab() {
  document.getElementById("cfg-weather").value = state.config.entities.weather || "";
  document.getElementById("cfg-media").value = state.config.entities.mediaPlayer || "";
}
