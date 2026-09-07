import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_SERVER = 'http://192.168.1.147:8000';
export const CLOUDFLARE_TUNNEL_URL = 'https://outdoors-introduction-commodities-gender.trycloudflare.com';

const STORAGE_KEYS = {
  SERVER_URL: 'mc_mobile_server_url',
  ACCESS_TOKEN: 'mc_access_token',
  REFRESH_TOKEN: 'mc_refresh_token',
  USER_INFO: 'mc_user_info',
  AVATAR: 'mc_user_avatar',
  RINGTONE: 'mc_user_ringtone',
};

let currentServerUrl: string = DEFAULT_SERVER;
let currentAccessToken: string | null = null;
let currentRefreshToken: string | null = null;

// Initialize server URL from storage
export const initApiClient = async () => {
  try {
    const savedServer = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_URL);
    if (savedServer && savedServer.trim().length > 0) {
      currentServerUrl = savedServer.trim().replace(/\/$/, '');
    } else {
      currentServerUrl = DEFAULT_SERVER;
    }
    
    currentAccessToken = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    currentRefreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  } catch (err) {
    console.warn('Failed to load storage in initApiClient:', err);
    currentServerUrl = DEFAULT_SERVER;
  }
};

export const getTargetHostUrl = (): string => currentServerUrl;

export const setTargetHostUrl = async (url: string) => {
  const clean = url.trim().replace(/\/$/, '');
  currentServerUrl = clean;
  await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL, clean);
};

export const getApiBaseUrl = (): string => `${getTargetHostUrl()}/api/v1`;

export const getStoredToken = async (): Promise<string | null> => {
  if (currentAccessToken) return currentAccessToken;
  currentAccessToken = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  return currentAccessToken;
};

export const setStoredTokens = async (accessToken: string, refreshToken?: string) => {
  currentAccessToken = accessToken;
  await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  if (refreshToken) {
    currentRefreshToken = refreshToken;
    await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  }
};

export const clearStoredTokens = async () => {
  currentAccessToken = null;
  currentRefreshToken = null;
  await AsyncStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  await AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  await AsyncStorage.removeItem(STORAGE_KEYS.USER_INFO);
};

export const apiClient = axios.create({
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
    'ngrok-skip-browser-warning': 'true',
  },
});

apiClient.interceptors.request.use(async (config) => {
  config.baseURL = getApiBaseUrl();
  const token = currentAccessToken || (await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN));
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refToken = currentRefreshToken || (await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN));
      if (refToken) {
        try {
          const res = await axios.post(`${getApiBaseUrl()}/auth/refresh`, {
            refresh_token: refToken,
          });
          const data = res.data.data || res.data;
          if (data.access_token) {
            await setStoredTokens(data.access_token, data.refresh_token);
            originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
            return apiClient(originalRequest);
          }
        } catch (refreshErr) {
          await clearStoredTokens();
        }
      }
    }
    return Promise.reject(error);
  }
);
