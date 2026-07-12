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
        // Scan button tap: quick squeeze + green glow bloom, spring back.
        // Uses the same #4ade80 as the button ring; peak bloom is brighter
        // and wider than rest so the press reads as "lit up."
        'scan-pulse': {
          '0%':   { transform: 'scale(1)',    boxShadow: '0 0 14px rgba(74,222,128,0.40)' },
          '35%':  { transform: 'scale(0.92)', boxShadow: '0 0 22px 4px rgba(74,222,128,0.85)' },
          '100%': { transform: 'scale(1)',    boxShadow: '0 0 14px rgba(74,222,128,0.40)' },
        },
      },
      animation: {
        'fade-in':   'fade-in 150ms ease-out',
        'slide-up':  'slide-up 200ms ease-out',
        // Spring easing so the scale-back overshoots slightly for a tactile pop.
        'scan-pulse': 'scan-pulse 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
