import { apiClient } from '../api/client';

export interface ActivityItem {
  id: string;
  title: string;
  body: string;
  type?: string;
  is_read?: boolean;
  created_at: string;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  size: number;
  mime_type?: string;
  created_at: string;
  uploader_name?: string;
}

interface ActivityState {
  notifications: ActivityItem[];
  files: WorkspaceFile[];
  activeSubTab: 'notifications' | 'files';
  isLoadingNotifs: boolean;
  isLoadingFiles: boolean;
}

type Listener = () => void;

class ActivityStore {
  private state: ActivityState = {
    notifications: [],
    files: [],
    activeSubTab: 'notifications',
    isLoadingNotifs: false,
    isLoadingFiles: false,
  };

  private listeners: Set<Listener> = new Set();

  getState(): ActivityState {
    return { ...this.state };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  setSubTab(tab: 'notifications' | 'files') {
    this.state.activeSubTab = tab;
    this.notify();
    if (tab === 'files' && this.state.files.length === 0) {
      this.fetchFiles();
    }
  }

  async fetchNotifications() {
    this.state.isLoadingNotifs = true;
    this.notify();

    try {
      const res = await apiClient.get('/notifications');
      const data = res.data.data || res.data || [];
      const list = Array.isArray(data) ? data : data.notifications || [];

      this.state.notifications = list.map((n: any) => ({
        id: n.id,
        title: n.title || 'Workspace Alert',
        body: n.body || n.content || 'You have a new update in your workspace.',
        type: n.type || 'system',
        is_read: n.is_read || false,
        created_at: n.created_at || new Date().toISOString(),
      }));
      this.state.isLoadingNotifs = false;
      this.notify();
    } catch (err) {
      console.warn('Fetch notifications error:', err);
      // Fallback
      if (this.state.notifications.length === 0) {
        this.state.notifications = [
          {
            id: 'n-1',
            title: 'Welcome to Micropro Commute',
            body: 'Connected to Enterprise Unified Workspace.',
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ];
      }
      this.state.isLoadingNotifs = false;
      this.notify();
    }
  }

  async markAllRead() {
    try {
      await apiClient.post('/notifications/read');
      this.state.notifications = this.state.notifications.map((n) => ({
        ...n,
        is_read: true,
      }));
      this.notify();
    } catch {}
  }

  async fetchFiles() {
    this.state.isLoadingFiles = true;
    this.notify();

    try {
      const res = await apiClient.get('/files');
      const data = Array.isArray(res.data) ? res.data : res.data.data || [];

      this.state.files = data.map((f: any) => ({
        id: f.id,
        name: f.name || f.original_name || 'Document',
        size: f.size || 0,
        mime_type: f.mime_type || 'application/octet-stream',
        created_at: f.created_at || new Date().toISOString(),
        uploader_name: f.uploader?.display_name || f.uploader?.username || 'Member',
      }));
      this.state.isLoadingFiles = false;
      this.notify();
    } catch (err) {
      console.warn('Fetch files error:', err);
      this.state.isLoadingFiles = false;
      this.notify();
    }
  }
}

export const activityStore = new ActivityStore();
