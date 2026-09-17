import { apiClient } from '../api/client';

export interface PersistentNotification {
  id: string;
  notificationId?: string;
  type: string;
  title: string;
  body: string;
  resource_type?: string;
  resource_id?: string;
  conversation_id?: string;
  conversationId?: string;
  call_id?: string;
  callId?: string;
  meeting_id?: string;
  meetingId?: string;
  status?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

export const notificationService = {
  async getNotifications(): Promise<{ unread_count: number; notifications: PersistentNotification[] }> {
    const res = await apiClient.get('/notifications');
    const data = res.data?.data || res.data;
    return {
      unread_count: data?.unread_count || 0,
      notifications: Array.isArray(data?.notifications) ? data.notifications : []
    };
  },

  async markAsRead(markAll: boolean = false, notificationIds?: string[]): Promise<void> {
    await apiClient.post('/notifications/read', {
      mark_all: markAll,
      notification_ids: notificationIds
    });
  },

  async deleteNotification(id: string): Promise<void> {
    if (!id) return;
    await apiClient.delete(`/notifications/${encodeURIComponent(id)}`);
  },

  async clearAllNotifications(): Promise<void> {
    await apiClient.delete('/notifications');
  }
};
