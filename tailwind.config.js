module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        void:   '#070b12',
        steel:  '#101827',
        panel:  '#0d1422',
        line:   'rgba(148,163,184,0.15)',
        // Couleur d'accent pilotée par CSS variable — supporte le modificateur
        // d'opacité Tailwind : bg-accent/10, text-accent, border-accent/25, etc.
        // La valeur réelle est injectée dynamiquement par applyAppearance().
        accent:  'rgb(var(--accent-rgb)  / <alpha-value>)',
        accent2: 'rgb(var(--accent2-rgb) / <alpha-value>)',
        danger:  '#ff5d7d',
        success: '#4ade80',
      },
      backgroundColor: {
        'th-base':    'var(--bg-base)',
        'th-primary': 'var(--bg-primary)',
        'th-surface': 'var(--bg-surface)',
        'th-card':    'var(--bg-card)',
        'th-hover':   'var(--bg-hover)',
        'th-active':  'var(--bg-active)',
      },
      textColor: {
        'th-primary':   'var(--text-primary)',
        'th-bright':    'var(--text-bright)',
        'th-secondary': 'var(--text-secondary)',
        'th-muted':     'var(--text-muted)',
        'th-disabled':  'var(--text-disabled)',
      },
      borderColor: {
        DEFAULT:     'var(--border)',
        'th':        'var(--border)',
        'th-subtle': 'var(--border-subtle)',
        'th-muted':  'var(--border-muted)',
      },
      boxShadow: {
        hud:  'var(--shadow-hud)',
        glow: 'var(--shadow-glow)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(var(--accent-rgb), 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--accent-rgb), 0.05) 1px, transparent 1px)',
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
    }
  },
  plugins: []
}
