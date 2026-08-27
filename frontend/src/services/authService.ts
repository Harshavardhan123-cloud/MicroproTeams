import { apiClient } from '../api/client';
import { User } from '../types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
  first_name: string;
  last_name: string;
  organization_name: string;
}

export const authService = {
  login: async (payload: LoginPayload) => {
    const res = await apiClient.post('/auth/login', payload);
    const data = res.data.data || res.data;
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data;
  },

  register: async (payload: RegisterPayload) => {
    const res = await apiClient.post('/auth/register', payload);
    const data = res.data.data || res.data;
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data;
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  },

  getMe: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me');
    return res.data.data || res.data;
  }
};
