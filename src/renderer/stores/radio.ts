// ─── Radio Pinia Store ────────────────────────────────────────────────────────

import { defineStore } from 'pinia'
import { RadioClient } from '../services/radioClient'
import type { RadioChannel, RadioSettings, RadioSpeaker } from '@shared/radio'
import { STATIC_RADIOS, DEFAULT_RADIO_SETTINGS } from '@shared/radio'
import { useAppStore } from './app'

const radioClient = new RadioClient()

export const useRadioStore = defineStore('radio', {
  state: () => ({
    settings: { ...DEFAULT_RADIO_SETTINGS } as RadioSettings,
    channels: [...STATIC_RADIOS] as RadioChannel[],
    currentChannel: null as string | null,
    connected: false,
    transmitting: false,
    muted: false,
    micLevel: 0,
    activeSpeakers: [] as RadioSpeaker[],
    participants: [] as string[],
    connecting: false,
    error: null as string | null,
  }),

  getters: {
    currentChannelName(state): string {
      const ch = state.channels.find(c => c.id === state.currentChannel)
      return ch?.name ?? '—'
    },
    isConnected(state): boolean {
      return state.connected
    },
  },

  actions: {
    // ── Init ───────────────────────────────────────────────────────────────

    async init() {
      // Charger les settings depuis le main process
      this.settings = await window.oneCC.radioGetSettings()

      // Charger la liste des radios depuis le radio-server
      try {
        const res = await fetch(`${this.settings.radioServerUrl}/radios`)
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) this.channels = data
        }
      } catch {
        // Fallback radios statiques
        this.channels = [...STATIC_RADIOS]
      }

      // Écouter les events LiveKit
      radioClient.on('connected', () => {
        this.connected = true
        this.connecting = false
        this.error = null
        this.participants = radioClient.participants
      })

      radioClient.on('disconnected', (reason) => {
        this.connected = false
        this.transmitting = false
        this.micLevel = 0
        this.activeSpeakers = []
        this.participants = []
        if (reason) this.error = `Déconnecté: ${reason}`
      })

      radioClient.on('speakersChanged', (speakers) => {
        this.activeSpeakers = speakers
      })

      radioClient.on('participantJoined', () => {
        this.participants = radioClient.participants
      })

      radioClient.on('participantLeft', () => {
        this.participants = radioClient.participants
      })

      radioClient.on('micLevel', (level) => {
        this.micLevel = level
      })

      radioClient.on('error', (err) => {
        this.error = err.message
      })

      // Écouter les événements PTT du main process (uIOhook)
      window.oneCC.onRadioPttStart(() => {
        if (this.connected && !this.muted) {
          this.startTransmit()
        }
      })

      window.oneCC.onRadioPttStop(() => {
        this.stopTransmit()
      })
    },

    // ── Join / Leave ───────────────────────────────────────────────────────

    async joinChannel(channelId: string) {
      if (this.connecting) return

      this.connecting = true
      this.error = null

      try {
        // Identité : profil connecté ou fallback horodaté
        const appStore = useAppStore()
        const identity = appStore.profile?.username || `user-${Date.now()}`

        // Obtenir un token JWT auprès du radio-server
        const res = await fetch(`${this.settings.radioServerUrl}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomName: channelId, identity }),
        })
        if (!res.ok) throw new Error(`Token server error: ${res.status}`)
        const { token } = await res.json()

        await radioClient.join(this.settings.livekitUrl, token, channelId)
        this.currentChannel = channelId

        // Appliquer le volume
        radioClient.setVolume(this.settings.radioVolume)
      } catch (err: any) {
        this.error = err?.message || 'Erreur de connexion radio'
        this.connecting = false
        throw err
      }
    },

    async leaveChannel() {
      await radioClient.leave()
      this.currentChannel = null
    },

    // ── PTT ──────────────────────────────────────────────────────────────

    async startTransmit() {
      if (!this.connected || this.muted) return
      await radioClient.startTransmit()
      this.transmitting = true
    },

    async stopTransmit() {
      await radioClient.stopTransmit()
      this.transmitting = false
    },

    // ── Mute ─────────────────────────────────────────────────────────────

    toggleMute() {
      this.muted = !this.muted
      if (this.muted && this.transmitting) {
        this.stopTransmit()
      }
    },

    // ── Volume ───────────────────────────────────────────────────────────

    setVolume(volume: number) {
      this.settings.radioVolume = volume
      radioClient.setVolume(volume)
      window.oneCC.radioUpdateSettings({ radioVolume: volume })
    },

    // ── Settings ─────────────────────────────────────────────────────────

    async updateSettings(partial: Partial<RadioSettings>) {
      Object.assign(this.settings, partial)
      await window.oneCC.radioUpdateSettings(partial)
    },

    async setPttKey(keyCode: number | null, keyName: string) {
      this.settings.pttKeyCode = keyCode
      this.settings.pttKey = keyName
      await window.oneCC.radioSetPttKey({ keyCode, key: keyName })
    },

    // ── Cleanup ──────────────────────────────────────────────────────────

    async cleanup() {
      window.oneCC.offRadioPtt()
      radioClient.destroy()
    },
  },
})
