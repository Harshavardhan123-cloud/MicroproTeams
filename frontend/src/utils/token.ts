export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
};

export const getRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('refresh_token') || localStorage.getItem('refresh_token');
};

export const setTokens = (accessToken: string, refreshToken: string) => {
  if (typeof window === 'undefined') return;
  // Session storage ensures user is auto-logged out when app window/tab is closed
  sessionStorage.setItem('access_token', accessToken);
  sessionStorage.setItem('refresh_token', refreshToken);
  // Clear persistent localStorage tokens
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
};

export const clearTokens = () => {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('refresh_token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
};
