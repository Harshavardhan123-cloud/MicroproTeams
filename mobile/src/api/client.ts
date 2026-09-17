import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_SERVER = 'https://violin-providers-entries-content.trycloudflare.com';
export const LAN_SERVER = 'http://192.168.1.147:8000';
export const CLOUDFLARE_TUNNEL_URL = 'https://violin-providers-entries-content.trycloudflare.com';

// Default listen port of backend/sfu (SFU_LISTEN_PORT || 3010).
export const SFU_DEFAULT_PORT = 3010;

const STORAGE_KEYS = {
  SERVER_URL: 'mc_mobile_server_url',
  SFU_URL: 'mc_mobile_sfu_url',
  ACCESS_TOKEN: 'mc_access_token',
  REFRESH_TOKEN: 'mc_refresh_token',
  USER_INFO: 'mc_user_info',
  AVATAR: 'mc_user_avatar',
  RINGTONE: 'mc_user_ringtone',
};

let currentServerUrl: string = DEFAULT_SERVER;
// '' means "no explicit override — derive the SFU host from the backend host".
let currentSfuUrl: string = '';
let currentAccessToken: string | null = null;
let currentRefreshToken: string | null = null;

// Initialize server URL from storage
export const initApiClient = async () => {
  try {
    const savedServer = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_URL);
    if (savedServer && savedServer.trim().length > 0) {
      const trimmed = savedServer.trim().replace(/\/$/, '');
      // If user had an older ephemeral trycloudflare.com tunnel saved, auto-migrate to the active tunnel
      if (trimmed.includes('trycloudflare.com') && trimmed !== CLOUDFLARE_TUNNEL_URL) {
        currentServerUrl = CLOUDFLARE_TUNNEL_URL;
        await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL, CLOUDFLARE_TUNNEL_URL);
      } else {
        currentServerUrl = trimmed;
      }
    } else {
      currentServerUrl = DEFAULT_SERVER;
    }
    
    const savedSfu = await AsyncStorage.getItem(STORAGE_KEYS.SFU_URL);
    currentSfuUrl = savedSfu ? savedSfu.trim().replace(/\/$/, '') : '';

    currentAccessToken = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    currentRefreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  } catch (err) {
    console.warn('Failed to load storage in initApiClient:', err);
    currentServerUrl = DEFAULT_SERVER;
    currentSfuUrl = '';
  }
};

export const getTargetHostUrl = (): string => currentServerUrl;

export const setTargetHostUrl = async (url: string) => {
  const clean = url.trim().replace(/\/$/, '');
  currentServerUrl = clean;
  await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL, clean);
};

export const getApiBaseUrl = (): string => `${getTargetHostUrl()}/api/v1`;

// ---------------------------------------------------------------------------
// SFU (media server) host
//
// The mediasoup signaling socket needs its host *synchronously* at connect
// time, so this mirrors the getTargetHostUrl/setTargetHostUrl pattern above:
// a module-level cache hydrated once by initApiClient(), a synchronous getter,
// and an async setter that writes cache + AsyncStorage together.
// ---------------------------------------------------------------------------

/**
 * Explicit user override for the SFU host, or '' when the meeting manager
 * should auto-derive it from the backend host (see getDerivedSfuUrl).
 *
 * A value ending in `/sfu` means "reach the SFU through the nginx proxy on the
 * backend origin" — the manager turns that into socket.io `path: '/sfu/socket.io'`.
 */
export const getSfuHostUrl = (): string => currentSfuUrl;

/** Pass '' (or undefined) to clear the override and go back to deriving. */
export const setSfuHostUrl = async (url: string) => {
  const clean = (url || '').trim().replace(/\/$/, '');
  currentSfuUrl = clean;
  if (clean) {
    await AsyncStorage.setItem(STORAGE_KEYS.SFU_URL, clean);
  } else {
    await AsyncStorage.removeItem(STORAGE_KEYS.SFU_URL);
  }
};

/**
 * What the meeting manager falls back to when no override is set: the backend
 * host's protocol + hostname with the backend port dropped and the SFU's own
 * port appended. Exported so the config UI can show the value it will use.
 *
 * `fromUrl` lets the UI preview the derivation for a host the user has typed
 * but not saved yet; it defaults to the currently active backend host.
 *
 * NOTE: this is deliberately hand-parsed rather than using `new URL()`.
 * React Native's URL polyfill (react-native/Libraries/Blob/URL.js) *throws*
 * from the `protocol` and `hostname` getters, so a URL-based derivation would
 * silently fall through to the fallback on every single call.
 *
 * An https backend yields `https://host:3010`, which the plain-HTTP SFU will
 * not answer — that is precisely the case where the user must set an explicit
 * override (usually the `${backend}/sfu` proxied form).
 */
export const getDerivedSfuUrl = (fromUrl?: string): string => {
  const base = (fromUrl ?? getTargetHostUrl()).trim();
  // scheme + host, where host is either a bracketed IPv6 literal or a
  // plain hostname/IPv4. Any port, path, query or fragment is discarded.
  const match = /^(https?:)\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(base);
  if (!match) return `http://localhost:${SFU_DEFAULT_PORT}`;
  return `${match[1].toLowerCase()}//${match[2]}:${SFU_DEFAULT_PORT}`;
};

// Resolves a file/attachment URL returned by the backend (which may be relative,
// or point at a different host than the currently-configured server) into an
// absolute URL against the currently active server. Mirrors the web frontend's
// `getMediaUrl` helper (frontend/src/api/client.ts) so attachment tags encoded by
// either client resolve identically for both clients.
export const getMediaUrl = (url?: string): string => {
  if (!url) return '';
  // blob: and data: URIs are already directly usable
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;

  // If it's an /uploads path (relative, or absolute with any host prefix),
  // resolve it against the currently configured server host.
  if (url.includes('/uploads/')) {
    const filename = url.split('/uploads/')[1];
    return `${getTargetHostUrl()}/uploads/${filename}`;
  }

  // Already an absolute URL pointing elsewhere (e.g. external storage)
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  // Fallback: treat as a path relative to the backend host
  return `${getTargetHostUrl()}/${url.replace(/^\//, '')}`;
};

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
