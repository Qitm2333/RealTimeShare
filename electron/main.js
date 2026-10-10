const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const path = require('path');
const { createFirewallAccess } = require('./firewall');

let port = Number(process.env.PORT || 3000);
const firstPort = port;
const lastPort = firstPort + 20;
let appUrl = `http://127.0.0.1:${port}`;
let serverProcess = null;
let startWindow = null;
let overlayWindow = null;
let toolbarWindow = null;
let qrWindow = null;
let selectedDisplayId = null;
let toolbarContentHeight = 80;
let toolbarExpanded = true;
let toolsOpen = false;
let toolbarHideTimer = null;
let cursorWatchTimer = null;
let topmostGuardTimer = null;
let qrExpanded = false;
let qrEditing = false;
let lotteryVisible = false;
let quitting = false;
let shutdownFinished = false;
let startingInteraction = false;
let stoppingInteraction = false;
const sessionToken = crypto.randomBytes(24).toString('hex');

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

function requestServer(expectedPid) {
  return new Promise((resolve) => {
    const request = http.get(`${appUrl}/api/desktop-health`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(response.statusCode === 200 && data.service === 'realtime-share' && data.pid === expectedPid);
        } catch (_error) {
          resolve(false);
        }
      });
    });
    request.setTimeout(800, () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

function canListen(candidatePort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(candidatePort, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function selectAvailablePort() {
  if (await canListen(port)) return;
  for (let candidate = port + 1; candidate <= port + 20; candidate += 1) {
    if (await canListen(candidate)) {
      port = candidate;
      appUrl = `http://127.0.0.1:${port}`;
      return;
    }
  }
  throw new Error(`No available local port found near ${port}`);
}

async function startServer(listenHost) {
  if (quitting) throw new Error('Application is quitting');
  const appRoot = path.join(__dirname, '..');
  const serverPath = path.join(appRoot, 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    cwd: app.isPackaged ? path.dirname(process.execPath) : appRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: path.join(app.getPath('userData'), 'data'),
      LISTEN_HOST: listenHost,
      SESSION_TOKEN: sessionToken,
      ELECTRON_RUN_AS_NODE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true
  });
  serverProcess = child;

  child.stdout?.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  let spawnError;
  child.once('error', (error) => { spawnError = error; });

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (quitting) throw new Error('Application is quitting');
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Interaction server exited');
    if (await requestServer(child.pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Interaction server did not start on port ${port}`);
}

async function ensureServer() {
  await selectAvailablePort();
  await startServer('127.0.0.1');
}

function stopServer() {
  return new Promise((resolve, reject) => {
    if (!serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
      serverProcess = null;
      resolve();
      return;
    }
    const processToStop = serverProcess;
    let timeout;
    let killTimeout;
    const finish = () => {
      clearTimeout(timeout);
      clearTimeout(killTimeout);
      if (serverProcess === processToStop) serverProcess = null;
      resolve();
    };
    processToStop.once('exit', finish);
    timeout = setTimeout(() => {
      processToStop.removeListener('exit', finish);
      reject(new Error('Interaction server did not stop'));
    }, 3000);
    try {
      if (processToStop.connected) {
        killTimeout = setTimeout(() => processToStop.kill(), 2000);
        processToStop.send({ type: 'desktop:shutdown' }, (error) => {
          if (error && processToStop.exitCode === null && processToStop.signalCode === null) processToStop.kill();
        });
      } else {
        processToStop.kill();
      }
    } catch (error) {
      clearTimeout(timeout);
      clearTimeout(killTimeout);
      processToStop.removeListener('exit', finish);
      reject(error);
    }
  });
}

function runPowerShell(command, elevated = false) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    const invocation = elevated
      ? `$ErrorActionPreference = 'Stop'; try { $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'); exit $process.ExitCode } catch { exit 1 }`
      : command;
    const invocationEncoded = Buffer.from(invocation, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', invocationEncoded], {
      windowsHide: true,
      stdio: 'ignore'
    });
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}

const ensureFirewallAccess = createFirewallAccess({
  platform: process.platform,
  packaged: app.isPackaged,
  executable: process.execPath,
  firstPort,
  lastPort,
  runPowerShell
});

async function enableLanServer() {
  if (!await ensureFirewallAccess()) return false;
  if (quitting) return false;
  await stopServer();
  try {
    await startServer('0.0.0.0');
    return true;
  } catch (error) {
    try {
      await stopServer();
      await startServer('127.0.0.1');
    } catch (fallbackError) {
      console.error(fallbackError);
    }
    console.error(error);
    return false;
  }
}

function windowOptions(overrides = {}) {
  return {
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    },
    ...overrides
  };
}

function getSelectedDisplay() {
  const displays = screen.getAllDisplays();
  return displays.find((display) => String(display.id) === String(selectedDisplayId)) || screen.getPrimaryDisplay();
}

function keepOnTop(win) {
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function restoreInteractionZOrder() {
  const baseOrder = [overlayWindow, toolbarWindow, qrWindow];
  const visibleWindows = baseOrder.filter((win) => win && !win.isDestroyed() && win.isVisible());

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const display = getSelectedDisplay();
    const currentBounds = overlayWindow.getBounds();
    const expectedBounds = display.bounds;
    if (currentBounds.x !== expectedBounds.x
      || currentBounds.y !== expectedBounds.y
      || currentBounds.width !== expectedBounds.width
      || currentBounds.height !== expectedBounds.height) {
      overlayWindow.setBounds(expectedBounds, false);
    }
  }

  visibleWindows.forEach((win) => {
    if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver', 1);
  });
  if (lotteryVisible) return;
  // Native <select> popups temporarily take focus. Moving the owner window
  // above other windows while the popup is open makes Windows close it
  // immediately, so keep the current z-order until the tools are closed.
  if (toolsOpen) return;
  visibleWindows.forEach((win) => win.moveTop());
}

function startTopmostGuard() {
  clearInterval(topmostGuardTimer);
  restoreInteractionZOrder();
  topmostGuardTimer = setInterval(restoreInteractionZOrder, 250);
}

function createStartWindow(loading = false) {
  startWindow = new BrowserWindow({
    width: 680,
    height: 500,
    minWidth: 620,
    minHeight: 460,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    maximizable: false,
    hasShadow: true,
    title: 'Torras Live Interaction',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (loading) {
    startWindow.loadFile(path.join(__dirname, '..', 'public', 'desktop-loading.html'));
  } else {
    startWindow.loadURL(`${appUrl}/desktop-start`);
  }
  startWindow.once('ready-to-show', () => startWindow?.show());
  startWindow.on('closed', () => {
    startWindow = null;
    if (!overlayWindow && !quitting) app.quit();
  });
}

function createOverlayWindow(display) {
  overlayWindow = new BrowserWindow(windowOptions({
    ...display.bounds,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false
  }));
  overlayWindow.setIgnoreMouseEvents(true);
  keepOnTop(overlayWindow);
  overlayWindow.loadURL(`${appUrl}/presenter?desktop=overlay`);
  overlayWindow.webContents.once('did-finish-load', () => {
    overlayWindow?.webContents.send('desktop:toolbar-visibility', toolbarExpanded);
  });
  overlayWindow.once('ready-to-show', () => overlayWindow?.showInactive());
  overlayWindow.on('closed', () => { overlayWindow = null; });
}

function setToolbarBounds(expanded) {
  if (!toolbarWindow || toolbarWindow.isDestroyed()) return;
  const display = getSelectedDisplay();
  toolbarExpanded = Boolean(expanded) || toolsOpen;

  if (!toolbarExpanded) {
    toolbarWindow.hide();
    overlayWindow?.webContents.send('desktop:toolbar-visibility', false);
    return;
  }

  const height = toolsOpen
    ? display.bounds.height
    : Math.min(190, Math.max(64, toolbarContentHeight));
  toolbarWindow.setBounds({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height
  }, false);
  if (!toolbarWindow.isVisible()) toolbarWindow.showInactive();
  toolbarWindow.moveTop();
  overlayWindow?.webContents.send('desktop:toolbar-visibility', true);
  if (lotteryVisible) overlayWindow?.moveTop();
}

function scheduleToolbarCollapse() {
  if (toolbarHideTimer || toolsOpen) return;
  toolbarHideTimer = setTimeout(() => {
    toolbarHideTimer = null;
    const display = getSelectedDisplay();
    const cursor = screen.getCursorScreenPoint();
    const withinToolbar = cursor.x >= display.bounds.x
      && cursor.x < display.bounds.x + display.bounds.width
      && cursor.y >= display.bounds.y
      && cursor.y < display.bounds.y + Math.max(toolbarContentHeight, 90);
    if (!withinToolbar) setToolbarBounds(false);
  }, 1500);
}

function startCursorWatch() {
  clearInterval(cursorWatchTimer);
  cursorWatchTimer = setInterval(() => {
    if (!toolbarWindow || toolbarWindow.isDestroyed() || toolsOpen) return;
    const display = getSelectedDisplay();
    const cursor = screen.getCursorScreenPoint();
    const onSelectedDisplay = cursor.x >= display.bounds.x
      && cursor.x < display.bounds.x + display.bounds.width
      && cursor.y >= display.bounds.y
      && cursor.y < display.bounds.y + display.bounds.height;
    if (!onSelectedDisplay) return;
    const atTopLeft = cursor.x <= display.bounds.x + 12 && cursor.y <= display.bounds.y + 12;
    if (atTopLeft) {
      if (!toolbarExpanded) setToolbarBounds(true);
      scheduleToolbarCollapse();
    } else if (toolbarExpanded && cursor.y > display.bounds.y + Math.max(toolbarContentHeight, 90)) {
      scheduleToolbarCollapse();
    }
  }, 120);
}

function createToolbarWindow(display) {
  toolbarWindow = new BrowserWindow(windowOptions({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: toolbarContentHeight,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false
  }));
  keepOnTop(toolbarWindow);
  toolbarWindow.loadURL(`${appUrl}/presenter?desktop=toolbar`);
  toolbarWindow.once('ready-to-show', () => {
    toolbarWindow?.show();
    setToolbarBounds(true);
    scheduleToolbarCollapse();
  });
  toolbarWindow.on('closed', () => { toolbarWindow = null; });
  startCursorWatch();
}

function setQrBounds(expanded, editing = qrEditing) {
  if (!qrWindow || qrWindow.isDestroyed()) return;
  const display = getSelectedDisplay();
  qrExpanded = Boolean(expanded);
  qrEditing = qrExpanded && Boolean(editing);
  const width = qrExpanded ? (qrEditing ? 380 : 204) : 148;
  const height = qrExpanded ? (qrEditing ? 380 : 204) : 54;
  const right = 24;
  const bottom = 16;
  const workAreaRight = display.workArea.x + display.workArea.width;
  const workAreaBottom = display.workArea.y + display.workArea.height;
  qrWindow.setBounds({
    x: workAreaRight - width - right,
    y: workAreaBottom - height - bottom,
    width,
    height
  }, false);
  qrWindow.moveTop();
  if (lotteryVisible) overlayWindow?.moveTop();
}

function createQrWindow(display) {
  qrWindow = new BrowserWindow(windowOptions({
    width: 148,
    height: 54,
    x: display.bounds.x + display.bounds.width - 172,
    y: display.bounds.y + display.bounds.height - 152,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false
  }));
  keepOnTop(qrWindow);
  qrWindow.loadURL(`${appUrl}/presenter?desktop=qr`);
  qrWindow.once('ready-to-show', () => {
    qrWindow?.show();
    setQrBounds(false);
  });
  qrWindow.on('closed', () => { qrWindow = null; });
}

function closeInteractionWindows() {
  clearTimeout(toolbarHideTimer);
  clearInterval(cursorWatchTimer);
  clearInterval(topmostGuardTimer);
  toolbarHideTimer = null;
  cursorWatchTimer = null;
  topmostGuardTimer = null;
  toolsOpen = false;
  qrExpanded = false;
  qrEditing = false;
  lotteryVisible = false;
  for (const win of [qrWindow, toolbarWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) win.destroy();
  }
  qrWindow = null;
  toolbarWindow = null;
  overlayWindow = null;
}

function startInteraction(displayId) {
  selectedDisplayId = displayId;
  closeInteractionWindows();
  const display = getSelectedDisplay();
  createOverlayWindow(display);
  createToolbarWindow(display);
  createQrWindow(display);
  startTopmostGuard();
  startWindow?.hide();
}

async function stopInteraction() {
  closeInteractionWindows();
  try {
    await stopServer();
    await startServer('127.0.0.1');
  } catch (error) {
    if (!quitting) {
      console.error(error);
      dialog.showErrorBox('互动服务启动失败', '无法返回启动界面，请重新打开应用');
      app.quit();
    }
    return;
  }
  if (quitting) return;
  if (!startWindow || startWindow.isDestroyed()) createStartWindow();
  else {
    startWindow.webContents.reloadIgnoringCache();
    startWindow.show();
    startWindow.focus();
  }
}

function syncWindowsToDisplay() {
  if (!overlayWindow && !toolbarWindow && !qrWindow) return;
  const display = getSelectedDisplay();
  overlayWindow?.setBounds(display.bounds, false);
  setToolbarBounds(toolbarExpanded);
  setQrBounds(qrExpanded);
}

ipcMain.handle('desktop:list-displays', () => screen.getAllDisplays().map((display, index) => ({
  id: String(display.id),
  label: display.label || `显示器 ${index + 1}`,
  primary: display.id === screen.getPrimaryDisplay().id,
  bounds: display.bounds,
  workArea: display.workArea,
  scaleFactor: display.scaleFactor
})));

ipcMain.handle('desktop:start', async (_event, displayId) => {
  if (startingInteraction || stoppingInteraction || overlayWindow || quitting) return { ok: false, error: 'desktop' };
  startingInteraction = true;
  try {
    if (!await enableLanServer() || quitting) return { ok: false, error: 'lan-access' };
    startInteraction(String(displayId));
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'lan-access' };
  } finally {
    startingInteraction = false;
  }
});

ipcMain.handle('desktop:stop', async () => {
  if (startingInteraction || stoppingInteraction || quitting) return { ok: false };
  stoppingInteraction = true;
  try {
    await stopInteraction();
    return { ok: !quitting };
  } finally {
    stoppingInteraction = false;
  }
});

ipcMain.handle('desktop:minimize', () => {
  if (startWindow && !startWindow.isDestroyed()) startWindow.minimize();
  return { ok: true };
});

ipcMain.handle('desktop:quit', () => app.quit());

ipcMain.on('desktop:tools-open', (_event, open) => {
  toolsOpen = Boolean(open);
  setToolbarBounds(true);
  if (toolsOpen && qrWindow && !qrWindow.isDestroyed()) qrWindow.moveTop();
  if (lotteryVisible) overlayWindow?.moveTop();
  if (!toolsOpen) scheduleToolbarCollapse();
});

ipcMain.on('desktop:qr-expanded', (_event, expanded) => setQrBounds(expanded));

ipcMain.on('desktop:qr-editing', (_event, editing) => {
  if (qrExpanded) setQrBounds(true, editing);
});

ipcMain.on('desktop:lottery-visible', (_event, visible) => {
  lotteryVisible = Boolean(visible);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(!lotteryVisible);
  }
  if (lotteryVisible) {
    overlayWindow?.moveTop();
    return;
  }
  toolbarWindow?.moveTop();
  qrWindow?.moveTop();
});

ipcMain.on('desktop:toolbar-height', (_event, height) => {
  if (!Number.isFinite(height)) return;
  toolbarContentHeight = Math.min(190, Math.max(64, Math.ceil(height)));
  if (toolbarExpanded && !toolsOpen) setToolbarBounds(true);
});

app.whenReady().then(async () => {
  createStartWindow(true);
  try {
    await ensureServer();
    if (!startWindow || startWindow.isDestroyed()) return;
    await startWindow.loadURL(`${appUrl}/desktop-start`);
    screen.on('display-added', syncWindowsToDisplay);
    screen.on('display-removed', syncWindowsToDisplay);
    screen.on('display-metrics-changed', syncWindowsToDisplay);
    app.on('browser-window-blur', () => {
      if (overlayWindow || toolbarWindow || qrWindow) setTimeout(restoreInteractionZOrder, 50);
    });
  } catch (error) {
    console.error(error);
    dialog.showErrorBox('互动服务启动失败', error.message || '无法启动本地互动服务');
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (shutdownFinished) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  closeInteractionWindows();
  stopServer().catch((error) => {
    console.error(error);
    if (serverProcess && !serverProcess.killed) serverProcess.kill();
  }).finally(() => {
    shutdownFinished = true;
    app.quit();
  });
});

app.on('window-all-closed', () => app.quit());
