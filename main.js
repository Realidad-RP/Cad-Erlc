// CAD | AYUNTAMIENTO | Los Angeles — Proceso principal de Electron
//
// Aquí vive todo lo que necesita permisos especiales:
//  - La ventana de la app
//  - El permiso de micrófono
//  - La tecla global de push-to-talk (funciona aunque estés dentro de ER:LC)
//  - El servidor de radio integrado (opcional, para alojar el radio)

const { app, BrowserWindow, session, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

let mainWindow = null;
let splashWindow = null; // pantalla de bienvenida con el escudo
let radioServer = null; // el servidor de radio, cuando esta PC lo aloja

// Tiempo mínimo que se muestra la pantalla de bienvenida (ms)
const SPLASH_MIN_MS = 2500;
let appStartedAt = 0;

// ---------------- Pantalla de bienvenida ----------------
function createSplash() {
  appStartedAt = Date.now();
  splashWindow = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0b1015',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadFile(path.join(__dirname, 'src', 'splash.html'));
  splashWindow.on('closed', () => { splashWindow = null; });
}

function closeSplashSoon() {
  const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - appStartedAt));
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
  }, wait);
}

// ---------------- Ventana principal ----------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 680,
    title: 'CAD | AYUNTAMIENTO | Los Angeles',
    icon: path.join(__dirname, 'src', 'assets', 'logo.png'),
    backgroundColor: '#0b1015',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Cuando la interfaz termina de cargar, cerramos la pantalla de bienvenida
  mainWindow.webContents.once('did-finish-load', () => closeSplashSoon());

  // Si cierran el CAD, la radio flotante también se cierra
  mainWindow.on('closed', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
  });

  // Mostrar errores de la interfaz en la consola (útil para depurar)
  mainWindow.webContents.on('console-message', (...args) => {
    let level, message, line, sourceId;
    if (args[0] && typeof args[0] === 'object' && 'message' in args[0]) {
      ({ level, message, line, sourceId } = args[0]);
    } else {
      [, level, message, line, sourceId] = args;
    }
    if (level === 3 || level === 'error') {
      console.error(`[Interfaz] ${message} (${sourceId}:${line})`);
    }
  });
}

// ---------------- Permisos (micrófono) ----------------
function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(true); // Es una app local: permitimos lo que necesite (micrófono)
  });
  // Hace que los nombres de micrófonos/parlantes estén disponibles al instante
  // (enumerateDevices) sin tener que abrir primero el micrófono.
  session.defaultSession.setPermissionCheckHandler(() => true);
}

// ---------------- Push-to-talk global ----------------
// Detecta la tecla del PTT incluso cuando la app NO tiene el foco
// (por ejemplo, mientras juegas ER:LC a pantalla completa).
//
// Usa un pequeño detector en PowerShell con GetAsyncKeyState (API de Windows).
// Se usó PowerShell en lugar de librerías externas porque son firmadas por
// Microsoft y el antivirus no las bloquea (algunas librerías de teclado son
// marcadas como "software potencialmente no deseado").
function setupGlobalPTT() {
  let available = false;
  let psProc = null;
  let pttKey = 'V';
  let mode = 'hold';
  let isDown = false;
  let lastState = 'UP';

  const sendPtt = (down) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(down ? 'ptt-down' : 'ptt-up');
    }
  };

  function handleState(now) {
    if (!now || now === lastState) return;
    lastState = now;
    console.log(`[PTT] Tecla ${now === 'DOWN' ? 'pulsada (hablando)' : 'soltada (silencio)'}`);

    if (mode === 'toggle') {
      if (now === 'DOWN') {
        isDown = !isDown;
        sendPtt(isDown);
      }
    } else {
      if (now === 'DOWN') { isDown = true; sendPtt(true); }
      else { isDown = false; sendPtt(false); }
    }
  }

  function stopListener() {
    if (psProc) {
      try { psProc.kill(); } catch {}
      psProc = null;
    }
  }

  function startListener(key) {
    stopListener();
    // Para letras A-Z, el código de tecla virtual coincide con su letra
    const vk = key.toUpperCase().charCodeAt(0);

    const script = `
Add-Type -Namespace PTT -Name Native -MemberDefinition '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);';
$vk = ${vk};
$last = $false;
while ($true) {
  $down = ([PTT.Native]::GetAsyncKeyState($vk) -band 0x8000) -ne 0;
  if ($down -ne $last) {
    if ($down) { [Console]::Out.WriteLine('DOWN') } else { [Console]::Out.WriteLine('UP') }
    [Console]::Out.Flush();
    $last = $down;
  }
  Start-Sleep -Milliseconds 40;
}
`;

    try {
      psProc = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
      );

      let buffer = '';
      psProc.stdout.on('data', (data) => {
        buffer += data.toString();
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line === 'DOWN' || line === 'UP') handleState(line);
        }
      });

      psProc.on('error', (err) => {
        console.warn('[PTT] No se pudo iniciar el detector global:', err.message);
        psProc = null;
      });
      psProc.on('exit', () => { psProc = null; });

      available = true;
      console.log(`[PTT] Detector global activo (tecla ${key}).`);
    } catch (err) {
      console.warn('[PTT] Error al iniciar el detector global:', err.message);
      psProc = null;
      available = false;
    }
  }

  ipcMain.on('ptt-config', (_e, cfg) => {
    if (cfg && typeof cfg.key === 'string') {
      const newKey = cfg.key.toUpperCase();
      if (newKey !== pttKey) {
        pttKey = newKey;
        isDown = false;
        lastState = 'UP';
        startListener(pttKey); // reiniciar el detector con la nueva tecla
      }
    }
    if (cfg && typeof cfg.mode === 'string') mode = cfg.mode;
  });

  startListener(pttKey);

  ipcMain.handle('ptt-capable', () => available);

  app.on('will-quit', stopListener);
}

// ---------------- Servidor de radio integrado ----------------
function setupRadioServerIPC() {
  ipcMain.handle('host-start', async (_e, port) => {
    if (radioServer) return { ok: true, port: radioServer.port, already: true };
    try {
      const { createRadioServer } = require('./server/radio-server');
      radioServer = await createRadioServer(port || 8787);
      console.log(`[Radio] Servidor alojado en el puerto ${radioServer.port}`);
      return { ok: true, port: radioServer.port };
    } catch (err) {
      console.error('[Radio] No se pudo alojar:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('host-stop', () => {
    if (radioServer) {
      try { radioServer.close(); } catch {}
      radioServer = null;
    }
    return { ok: true };
  });

  ipcMain.handle('host-status', () => ({
    hosting: !!radioServer,
    port: radioServer ? radioServer.port : null,
  }));

  // IPs de la red local, para indicar a los compañeros dónde conectarse
  ipcMain.handle('get-lan-ips', () => {
    const result = [];
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const info of ifaces[name] || []) {
        if (info.family === 'IPv4' && !info.internal) {
          result.push({ iface: name, ip: info.address });
        }
      }
    }
    return result;
  });
}

// ---------------- API de ER:LC (se consulta desde acá, sin CORS) ----------------
// La server-key la escribe el usuario en la pestaña 🟢 ER:LC de la app.
function setupErlcIPC() {
  ipcMain.handle('erlc-request', async (_e, payload = {}) => {
    const { serverKey, path: apiPath, method = 'GET', body = null } = payload || {};
    if (!serverKey || typeof serverKey !== 'string') {
      return { ok: false, status: 0, error: 'Falta la server-key de ER:LC.' };
    }
    if (typeof apiPath !== 'string' || !apiPath.startsWith('/')) {
      return { ok: false, status: 0, error: 'Ruta inválida.' };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch('https://api.erlc.gg' + apiPath, {
        method,
        headers: {
          'server-key': serverKey,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      let data = null;
      try { data = await res.json(); } catch {}
      return {
        ok: res.ok,
        status: res.status,
        data,
        retryAfter: parseInt(res.headers.get('retry-after') || '0', 10) || 0,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: err && err.name === 'AbortError'
          ? 'Se agotó el tiempo de espera. ¿Tenés internet?'
          : String((err && err.message) || err),
      };
    } finally {
      clearTimeout(timer);
    }
  });
}

// ---------------- Tecla global de pánico ----------------
// Dispara el pánico aunque la app esté minimizada o jugando ER:LC a pantalla
// completa (registro de atajos globales de Windows).
function setupGlobalPanic() {
  let panicKey = 'F8';

  const apply = () => {
    try { globalShortcut.unregisterAll(); } catch {}
    if (!panicKey) {
      console.log('[Pánico] Tecla global desactivada.');
      return;
    }
    try {
      const ok = globalShortcut.register(panicKey, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('panic-hotkey');
          mainWindow.flashFrame(true); // destella el ícono para avisar que salió la alerta
          mainWindow.once('focus', () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false);
          });
        }
      });
      if (ok) console.log(`[Pánico] Tecla global lista: ${panicKey}`);
      else console.warn(`[Pánico] No se pudo registrar la tecla ${panicKey} (¿la usa otro programa?).`);
    } catch (err) {
      console.warn('[Pánico] Error al registrar la tecla:', err.message);
    }
  };

  ipcMain.on('panic-config', (_e, cfg) => {
    if (cfg && typeof cfg.key === 'string') {
      panicKey = cfg.key;
      apply();
    }
  });

  apply();
}

// ---------------- Radio flotante sobre el juego (overlay) ----------------
// Es una ventanita siempre-encima que muestra el estado de la radio mientras
// jugás ER:LC (como el overlay de Sonoran Radio). La maneja la interfaz.
let overlayWindow = null;
let lastOverlayState = null;

function createOverlayWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 320;
  const height = 158;
  overlayWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + 24,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    title: 'Radio de voz',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'src', 'overlay.html'));
  overlayWindow.webContents.once('did-finish-load', () => {
    if (lastOverlayState && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay-state', lastOverlayState);
    }
  });
  overlayWindow.on('closed', () => { overlayWindow = null; });
  return overlayWindow;
}

function setupOverlayIPC() {
  ipcMain.on('overlay-state', (_e, state) => {
    lastOverlayState = state || null;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay-state', lastOverlayState);
    }
  });

  ipcMain.handle('overlay-toggle', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      createOverlayWindow();
      return { ok: true, visible: true };
    }
    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
      return { ok: true, visible: false };
    }
    overlayWindow.showInactive();
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    return { ok: true, visible: true };
  });

  ipcMain.on('overlay-hide', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
  });

  ipcMain.on('overlay-open-cad', () => {
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ---------------- Ciclo de vida de la app ----------------
app.whenReady().then(() => {
  setupPermissions();
  setupGlobalPTT();
  setupGlobalPanic();
  setupRadioServerIPC();
  setupErlcIPC();
  setupOverlayIPC();
  createSplash();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
  if (radioServer) {
    try { radioServer.close(); } catch {}
  }
});
