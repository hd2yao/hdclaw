export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#0f172a',
        panelSoft: '#111827',
        border: 'rgba(148, 163, 184, 0.16)',
        accent: '#22c55e',
        warn: '#f59e0b',
        danger: '#ef4444',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(148,163,184,0.1), 0 8px 30px rgba(2,6,23,0.35)',
      },
    },
  },
  plugins: [],
};
