// Security screen: camera grid + security controls panel builders.
// assembleColumns comes from ./index.js — runtime-only circular function ref.
import { state } from '../state.js';
import { sectionTitle } from '../utils.js';
import { effectivePanels } from '../config.js';
import { renderCameraFeed } from '../cameras.js';
import { renderTerminalPanel, renderSceneButton } from '../components/panels.js';
import { renderMetricCard } from '../components/cards.js';
import { assembleColumns } from './index.js';

export function buildSecurityPanels() {
  const cameras = (state.config.sections && state.config.sections.cameras && state.config.sections.cameras.entities) || [];
  const security = (state.config.sections && state.config.sections.security && state.config.sections.security.entities) || [];

  const cameraFeeds = cameras.map(id => renderCameraFeed(id)).join("");
  const securityCards = security.map(id => {
    const domain = id.split(".")[0];
    if (domain === "switch" || domain === "siren" || domain === "button" || domain === "script") {
      return renderSceneButton(id);
    }
    return renderMetricCard(id);
  }).join("");

  const panels = {
    cameras: `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;min-height:0;overflow:hidden;" data-panel-id="cameras">${cameraFeeds}</div>`,
    security: `<div style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;" data-panel-id="security">${renderTerminalPanel(sectionTitle("security"), `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;grid-auto-rows:1fr;height:100%;">${securityCards}</div>`, "fill")}</div>`,
  };
  return {
    panels,
    gridStyle: "display:grid;grid-template-columns:1fr;gap:14px;flex:1;min-height:0;",
    // Single column: the grid contributes no gap (one track), so the column's
    // 14px flex gap is the only gap between the camera grid and the security
    // panel — same as the .screen gap that separated them before.
    colStyles: ["display:flex;flex-direction:column;gap:14px;min-height:0;"],
  };
}

export function renderSecurityScreen() {
  const b = buildSecurityPanels();
  document.getElementById("security-screen").innerHTML = assembleColumns(b.panels,
    effectivePanels("security"), b.gridStyle, b.colStyles);
}
