'use strict';

/**
 * launcher/main.js — Electron main process for KunekAgent.
 *
 * Creates two browser windows:
 *   lockWin   — full-screen, always-on-top, frameless lock screen
 *   widgetWin — small transparent floating widget (bottom-right corner)
 *
 * Connects to the Node service via named pipe \\.\pipe\KunekAgent and routes
 * IPC messages to the appropriate renderer:
 *
 *   LOCK           → show lockWin, hide widgetWin, send 'enter-idle' to lockWin
 *   UNLOCK         → hide lockWin, show widgetWin
 *   SESSION_UPDATE → widgetWin ← 'session-update'
 *   TIMER_TICK     → widgetWin ← 'timer-tick'
 *   WARNING        → widgetWin ← 'warning'  (also lockWin if locked)
 *   SESSION_EXPIRED→ widgetWin ← 'session-cleared', then LOCK
 */

const { app, BrowserWindow, screen, globalShortcut, Menu, Tray, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const fs = require('fs');

const PIPE_NAME = '\\\\.\\pipe\\KunekAgent';
const CONFIG_PATH = 'C:\\ProgramData\\KunekAgent\\config.json';
const RECONNECT_DELAY_MS = 2000;

let lockWin = null;
let widgetWin = null;
let tray = null;
let pipeClient = null;
let isLocked = true;
let config = {};

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('[main] Failed to load config:', err.message);
  }
}

function createLockWindow() {
  console.log('[main] Creating lock window...');
  lockWin = new BrowserWindow({
    fullscreen: true,
    alwaysOnTop: true,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  lockWin.loadFile(path.join(__dirname, 'renderer', 'lock.html'));

  lockWin.webContents.once('did-finish-load', () => {
    console.log('[main] Lock window loaded');
    lockWin.webContents.send('init', {
      videoPath: config.videoBackgroundPath || '',
      stationId: config.stationId || '',
      inactivityMs: 30_000,
    });
  });

  // Prevent Alt+F4 / close attempts
  lockWin.on('close', (e) => {
    if (isLocked) e.preventDefault();
  });
}

function createWidgetWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  console.log('[main] Creating widget window...');
  widgetWin = new BrowserWindow({
    width: 280,
    height: 90,
    x: width - 296,
    y: height - 106,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widgetWin.loadFile(path.join(__dirname, 'renderer', 'widget.html'));

  widgetWin.webContents.once('did-finish-load', () => {
    console.log('[main] Widget window loaded');
    widgetWin.webContents.send('init', {});
  });

  widgetWin.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      widgetWin.hide();
    }
    return false;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'ui', 'tray-icon.png');
  const fallbackIcon = path.join(__dirname, 'node_modules', 'app-builder-lib', 'templates', 'icons', 'electron-linux', '32x32.png');

  let finalIcon = null;
  if (fs.existsSync(iconPath)) {
    finalIcon = iconPath;
  } else if (fs.existsSync(fallbackIcon)) {
    console.warn('[main] Tray icon missing, using fallback:', fallbackIcon);
    finalIcon = fallbackIcon;
  }

  if (!finalIcon) {
    console.warn('[main] No tray icon or fallback found. Skipping tray.');
    return;
  }

  tray = new Tray(finalIcon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Timer', click: () => { if (widgetWin && !isLocked) widgetWin.show(); } },
    { type: 'separator' },
    { label: 'Exit (Dev)', click: () => { app.isQuitting = true; app.quit(); }, visible: process.env.KUNEK_DEV === '1' }
  ]);

  tray.setToolTip('Kunek Agent');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (widgetWin && !isLocked) {
      if (widgetWin.isVisible()) widgetWin.hide();
      else widgetWin.show();
    }
  });
}

// ─── Lock / Unlock helpers ────────────────────────────────────────────────────

function lock() {
  console.log('[main] Action: LOCK');
  isLocked = true;
  if (lockWin) {
    lockWin.show();
    lockWin.setAlwaysOnTop(true, 'screen-saver');
    lockWin.webContents.send('enter-idle');
  }
  if (widgetWin) { widgetWin.hide(); }
}

function unlock() {
  console.log('[main] Action: UNLOCK');
  isLocked = false;
  if (lockWin) { lockWin.hide(); }
  if (widgetWin) { widgetWin.show(); }
}

// ─── Named pipe connection ────────────────────────────────────────────────────

let _msgBuffer = '';

function connectToPipe() {
  const client = net.createConnection(PIPE_NAME);

  client.on('connect', () => {
    console.log('[main] Connected to KunekAgent service pipe');
    pipeClient = client;
  });

  client.on('data', (chunk) => {
    _msgBuffer += chunk.toString();

    // Messages are newline-delimited JSON
    let nl;
    while ((nl = _msgBuffer.indexOf('\n')) !== -1) {
      const raw = _msgBuffer.slice(0, nl).trim();
      _msgBuffer = _msgBuffer.slice(nl + 1);
      if (raw) handleServiceMessage(JSON.parse(raw));
    }
  });

  client.on('close', () => {
    console.log('[main] Pipe disconnected — reconnecting in', RECONNECT_DELAY_MS, 'ms');
    pipeClient = null;
    setTimeout(connectToPipe, RECONNECT_DELAY_MS);
  });

  client.on('error', (err) => {
    // Service not ready yet — will retry via 'close'
    if (err.code !== 'ENOENT' && err.code !== 'ECONNREFUSED') {
      console.error('[main] Pipe error:', err.message);
    }
  });
}

// ─── Route service → renderer ─────────────────────────────────────────────────

function send(win, channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function handleServiceMessage(msg) {
  const { type, payload } = msg;
  console.log('[main] IPC ←', type);

  switch (type) {
    case 'LOCK':
      lock();
      break;

    case 'UNLOCK':
      unlock();
      break;

    case 'SESSION_UPDATE':
      send(widgetWin, 'session-update', payload?.session);
      break;

    case 'TIMER_TICK':
      send(widgetWin, 'timer-tick', payload);
      break;

    case 'WARNING':
      send(widgetWin, 'warning', payload);
      if (isLocked) send(lockWin, 'warning', payload);
      break;

    case 'SESSION_EXPIRED':
      send(widgetWin, 'session-cleared', {});
      lock();
      break;

    case 'LOGIN_RESPONSE':
    case 'PASSWORD_CHANGE_RESPONSE':
      send(lockWin, type, payload);
      break;

    default:
      console.warn('[main] Unknown IPC type:', type);
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.on('ready', () => {
  loadConfig();
  createLockWindow();
  createWidgetWindow();
  createTray();
  lock();               // start locked
  connectToPipe();

  ipcMain.on('minimize-widget', () => {
    if (widgetWin) widgetWin.hide();
  });

  // Dev-only escape hatch: Ctrl+Shift+D quits the launcher
  // In production (KUNEK_DEV not set) this shortcut is never registered.
  if (process.env.KUNEK_DEV === '1') {
    globalShortcut.register('CommandOrControl+Shift+D', () => {
      console.log('[dev] Ctrl+Shift+D — quitting launcher');
      app.isQuitting = true;
      app.exit(0);
    });
  }

  // Member Login Pipe
  const routeToPipe = (type, payload) => {
    if (pipeClient) {
      pipeClient.write(JSON.stringify({ type, payload }) + '\n');
    }
  };

  ipcMain.on('MEMBER_LOGIN', (e, payload) => routeToPipe('MEMBER_LOGIN', payload));
  ipcMain.on('MEMBER_CHANGE_PASSWORD', (e, payload) => routeToPipe('MEMBER_CHANGE_PASSWORD', payload));
  ipcMain.on('MEMBER_RESUME_SESSION', (e, payload) => routeToPipe('MEMBER_RESUME_SESSION', payload));
});

// Never quit when all windows close — we manage visibility manually
app.on('window-all-closed', (e) => {
  e.preventDefault();
});
