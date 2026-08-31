// Window shim: inline handler strings in generated HTML (onclick="toggleEntity(...)" etc.)
// call bare global names. ES modules create no globals, so attach the entry points here.
// When a function is later extracted to its own module, update its import below.
import {
  openSettings, closeSettings, saveSettings, exportConfig, importConfig, logout,
  switchSettingsTab, setEditorScreen,
} from './settings/editor.js';
import { addLabelOverride, removeLabelOverride, setLabelOverride } from './settings/labels.js';
import { removeMissingEntity } from './settings/layout.js';
import { showScreen } from './screens/index.js';
import { streamFeedFallback } from './cameras.js';
import { toggleEntity, mediaCmd, setBrightness, setColorTemp } from './api.js';
import {
  openLightModal, closeLightModal, lightPressStart, lightPressMove, lightPressEnd, lightPressCancel, lightWheelPick,
} from './components/light-modal.js';
import { openPrinterModal, closePrinterModal, pressPrinterButton } from './components/printer-modal.js';
import { openSnapshotHistory, closeSnapshotHistory, stepSnapshotHistory } from './components/snapshot-viewer.js';

Object.assign(window, {
  toggleEntity, mediaCmd, setBrightness, setColorTemp,
  showScreen,
  openLightModal, closeLightModal, lightPressStart, lightPressMove, lightPressEnd, lightPressCancel, lightWheelPick,
  openPrinterModal, closePrinterModal, pressPrinterButton,
  openSnapshotHistory, closeSnapshotHistory, stepSnapshotHistory,
  streamFeedFallback,
  openSettings, closeSettings, saveSettings, exportConfig, importConfig, logout,
  switchSettingsTab, setEditorScreen,
  addLabelOverride, removeLabelOverride, setLabelOverride, removeMissingEntity,
});
