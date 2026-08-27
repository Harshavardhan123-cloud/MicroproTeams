import { create } from 'zustand';

export interface ToastItem {
  id: string;
  title: string;
  body: string;
  type: 'chat' | 'call' | 'info';
  timestamp: number;
}

interface NotificationState {
  unreadChatCount: number;
  unreadByConversation: Record<string, number>;
  toasts: ToastItem[];

  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  addToast: (toast: Omit<ToastItem, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadChatCount: 0,
  unreadByConversation: {},
  toasts: [],

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
    const newToast: ToastItem = { ...toast, id, timestamp: Date.now() };
    set((state) => ({ toasts: [newToast, ...state.toasts].slice(0, 5) }));
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  }
}));
