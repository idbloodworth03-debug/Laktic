/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['DM Sans', 'system-ui', 'sans-serif'],
        hero:    ['DM Sans', 'system-ui', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#edfff8',
          100: '#d1fded',
          200: '#a6f9dc',
          300: '#69f2c7',
          400: '#2ee5ad',
          500: '#00E5A0',
          600: '#00c988',
          700: '#009e6b',
          800: '#007c54',
          900: '#006645',
          950: '#00261a',
        },
        dark: {
          900: '#0a0a0a',
          800: '#111111',
          750: '#1a1a1a',
          700: '#222222',
          650: '#2a2a2a',
          600: '#333333',
          500: '#444444',
          400: '#666666',
        },
      },
      boxShadow: {
        'glow-sm':           '0 0 12px rgba(0,229,160,0.18)',
        'glow-md':           '0 0 24px rgba(0,229,160,0.25)',
        'card':              '0 1px 3px rgba(0,0,0,0.4)',
        'card-lg':           '0 4px 20px rgba(0,0,0,0.5)',
        'btn-primary':       '0 1px 0 rgba(255,255,255,0.06) inset',
        'btn-primary-hover': '0 0 0 3px rgba(0,229,160,0.2)',
      },
    },
  },
  plugins: [],
};
