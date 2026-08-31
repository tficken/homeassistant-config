// Data tab of the settings editor: config persistence notes, JSON
// export/import, and the token-clearing logout button. Pure template — the
// actions themselves live in ./editor.js.
export function renderDataTab() {
  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <p style="color:var(--text-muted);font-size:0.85rem;">Settings are saved to <code>config.json</code> on the server when you press Save &amp; Apply, and shared by every device that opens this dashboard. Export keeps a local backup file.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <button class="btn" onclick="exportConfig()">Export JSON</button>
        <button class="btn" onclick="importConfig()">Import JSON</button>
      </div>
      <button class="btn" onclick="logout()" style="background:rgba(248,113,113,0.15);border-color:rgba(248,113,113,0.3);">Clear token &amp; reload</button>
    </div>
  `;
}
