import { create } from 'zustand';

export interface ToastItem {
  id: string;
  title: string;
  body: string;
  type: 'chat' | 'call' | 'info';
  timestamp: number;
}

export interface ActivityNotificationItem {
  id: string;
  title: string;
  body?: string;
  time: string;
  unread: boolean;
  type: string;
  created_at: string;
  conversationId?: string;
  callId?: string;
  meetingId?: string;
}

interface NotificationState {
  unreadChatCount: number;
  unreadByConversation: Record<string, number>;
  toasts: ToastItem[];
  notifications: ActivityNotificationItem[];

  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  addToast: (toast: Omit<ToastItem, 'id' | 'timestamp'> & { conversationId?: string; callId?: string; meetingId?: string }) => void;
  removeToast: (id: string) => void;
  setNotifications: (items: ActivityNotificationItem[]) => void;
  addNotification: (item: { title: string; body?: string; type?: string; conversationId?: string; callId?: string; meetingId?: string }) => void;
  markNotifRead: (id: string) => void;
  markAllNotifsRead: () => void;
  clearAllNotifications: () => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadChatCount: 0,
  unreadByConversation: {},
  toasts: [],
  notifications: [],

  incrementUnread: (conversationId: string) => {
    set((state) => {
      const current = state.unreadByConversation[conversationId] || 0;
      const updatedByConv = { ...state.unreadByConversation, [conversationId]: current + 1 };
      const totalUnread = Object.values(updatedByConv).reduce((acc, count) => acc + count, 0);
      return {
        unreadByConversation: updatedByConv,
        unreadChatCount: totalUnread
      };
    });
  },

  clearUnread: (conversationId: string) => {
    set((state) => {
      const updatedByConv = { ...state.unreadByConversation };
      delete updatedByConv[conversationId];
      const totalUnread = Object.values(updatedByConv).reduce((acc, count) => acc + count, 0);
      return {
        unreadByConversation: updatedByConv,
        unreadChatCount: totalUnread
      };
    });
  },

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastItem = {
      id,
      title: toast.title,
      body: toast.body,
      type: toast.type,
      timestamp: Date.now()
    };
    
    // Also create dynamic activity notification item
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newNotif: ActivityNotificationItem = {
      id: notifId,
      title: toast.title,
      body: toast.body,
      time: 'Just now',
      unread: true,
      type: toast.type,
      created_at: new Date().toISOString(),
      conversationId: toast.conversationId,
      callId: toast.callId,
      meetingId: toast.meetingId
    };

    set((state) => ({
      toasts: [newToast, ...state.toasts].slice(0, 5),
      notifications: [newNotif, ...state.notifications]
    }));
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  setNotifications: (items) => {
    set({ notifications: items });
  },

  addNotification: (item) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newNotif: ActivityNotificationItem = {
      id,
      title: item.title,
      body: item.body,
      time: 'Just now',
      unread: true,
      type: item.type || 'system',
      created_at: new Date().toISOString(),
      conversationId: item.conversationId,
      callId: item.callId,
      meetingId: item.meetingId
    };
    set((state) => ({ notifications: [newNotif, ...state.notifications] }));
  },

  markNotifRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, unread: false } : n))
    }));
  },

  markAllNotifsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, unread: false }))
    }));
  },

  clearAllNotifications: () => {
    set({ notifications: [] });
  },

  removeNotification: (id: string) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    }));
  }
}));
