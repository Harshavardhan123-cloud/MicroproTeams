/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      },
      colors: {
        mc: {
          base: '#0B0D12',
          surface: '#11131A',
          elevated: '#171923',
          overlay: '#1E2130',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-subtle': 'rgba(255, 255, 255, 0.04)',
          
          text: '#F4F5F7',
          secondary: '#9AA3B8',
          muted: '#697386',
          
          indigo: '#4F46E5',
          violet: '#7C3AED',
          cyan: '#06B6D4',
          
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
        },
        // Legacy alias mapped to new Micropro_Commute design system
        teams: {
          purple: '#6366F1',
          'purple-hover': '#4F46E5',
          'purple-dark': '#7C3AED',
          bg: '#0B0D12',
          sidebar: '#11131A',
          card: '#171923',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.05)',
          active: 'rgba(255, 255, 255, 0.09)',
          text: '#F4F5F7',
          muted: '#697386',
          accent: '#22D3EE'
        }
      },
      backgroundImage: {
        'mc-gradient-primary': 'linear-gradient(135deg, #4F46E5, #7C3AED)',
        'mc-gradient-accent': 'linear-gradient(135deg, #6366F1, #06B6D4)',
        'mc-gradient-glow': 'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15), transparent 70%)',
        'mc-gradient-dark': 'linear-gradient(180deg, #11131A 0%, #0B0D12 100%)',
      },
      boxShadow: {
        'mc-glass': '0 8px 32px 0 rgba(0, 0, 0, 0.36)',
        'mc-glow': '0 0 20px -5px rgba(99, 102, 241, 0.4)',
        'mc-glow-cyan': '0 0 20px -5px rgba(6, 182, 212, 0.4)',
        'mc-card': '0 4px 20px rgba(0, 0, 0, 0.25)',
      }
    },
  },
  plugins: [],
}
