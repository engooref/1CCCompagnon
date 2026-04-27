import { defineStore } from 'pinia'
import type { ModeRegistry, OverlayMode, OverlayModeUpdate, LayoutState } from '@shared/general'

export const useModeStore = defineStore('mode', {
  state: () => ({
    registry: null as ModeRegistry | null,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    modes: (state): OverlayMode[] => state.registry?.modes ?? [],
    activeModeId: (state): string => state.registry?.activeModeId ?? 'default',
    activeMode: (state): OverlayMode | undefined =>
      state.registry?.modes.find((m) => m.id === state.registry?.activeModeId),
    builtInModes: (state): OverlayMode[] =>
      state.registry?.modes.filter((m) => m.builtIn) ?? [],
    customModes: (state): OverlayMode[] =>
      state.registry?.modes.filter((m) => !m.builtIn) ?? [],
  },

  actions: {
    async load() {
      this.loading = true
      try {
        this.registry = await window.oneCC.getModeRegistry()
      } catch (e: any) {
        this.error = e?.message ?? 'Impossible de charger les modes'
      } finally {
        this.loading = false
      }
    },

    async switchMode(modeId: string) {
      const result = await window.oneCC.setActiveMode(modeId)
      if (result.success && this.registry) {
        this.registry.activeModeId = modeId
      }
      return result
    },

    async createCustomMode(label: string, baseId?: string) {
      const mode = await window.oneCC.createMode(label, baseId)
      this.registry?.modes.push(mode)
      return mode
    },

    async deleteMode(modeId: string) {
      const ok = await window.oneCC.deleteMode(modeId)
      if (ok && this.registry) {
        this.registry.modes = this.registry.modes.filter((m) => m.id !== modeId)
        if (this.registry.activeModeId === modeId) {
          this.registry.activeModeId = 'default'
        }
      }
      return ok
    },

    async updateModeMetadata(modeId: string, update: OverlayModeUpdate) {
      const updated = await window.oneCC.updateModeMetadata(modeId, update)
      if (updated && this.registry) {
        const idx = this.registry.modes.findIndex((m) => m.id === modeId)
        if (idx >= 0) this.registry.modes[idx] = updated
      }
      return updated
    },

    async saveModeLayout(modeId: string, layout: LayoutState) {
      return window.oneCC.saveModeLayout(modeId, layout)
    },

    /** Appelé par l'overlay quand le process principal signale un changement de mode */
    setActiveModeId(modeId: string) {
      if (this.registry) this.registry.activeModeId = modeId
    },
  },
})
