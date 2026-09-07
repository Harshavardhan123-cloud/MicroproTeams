import axios from 'axios';
import { getToken, getRefreshToken, setTokens, clearTokens } from '../utils/token';

export const DEFAULT_SERVER = 'http://192.168.1.147:8000';
export const CLOUDFLARE_TUNNEL_URL = 'https://outdoors-introduction-commodities-gender.trycloudflare.com';

export const getTargetHostUrl = () => {
  if (typeof window !== 'undefined') {
    // 1. User-configured custom server URL (saved in Desktop App or settings)
    const custom = localStorage.getItem('electron_server_url') || localStorage.getItem('mc_server_url');
    if (custom && custom.trim().length > 0 && !custom.startsWith('file:')) {
      return custom.trim().replace(/\/$/, '');
    }

    // 2. Browser environment running on http:// or https:// (NOT file://)
    const origin = window.location.origin;
    const protocol = window.location.protocol;
    if (
      origin &&
      origin !== 'null' &&
      !origin.startsWith('file:') &&
      (protocol === 'http:' || protocol === 'https:')
    ) {
      return origin.replace(/\/$/, '');
    }
  }

  // 3. Desktop / Electron fallback
  return DEFAULT_SERVER;
};

export const setTargetHostUrl = (url: string) => {
  const clean = url.trim().replace(/\/$/, '');
  localStorage.setItem('electron_server_url', clean);
  localStorage.setItem('mc_server_url', clean);
};

export const getApiBaseUrl = () => `${getTargetHostUrl()}/api/v1`;

export const getElectronServerBase = getTargetHostUrl;

export const getMediaUrl = (url?: string) => {
  if (!url) return '';
  // blob: and data: are already usable directly
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  
  // If it's an /uploads path (relative or with any host prefix), resolve to absolute backend URL
  if (url.includes('/uploads/')) {
    const filename = url.split('/uploads/')[1];
    return `${getTargetHostUrl()}/uploads/${filename}`;
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    if (url.startsWith('http://')) {
      url = url.replace(/^http:\/\//, 'https://');
    }
  }

  // Already absolute URL
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Fallback: prepend backend host
  return `${getTargetHostUrl()}/${url.replace(/^\//, '')}`;
};

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  config.headers['Bypass-Tunnel-Reminder'] = 'true';
  config.headers['ngrok-skip-browser-warning'] = 'true';
  const token = getToken();
  if (token && token !== 'undefined' && token !== 'null') {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = getRefreshToken();
      if (refreshToken && refreshToken !== 'undefined' && refreshToken !== 'null') {
        try {
          const res = await axios.post(`${getApiBaseUrl()}/auth/refresh`, { refresh_token: refreshToken });
          const data = res.data.data || res.data;
          if (data.access_token) {
            setTokens(data.access_token, data.refresh_token);
            originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
            return apiClient(originalRequest);
          }
        } catch (err) {
          clearTokens();
          window.location.href = '#/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const getApiErrorMessage = (err: any, fallbackMessage: string = 'An unexpected error occurred'): string => {
  if (!err?.response) return err?.message || fallbackMessage;
  const data = err.response.data;
  if (!data) return fallbackMessage;
  if (typeof data === 'string') return data;
  if (data.error?.message) return data.error.message;
  if (data.detail) {
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      return data.detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join(', ');
    }
  }
  if (data.message) return data.message;
  return fallbackMessage;
};

