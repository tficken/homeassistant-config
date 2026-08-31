// Window shim: inline handler strings in generated HTML (onclick="toggleEntity(...)" etc.)
// call bare global names. ES modules create no globals, so attach the entry points here.
// When a function is later extracted to its own module, update its import below.
import {
  toggleEntity, mediaCmd, setBrightness, setColorTemp,
  showScreen,
  openLightModal, closeLightModal, lightPressStart, lightPressEnd, lightPressCancel, lightWheelPick,
  openPrinterModal, closePrinterModal, pressPrinterButton,
  closeSnapshotHistory, stepSnapshotHistory,
  streamFeedFallback,
  openSettings, closeSettings, saveSettings, exportConfig, importConfig, logout,
  switchSettingsTab, setEditorScreen,
  addLabelOverride, removeLabelOverride, setLabelOverride, removeMissingEntity,
} from './main.js';

Object.assign(window, {
  toggleEntity, mediaCmd, setBrightness, setColorTemp,
  showScreen,
  openLightModal, closeLightModal, lightPressStart, lightPressEnd, lightPressCancel, lightWheelPick,
  openPrinterModal, closePrinterModal, pressPrinterButton,
  closeSnapshotHistory, stepSnapshotHistory,
  streamFeedFallback,
  openSettings, closeSettings, saveSettings, exportConfig, importConfig, logout,
  switchSettingsTab, setEditorScreen,
  addLabelOverride, removeLabelOverride, setLabelOverride, removeMissingEntity,
});
