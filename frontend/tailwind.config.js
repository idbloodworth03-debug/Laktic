/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        dark: {
          900: '#080c09',
          800: '#0d1610',
          750: '#111e14',
          700: '#162618',
          650: '#1a2d1e',
          600: '#1e3322',
          500: '#243a28',
          400: '#3a5440',
        },
      },
      boxShadow: {
        'glow-sm':          '0 0 14px rgba(34,197,94,0.18)',
        'glow-md':          '0 0 28px rgba(34,197,94,0.22)',
        'card':             '0 1px 2px rgba(0,0,0,0.4), 0 3px 10px rgba(0,0,0,0.25)',
        'card-lg':          '0 4px 24px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)',
        'btn-primary':      '0 1px 0 rgba(255,255,255,0.07) inset, 0 2px 10px rgba(34,197,94,0.22)',
        'btn-primary-hover':'0 1px 0 rgba(255,255,255,0.07) inset, 0 4px 16px rgba(34,197,94,0.32)',
      },
    },
  },
  plugins: [],
};
