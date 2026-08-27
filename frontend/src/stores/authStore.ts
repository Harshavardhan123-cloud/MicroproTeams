import { create } from 'zustand';
import { User, PresenceStatus } from '../types';
import { apiClient } from '../api/client';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setPresence: (presence: PresenceStatus) => void;
  fetchMe: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),

  fetchMe: async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token || token === 'undefined' || token === 'null') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      const res = await apiClient.get('/auth/me');
      const userData = res.data.data || res.data;
      set({ user: userData, isAuthenticated: true, isLoading: false });
    } catch (err) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setPresence: (presence) => set((state) => ({ user: state.user ? { ...state.user, presence } : null })),
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));
