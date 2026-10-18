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
});
