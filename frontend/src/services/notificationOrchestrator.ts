import {
  NotificationEvent,
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES
} from '../types/notification';
import { useNotificationStore } from '../stores/notificationStore';
import { electronNotify } from './electronNotificationService';
import { ringtoneManager } from '../utils/ringtoneManager';

const PREF_STORAGE_KEY = 'mc_notification_settings';

export class NotificationOrchestrator {
  private activeNotifications: Map<string, Notification> = new Map();

  /**
   * Fetch current notification preferences from localStorage or defaults
   */
  public getPreferences(): NotificationPreferences {
    try {
      const stored = localStorage.getItem(PREF_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('[NotificationOrchestrator] Error reading preferences:', e);
    }
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  /**
   * Save user notification preferences
   */
  public savePreferences(prefs: Partial<NotificationPreferences>): NotificationPreferences {
    const current = this.getPreferences();
    const updated = { ...current, ...prefs };
    try {
      localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[NotificationOrchestrator] Error saving preferences:', e);
    }
    return updated;
  }

  /**
   * Check if Do Not Disturb (DND) is active right now
   */
  public isDndActive(prefs: NotificationPreferences): boolean {
    if (!prefs.dndEnabled) return false;
    if (!prefs.dndStartTime || !prefs.dndEndTime) return true;

    try {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const [startH, startM] = prefs.dndStartTime.split(':').map(Number);
      const [endH, endM] = prefs.dndEndTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      } else {
        // Overnight range (e.g. 22:00 to 07:00)
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      }
    } catch {
      return false;
    }
  }

  /**
   * Central entry point to dispatch notification events across all valid channels
   */
  public async notify(event: NotificationEvent): Promise<void> {
    const prefs = this.getPreferences();
    const inDnd = this.isDndActive(prefs);
    const isCall = event.type === 'INCOMING_AUDIO_CALL' || event.type === 'INCOMING_VIDEO_CALL';

    // DND Filter logic
    if (inDnd) {
      if (isCall && prefs.allowCallsInDnd) {
        // Allowed call during DND
      } else {
        console.log(`[NotificationOrchestrator] Suppressed notification ${event.type} due to active DND mode.`);
        return;
      }
    }

    // Check specific type toggles
    if (event.type === 'MESSAGE' && !prefs.enableMessages) return;
    if (event.type === 'MENTION' && !prefs.enableMentions) return;
    if (isCall && !prefs.enableCalls) return;
    if ((event.type === 'MEETING_INVITATION' || event.type === 'MEETING_STARTED') && !prefs.enableMeetings) return;
    if (event.type === 'FILE_RECEIVED' && !prefs.enableFiles) return;
    if (event.type === 'SYSTEM' && !prefs.enableSystem) return;

    // 1. Audio Sound Dispatch
    if (prefs.enableSound) {
      if (isCall) {
        const callType = event.type === 'INCOMING_VIDEO_CALL' ? 'video' : 'audio';
        ringtoneManager.play(callType);
      } else if (event.priority === 'HIGH' || event.priority === 'NORMAL') {
        ringtoneManager.playMessageSound();
      }
    }

    // 2. In-App UI Toast Dispatch
    this.dispatchInAppToast(event);

    // 3. Desktop / OS Level Notification Dispatch
    if (prefs.enableDesktopNotifs || prefs.enableBrowserNotifs) {
      if (electronNotify.isElectron) {
        this.dispatchNativeDesktop(event);
      } else {
        this.dispatchBrowserNotification(event);
      }
    }
  }

  /**
   * Dispatch In-App Toast
   */
  private dispatchInAppToast(event: NotificationEvent) {
    const { addToast } = useNotificationStore.getState();
    let toastType: 'info' | 'chat' | 'call' = 'info';
    if (event.type === 'MESSAGE' || event.type === 'MENTION') toastType = 'chat';
    if (event.type === 'INCOMING_AUDIO_CALL' || event.type === 'INCOMING_VIDEO_CALL' || event.type === 'MEETING_STARTED') toastType = 'call';

    addToast({
      title: event.title,
      body: event.body,
      type: toastType
    });
  }

  /**
   * Dispatch Native Desktop Notification via Electron Bridge
   */
  private dispatchNativeDesktop(event: NotificationEvent) {
    if (event.type === 'INCOMING_AUDIO_CALL' || event.type === 'INCOMING_VIDEO_CALL') {
      electronNotify.showCall({
        callId: event.callId || event.notificationId,
        callerName: event.senderName || event.title,
        callerAvatar: event.senderAvatar || event.icon,
        isVideo: event.type === 'INCOMING_VIDEO_CALL'
      });
    } else {
      electronNotify.showMessage({
        conversationId: event.conversationId || '',
        senderName: event.senderName || event.title,
        messagePreview: event.body
      });
    }
  }

  /**
   * Dispatch HTML5 Browser Notification with full Firefox, Edge & Chrome support
   */
  private async dispatchBrowserNotification(event: NotificationEvent) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const tag = event.callId ? `call-${event.callId}` : event.notificationId;
    if (this.activeNotifications.has(tag)) return;

    try {
      // Build safe absolute icon URL (relative paths fail in Firefox/Edge)
      let iconUrl: string | undefined = undefined;
      const rawIcon = event.icon || event.senderAvatar;
      if (rawIcon) {
        if (rawIcon.startsWith('http://') || rawIcon.startsWith('https://') || rawIcon.startsWith('data:')) {
          iconUrl = rawIcon;
        } else {
          iconUrl = `${window.location.origin}${rawIcon.startsWith('/') ? '' : '/'}${rawIcon}`;
        }
      }

      const options: NotificationOptions & { data?: any } = {
        body: event.body || '',
        tag,
        requireInteraction: event.priority === 'CRITICAL',
        silent: true, // Audio is handled independently by RingtoneManager
        data: {
          conversationId: event.conversationId,
          callId: event.callId
        }
      };

      if (iconUrl) {
        options.icon = iconUrl;
      }

      // 1. Try Service Worker Notification first (required by Firefox & Edge when tab is backgrounded)
      let shownViaSW = false;
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && reg.showNotification) {
            await reg.showNotification(event.title, options);
            shownViaSW = true;
          }
        } catch (swErr) {
          console.warn('[NotificationOrchestrator] SW showNotification failed, fallback to direct:', swErr);
        }
      }

      // 2. Direct constructor fallback for Chrome/Safari/legacy environments
      if (!shownViaSW) {
        const notification = new Notification(event.title, options);
        notification.onclick = () => {
          try {
            window.focus();
          } catch (e) {}
          notification.close();
          this.activeNotifications.delete(tag);

          if (event.onNotificationClick) {
            event.onNotificationClick();
          } else if (event.conversationId || event.callId) {
            window.dispatchEvent(
              new CustomEvent('mc_notification_navigate', {
                detail: { conversationId: event.conversationId, callId: event.callId }
              })
            );
          }
        };

        notification.onclose = () => {
          this.activeNotifications.delete(tag);
        };

        this.activeNotifications.set(tag, notification);
      }
    } catch (err) {
      console.warn('[NotificationOrchestrator] Browser notification error:', err);
    }
  }

  /**
   * Cancel active notification by ID/tag
   */
  public cancel(notificationId: string) {
    const notif = this.activeNotifications.get(notificationId);
    if (notif) {
      try {
        notif.close();
      } catch (e) {}
      this.activeNotifications.delete(notificationId);
    }
  }

  /**
   * Cancel all active notifications
   */
  public cancelAll() {
    this.activeNotifications.forEach((notif) => {
      try {
        notif.close();
      } catch (e) {}
    });
    this.activeNotifications.clear();
  }
}

export const notificationOrchestrator = new NotificationOrchestrator();
