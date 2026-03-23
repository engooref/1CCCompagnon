/**
 * applyAppearance — Application dynamique du thème visuel
 *
 * Rôles des couleurs :
 *   - primaryColor  : teinte de fond (bg-base, bg-primary, etc.)
 *   - accentColor   : couleur de bordure + tous les éléments accent UI
 *                     (border-accent/X, text-accent, bg-accent/X, ombres, scrollbar…)
 *   - textColor     : couleur du texte principal et ses dérivés
 */

import type { AppearanceSettings } from '@shared/general'

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  primaryColor: '#0e7490',  // teinte de fond — cyan-700
  accentColor:  '#22d3ee',  // bordures + accent UI — cyan-400
  textColor:    '#f1f5f9',
  navPosition:  'left',
  fontSize:     16,
}

// ─── Conversions ───────────────────────────────────────────────────────────────

/** #rrggbb → "r, g, b"  (format rgba() classique) */
function hexToRgbTriple(hex: string): string | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 3 && clean.length !== 6) return null
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return `${r}, ${g}, ${b}`
}

/** #rrggbb → "r g b"  (format CSS Color 4 — requis pour Tailwind : rgb(var / alpha)) */
function hexToRgbSpace(hex: string): string | null {
  const triple = hexToRgbTriple(hex)
  return triple ? triple.replace(/,/g, '') : null
}

/** #rrggbb → [h(0-360), s(0-100), l(0-100)] */
function hexToHsl(hex: string): [number, number, number] | null {
  const triple = hexToRgbTriple(hex)
  if (!triple) return null
  const [r, g, b] = triple.split(', ').map(n => Number(n) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l   = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else                h = ((r - g) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

// ─── Application principale ────────────────────────────────────────────────────

export function applyAppearance(a: AppearanceSettings): void {
  const root = document.documentElement

  const primaryHex = a.primaryColor || DEFAULT_APPEARANCE.primaryColor
  const accentHex  = a.accentColor  || DEFAULT_APPEARANCE.accentColor

  const primaryRgb      = hexToRgbTriple(primaryHex)
  const accentRgb       = hexToRgbTriple(accentHex)
  const accentRgbSpace  = hexToRgbSpace(accentHex)
  const primaryRgbSpace = hexToRgbSpace(primaryHex)
  const primaryHsl      = hexToHsl(primaryHex)

  // ── 1) Couleur de bordure (accentColor) → --accent-rgb + tous les dérivés ──
  if (accentRgb && accentRgbSpace) {
    root.style.setProperty('--accent-rgb',    accentRgbSpace) // espace pour Tailwind /alpha
    root.style.setProperty('--accent',        `rgb(${accentRgb})`)
    root.style.setProperty('--accent-dim',    `rgba(${accentRgb}, 0.30)`)
    root.style.setProperty('--accent-border', `rgba(${accentRgb}, 0.20)`)
    root.style.setProperty('--accent-bg',     `rgba(${accentRgb}, 0.10)`)
    root.style.setProperty('--accent-hover',  `rgba(${accentRgb}, 0.15)`)
    root.style.setProperty('--border',        `rgba(${accentRgb}, 0.20)`)
    root.style.setProperty('--border-accent', `rgba(${accentRgb}, 0.20)`)
    root.style.setProperty('--border-subtle', `rgba(${accentRgb}, 0.15)`)
    root.style.setProperty('--border-muted',  `rgba(${accentRgb}, 0.08)`)
    root.style.setProperty('--shadow-hud',    `0 0 0 1px rgba(${accentRgb},0.12), 0 20px 50px rgba(0,0,0,0.45)`)
    root.style.setProperty('--shadow-glow',   `0 0 30px rgba(${accentRgb}, 0.22)`)
  }

  // ── 2) Teinte de fond (primaryColor) → fond de l'app sombre ────────────────
  if (primaryHsl) {
    const [h, s] = primaryHsl
    const sat = Math.min(s, 55)
    root.style.setProperty('--bg-base',    `hsl(${h}, ${sat}%, 3%)`)
    root.style.setProperty('--bg-primary', `hsl(${h}, ${Math.round(sat * 0.85)}%, 5%)`)
    root.style.setProperty('--bg-surface', `hsla(${h}, ${Math.round(sat * 0.70)}%, 12%, 0.80)`)
    root.style.setProperty('--bg-card',    `hsla(${h}, ${Math.round(sat * 0.50)}%, 10%, 0.25)`)
    root.style.setProperty('--bg-hover',   `hsla(${h}, ${sat}%, 50%, 0.07)`)
    root.style.setProperty('--bg-active',  `hsla(${h}, ${sat}%, 50%, 0.12)`)
  }

  // ── 3) Couleur primaire → --accent2-rgb (alias pour compat) ────────────────
  if (primaryRgb && primaryRgbSpace) {
    root.style.setProperty('--accent2-rgb', primaryRgbSpace) // espace pour Tailwind /alpha
    root.style.setProperty('--accent2',     `rgb(${primaryRgb})`)
  }

  // ── 4) Taille de texte → font-size sur :root ──────────────────────────────
  const fs = a.fontSize ?? DEFAULT_APPEARANCE.fontSize ?? 16
  root.style.setProperty('--app-font-size', `${fs}px`)
  root.style.fontSize = `${fs}px`

  // ── 5) Couleur de texte → --text-primary et dérivés ────────────────────────
  const textHex = a.textColor || DEFAULT_APPEARANCE.textColor
  const textRgb = hexToRgbTriple(textHex)
  if (textRgb) {
    const [tr, tg, tb] = textRgb.split(', ').map(Number)
    const br = Math.round(tr + (255 - tr) * 0.5)
    const bg = Math.round(tg + (255 - tg) * 0.5)
    const bb = Math.round(tb + (255 - tb) * 0.5)
    root.style.setProperty('--text-primary',   `rgb(${textRgb})`)
    root.style.setProperty('--text-bright',    `rgb(${br}, ${bg}, ${bb})`)
    root.style.setProperty('--text-secondary',  `rgba(${textRgb}, 0.60)`)
    root.style.setProperty('--text-muted',       `rgba(${textRgb}, 0.35)`)
    root.style.setProperty('--text-disabled',    `rgba(${textRgb}, 0.20)`)
  }
}

export function applyDefaultAppearance(): void {
  applyAppearance(DEFAULT_APPEARANCE)
}
