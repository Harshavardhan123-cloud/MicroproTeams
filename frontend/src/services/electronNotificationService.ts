/**
 * ElectronNotificationService
 * 
 * Bridges the React renderer to the Electron main process via the
 * preload IPC bridge (window.electronNotify).
 * 
 * Usage:
 *   import { electronNotify } from './electronNotificationService';
 *   electronNotify.showCall({ callId, callerName, isVideo });
 *   electronNotify.showMessage({ conversationId, senderName, messagePreview, channelName });
 */

const isElectron = typeof window !== 'undefined' && !!(window as any).electronNotify;

export const electronNotify = {
  isElectron,

  /** Show a call popup when the app window is not focused */
  showCall(payload: {
    callId: string;
    callerName: string;
    callerAvatar?: string;
    isVideo?: boolean;
  }) {
    if (isElectron) {
      (window as any).electronNotify.showCallNotification(payload);
    } else {
      // Web fallback: native browser Notification
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(
          `${payload.isVideo ? '📹' : '📞'} Incoming call from ${payload.callerName}`,
          { body: 'Click to open MicroproTeams', tag: `call-${payload.callId}` }
        );
        n.onclick = () => window.focus();
      }
    }
  },

  /** Show a message popup when the app window is not focused */
  showMessage(payload: {
    conversationId: string;
    senderName: string;
    messagePreview: string;
    channelName?: string;
  }) {
    if (isElectron) {
      (window as any).electronNotify.showMessageNotification(payload);
    } else {
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(`💬 ${payload.senderName}`, {
          body: payload.messagePreview,
          tag: `msg-${payload.conversationId}`,
        });
        n.onclick = () => window.focus();
      }
    }
  },

  /** Register handler for when a call is answered from the popup */
  onCallAnswered(cb: (data: { callId: string }) => void) {
    if (isElectron) (window as any).electronNotify.onCallAnswered(cb);
  },

  /** Register handler for when a call is declined from the popup */
  onCallDeclined(cb: (data: { callId: string }) => void) {
    if (isElectron) (window as any).electronNotify.onCallDeclined(cb);
  },

  /** Register handler for inline message replies from the popup */
  onMessageReplied(cb: (data: { conversationId: string; text: string | null; openApp: boolean }) => void) {
    if (isElectron) (window as any).electronNotify.onMessageReplied(cb);
  },

  /** Remove all listeners for a given channel */
  cleanup(channel: string) {
    if (isElectron) (window as any).electronNotify.removeAllListeners(channel);
  },

  /** Trigger OTA update check */
  checkForUpdate() {
    if (isElectron) (window as any).electronUpdater?.checkForUpdate?.();
  },

  /** Install the downloaded OTA update and restart */
  installUpdate() {
    if (isElectron) (window as any).electronUpdater?.installUpdate?.();
  },
};

/** 
 * Hook: listen for OTA update events broadcast from main process.
 * Use this in your App.tsx / Settings screen.
 */
export function listenForUpdates(handlers: {
  onUpdateAvailable?: (info: { version: string; releaseNotes: string }) => void;
  onDownloadProgress?: (info: { percent: number; speed: number }) => void;
  onUpdateDownloaded?: (info: { version: string }) => void;
}) {
  if (!isElectron) return () => {};

  const { ipcRenderer } = (window as any).electronBridge || {};
  if (!ipcRenderer) return () => {};

  if (handlers.onUpdateAvailable) ipcRenderer.on('update-available', (_: any, d: any) => handlers.onUpdateAvailable!(d));
  if (handlers.onDownloadProgress) ipcRenderer.on('update-download-progress', (_: any, d: any) => handlers.onDownloadProgress!(d));
  if (handlers.onUpdateDownloaded) ipcRenderer.on('update-downloaded', (_: any, d: any) => handlers.onUpdateDownloaded!(d));

  return () => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-download-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
  };
}
