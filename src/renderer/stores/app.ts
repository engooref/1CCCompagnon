import { defineStore } from 'pinia'
import type { AppSettings, ConnectionState, OverlayProfile } from '@shared/general'
import type { TransportOrder } from '@shared/deliveries'

const defaultStatus: ConnectionState = {
  connected: false,
  level: 'idle',
  siteOnline: false,
  authReady: false,
  message: 'Initialisation',
  checkedAt: null,
  latencyMs: null
}

export const useAppStore = defineStore('app', {
  state: () => ({
    settings: null as AppSettings | null,
    apiKeyPresent: false,
    status: defaultStatus,
    bearerToken: null as string | null,
    profile: null as OverlayProfile | null,
    transports: [] as TransportOrder[],
    transportsLoaded: false,
    loading: false,
    authError: null as string | null
  }),
  getters: {
    statusLabel: (state) => (state.status.connected ? 'CONNECTÉE' : 'DÉCONNECTÉE'),
    profileLabel: (state) => state.profile?.username || 'Inconnu',
    avatarUrl: (state) => state.profile?.avatar || ''
  },
  actions: {
    async init() {
      this.loading = true
      try {
        const [settings, apiKey] = await Promise.all([
          window.oneCC.getSettings(),
          window.oneCC.getApiKey(),
        ])
        this.settings = settings
        this.apiKeyPresent = Boolean(apiKey)
        if (this.apiKeyPresent) {
          await this.authenticate()
        } else {
          this.status = await window.oneCC.checkConnection()
        }
      } finally {
        this.loading = false
      }
    },
    async refreshConnection() {
      this.status = await window.oneCC.checkConnection()
      this.apiKeyPresent = Boolean(await window.oneCC.getApiKey())
    },
    async authenticate() {
      this.status = {
        connected: false,
        level: 'loading',
        siteOnline: false,
        authReady: false,
        message: 'Authentification overlay en cours',
        checkedAt: new Date().toISOString(),
        latencyMs: null
      }
      this.authError = null
      try {
        const auth = await window.oneCC.overlayAuth()
        this.bearerToken = auth.token
        this.profile = auth.user ?? null
        if (!this.profile && this.bearerToken) {
          this.profile = await window.oneCC.overlayMe(this.bearerToken)
        }
        this.status = {
          connected: true,
          level: 'connected',
          siteOnline: true,
          authReady: true,
          message: 'Overlay authentifié',
          checkedAt: new Date().toISOString(),
          latencyMs: null
        }
      } catch (error: any) {
        this.bearerToken = null
        this.profile = null
        this.authError = error?.message ?? 'Erreur inconnue'
        await this.refreshConnection()
      }
    },
    async saveSettings(partial: Partial<AppSettings>) {
      this.settings = await window.oneCC.updateSettings(partial)
      await this.refreshConnection()
    },
    
    async saveApiKey(apiKey: string) {
      await window.oneCC.setApiKey(apiKey)
      this.apiKeyPresent = true
      await this.authenticate()
    },
    async clearApiKey() {
      await window.oneCC.clearApiKey()
      this.apiKeyPresent = false
      this.bearerToken = null
      this.profile = null
      this.authError = null
      await this.refreshConnection()
    },
    async reloadMe() {
      if (!this.bearerToken) return
      this.profile = await window.oneCC.overlayMe(this.bearerToken)
    }
  }
})
