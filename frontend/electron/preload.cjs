const { contextBridge, ipcRenderer } = require('electron');

// ── Notification Bridge ──────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronNotify', {
  isElectron: true,

  // Renderer → Main: trigger popup windows
  showCallNotification:    (payload) => ipcRenderer.send('show-call-notification', payload),
  showMessageNotification: (payload) => ipcRenderer.send('show-message-notification', payload),

  // Renderer → Main: call actions (from main window controls)
  answerCall:  (callId)  => ipcRenderer.send('call-answer', callId),
  declineCall: (callId)  => ipcRenderer.send('call-decline', callId),
  replyMessage: (payload) => ipcRenderer.send('message-reply', payload),

  // Main → Renderer: popup action results
  onCallAnswered:   (cb) => ipcRenderer.on('call-answered',   (_, data) => cb(data)),
  onCallDeclined:   (cb) => ipcRenderer.on('call-declined',   (_, data) => cb(data)),
  onMessageReplied: (cb) => ipcRenderer.on('message-replied', (_, data) => cb(data)),

  // Cleanup
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});

// ── Auto-Updater Bridge ───────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronUpdater', {
  checkForUpdate: () => ipcRenderer.send('check-for-update'),
  installUpdate:  () => ipcRenderer.send('install-update'),

  // Main → Renderer: update lifecycle events
  onUpdateAvailable:    (cb) => ipcRenderer.on('update-available',         (_, d) => cb(d)),
  onDownloadProgress:   (cb) => ipcRenderer.on('update-download-progress', (_, d) => cb(d)),
  onUpdateDownloaded:   (cb) => ipcRenderer.on('update-downloaded',        (_, d) => cb(d)),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});

// ── Generic IPC bridge (for advanced usage) ──────────────────────────────────
contextBridge.exposeInMainWorld('electronBridge', {
  ipcRenderer: {
    on:  (channel, cb) => ipcRenderer.on(channel, cb),
    once: (channel, cb) => ipcRenderer.once(channel, cb),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  },
  platform: process.platform,
  version:  process.env.npm_package_version || 'unknown',
});
