import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, setStoredTokens, clearStoredTokens, getStoredToken } from '../api/client';
import { wsService } from '../services/websocketService';

export interface User {
  id: string;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  status?: string;
}

type Listener = () => void;

class AuthStore {
  private user: User | null = null;
  private isAuthenticated: boolean = false;
  private isLoading: boolean = true;
  private listeners: Set<Listener> = new Set();

  getState() {
    return {
      user: this.user,
      isAuthenticated: this.isAuthenticated,
      isLoading: this.isLoading,
    };
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

  async checkAuth() {
    this.isLoading = true;
    this.notify();

    try {
      const token = await getStoredToken();
      if (!token) {
        this.user = null;
        this.isAuthenticated = false;
        this.isLoading = false;
        this.notify();
        return;
      }

      const savedUser = await AsyncStorage.getItem('mc_user_info');
      if (savedUser) {
        this.user = JSON.parse(savedUser);
        this.isAuthenticated = true;
      }

      // Fetch latest profile from backend
      try {
        const res = await apiClient.get('/auth/me');
        const userData = res.data.data || res.data;
        if (userData && userData.id) {
          this.user = userData;
          this.isAuthenticated = true;
          await AsyncStorage.setItem('mc_user_info', JSON.stringify(userData));
        }
      } catch (err) {
        console.warn('Profile fetch checkAuth warning:', err);
      }

      if (this.isAuthenticated) {
        wsService.connect();
      }
    } catch (err) {
      console.warn('Auth check error:', err);
      this.isAuthenticated = false;
      this.user = null;
    } finally {
      this.isLoading = false;
      this.notify();
    }
  }

  async login(identifier: string, password: string):Promise<boolean> {
    this.isLoading = true;
    this.notify();

    try {
      const response = await apiClient.post('/auth/login', {
        email: identifier,
        username: identifier,
        password,
      });

      const data = response.data.data || response.data;
      const accessToken = data.access_token || data.token;
      const refreshToken = data.refresh_token;

      if (!accessToken) {
        throw new Error('No access token received from server');
      }

      await setStoredTokens(accessToken, refreshToken);

      let userInfo = data.user;
      if (!userInfo) {
        const meRes = await apiClient.get('/auth/me');
        userInfo = meRes.data.data || meRes.data;
      }

      this.user = userInfo;
      this.isAuthenticated = true;
      await AsyncStorage.setItem('mc_user_info', JSON.stringify(userInfo));

      wsService.connect();
      return true;
    } catch (err: any) {
      console.error('Login error:', err?.response?.data || err.message);
      throw err;
    } finally {
      this.isLoading = false;
      this.notify();
    }
  }

  async register(data: { email: string; password: string; username: string; display_name?: string }): Promise<boolean> {
    this.isLoading = true;
    this.notify();

    try {
      const response = await apiClient.post('/auth/register', data);
      const resData = response.data.data || response.data;
      const accessToken = resData.access_token || resData.token;

      if (accessToken) {
        await setStoredTokens(accessToken, resData.refresh_token);
        this.user = resData.user || {
          id: resData.id || `user-${Date.now()}`,
          username: data.username,
          email: data.email,
          display_name: data.display_name || data.username,
        };
        this.isAuthenticated = true;
        await AsyncStorage.setItem('mc_user_info', JSON.stringify(this.user));
        wsService.connect();
      } else {
        // Automatically attempt login
        return await this.login(data.email, data.password);
      }
      return true;
    } catch (err: any) {
      console.error('Registration error:', err?.response?.data || err.message);
      throw err;
    } finally {
      this.isLoading = false;
      this.notify();
    }
  }

  async updateAvatar(avatarUrl: string) {
    if (!this.user) return;
    this.user = { ...this.user, avatar_url: avatarUrl };
    await AsyncStorage.setItem('mc_user_info', JSON.stringify(this.user));
    this.notify();

    try {
      await apiClient.put('/auth/profile', { avatar_url: avatarUrl });
    } catch (e) {
      console.warn('Update avatar remote sync warning:', e);
    }
  }

  async logout() {
    wsService.disconnect();
    await clearStoredTokens();
    this.user = null;
    this.isAuthenticated = false;
    this.notify();
  }
}

export const authStore = new AuthStore();
