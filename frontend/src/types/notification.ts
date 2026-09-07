/**
 * Notification Types and Priority Interfaces for Micropro Commute
 * Universal Notification System
 */

export type NotificationType =
  | 'MESSAGE'
  | 'INCOMING_AUDIO_CALL'
  | 'INCOMING_VIDEO_CALL'
  | 'MEETING_INVITATION'
  | 'MEETING_STARTED'
  | 'MENTION'
  | 'FILE_RECEIVED'
  | 'SYSTEM'
  | 'SECURITY'
  | 'CUSTOM';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface NotificationAction {
  id: string;
  label: string;
  actionType?: 'open' | 'accept' | 'decline' | 'reply' | 'join';
}

export interface NotificationEvent {
  notificationId: string;
  userId?: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  icon?: string;
  timestamp?: string;
  entityId?: string;
  conversationId?: string;
  callId?: string;
  meetingId?: string;
  senderName?: string;
  senderAvatar?: string;
  onNotificationClick?: () => void;
  actions?: NotificationAction[];
  metadata?: Record<string, any>;
}

export interface NotificationPreferences {
  enableMessages: boolean;
  enableMentions: boolean;
  enableCalls: boolean;
  enableMeetings: boolean;
  enableFiles: boolean;
  enableSystem: boolean;
  enableSound: boolean;
  enableDesktopNotifs: boolean;
  enableBrowserNotifs: boolean;
  dndEnabled: boolean;
  dndStartTime?: string; // e.g. "22:00"
  dndEndTime?: string;   // e.g. "07:00"
  allowCallsInDnd: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enableMessages: true,
  enableMentions: true,
  enableCalls: true,
  enableMeetings: true,
  enableFiles: true,
  enableSystem: true,
  enableSound: true,
  enableDesktopNotifs: true,
  enableBrowserNotifs: true,
  dndEnabled: false,
  dndStartTime: '22:00',
  dndEndTime: '07:00',
  allowCallsInDnd: true
};
