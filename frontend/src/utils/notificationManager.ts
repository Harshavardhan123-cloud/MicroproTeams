import { notificationOrchestrator } from '../services/notificationOrchestrator';

/**
 * NotificationManager
 * 
 * Centralized browser & desktop notification helper for Micropro Commute.
 * Provides cross-browser support across Chrome, Firefox, Microsoft Edge, Safari, and Electron.
 */
class NotificationManager {
  private swRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    this.initServiceWorker();
  }

  /**
   * Register Web Push Service Worker for Firefox, Edge & Mobile browser support
   */
  private async initServiceWorker() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
        this.swRegistration = reg;
        console.log('[NotificationManager] ServiceWorker registered:', reg.scope);
      } catch (err) {
        console.warn('[NotificationManager] ServiceWorker registration failed:', err);
      }
    }
  }

  /**
   * Get active ServiceWorker registration
   */
  async getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (this.swRegistration) return this.swRegistration;
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        this.swRegistration = reg || null;
        return this.swRegistration;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Request notification permission from the browser.
   * Compatible with Firefox, Edge, Safari, Chrome, and Opera.
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }

    const currentPerm = Notification.permission;
    if (currentPerm === 'granted') {
      this.initServiceWorker();
      return 'granted';
    }

    try {
      let resultPermission: NotificationPermission = currentPerm;

      // Handle dual Promise + Callback signatures for legacy/modern browser parity (Firefox & Safari)
      await new Promise<void>((resolve) => {
        let isResolved = false;
        const done = (perm: NotificationPermission) => {
          if (isResolved) return;
          isResolved = true;
          resultPermission = perm;
          resolve();
        };

        try {
          const req = Notification.requestPermission((p) => done(p));
          if (req && typeof req.then === 'function') {
            req.then((p) => done(p)).catch(() => done(Notification.permission));
          }
        } catch (e) {
          done(Notification.permission);
        }
      });

      if ((resultPermission as NotificationPermission) === 'granted') {
        this.initServiceWorker();
      }

      return resultPermission;
    } catch (err) {
      console.warn('[NotificationManager] Request permission error:', err);
      return Notification.permission || 'denied';
    }
  }

  /**
   * Get current permission status
   */
  getPermissionStatus(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Display incoming call notification
   */
  showCallNotification(payload: {
    callId: string;
    callerName: string;
    callerAvatar?: string;
    isVideo?: boolean;
    onNotificationClick?: () => void;
  }) {
    const isVideo = payload.isVideo !== false;
    notificationOrchestrator.notify({
      notificationId: `call-${payload.callId}`,
      type: isVideo ? 'INCOMING_VIDEO_CALL' : 'INCOMING_AUDIO_CALL',
      priority: 'CRITICAL',
      title: `${isVideo ? '📹' : '📞'} Incoming Call from ${payload.callerName}`,
      body: 'Click to answer or open Micropro Commute',
      senderName: payload.callerName,
      senderAvatar: payload.callerAvatar,
      callId: payload.callId,
      icon: payload.callerAvatar
    });
  }

  /**
   * Display incoming chat message notification
   */
  showMessageNotification(payload: {
    messageId?: string;
    senderName: string;
    senderAvatar?: string;
    content: string;
    conversationId?: string;
    onNotificationClick?: () => void;
  }) {
    notificationOrchestrator.notify({
      notificationId: payload.messageId ? `msg-${payload.messageId}` : `msg-${Date.now()}`,
      type: 'MESSAGE',
      priority: 'NORMAL',
      title: `💬 Message from ${payload.senderName}`,
      body: payload.content,
      senderName: payload.senderName,
      senderAvatar: payload.senderAvatar,
      conversationId: payload.conversationId,
      icon: payload.senderAvatar
    });
  }

  /**
   * Close notification for a specific call ID
   */
  closeCallNotification(callId: string) {
    notificationOrchestrator.cancel(`call-${callId}`);
  }

  /**
   * Close all active notifications
   */
  closeAllNotifications() {
    notificationOrchestrator.cancelAll();
  }
}

export const notificationManager = new NotificationManager();
