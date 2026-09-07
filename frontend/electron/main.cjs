const {
  app, BrowserWindow, shell, session, ipcMain, Menu, Tray, nativeImage, Notification, screen
} = require('electron');
const path = require('path');
const os = require('os');

let mainWindow = null;
let splashWindow = null;
let callPopupWindow = null;
let tray = null;
let msgPopupWindows = [];

// ─── App ID & Platform Config ───────────────────────────────────────────────
if (process.platform === 'win32') {
  app.setAppUserModelId('com.micropro.commute');
}

const iconPath = process.platform === 'win32'
  ? path.join(__dirname, 'icon.ico')
  : path.join(__dirname, 'icon.png');

// ─── GPU / WebRTC flags ──────────────────────────────────────────────────────
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-setuid-sandbox');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('auto-select-desktop-capture-source', 'Entire screen');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream', 'false');
app.commandLine.appendSwitch('enable-features', 'WebRTC,WebRTCPipeWireCapturer');

// ─── Auto-updater (OTA) ───────────────────────────────────────────────────────
// Only activate in production builds
function initAutoUpdater() {
  try {
    const { autoUpdater } = require('electron-updater');

    autoUpdater.autoDownload = true;        // Download silently in background
    autoUpdater.autoInstallOnAppQuit = true; // Install when user quits

    autoUpdater.on('checking-for-update', () => {
      console.log('[Updater] Checking for update...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] Update available:', info.version);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', {
          version: info.version,
          releaseNotes: info.releaseNotes || '',
        });
      }
      // Show native OS notification
      if (Notification.isSupported()) {
        new Notification({
          title: '🚀 Micropro_Commute Update Available',
          body: `Version ${info.version} is downloading in the background.`,
        }).show();
      }
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[Updater] App is up to date.');
    });

    autoUpdater.on('download-progress', (progress) => {
      const pct = Math.round(progress.percent);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(progress.percent / 100);
        mainWindow.webContents.send('update-download-progress', { percent: pct, speed: progress.bytesPerSecond });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Updater] Update downloaded:', info.version);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(-1); // Remove progress bar
        mainWindow.webContents.send('update-downloaded', { version: info.version });
      }
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: '✅ Update Ready to Install',
          body: `Micropro_Commute ${info.version} will install when you restart the app.`,
        });
        notif.on('click', () => autoUpdater.quitAndInstall());
        notif.show();
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('[Updater] Error:', err?.message || err);
    });

    // Check on launch, then every 2 hours
    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 2 * 60 * 60 * 1000);

    // IPC: renderer can request check or force install
    ipcMain.on('check-for-update', () => autoUpdater.checkForUpdatesAndNotify());
    ipcMain.on('install-update', () => autoUpdater.quitAndInstall());

  } catch (err) {
    console.warn('[Updater] electron-updater not available (dev mode or unsigned build):', err?.message);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs');
}

function focusMain() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

// ─── Splash Screen ───────────────────────────────────────────────────────────
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    webPreferences: { nodeIntegration: false },
  });

  splashWindow.loadURL(`data:text/html,
    <html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        width:480px; height:300px;
        background:linear-gradient(135deg,#0F1117 0%,#13151E 50%,#1A1C2A 100%);
        border:1px solid rgba(99,102,241,0.4); border-radius:20px;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        overflow:hidden; -webkit-app-region:drag;
      }
      .logo-ring {
        width:72px; height:72px; border-radius:20px;
        background:linear-gradient(135deg,#4F46E5,#7C3AED);
        display:flex; align-items:center; justify-content:center;
        margin-bottom:20px; box-shadow:0 0 40px rgba(79,70,229,0.5);
      }
      .logo-text { font-size:32px; font-weight:900; color:white; }
      h1 { color:white; font-size:22px; font-weight:800; margin-bottom:6px; letter-spacing:-0.5px; }
      p { color:rgba(148,163,184,0.8); font-size:12px; margin-bottom:28px; }
      .bar-track { width:240px; height:3px; background:rgba(255,255,255,0.1); border-radius:10px; overflow:hidden; }
      .bar-fill {
        width:0; height:100%;
        background:linear-gradient(90deg,#4F46E5,#7C3AED);
        border-radius:10px;
        animation:load 2s ease-in-out forwards;
      }
      @keyframes load { 0%{width:0} 100%{width:100%} }
      .version { color:rgba(100,116,139,0.6); font-size:10px; margin-top:16px; }
    </style></head>
    <body>
      <div class="logo-ring"><span class="logo-text">M</span></div>
      <h1>Micropro_Commute</h1>
      <p>Initializing collaboration platform...</p>
      <div class="bar-track"><div class="bar-fill"></div></div>
      <span class="version">v${app.getVersion()} &nbsp;&bull;&nbsp; ${os.platform() === 'win32' ? 'Windows' : 'Linux'}</span>
    </body></html>
  `);
}

// ─── Main Window ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Micropro Commute',
    icon: iconPath,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: true,
    },
    autoHideMenuBar: true,
    backgroundColor: '#0D0F16',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Clear taskbar flash alert on window focus
  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.flashFrame(false);
    }
  });

  // Grant all media permissions
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(['media','display-capture','audioCapture','videoCapture','notifications','fullscreen'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  // CORS bypass for local API calls without header duplicates
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    requestHeaders['Origin'] = 'http://localhost';
    callback({ cancel: false, requestHeaders });
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const h = { ...details.responseHeaders };
    for (const key of Object.keys(h)) {
      const lower = key.toLowerCase();
      if (lower === 'access-control-allow-origin' ||
          lower === 'access-control-allow-headers' ||
          lower === 'access-control-allow-methods') {
        delete h[key];
      }
    }
    h['access-control-allow-origin'] = ['*'];
    h['access-control-allow-headers'] = ['*'];
    h['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, OPTIONS, PATCH'];
    callback({ responseHeaders: h });
  });

  // Enable F12 and Ctrl+Shift+I to toggle Developer Tools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      setTimeout(() => {
        splashWindow.close();
        mainWindow.show();
        mainWindow.focus();
        if (!isDev) initAutoUpdater();
      }, 2200);
    } else {
      mainWindow.show();
      if (!isDev) initAutoUpdater();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Close button (X) completely quits the application (does NOT minimize)
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.isQuiting = true;
    app.quit();
  });

  Menu.setApplicationMenu(null);
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  // 16×16 purple icon as base64 PNG fallback
  const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAVklEQVQ4T2NkIBIwEqmPgWoGvP7PwMBgRKJzGIbdAAYGBob/DMQrgaFLGBkYGHgZSHQJTBcjAwMDA8N/Bga8amCKGFHuIMsAohwAMYCRkZHxP3mOBQDXGRMRpvD5AQAAAABJRU5ErkJggg==';

  try {
    const icon = nativeImage.createFromDataURL(iconDataUrl);
    tray = new Tray(icon);
  } catch (e) {
    tray = new Tray(nativeImage.createEmpty());
  }

  tray.setToolTip(`Micropro_Commute Enterprise v${app.getVersion()}`);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Micropro_Commute', click: () => focusMain() },
    { type: 'separator' },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { label: 'Check for Updates', click: () => {
        try { require('electron-updater').autoUpdater.checkForUpdatesAndNotify(); } catch (e) {}
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => focusMain());
}

// ─── Call Popup Window ───────────────────────────────────────────────────────
function createCallPopup(payload) {
  if (callPopupWindow && !callPopupWindow.isDestroyed()) callPopupWindow.close();

  const { callId, callerName, isVideo } = payload;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  callPopupWindow = new BrowserWindow({
    width: 360,
    height: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
    x: sw - 380,
    y: sh - 220,
  });

  const avatarText = (callerName || '?').charAt(0).toUpperCase();
  const callTypeLabel = isVideo ? '📹 Incoming Video Call' : '📞 Incoming Call';

  callPopupWindow.loadURL(`data:text/html,<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:360px;height:200px;background:transparent;overflow:hidden}
  .card{
    width:360px;height:200px;
    background:linear-gradient(135deg,#13151E,#1a1c2a);
    border:1px solid rgba(99,102,241,0.5);border-radius:20px;
    box-shadow:0 20px 60px rgba(0,0,0,0.8);
    display:flex;flex-direction:column;padding:20px;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    -webkit-app-region:drag;
    animation:slideIn .3s cubic-bezier(.34,1.56,.64,1);
  }
  @keyframes slideIn{from{opacity:0;transform:translateY(20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
  .top{display:flex;align-items:center;gap:14px;margin-bottom:18px}
  .avatar{
    width:48px;height:48px;border-radius:14px;flex-shrink:0;
    background:linear-gradient(135deg,#4F46E5,#7C3AED);
    display:flex;align-items:center;justify-content:center;
    font-size:20px;font-weight:800;color:white;
    animation:pulse 1.5s ease-in-out infinite;
  }
  @keyframes pulse{0%,100%{box-shadow:0 0 20px rgba(79,70,229,.5)}50%{box-shadow:0 0 35px rgba(79,70,229,.9)}}
  .info{flex:1;min-width:0}
  .type{font-size:10px;color:rgba(148,163,184,.8);font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:3px}
  .name{font-size:16px;font-weight:800;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dismiss{-webkit-app-region:no-drag;cursor:pointer;color:rgba(148,163,184,.5);font-size:16px;border:none;background:none;padding:4px}
  .dismiss:hover{color:white}
  .actions{display:flex;gap:10px;-webkit-app-region:no-drag}
  .btn{flex:1;height:40px;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s}
  .btn:active{transform:scale(.96)}
  .btn-decline{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3)}
  .btn-decline:hover{background:rgba(239,68,68,.3);color:white}
  .btn-answer{background:linear-gradient(135deg,#22c55e,#16a34a);color:white;box-shadow:0 4px 15px rgba(34,197,94,.4)}
  .btn-answer:hover{filter:brightness(1.15)}
</style></head>
<body>
<div class="card">
  <div class="top">
    <div class="avatar">${avatarText}</div>
    <div class="info">
      <div class="type">${callTypeLabel}</div>
      <div class="name">${callerName || 'Unknown Caller'}</div>
    </div>
    <button class="dismiss" onclick="ipc('dismiss')">✕</button>
  </div>
  <div class="actions">
    <button class="btn btn-decline" onclick="ipc('decline')">📵 Decline</button>
    <button class="btn btn-answer" onclick="ipc('answer')">${isVideo ? '📹' : '📞'} Answer</button>
  </div>
</div>
<script>
  const callId=${JSON.stringify(callId)};
  function ipc(action){
    if(action==='answer'&&window.electronNotify) window.electronNotify.answerCall(callId);
    if(action==='decline'&&window.electronNotify) window.electronNotify.declineCall(callId);
    window.close();
  }
  setTimeout(()=>window.close(),45000);
</script>
</body></html>`);

  callPopupWindow.on('closed', () => { callPopupWindow = null; });
}

// ─── Message Notification Popup ───────────────────────────────────────────────
function createMessagePopup(payload) {
  const { conversationId, senderName, messagePreview, channelName } = payload;
  const active = msgPopupWindows.filter(w => !w.isDestroyed());
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const popup = new BrowserWindow({
    width: 360,
    height: 130,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
    x: sw - 380,
    y: sh - 150 - (active.length * 140),
  });

  const avatarChar = (senderName || '?').charAt(0).toUpperCase();

  popup.loadURL(`data:text/html,<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:360px;min-height:130px;background:transparent;overflow:hidden}
  .card{
    width:360px;
    background:linear-gradient(135deg,#13151E,#1a1c2a);
    border:1px solid rgba(99,102,241,0.4);border-radius:16px;
    box-shadow:0 16px 48px rgba(0,0,0,.7);padding:14px;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    -webkit-app-region:drag;cursor:pointer;
    animation:slideIn .25s cubic-bezier(.34,1.56,.64,1);
  }
  @keyframes slideIn{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
  .top{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}
  .avatar{width:36px;height:36px;border-radius:10px;flex-shrink:0;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:white}
  .meta{flex:1;min-width:0}
  .sender{font-size:13px;font-weight:700;color:white;margin-bottom:1px}
  .channel{font-size:10px;color:rgba(148,163,184,.7)}
  .dismiss{-webkit-app-region:no-drag;cursor:pointer;color:rgba(148,163,184,.4);font-size:14px;border:none;background:none;padding:2px 4px}
  .dismiss:hover{color:white}
  .preview{font-size:12px;color:rgba(203,213,225,.85);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:10px;padding-left:46px}
  .reply-row{display:flex;gap:8px;padding-left:46px;-webkit-app-region:no-drag}
  .reply-input{flex:1;height:32px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:0 10px;color:white;font-size:12px;outline:none}
  .reply-input:focus{border-color:rgba(99,102,241,.6);background:rgba(255,255,255,.1)}
  .reply-input::placeholder{color:rgba(148,163,184,.5)}
  .send-btn{width:32px;height:32px;background:linear-gradient(135deg,#4F46E5,#7C3AED);border:none;border-radius:8px;color:white;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
  .send-btn:hover{opacity:.85}
  .send-btn:active{transform:scale(.93)}
</style></head>
<body>
<div class="card" onclick="openApp(event)">
  <div class="top">
    <div class="avatar">${avatarChar}</div>
    <div class="meta">
      <div class="sender">${senderName || 'Unknown'}</div>
      <div class="channel">${channelName || 'Direct Message'}</div>
    </div>
    <button class="dismiss" onclick="event.stopPropagation();window.close()">✕</button>
  </div>
  <div class="preview">${(messagePreview||'').substring(0,80)}${(messagePreview||'').length>80?'...':''}</div>
  <div class="reply-row" onclick="event.stopPropagation()">
    <input id="replyInput" class="reply-input" placeholder="Reply here..." onkeydown="if(event.key==='Enter')sendReply()"/>
    <button class="send-btn" onclick="sendReply()">➤</button>
  </div>
</div>
<script>
  const convId=${JSON.stringify(conversationId)};
  function openApp(e){
    if(e.target.id==='replyInput'||e.target.classList.contains('send-btn')) return;
    window.electronNotify&&window.electronNotify.replyMessage({conversationId:convId,text:null,openApp:true});
    window.close();
  }
  function sendReply(){
    const text=document.getElementById('replyInput').value.trim();
    if(!text) return;
    window.electronNotify&&window.electronNotify.replyMessage({conversationId:convId,text,openApp:false});
    window.close();
  }
  setTimeout(()=>window.close(),8000);
</script>
</body></html>`);

  msgPopupWindows.push(popup);
  popup.on('closed', () => { msgPopupWindows = msgPopupWindows.filter(w => !w.isDestroyed()); });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.on('show-call-notification', (event, payload) => {
  if (mainWindow && mainWindow.isFocused()) return;

  // Flash taskbar icon to alert user when minimized
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.flashFrame(true);
  }

  // Floating always-on-top interactive call dialog
  createCallPopup(payload);

  // Native OS Notification with sound and click-to-focus
  if (Notification.isSupported()) {
    const callNotif = new Notification({
      title: `📞 Incoming ${payload.isVideo ? 'Video' : 'Audio'} Call`,
      body: `${payload.callerName || 'Someone'} is calling you on Micropro Commute. Click to answer.`,
      icon: iconPath,
      silent: false,
      urgency: 'critical',
    });
    callNotif.on('click', () => {
      focusMain();
    });
    callNotif.show();
  }
});

ipcMain.on('show-message-notification', (event, payload) => {
  if (mainWindow && mainWindow.isFocused()) return;

  // Flash taskbar icon to alert user when minimized
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.flashFrame(true);
  }

  // Floating quick-reply toast popup
  createMessagePopup(payload);

  // Native OS Notification
  if (Notification.isSupported()) {
    const msgNotif = new Notification({
      title: `💬 ${payload.senderName || 'New Message'}${payload.channelName ? ' in #' + payload.channelName : ''}`,
      body: payload.messagePreview || 'New message on Micropro Commute',
      icon: iconPath,
      silent: false,
    });
    msgNotif.on('click', () => {
      focusMain();
      if (mainWindow && !mainWindow.isDestroyed() && payload.conversationId) {
        mainWindow.webContents.send('open-conversation', { conversationId: payload.conversationId });
      }
    });
    msgNotif.show();
  }
});

ipcMain.on('call-answer', (event, callId) => {
  if (callPopupWindow && !callPopupWindow.isDestroyed()) callPopupWindow.close();
  focusMain();
  if (mainWindow) mainWindow.webContents.send('call-answered', { callId });
});

ipcMain.on('call-decline', (event, callId) => {
  if (callPopupWindow && !callPopupWindow.isDestroyed()) callPopupWindow.close();
  if (mainWindow) mainWindow.webContents.send('call-declined', { callId });
});

ipcMain.on('message-reply', (event, payload) => {
  if (payload.openApp) focusMain();
  if (mainWindow) mainWindow.webContents.send('message-replied', payload);
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createSplashWindow();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  app.isQuiting = true;
});
