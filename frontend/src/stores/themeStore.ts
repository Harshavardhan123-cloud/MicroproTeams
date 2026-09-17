import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light' | 'auto';

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  initTheme: () => void;
}

const getStoredTheme = (): ThemeMode => {
  const stored = localStorage.getItem('mc_theme') || localStorage.getItem('teams_theme');
  if (stored === 'light' || stored === 'dark' || stored === 'auto') {
    return stored;
  }
  return 'dark';
};

/**
 * Day/Night time detection:
 * Daytime: 07:00 AM to 07:00 PM (19:00) -> Light Mode
 * Nighttime: 07:00 PM to 07:00 AM -> Dark Mode
 */
const isDayTime = (): boolean => {
  const hours = new Date().getHours();
  return hours >= 7 && hours < 19;
};

const applyThemeToDOM = (mode: ThemeMode) => {
  let isLight = false;
  if (mode === 'auto') {
    // Auto theme based on Day / Night time cycle
    isLight = isDayTime();
  } else if (mode === 'light') {
    isLight = true;
  } else {
    isLight = false;
  }

  if (isLight) {
    document.documentElement.classList.add('light-mode');
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.remove('light-mode');
    document.documentElement.classList.add('dark');
  }
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getStoredTheme(),
  setTheme: (newTheme: ThemeMode) => {
    localStorage.setItem('mc_theme', newTheme);
    localStorage.setItem('teams_theme', newTheme);
    set({ theme: newTheme });
    applyThemeToDOM(newTheme);
  },
  initTheme: () => {
    const currentTheme = getStoredTheme();
    applyThemeToDOM(currentTheme);

    // Monitor time changes every minute for seamless Day/Night transitions in Auto mode
    setInterval(() => {
      if (get().theme === 'auto') {
        applyThemeToDOM('auto');
      }
    }, 60000);

    // Also listen to OS media query changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (get().theme === 'auto') {
        applyThemeToDOM('auto');
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemChange);
    } else {
      mediaQuery.addListener(handleSystemChange);
    }
  },
}));
