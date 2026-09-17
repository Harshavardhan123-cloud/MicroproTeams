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

export type OtpPurpose = 'REGISTER' | 'FORGOT_PASSWORD' | 'CHANGE_PASSWORD';

export interface RegisterData {
  email: string;
  password: string;
  username: string;
  first_name: string;
  last_name: string;
  organization_name: string;
  otp_code?: string;
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

  async register(data: RegisterData): Promise<boolean> {
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
          display_name: `${data.first_name} ${data.last_name}`.trim() || data.username,
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

  /**
   * Sends a 6-digit email OTP code for the given purpose.
   * Backend: POST /auth/send-otp { email, purpose } -> { message, email, purpose, dev_otp? }
   */
  async sendOtp(email: string, purpose: OtpPurpose): Promise<{ message?: string; dev_otp?: string }> {
    try {
      const response = await apiClient.post('/auth/send-otp', { email, purpose });
      return response.data.data || response.data;
    } catch (err: any) {
      console.error('Send OTP error:', err?.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Verifies a previously sent OTP code (optional standalone check).
   * Backend: POST /auth/verify-otp { email, otp_code, purpose } -> { message, email, purpose }
   */
  async verifyOtp(email: string, otpCode: string, purpose: OtpPurpose): Promise<{ message?: string }> {
    try {
      const response = await apiClient.post('/auth/verify-otp', {
        email,
        otp_code: otpCode,
        purpose,
      });
      return response.data.data || response.data;
    } catch (err: any) {
      console.error('Verify OTP error:', err?.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Starts the password-reset flow by emailing an OTP to a registered account.
   * Backend: POST /auth/forgot-password { email } -> { message, email, dev_otp? }
   */
  async forgotPassword(email: string): Promise<{ message?: string; dev_otp?: string }> {
    try {
      const response = await apiClient.post('/auth/forgot-password', { email });
      return response.data.data || response.data;
    } catch (err: any) {
      console.error('Forgot password error:', err?.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Completes the password-reset flow using the OTP sent via forgotPassword.
   * Backend: POST /auth/reset-password { email, otp_code, new_password } -> { message }
   */
  async resetPassword(email: string, otpCode: string, newPassword: string): Promise<{ message?: string }> {
    try {
      const response = await apiClient.post('/auth/reset-password', {
        email,
        otp_code: otpCode,
        new_password: newPassword,
      });
      return response.data.data || response.data;
    } catch (err: any) {
      console.error('Reset password error:', err?.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Changes the current authenticated user's password. Requires an OTP sent to
   * the user's own email with purpose CHANGE_PASSWORD (see sendOtp).
   * Backend: POST /auth/change-password { current_password, new_password, otp_code } -> { message }
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
    otpCode: string
  ): Promise<{ message?: string }> {
    try {
      const response = await apiClient.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        otp_code: otpCode,
      });
      return response.data.data || response.data;
    } catch (err: any) {
      console.error('Change password error:', err?.response?.data || err.message);
      throw err;
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
    try {
      // Best-effort: revoke server-side session state. Must run before we
      // clear the stored access token since this call is authenticated.
      await apiClient.post('/auth/logout');
    } catch (err) {
      console.warn('Logout API warning:', err);
    }

    wsService.disconnect();
    await clearStoredTokens();
    this.user = null;
    this.isAuthenticated = false;
    this.notify();
  }
}

export const authStore = new AuthStore();
