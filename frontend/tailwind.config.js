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
        mesh: {
          50: '#f0f5ff',
          100: '#e0ecff',
          200: '#c7dcff',
          300: '#9ec4ff',
          400: '#6ca2ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#0b132b',
        },
        slate: {
          850: '#162032',
          925: '#0b111e',
        }
      }
    },
  },
  plugins: [],
}
