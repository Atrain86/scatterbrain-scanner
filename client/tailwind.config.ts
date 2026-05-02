import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core palette — matches PaintBrain dark aesthetic
        'sb-purple': '#a855f7',
        'sb-green': '#4ade80',
        'sb-yellow': '#eab308',
        'sb-red': '#F44747',
        'sb-orange': '#E67E22',
        'sb-cyan': '#4ECDC4',
        'sb-blue': '#0C87C1',

        // Category colors
        'cat-supplies':    '#E67E22',
        'cat-gas':         '#F44747',
        'cat-vehicle':     '#0C87C1',
        'cat-equipment':   '#eab308',
        'cat-meals':       '#4ade80',
        'cat-office':      '#a855f7',
        'cat-subs':        '#4ECDC4',
        'cat-insurance':   '#888888',
        'cat-phone':       '#2DD4BF',
        'cat-other':       '#6B7280',

        // Surfaces
        'sb-bg':     '#000000',
        'sb-card':   '#1a1a2e',
        'sb-card2':  '#16213e',
        'sb-border': '#333333',
        'sb-text':   '#FFFFFF',
        'sb-muted':  '#888888',
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in':  'fade-in 150ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
