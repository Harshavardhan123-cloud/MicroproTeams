import { apiClient } from '../api/client';
import { User } from '../types';

export const userService = {
  getUsers: async (): Promise<User[]> => {
    const res = await apiClient.get('/users');
    return res.data.data || res.data;
  },

  getProfile: async (): Promise<User> => {
    const res = await apiClient.get('/users/me');
    return res.data.data || res.data;
  }
};
