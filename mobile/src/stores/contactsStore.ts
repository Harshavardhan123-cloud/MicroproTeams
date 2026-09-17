import { apiClient } from '../api/client';
import { wsService } from '../services/websocketService';
import { authStore } from './authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserContact {
  id: string;
  email: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  presence?: 'available' | 'busy' | 'away' | 'offline' | string;
  status_message?: string;
  role?: string;
  department?: string;
  is_favorite?: boolean;
}

interface ContactsState {
  users: UserContact[];
  isLoading: boolean;
  searchQuery: string;
  filter: 'all' | 'online' | 'favorites';
  favorites: string[];
  error: string | null;
}

type Listener = () => void;
const FAV_STORAGE_KEY = 'mc_favorite_contacts';

class ContactsStore {
  private state: ContactsState = {
    users: [],
    isLoading: false,
    searchQuery: '',
    filter: 'all',
    favorites: [],
    error: null,
  };

  private listeners: Set<Listener> = new Set();

  constructor() {
    this.loadFavorites();
    this.setupWebSocket();
  }

  getState(): ContactsState {
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

  private async loadFavorites() {
    try {
      const stored = await AsyncStorage.getItem(FAV_STORAGE_KEY);
      if (stored) {
        this.state.favorites = JSON.parse(stored);
        this.notify();
      }
    } catch {
      // silent
    }
  }

  private setupWebSocket() {
    wsService.on((event: any) => {
      if (event.type === 'presence_update' && event.user_id) {
        this.state.users = this.state.users.map((u) => {
          if (u.id === event.user_id) {
            return {
              ...u,
              presence: event.presence || 'available',
            };
          }
          return u;
        });
        this.notify();
      }
    });
  }

  async fetchUsers() {
    this.state.isLoading = true;
    this.state.error = null;
    this.notify();

    try {
      const res = await apiClient.get('/users');
      const data = Array.isArray(res.data) ? res.data : res.data.data || [];
      const current = authStore.getState().user;

      const filtered = data
        .filter((u: any) => u.id !== current?.id)
        .map((u: any) => ({
          id: u.id,
          email: u.email,
          username: u.username,
          display_name: u.display_name || u.username || u.email,
          avatar_url: u.avatar_url,
          presence: u.presence || 'offline',
          status_message: u.status_message,
          role: u.role || 'Member',
          department: u.department,
          is_favorite: this.state.favorites.includes(u.id),
        }));

      this.state.users = filtered;
      this.state.isLoading = false;
      this.notify();
    } catch (err: any) {
      console.warn('Contacts fetch error:', err);
      this.state.error = err.message || 'Failed to load directory';
      this.state.isLoading = false;
      this.notify();
    }
  }

  async toggleFavorite(userId: string) {
    const isFav = this.state.favorites.includes(userId);
    const updated = isFav
      ? this.state.favorites.filter((id) => id !== userId)
      : [...this.state.favorites, userId];

    this.state.favorites = updated;
    this.state.users = this.state.users.map((u) =>
      u.id === userId ? { ...u, is_favorite: !isFav } : u
    );
    this.notify();

    try {
      await AsyncStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }

  setSearchQuery(q: string) {
    this.state.searchQuery = q;
    this.notify();
  }

  setFilter(f: 'all' | 'online' | 'favorites') {
    this.state.filter = f;
    this.notify();
  }
}

export const contactsStore = new ContactsStore();
