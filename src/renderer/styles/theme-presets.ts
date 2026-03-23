/**
 * 1CC Overlay — Presets de thème
 *
 * Chaque preset définit l'intégralité des variables CSS nécessaires.
 * applyAppearance() applique ces variables sur :root puis laisse
 * l'utilisateur surcharger la couleur d'accent si besoin.
 */

export interface ThemeVars {
  '--accent-rgb':    string
  '--bg-base':       string
  '--bg-primary':    string
  '--bg-surface':    string
  '--bg-card':       string
  '--bg-hover':      string
  '--text-primary':  string
  '--text-secondary':string
  '--text-muted':    string
  '--border':        string
  '--border-subtle': string
  '--color-success': string
  '--color-danger':  string
  '--shadow-hud':    string
}

export interface ThemePreset {
  id:          string
  label:       string
  description: string
  /** Couleur CSS pour l'aperçu visuel (swatch) */
  preview:     string
  vars:        ThemeVars
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export const THEME_PRESETS: ThemePreset[] = [
  {
    id:          'cyan',
    label:       'Cyan',
    description: 'Thème militaire bleu-cyan (défaut)',
    preview:     'rgb(34, 211, 238)',
    vars: {
      '--accent-rgb':     '34, 211, 238',
      '--bg-base':        '#070b12',
      '--bg-primary':     '#09101b',
      '--bg-surface':     'rgba(15, 23, 42, 0.80)',
      '--bg-card':        'rgba(0, 0, 0, 0.20)',
      '--bg-hover':       'rgba(255, 255, 255, 0.05)',
      '--text-primary':   '#f1f5f9',
      '--text-secondary': '#94a3b8',
      '--text-muted':     '#475569',
      '--border':         'rgba(34, 211, 238, 0.20)',
      '--border-subtle':  '#1e293b',
      '--color-success':  '#34d399',
      '--color-danger':   '#fb7185',
      '--shadow-hud':     '0 0 0 1px rgba(34,211,238,0.12), 0 20px 50px rgba(0,0,0,0.45)',
    },
  },
  {
    id:          'neutral',
    label:       'Neutre',
    description: 'Interface épurée sans dominante colorée',
    preview:     'rgb(148, 163, 184)',
    vars: {
      '--accent-rgb':     '148, 163, 184',
      '--bg-base':        '#0a0a0a',
      '--bg-primary':     '#111111',
      '--bg-surface':     'rgba(20, 20, 20, 0.90)',
      '--bg-card':        'rgba(255, 255, 255, 0.04)',
      '--bg-hover':       'rgba(255, 255, 255, 0.06)',
      '--text-primary':   '#e2e8f0',
      '--text-secondary': '#94a3b8',
      '--text-muted':     '#64748b',
      '--border':         'rgba(148, 163, 184, 0.15)',
      '--border-subtle':  '#1c1c1c',
      '--color-success':  '#4ade80',
      '--color-danger':   '#f87171',
      '--shadow-hud':     '0 0 0 1px rgba(148,163,184,0.10), 0 20px 50px rgba(0,0,0,0.50)',
    },
  },
  {
    id:          'neon',
    label:       'Neon',
    description: 'Accents verts style cyberpunk',
    preview:     'rgb(74, 222, 128)',
    vars: {
      '--accent-rgb':     '74, 222, 128',
      '--bg-base':        '#020c02',
      '--bg-primary':     '#040f06',
      '--bg-surface':     'rgba(2, 17, 5, 0.90)',
      '--bg-card':        'rgba(74, 222, 128, 0.03)',
      '--bg-hover':       'rgba(74, 222, 128, 0.06)',
      '--text-primary':   '#dcfce7',
      '--text-secondary': '#86efac',
      '--text-muted':     '#4ade80',
      '--border':         'rgba(74, 222, 128, 0.20)',
      '--border-subtle':  '#0f2011',
      '--color-success':  '#86efac',
      '--color-danger':   '#f87171',
      '--shadow-hud':     '0 0 0 1px rgba(74,222,128,0.15), 0 20px 50px rgba(0,0,0,0.60)',
    },
  },
  {
    id:          'amber',
    label:       'Ambre',
    description: 'Teintes chaudes — style terminal rétro',
    preview:     'rgb(251, 191, 36)',
    vars: {
      '--accent-rgb':     '251, 191, 36',
      '--bg-base':        '#0f0900',
      '--bg-primary':     '#130c00',
      '--bg-surface':     'rgba(24, 15, 0, 0.90)',
      '--bg-card':        'rgba(251, 191, 36, 0.04)',
      '--bg-hover':       'rgba(251, 191, 36, 0.06)',
      '--text-primary':   '#fefce8',
      '--text-secondary': '#fde68a',
      '--text-muted':     '#d97706',
      '--border':         'rgba(251, 191, 36, 0.20)',
      '--border-subtle':  '#1c1200',
      '--color-success':  '#4ade80',
      '--color-danger':   '#f87171',
      '--shadow-hud':     '0 0 0 1px rgba(251,191,36,0.12), 0 20px 50px rgba(0,0,0,0.50)',
    },
  },
  {
    id:          'purple',
    label:       'Violet',
    description: 'Accents violets — style galactique',
    preview:     'rgb(167, 139, 250)',
    vars: {
      '--accent-rgb':     '167, 139, 250',
      '--bg-base':        '#070512',
      '--bg-primary':     '#0a0718',
      '--bg-surface':     'rgba(12, 8, 30, 0.85)',
      '--bg-card':        'rgba(167, 139, 250, 0.04)',
      '--bg-hover':       'rgba(167, 139, 250, 0.06)',
      '--text-primary':   '#f5f3ff',
      '--text-secondary': '#c4b5fd',
      '--text-muted':     '#7c3aed',
      '--border':         'rgba(167, 139, 250, 0.20)',
      '--border-subtle':  '#140e2a',
      '--color-success':  '#4ade80',
      '--color-danger':   '#f87171',
      '--shadow-hud':     '0 0 0 1px rgba(167,139,250,0.12), 0 20px 50px rgba(0,0,0,0.50)',
    },
  },
  {
    id:          'high-contrast',
    label:       'Contraste élevé',
    description: 'Blanc pur sur noir — accessibilité maximale',
    preview:     'rgb(255, 255, 255)',
    vars: {
      '--accent-rgb':     '255, 255, 255',
      '--bg-base':        '#000000',
      '--bg-primary':     '#000000',
      '--bg-surface':     'rgba(255, 255, 255, 0.05)',
      '--bg-card':        'rgba(255, 255, 255, 0.04)',
      '--bg-hover':       'rgba(255, 255, 255, 0.10)',
      '--text-primary':   '#ffffff',
      '--text-secondary': '#d1d5db',
      '--text-muted':     '#9ca3af',
      '--border':         'rgba(255, 255, 255, 0.30)',
      '--border-subtle':  '#1f1f1f',
      '--color-success':  '#86efac',
      '--color-danger':   '#fca5a5',
      '--shadow-hud':     '0 0 0 1px rgba(255,255,255,0.20), 0 20px 50px rgba(0,0,0,0.80)',
    },
  },
  {
    id:          'minimal',
    label:       'Minimaliste',
    description: 'Gris doux, effets réduits',
    preview:     'rgb(107, 114, 128)',
    vars: {
      '--accent-rgb':     '107, 114, 128',
      '--bg-base':        '#111827',
      '--bg-primary':     '#1f2937',
      '--bg-surface':     'rgba(31, 41, 55, 0.80)',
      '--bg-card':        'rgba(17, 24, 39, 0.40)',
      '--bg-hover':       'rgba(107, 114, 128, 0.08)',
      '--text-primary':   '#f9fafb',
      '--text-secondary': '#9ca3af',
      '--text-muted':     '#6b7280',
      '--border':         'rgba(107, 114, 128, 0.18)',
      '--border-subtle':  '#374151',
      '--color-success':  '#4ade80',
      '--color-danger':   '#f87171',
      '--shadow-hud':     '0 0 0 1px rgba(107,114,128,0.12), 0 20px 50px rgba(0,0,0,0.30)',
    },
  },
]

export const DEFAULT_PRESET_ID = 'cyan'

export function getPreset(id: string): ThemePreset {
  return THEME_PRESETS.find(p => p.id === id) ?? THEME_PRESETS[0]
}
