import { EventEmitter } from 'node:events'
import ElectronStore from 'electron-store'
import type { ModeRegistry, OverlayMode, OverlayModeUpdate, LayoutState } from '../../shared/general'
import { DEFAULT_MODES, DEFAULT_OVERLAY_MODULES } from '../../shared/general'
import { getSettings } from './settingsStore'

// ─── Store electron-store séparé ─────────────────────────────────────────────

function createModeStoreInstance() {
  const StoreCtor: any = (ElectronStore as any).default ?? ElectronStore
  return new StoreCtor({ name: '1cc-overlay-modes' }) as InstanceType<typeof ElectronStore>
}

const modeStoreInstance = createModeStoreInstance()
const emitter = new EventEmitter()

// ─── Migration / Bootstrap ────────────────────────────────────────────────────

/**
 * Au premier lancement (aucune registry), crée les modes par défaut
 * et migre l'ancien layout global dans le mode 'default'.
 */
function bootstrapRegistry(): ModeRegistry {
  const legacySettings = getSettings()

  // Deep copy des modes par défaut pour éviter les mutations partagées
  const modes: OverlayMode[] = DEFAULT_MODES.map((m) => ({
    ...m,
    layout: {
      modules: m.layout.modules.map((mod) => ({ ...mod })),
      positions: { ...m.layout.positions },
    },
  }))

  // Si l'utilisateur avait un layout sauvegardé, on le migre dans 'default'
  const hasLegacyModules = (legacySettings.overlayModules?.length ?? 0) > 0
  const hasLegacyPositions = Object.keys(legacySettings.overlayLayout ?? {}).length > 0

  if (hasLegacyModules || hasLegacyPositions) {
    const defaultMode = modes.find((m) => m.id === 'default')!
    defaultMode.layout = {
      modules: hasLegacyModules
        ? [...legacySettings.overlayModules!]
        : [...DEFAULT_OVERLAY_MODULES],
      positions: hasLegacyPositions ? { ...legacySettings.overlayLayout } : {},
    }
  }

  return { modes, activeModeId: 'default' }
}

// ─── Accès registry ───────────────────────────────────────────────────────────

export function getRegistry(): ModeRegistry {
  const saved = modeStoreInstance.get('registry') as ModeRegistry | undefined
  if (!saved) {
    const registry = bootstrapRegistry()
    modeStoreInstance.set('registry', registry)
    return registry
  }

  // Assurer la cohérence : ajouter les modes built-in manquants (nouvelles versions)
  let dirty = false
  for (const defaultMode of DEFAULT_MODES) {
    if (!saved.modes.find((m) => m.id === defaultMode.id)) {
      saved.modes.unshift({
        ...defaultMode,
        layout: {
          modules: defaultMode.layout.modules.map((mod) => ({ ...mod })),
          positions: {},
        },
      })
      dirty = true
    }
  }
  if (dirty) modeStoreInstance.set('registry', saved)

  return saved
}

export function saveRegistry(registry: ModeRegistry): void {
  modeStoreInstance.set('registry', registry)
  emitter.emit('change', registry)
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export function getModeById(id: string): OverlayMode | undefined {
  return getRegistry().modes.find((m) => m.id === id)
}

export function getActiveMode(): OverlayMode {
  const reg = getRegistry()
  return (
    reg.modes.find((m) => m.id === reg.activeModeId) ??
    reg.modes.find((m) => m.id === 'default') ??
    reg.modes[0]!
  )
}

export function getActiveModeLayout(): LayoutState {
  return getActiveMode().layout
}

// ─── Écriture ─────────────────────────────────────────────────────────────────

export function saveActiveModeLayout(layout: LayoutState): void {
  const reg = getRegistry()
  const mode = reg.modes.find((m) => m.id === reg.activeModeId)
  if (!mode) return
  mode.layout = layout
  saveRegistry(reg)
}

export function saveModeLayout(modeId: string, layout: LayoutState): boolean {
  const reg = getRegistry()
  const mode = reg.modes.find((m) => m.id === modeId)
  if (!mode) return false
  mode.layout = layout
  saveRegistry(reg)
  return true
}

export function setActiveMode(modeId: string): OverlayMode | null {
  const reg = getRegistry()
  const mode = reg.modes.find((m) => m.id === modeId)
  if (!mode) return null
  reg.activeModeId = modeId
  saveRegistry(reg)
  emitter.emit('mode-change', mode)
  return mode
}

// ─── CRUD modes custom ────────────────────────────────────────────────────────

export function createCustomMode(label: string, baseId?: string): OverlayMode {
  const reg = getRegistry()
  const base = baseId
    ? reg.modes.find((m) => m.id === baseId)
    : getActiveMode()
  const id = `custom-${Date.now()}`

  const sourceLayout: LayoutState = base?.layout ?? {
    modules: [...DEFAULT_OVERLAY_MODULES],
    positions: {},
  }

  const newMode: OverlayMode = {
    id,
    label,
    builtIn: false,
    layout: {
      modules: sourceLayout.modules.map((mod) => ({ ...mod })),
      positions: { ...sourceLayout.positions },
    },
  }

  reg.modes.push(newMode)
  saveRegistry(reg)
  return newMode
}

export function deleteCustomMode(modeId: string): boolean {
  const reg = getRegistry()
  const mode = reg.modes.find((m) => m.id === modeId)
  if (!mode || mode.builtIn) return false

  reg.modes = reg.modes.filter((m) => m.id !== modeId)
  if (reg.activeModeId === modeId) reg.activeModeId = 'default'
  saveRegistry(reg)
  return true
}

export function updateModeMetadata(modeId: string, update: OverlayModeUpdate): OverlayMode | null {
  const reg = getRegistry()
  const mode = reg.modes.find((m) => m.id === modeId)
  if (!mode) return null

  if (update.label !== undefined) mode.label = update.label
  if ('hotkey' in update) mode.hotkey = update.hotkey ?? null
  if ('hotkeyCode' in update) mode.hotkeyCode = update.hotkeyCode ?? null

  saveRegistry(reg)
  return mode
}

// ─── Événements ───────────────────────────────────────────────────────────────

export function onRegistryChange(fn: (reg: ModeRegistry) => void): () => void {
  emitter.on('change', fn)
  return () => emitter.off('change', fn)
}

export function onModeChange(fn: (mode: OverlayMode) => void): () => void {
  emitter.on('mode-change', fn)
  return () => emitter.off('mode-change', fn)
}
