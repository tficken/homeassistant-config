// Window shim: inline handler strings in generated HTML (onclick="toggleEntity(...)" etc.)
// call bare global names. ES modules create no globals, so attach the entry points here.
// When a function is later extracted to its own module, update its import below.
import {
  showScreen,
  streamFeedFallback,
  openSettings, closeSettings, saveSettings, exportConfig, importConfig, logout,
  switchSettingsTab, setEditorScreen,
  addLabelOverride, removeLabelOverride, setLabelOverride, removeMissingEntity,
} from './main.js';
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
