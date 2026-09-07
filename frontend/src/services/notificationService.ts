import { apiClient } from '../api/client';

export interface PersistentNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  resource_type?: string;
  resource_id?: string;
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
  }
};
