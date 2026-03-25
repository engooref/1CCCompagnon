import { defineStore } from 'pinia'
import type { AppSettings, ConnectionState, OverlayProfile } from '@shared/general'
import type { TransportOrder } from '@shared/deliveries'
import { applyAppearance, applyDefaultAppearance } from '../services/applyAppearance'
import { startAgendaPoll, stopAgendaPoll } from '../services/agendaPoll'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'

export interface AgendaEvent {
  id: number
  name: string
  type: { name: string; color: string | null } | null
  start: string | null
}

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
    transportsLoading: false,
    agendaEvents: [] as AgendaEvent[],
    agendaLoaded: false,
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
        if (settings.appearance) {
          applyAppearance(settings.appearance)
        } else {
          applyDefaultAppearance()
        }
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
        // Démarrer le polling agenda + prefetch initial
        try {
          startAgendaPoll(this, this.settings?.agendaPollIntervalMs ?? 5 * 60 * 1000)
        } catch (e) {
          // ignore
        }
        // Prefetch des données principales après connexion
        void this.fetchTransports()
        void this.fetchAgendaEvents()
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
      // Stop le poller quand la clé est supprimée
      try { stopAgendaPoll() } catch (e) { }
      await this.refreshConnection()
    },
    async reloadMe() {
      if (!this.bearerToken) return
      this.profile = await window.oneCC.overlayMe(this.bearerToken)
    },

    async fetchTransports() {
      if (!this.bearerToken || !this.settings) return
      const url = createOverlayUrls(this.settings).transports
      if (!url) return
      this.transportsLoading = true
      try {
        const { data } = await http.get(url, { headers: { Authorization: `Bearer ${this.bearerToken}` } })
        const raw = data?.data ?? data
        this.transports = (Array.isArray(raw) ? raw.filter(Boolean) : [raw].filter(Boolean)) as TransportOrder[]
        this.transportsLoaded = true
      } catch {
        this.transports = []
        this.transportsLoaded = true
      } finally {
        this.transportsLoading = false
      }
    },

    async fetchAgendaEvents() {
      if (!this.bearerToken || !this.settings) return
      const url = createOverlayUrls(this.settings).agendaIndex
      if (!url) return
      try {
        const { data } = await http.get(url, {
          headers: { Authorization: `Bearer ${this.bearerToken}` },
          params: { limit: 20 },
        })
        this.agendaEvents = data?.events ?? []
        this.agendaLoaded = true
      } catch {
        this.agendaEvents = []
        this.agendaLoaded = true
      }
    },
  }
})
