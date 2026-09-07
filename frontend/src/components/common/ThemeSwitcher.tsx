import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore, ThemeMode } from '../../stores/themeStore';

interface ThemeSwitcherProps {
  variant?: 'compact' | 'cards' | 'dropdown';
  className?: string;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ variant = 'compact', className = '' }) => {
  const { theme, setTheme } = useThemeStore();

  const options: { mode: ThemeMode; label: string; subLabel: string; icon: React.FC<{ className?: string }> }[] = [
    { mode: 'light', label: 'Light', subLabel: 'Day mode', icon: Sun },
    { mode: 'dark', label: 'Dark', subLabel: 'Quiet dark', icon: Moon },
    { mode: 'auto', label: 'Auto', subLabel: 'Day / Night cycle', icon: Monitor },
  ];

  if (variant === 'cards') {
    return (
      <div className={`grid grid-cols-3 gap-3 ${className}`}>
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = theme === opt.mode;
          return (
            <div
              key={opt.mode}
              onClick={() => setTheme(opt.mode)}
              className={`p-3.5 bg-[#11131A] border-2 rounded-xl cursor-pointer transition-all flex flex-col items-center justify-center gap-2 select-none ${
                isActive
                  ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-500/10'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : 'text-mc-muted'}`} />
              <div className="text-center">
                <p className={`text-xs font-bold ${isActive ? 'text-white' : 'text-mc-secondary'}`}>
                  {opt.label}
                </p>
                <p className="text-[10px] text-mc-muted mt-0.5">{opt.subLabel}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center bg-[#171923] border border-white/10 p-1 rounded-xl gap-1 select-none ${className}`}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = theme === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            onClick={() => setTheme(opt.mode)}
            title={`Switch to ${opt.label} theme`}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              isActive
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-mc-muted hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="capitalize">{opt.mode}</span>
          </button>
        );
      })}
    </div>
  );
};
