import { EventEmitter } from 'node:events'
import type { OverlayLayout, OverlayModuleConfig } from '../../shared/general'
import { DEFAULT_OVERLAY_MODULES } from '../../shared/general'
import { getSettings, setSettings } from './settingsStore'

export interface LayoutState {
  modules: OverlayModuleConfig[]
  positions: OverlayLayout
}

const emitter = new EventEmitter()

export function getLayout(): LayoutState {
  const s = getSettings()
  return {
    modules: s.overlayModules?.length ? [...s.overlayModules] : [...DEFAULT_OVERLAY_MODULES],
    positions: { ...(s.overlayLayout ?? {}) },
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
