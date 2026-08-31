// Control Hub screen: scenes/scripts/quick-controls/media panel builders.
// assembleColumns comes from ./index.js — runtime-only circular function ref.
import { state } from '../state.js';
import { sectionTitle } from '../utils.js';
import { effectivePanels } from '../config.js';
import { renderTerminalPanel, renderSceneButton } from '../components/panels.js';
import { renderLightCard, renderSwitchCard, renderMediaCard } from '../components/cards.js';
import { assembleColumns } from './index.js';

export function buildControlPanels() {
  const scenes = (state.config.sections && state.config.sections.scenes && state.config.sections.scenes.entities) || [];
  const scripts = (state.config.sections && state.config.sections.scripts && state.config.sections.scripts.entities) || [];
  const quick = (state.config.sections && state.config.sections.quickControls && state.config.sections.quickControls.entities) || [];
  const mediaId = state.config.entities.mediaPlayer || "media_player.living_room_fire_tv_living_room";

  const sceneButtons = scenes.map(id => renderSceneButton(id)).join("");
  const scriptButtons = scripts.map(id => renderSceneButton(id)).join("");
  const lightIds = quick.filter(id => id.startsWith("light."));
  const switchIds = quick.filter(id => id.startsWith("switch."));
  const lightCards = lightIds.map(id => renderLightCard(id)).join("");
  const switchCards = switchIds.map(id => renderSwitchCard(id)).join("");
  // Light tiles sit side by side in an auto-filling grid; switches keep the
  // full-width row layout below.
  const controlCards = (lightCards ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;align-content:start;">${lightCards}</div>` : "") + switchCards;

  const panels = {
    scenes: renderTerminalPanel(sectionTitle("scenes"), `<div class="stretch-btns" style="display:flex;flex-direction:column;gap:10px;height:100%;">${sceneButtons || "<div style='color:var(--text-muted)'>NO SCENES</div>"}</div>`, "fill", 'data-panel-id="scenes"'),
    quickControls: `<div style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;" data-panel-id="quickControls">${renderTerminalPanel(sectionTitle("quickControls"), `<div class="stretch-cards" style="display:flex;flex-direction:column;gap:10px;height:100%;">${controlCards || "<div style='color:var(--text-muted)'>NO CONTROLS</div>"}</div>`, "fill")}</div>`,
    media: `<div style="flex-shrink:0;" data-panel-id="media">${renderMediaCard(mediaId)}</div>`,
    scripts: renderTerminalPanel(sectionTitle("scripts"), `<div style="display:grid;grid-template-columns:1fr;gap:10px;">${scriptButtons || "<div style='color:var(--text-muted)'>NO SCRIPTS</div>"}</div>`, "", 'data-panel-id="scripts"'),
  };
  return {
    panels,
    gridStyle: "display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:14px;flex:1;min-height:0;",
    colStyles: [
      "display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;",
      "display:flex;flex-direction:column;gap:10px;min-height:0;",
      "display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;",
    ],
  };
}

export function renderControlScreen() {
  const b = buildControlPanels();
  document.getElementById("control-screen").innerHTML = assembleColumns(b.panels,
    effectivePanels("control"), b.gridStyle, b.colStyles);
}
