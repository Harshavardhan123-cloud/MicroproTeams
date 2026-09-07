import { apiClient } from '../api/client';
import { User } from '../types';
import { setTokens, clearTokens } from '../utils/token';

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
  otp_code?: string;
}

export type OTPPurpose = 'REGISTER' | 'FORGOT_PASSWORD' | 'CHANGE_PASSWORD';

export const authService = {
  login: async (payload: LoginPayload) => {
    const res = await apiClient.post('/auth/login', payload);
    const data = res.data.data || res.data;
    if (data.access_token) {
      setTokens(data.access_token, data.refresh_token);
    }
    return data;
  },

  sendOTP: async (email: string, purpose: OTPPurpose): Promise<{ message: string; dev_otp?: string }> => {
    const res = await apiClient.post('/auth/send-otp', { email, purpose });
    return res.data.data || res.data;
  },

  verifyOTP: async (email: string, otp_code: string, purpose: OTPPurpose): Promise<{ message: string }> => {
    const res = await apiClient.post('/auth/verify-otp', { email, otp_code, purpose });
    return res.data.data || res.data;
  },

  register: async (payload: RegisterPayload) => {
    const res = await apiClient.post('/auth/register', payload);
    const data = res.data.data || res.data;
    if (data.access_token) {
      setTokens(data.access_token, data.refresh_token);
    }
    return data;
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      clearTokens();
    }
  },

  getMe: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me');
    return res.data.data || res.data;
  },

  forgotPassword: async (email: string): Promise<{ message: string; dev_otp?: string }> => {
    const res = await apiClient.post('/auth/forgot-password', { email });
    return res.data.data || res.data;
  },

  resetPassword: async (email: string, otp_code: string, newPassword: string): Promise<{ message: string }> => {
    const res = await apiClient.post('/auth/reset-password', { email, otp_code, new_password: newPassword });
    return res.data.data || res.data;
  },

  changePassword: async (currentPassword: string, newPassword: string, otp_code: string): Promise<{ message: string }> => {
    const res = await apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
      otp_code: otp_code
    });
    return res.data.data || res.data;
  }
};
