// Puente seguro entre la interfaz (la página) y el sistema (Electron).
// Solo se expone lo necesario, de forma controlada (contextIsolation).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cadNative', {
  // ---- Push-to-talk global ----
  onPttDown: (cb) => ipcRenderer.on('ptt-down', () => cb()),
  onPttUp: (cb) => ipcRenderer.on('ptt-up', () => cb()),
  setPttConfig: (cfg) => ipcRenderer.send('ptt-config', cfg),
  pttCapable: () => ipcRenderer.invoke('ptt-capable'),

  // ---- Tecla global de pánico (funciona con la ventana minimizada) ----
  setPanicConfig: (cfg) => ipcRenderer.send('panic-config', cfg),
  onPanicHotkey: (cb) => ipcRenderer.on('panic-hotkey', () => cb()),

  // ---- Servidor de radio integrado ----
  hostStart: (port) => ipcRenderer.invoke('host-start', port),
  hostStop: () => ipcRenderer.invoke('host-stop'),
  hostStatus: () => ipcRenderer.invoke('host-status'),
  getLanIps: () => ipcRenderer.invoke('get-lan-ips'),

  // ---- API oficial de ER:LC (servidor en vivo) ----
  erlcRequest: (payload) => ipcRenderer.invoke('erlc-request', payload),

  // ---- Radio flotante sobre el juego (overlay) ----
  overlayToggle: () => ipcRenderer.invoke('overlay-toggle'),
  overlaySend: (state) => ipcRenderer.send('overlay-state', state),
  overlayHide: () => ipcRenderer.send('overlay-hide'),
  onOverlayState: (cb) => ipcRenderer.on('overlay-state', (_e, state) => cb(state)),
  overlayCollapse: (collapsed) => ipcRenderer.invoke('overlay-collapse', { collapsed: !!collapsed }),
  onOverlayCollapsed: (cb) => ipcRenderer.on('overlay-collapsed', (_e, data) => cb(data)),
  overlayPanic: (data) => ipcRenderer.send('overlay-panic', data),
  overlayPanicClear: () => ipcRenderer.send('overlay-panic-clear'),
  overlayChannel: (data) => ipcRenderer.send('overlay-channel', data),
  onOverlayPanic: (cb) => ipcRenderer.on('overlay-panic', (_e, data) => cb(data)),
  onOverlayPanicClear: (cb) => ipcRenderer.on('overlay-panic-clear', () => cb()),
  onOverlayChannel: (cb) => ipcRenderer.on('overlay-channel', (_e, data) => cb(data)),
});
