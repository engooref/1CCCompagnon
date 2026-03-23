/**
 * scTrackerNative.ts
 *
 * Wrapper TypeScript autour de l'addon natif sc_overlay_tracker.node.
 *
 * Responsabilités :
 *  - Charger l'addon depuis le bon chemin (dev vs packagé)
 *  - Exposer une interface typée
 *  - Dégrader gracieusement si l'addon n'est pas compilé
 *
 * Usage depuis main.ts :
 *   import { loadNativeTracker, nativeGetState, nativeStartTracking } from './services/scTrackerNative'
 *
 *   const ok = loadNativeTracker()
 *   if (ok) nativeStartTracking('StarCitizen.exe')
 *   const state = nativeGetState()  // < 2 ms, appel synchrone
 */

import path from 'node:path'
import { app }  from 'electron'
import { logger } from './logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SCWindowState {
  /** Le processus est trouvé et possède une fenêtre principale */
  found: boolean
  /** La fenêtre est visible (pas minimisée) */
  visible: boolean
  /** La fenêtre est au premier plan (GetForegroundWindow) */
  focused: boolean
  /** La fenêtre est minimisée (IsIconic) */
  minimized: boolean
  /** Position X en pixels physiques (raw DPI, identique à l'existant) */
  x: number
  /** Position Y en pixels physiques (raw DPI) */
  y: number
  /** Largeur en pixels physiques */
  width: number
  /** Hauteur en pixels physiques */
  height: number
}

interface NativeTrackerAddon {
  startTracking(opts: { processName: string }): void
  stopTracking(): void
  getState(): SCWindowState
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _addon: NativeTrackerAddon | null = null

// ─── Chargement ───────────────────────────────────────────────────────────────

/**
 * Charge l'addon natif .node depuis le chemin approprié.
 * - En dev    : native/build/Release/sc_overlay_tracker.node
 * - Packagé   : resources/sc_overlay_tracker.node  (via extraResources electron-builder)
 *
 * @returns true si le chargement a réussi, false sinon (fallback PowerShell actif)
 */
export function loadNativeTracker(): boolean {
  if (_addon) return true

  const addonPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sc_overlay_tracker.node')
    : path.join(app.getAppPath(), 'native', 'build', 'Release', 'sc_overlay_tracker.node')

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _addon = require(addonPath) as NativeTrackerAddon
    logger.info(`[scTracker] Addon natif chargé : ${addonPath}`)
    return true
  } catch (err) {
    logger.warn(
      '[scTracker] Addon natif non disponible — le fallback PowerShell reste actif.',
      `\n  Chemin tenté : ${addonPath}`,
      `\n  Erreur       : ${(err as Error).message}`,
      `\n  → Lancer "npm run build:native" pour compiler l'addon.`
    )
    return false
  }
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Démarre le tracking du processus.
 * Idempotent — peut être rappelé sans risque.
 */
export function nativeStartTracking(processName: string): void {
  _addon?.startTracking({ processName })
}

/**
 * Arrête le tracking. getState() retournera found=false après cet appel.
 */
export function nativeStopTracking(): void {
  _addon?.stopTracking()
}

/**
 * Retourne l'état courant de la fenêtre Star Citizen.
 * Appel synchrone, typiquement < 2 ms.
 * Retourne null si l'addon n'est pas chargé.
 */
export function nativeGetState(): SCWindowState | null {
  return _addon?.getState() ?? null
}

/**
 * Indique si l'addon natif est disponible et opérationnel.
 */
export function isNativeTrackerAvailable(): boolean {
  return _addon !== null
}
