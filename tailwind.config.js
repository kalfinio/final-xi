/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0d0d',
        surface: '#161616',
        card: '#1e1e1e',
        border: '#2a2a2a',
        primary: '#f0f0f0',
        secondary: '#888888',
        gold: '#c9a84c',
        success: '#4ade80',
        danger: '#f87171',
      },
    },
  },
  plugins: [],
}
