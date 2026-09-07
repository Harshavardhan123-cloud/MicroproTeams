import { create } from 'zustand';
import { User, PresenceStatus } from '../types';
import { apiClient } from '../api/client';
import { wsService } from '../services/websocketService';
import { getToken, clearTokens } from '../utils/token';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setPresence: (presence: PresenceStatus) => Promise<void>;
  fetchMe: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!getToken(),
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),

  fetchMe: async () => {
    try {
      const token = getToken();
      if (!token || token === 'undefined' || token === 'null') {
        clearTokens();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      const res = await apiClient.get('/auth/me');
      const userData = res.data.data || res.data;
      set({ user: userData, isAuthenticated: true, isLoading: false });
    } catch (err) {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setPresence: async (presence) => {
    set((state) => ({ user: state.user ? { ...state.user, presence } : null }));
    try {
      await apiClient.put('/users/me/presence', { presence });
      wsService.send({
        type: 'presence_update',
        presence: presence
      });
    } catch (err) {
      console.error('Failed to persist presence state:', err);
    }
  },

  logout: () => {
    clearTokens();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));

