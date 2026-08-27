/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        teams: {
          purple: '#5B5FC7',
          'purple-hover': '#4F52B2',
          'purple-dark': '#464775',
          bg: '#181818',
          sidebar: '#1F1F1F',
          card: '#292929',
          border: '#333333',
          hover: '#383838',
          active: '#424242',
          text: '#F5F5F5',
          muted: '#A1A1A1',
          accent: '#7B83EB'
        }
      }
    },
  },
  plugins: [],
}
