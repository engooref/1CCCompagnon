import { EventEmitter } from 'node:events'
import type { OverlayLayout, OverlayElementPos, OverlayModuleConfig } from '../../shared/general'
import { DEFAULT_OVERLAY_MODULES } from '../../shared/general'
import { getSettings, setSettings } from './settingsStore'

export interface LayoutState {
  modules: OverlayModuleConfig[]
  positions: OverlayLayout
}

const emitter = new EventEmitter()

/**
 * Migre les positions de l'ancien format (pixels absolus { x, y }) vers
 * le nouveau format fractionnel ({ xPct, yPct }).
 * Si le format est déjà nouveau, retourne tel quel.
 */
function migratePositions(saved: Record<string, any>): OverlayLayout {
  const entries = Object.entries(saved)
  if (entries.length === 0) return {}

  // Déjà au format fractionnel ?
  if (typeof entries[0][1]?.xPct === 'number') return saved as OverlayLayout

  // Ancien format pixel absolu → détecter la résolution de base heuristiquement
  const maxX = Math.max(...entries.map(([, p]) => p?.x ?? 0))
  const baseW = maxX > 1920 ? 2560 : 1920
  const baseH = baseW === 2560 ? 1440 : 1080

  const result: OverlayLayout = {}
  for (const [id, pos] of entries) {
    result[id] = {
      xPct: Math.min(1, Math.max(0, (pos?.x ?? 0) / baseW)),
      yPct: Math.min(1, Math.max(0, (pos?.y ?? 0) / baseH)),
    } satisfies OverlayElementPos
  }
  return result
}

export function getLayout(): LayoutState {
  const s = getSettings()
  const rawPositions = s.overlayLayout ?? {}
  return {
    modules: s.overlayModules?.length ? [...s.overlayModules] : [...DEFAULT_OVERLAY_MODULES],
    positions: migratePositions(rawPositions as Record<string, any>),
  }
}

export function saveLayout(layout: LayoutState): void {
  setSettings({ overlayModules: layout.modules, overlayLayout: layout.positions })
  emitter.emit('change', layout)
}

export function onLayoutChange(fn: (layout: LayoutState) => void): () => void {
  emitter.on('change', fn)
  return () => emitter.off('change', fn)
}
