module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        void: '#070b12',
        steel: '#101827',
        panel: '#0d1422',
        line: 'rgba(148,163,184,0.15)',
        accent: '#51d8ff',
        accent2: '#7df9ff',
        danger: '#ff5d7d',
        success: '#4ade80'
      },
      boxShadow: {
        hud: '0 0 0 1px rgba(81,216,255,.12), 0 20px 50px rgba(0,0,0,.45)',
        glow: '0 0 30px rgba(81,216,255,.18)'
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(81,216,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(81,216,255,0.05) 1px, transparent 1px)'
      }
    }
  },
  plugins: []
}
