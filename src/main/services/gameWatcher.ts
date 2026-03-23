/**
 * gameWatcher.ts
 *
 * Watcher unifié pour Star Citizen — remplace l'ancien duo
 * gameWatcher (PowerShell tasklist + DWM via C#) + windowStateWatcher (PS persistant).
 *
 * Utilise l'addon natif sc_overlay_tracker.node via scTrackerNative.ts :
 *   - Détection processus       → nativeGetState().found
 *   - Bounds réelles (DWM)      → nativeGetState().x/y/width/height
 *   - Minimize / restore        → nativeGetState().minimized
 *   - Focus / unfocus           → nativeGetState().focused
 *
 * Polling toutes les 250 ms (nativeGetState < 2 ms → overhead négligeable).
 *
 * API publique :
 *   startGameWatcher(callbacks) → démarre
 *   stopGameWatcher()           → arrête
 *   getGameWindowBounds()       → Rectangle physique (raw DPI) | null
 */

import { loadNativeTracker, nativeStartTracking, nativeGetState, isNativeTrackerAvailable } from './scTrackerNative'
import { logger } from './logger'
import type { Rectangle } from 'electron'

const GAME_EXE = 'StarCitizen.exe'
const POLL_MS  = 250

// ─── Types ────────────────────────────────────────────────────────────────────

export type GameWatcherCallbacks = {
  /** Jeu démarré et fenêtre trouvée. `bounds` en pixels physiques (raw DPI). `focused` = SC est au premier plan au moment de la détection. */
  onStart:         (bounds: Rectangle, focused: boolean) => void
  /** Processus terminé. */
  onStop:          () => void
  /** Fenêtre minimisée. */
  onMinimize:      () => void
  /** Fenêtre restaurée. `foreground` = elle est revenue au premier plan. */
  onRestore:       (foreground: boolean) => void
  /** SC est passée au premier plan. */
  onFocus?:        () => void
  /** Une autre fenêtre est venue devant SC. */
  onUnfocus?:      () => void
  /**
   * Position / taille de la fenêtre a changé pendant que le jeu tourne.
   * Déclenché seulement si la fenêtre n'est pas minimisée.
   * `bounds` en pixels physiques (raw DPI).
   */
  onBoundsChange?: (bounds: Rectangle) => void
}

type WatchState = 'gone' | 'foreground' | 'running' | 'minimized'

// ─── État interne ─────────────────────────────────────────────────────────────

let watchInterval: ReturnType<typeof setInterval> | null = null
let lastWatchState: WatchState = 'gone'
let cachedBounds:   Rectangle | null = null
let lastBounds:     Rectangle | null = null  // Pour la détection de changement de bounds

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Bounds courantes de la fenêtre Star Citizen en pixels physiques (raw DPI).
 * Null si le jeu n'est pas lancé ou n'est pas trouvé.
 * Valeur synchrone — mise à jour toutes les 250 ms par le watcher.
 */
export function getGameWindowBounds(): Rectangle | null {
  return cachedBounds
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function boundsChanged(a: Rectangle, b: Rectangle): boolean {
  return a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height
}

function toRect(s: { x: number; y: number; width: number; height: number }): Rectangle {
  return { x: s.x, y: s.y, width: s.width, height: s.height }
}

// ─── Watcher ──────────────────────────────────────────────────────────────────

export function startGameWatcher(callbacks: GameWatcherCallbacks): void {
  stopGameWatcher()

  // Charger l'addon natif (idempotent si déjà chargé)
  if (!isNativeTrackerAvailable()) loadNativeTracker()

  if (!isNativeTrackerAvailable()) {
    logger.error('[gameWatcher] Addon natif non disponible — watcher désactivé. Lancer "npm run build:native".')
    return
  }

  nativeStartTracking(GAME_EXE)
  logger.info(`[gameWatcher] Démarré — polling ${GAME_EXE} toutes les ${POLL_MS} ms`)

  lastWatchState = 'gone'
  cachedBounds   = null
  lastBounds     = null

  function tick() {
    const s = nativeGetState()
    if (!s) return  // Addon non disponible

    const newState: WatchState = !s.found
      ? 'gone'
      : s.minimized
        ? 'minimized'
        : s.focused
          ? 'foreground'
          : 'running'

    // Mise à jour du cache bounds (sauf si "gone")
    if (newState !== 'gone') {
      cachedBounds = toRect(s)
    }

    // ── Détection de changement de bounds ────────────────────────────────────
    // Seulement quand le jeu tourne (non minimisé, non absent) et que l'état
    // précédent était aussi "running" (pas une transition d'état majeure).
    if (
      newState !== 'gone' &&
      newState !== 'minimized' &&
      lastWatchState !== 'gone' &&
      lastWatchState !== 'minimized' &&
      lastBounds && cachedBounds &&
      callbacks.onBoundsChange &&
      boundsChanged(lastBounds, cachedBounds)
    ) {
      callbacks.onBoundsChange(cachedBounds)
    }

    // Snapshot des bounds pour la prochaine comparaison
    if (cachedBounds) lastBounds = { ...cachedBounds }

    // ── Transitions d'état ───────────────────────────────────────────────────

    // gone → found : jeu démarré
    if (lastWatchState === 'gone' && newState !== 'gone') {
      logger.info(`[gameWatcher] SC détecté → state=${newState} bounds=${JSON.stringify(cachedBounds)}`)
      lastWatchState = newState
      callbacks.onStart(cachedBounds!, newState === 'foreground')
      return
    }

    // found → gone : jeu fermé
    if (lastWatchState !== 'gone' && newState === 'gone') {
      logger.info('[gameWatcher] SC disparu (processus terminé)')
      lastWatchState = 'gone'
      cachedBounds   = null
      lastBounds     = null
      callbacks.onStop()
      return
    }

    // running/foreground → minimized
    if (newState === 'minimized' && lastWatchState !== 'minimized') {
      logger.info('[gameWatcher] SC minimisé')
      lastWatchState = newState
      callbacks.onMinimize()
      return
    }

    // minimized → running/foreground
    if (newState !== 'minimized' && lastWatchState === 'minimized') {
      logger.info(`[gameWatcher] SC restauré → foreground=${newState === 'foreground'}`)
      lastWatchState = newState
      setTimeout(() => callbacks.onRestore(newState === 'foreground'), 250)
      return
    }

    // running → foreground (focus obtenu)
    if (newState === 'foreground' && lastWatchState !== 'foreground') {
      logger.info('[gameWatcher] SC focus obtenu')
      lastWatchState = newState
      callbacks.onFocus?.()
      return
    }

    // foreground → running (focus perdu, SC visible mais pas au premier plan)
    if (newState === 'running' && lastWatchState === 'foreground') {
      logger.info('[gameWatcher] SC focus perdu')
      lastWatchState = newState
      callbacks.onUnfocus?.()
      return
    }

    lastWatchState = newState
  }

  watchInterval = setInterval(tick, POLL_MS)
}

export function stopGameWatcher(): void {
  if (watchInterval) {
    clearInterval(watchInterval)
    watchInterval = null
  }
  lastWatchState = 'gone'
  cachedBounds   = null
  lastBounds     = null
}
