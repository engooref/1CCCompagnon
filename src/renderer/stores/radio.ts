// ─── Radio Pinia Store ────────────────────────────────────────────────────────

import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { RadioClient } from '../services/radioClient'
import type { RadioChannel, RadioSettings, RadioSpeaker, PttBinding } from '@shared/radio'
import { STATIC_RADIOS, DEFAULT_RADIO_SETTINGS } from '@shared/radio'
import { useAppStore } from './app'
import { createOverlayUrls } from '../config/api'

const radioClient = new RadioClient()


interface ChannelState {
  connected: boolean
  connecting: boolean
  participants: string[]
  transmitting: boolean
  /** true = murmure (émission uniquement, pas d'écoute) */
  whisperOnly: boolean
}

export const useRadioStore = defineStore('radio', {
  state: () => ({
    settings: { ...DEFAULT_RADIO_SETTINGS } as RadioSettings,
    channels: [...STATIC_RADIOS] as RadioChannel[],

    // État par canal (clé = channelId)
    channelState: {} as Record<string, ChannelState>,

    muted: false,
    mutedIncoming: false,
    micLevel: 0,
    activeSpeakers: [] as RadioSpeaker[],
    error: null as string | null,
    _initialized: false,
    availableInputs: [] as MediaDeviceInfo[],
    availableOutputs: [] as MediaDeviceInfo[],
    selectedInputId: null as string | null,
    selectedOutputId: null as string | null,
    monitoring: false,
    gateThreshold: 0,
    inputGain: 1.0,
    /** Participants par canal, mis à jour par polling (canaux non connectés) */
    channelParticipants: {} as Record<string, string[]>,
    _participantsInterval: null as ReturnType<typeof setInterval> | null,
  }),

  getters: {
    /** true si au moins un canal est connecté */
    connected(state): boolean {
      return Object.values(state.channelState).some(s => s.connected)
    },
    /** true si en train de transmettre sur au moins un canal */
    transmitting(state): boolean {
      return Object.values(state.channelState).some(s => s.transmitting)
    },
    /** Liste des channelIds actuellement connectés */
    connectedChannels(state): string[] {
      return Object.entries(state.channelState)
        .filter(([, s]) => s.connected)
        .map(([id]) => id)
    },
    /** Canal en cours de transmission (premier trouvé) */
    transmittingChannel(state): string | null {
      return Object.entries(state.channelState).find(([, s]) => s.transmitting)?.[0] ?? null
    },
    /** Premier canal connecté (compat overlay) */
    currentChannel(state): string | null {
      return Object.entries(state.channelState).find(([, s]) => s.transmitting)?.[0]
        ?? Object.entries(state.channelState).find(([, s]) => s.connected)?.[0]
        ?? null
    },
    currentChannelName(): string {
      const ch = (this as any).channels.find((c: RadioChannel) => c.id === (this as any).currentChannel)
      return ch?.name ?? '—'
    },
    isConnected(): boolean {
      return (this as any).connected
    },
    canManageChannels(): boolean {
      return useAppStore().profile?.isBureau ?? false
    },
    /** true si au moins un canal est en cours de connexion */
    connecting(state): boolean {
      return Object.values(state.channelState).some(s => s.connecting)
    },
    /** Tous les participants (dédupliqués, tous canaux confondus) */
    participants(state): string[] {
      const all = new Set<string>()
      for (const cs of Object.values(state.channelState)) {
        for (const p of cs.participants) all.add(p)
      }
      return Array.from(all)
    },
    /** Binding PTT pour un canal donné */
    pttBinding: (state) => (channelId: string): PttBinding | undefined => {
      return state.settings.pttBindings.find(b => b.channelId === channelId)
    },
    /**
     * Participants d'un canal : live si connecté, sinon depuis le polling.
     */
    participantsFor: (state) => (channelId: string): string[] => {
      if (state.channelState[channelId]?.connected) {
        return state.channelState[channelId].participants
      }
      return state.channelParticipants[channelId] ?? []
    },
  },

  actions: {
    _channelExists(channelId: string): boolean {
      return this.channels.some(ch => ch.id === channelId)
    },

    async _pruneInvalidPttBindings() {
      const validChannelIds = new Set(this.channels.map(ch => ch.id))
      const invalidBindings = this.settings.pttBindings.filter(b => !validChannelIds.has(b.channelId))
      if (!invalidBindings.length) return

      this.settings.pttBindings = this.settings.pttBindings.filter(b => validChannelIds.has(b.channelId))
      await window.oneCC.radioSetPttBindings(toRaw(this.settings.pttBindings).map(b => ({ ...toRaw(b) })))

      // Si un canal invalide était connecté en murmure auto, on le quitte.
      for (const binding of invalidBindings) {
        if (this.channelState[binding.channelId]?.connected && this.channelState[binding.channelId]?.whisperOnly) {
          await this.leaveChannel(binding.channelId)
        }
      }
    },

    // ── Init ───────────────────────────────────────────────────────────────

    async init() {
      if (this._initialized) return
      this._initialized = true

      this.settings = await window.oneCC.radioGetSettings()
      await this.fetchChannels()
      await this.loadDevices()

      // Écouter les events RadioClient
      radioClient.on('channelConnected', (channelId) => {
        this._ensureChannelState(channelId)
        this.channelState[channelId].connected = true
        this.channelState[channelId].connecting = false
        this.channelState[channelId].participants = radioClient.participants(channelId)
        this.error = null
      })

      radioClient.on('channelDisconnected', (channelId, reason) => {
        console.debug(`[RADIO][store] channelDisconnected canal=${channelId} reason=${reason ?? 'none'}`, new Error('trace').stack)
        if (this.channelState[channelId]) {
          this.channelState[channelId].connected = false
          this.channelState[channelId].transmitting = false
          this.channelState[channelId].participants = []
        }
        // Retirer les speakers de ce canal
        this.activeSpeakers = this.activeSpeakers.filter(s => s.channel !== channelId)
        if (reason) this.error = `Canal ${channelId} déconnecté: ${reason}`
      })

      radioClient.on('speakersChanged', (speakers) => {
        this.activeSpeakers = speakers
      })

      radioClient.on('participantJoined', (channelId) => {
        if (this.channelState[channelId]) {
          this.channelState[channelId].participants = radioClient.participants(channelId)
        }
      })

      radioClient.on('participantLeft', (channelId) => {
        if (this.channelState[channelId]) {
          this.channelState[channelId].participants = radioClient.participants(channelId)
        }
      })

      radioClient.on('micLevel', (level) => {
        this.micLevel = level
      })

      radioClient.on('error', (err) => {
        this.error = err.message
      })

      // Écouter les événements PTT du main process (uIOhook) — avec channelId
      window.oneCC.onRadioPttStart(async (channelId) => {
        if (!this._channelExists(channelId)) {
          await this.removePttBinding(channelId)
          return
        }

        const cs = this.channelState[channelId]
        console.debug(`[RADIO][PTT] ptt-start canal=${channelId} connected=${cs?.connected} whisperOnly=${cs?.whisperOnly} muted=${this.muted}`)
        if (this.muted) return

        // Si pas connecté : auto-join en murmure avant de transmettre
        if (!this.channelState[channelId]?.connected) {
          const hasPttBinding = this.settings.pttBindings.some(b => b.channelId === channelId)
          if (!hasPttBinding) return
          console.debug(`[RADIO][PTT] canal non connecté → auto-join murmure`)
          try {
            await this.joinChannel(channelId, true)
          } catch (e) {
            console.debug('[RADIO][PTT] auto-join échoué:', e)
            return
          }
        }

        console.debug(`[RADIO][PTT] → startTransmit canal=${channelId}`)
        this.startTransmit(channelId)
      })

      window.oneCC.onRadioPttStop((channelId) => {
        console.debug(`[RADIO][PTT] ptt-stop canal=${channelId}`)
        this.stopTransmit(channelId)
      })

      // Enregistrer les bindings PTT dans le main process
      if (this.settings.pttBindings.length) {
        window.oneCC.radioSetPttBindings(toRaw(this.settings.pttBindings).map(b => ({ ...toRaw(b) })))
      }

      // Polling participants canaux non connectés (toutes les 30s)
      this._participantsInterval = setInterval(() => {
        this.fetchAllParticipants()
      }, 30_000)

    },

    _ensureChannelState(channelId: string, whisperOnly = false) {
      if (!this.channelState[channelId]) {
        this.channelState[channelId] = {
          connected: false,
          connecting: false,
          participants: [],
          transmitting: false,
          whisperOnly,
        }
      }
    },

    // ── Join / Leave ───────────────────────────────────────────────────────

    async joinChannel(channelId: string, whisperOnly = false) {
      console.debug(`[RADIO][store] joinChannel canal=${channelId} whisperOnly=${whisperOnly} alreadyConnecting=${this.channelState[channelId]?.connecting}`)
      if (this.channelState[channelId]?.connecting) return

      this._ensureChannelState(channelId, whisperOnly)
      this.channelState[channelId].connecting = true
      this.channelState[channelId].whisperOnly = whisperOnly
      this.error = null

      try {
        const appStore = useAppStore()
        const channelsBaseUrl = appStore.settings ? createOverlayUrls(appStore.settings).radioChannels : ''

        const res = await fetch(`${channelsBaseUrl}/${encodeURIComponent(channelId)}/token`, {
          headers: { Authorization: `Bearer ${appStore.bearerToken}` },
        })
        if (!res.ok) throw new Error(`Token server error: ${res.status}`)
        const { token, url } = await res.json()

        await radioClient.join(channelId, url as string, token as string, this.selectedInputId, whisperOnly)

        // Appliquer le volume
        radioClient.setVolume(this.settings.radioVolume)

        // Si on rejoint en écoute normale, connecter en murmure tous les autres
        // canaux qui ont un binding PTT et ne sont pas encore connectés.
        if (!whisperOnly) {
          for (const binding of this.settings.pttBindings) {
            if (binding.channelId === channelId) continue
            const otherCs = this.channelState[binding.channelId]
            if (!otherCs?.connected && !otherCs?.connecting) {
              this.joinChannel(binding.channelId, true).catch(() => {})
            }
          }
        }
      } catch (err: any) {
        this.error = err?.message || 'Erreur de connexion radio'
        if (this.channelState[channelId]) {
          this.channelState[channelId].connecting = false
        }
        throw err
      }
    },

    async whisperChannel(channelId: string) {
      return this.joinChannel(channelId, true)
    },

    async leaveChannel(channelId: string) {
      console.debug(`[RADIO][store] leaveChannel canal=${channelId}`, new Error('trace').stack)
      await radioClient.leave(channelId)
    },

    async leaveAll() {
      await radioClient.leaveAll()
    },

    // ── PTT ──────────────────────────────────────────────────────────────

    async startTransmit(channelId: string) {
      const cs = this.channelState[channelId]
      console.debug(`[RADIO][store] startTransmit canal=${channelId} cs.connected=${cs?.connected} muted=${this.muted}`)
      if (!cs?.connected || this.muted) return
      await radioClient.startTransmit(channelId)
      cs.transmitting = true
    },

    async stopTransmit(channelId: string) {
      const cs = this.channelState[channelId]
      console.debug(`[RADIO][store] stopTransmit canal=${channelId} cs=${!!cs}`)
      if (!cs) return
      await radioClient.stopTransmit(channelId)
      cs.transmitting = false
    },

    // ── Mute ─────────────────────────────────────────────────────────────

    toggleMute() {
      this.muted = !this.muted
      if (this.muted) {
        for (const [channelId, cs] of Object.entries(this.channelState)) {
          if (cs.transmitting) this.stopTransmit(channelId)
        }
      }
    },

    toggleMutedIncoming() {
      this.mutedIncoming = !this.mutedIncoming
      radioClient.setVolume(this.mutedIncoming ? 0 : this.settings.radioVolume)
    },

    // ── Volume ───────────────────────────────────────────────────────────

    setVolume(volume: number) {
      this.settings.radioVolume = volume
      radioClient.setVolume(volume)
      window.oneCC.radioUpdateSettings({ radioVolume: volume })
    },

    // ── PTT Bindings ──────────────────────────────────────────────────────

    async setPttBinding(channelId: string, keyCode: number | null, key: string) {
      if (!this._channelExists(channelId)) {
        await this.removePttBinding(channelId)
        return
      }

      console.debug(`[RADIO][store] setPttBinding canal=${channelId} keyCode=${keyCode} key=${key} — état actuel:`, JSON.stringify(this.channelState[channelId] ?? null))
      const bindings = this.settings.pttBindings.filter(b => b.channelId !== channelId)
      if (keyCode !== null) bindings.push({ channelId, keyCode, key })
      this.settings.pttBindings = bindings
      await window.oneCC.radioSetPttBindings(bindings.map(b => ({ ...b })))

      // Auto-rejoindre en murmure dès qu'une touche PTT est configurée
      if (keyCode !== null) {
        const cs = this.channelState[channelId]
        if (cs?.connected && !cs.whisperOnly) {
          // Canal en écoute normale → quitter puis rejoindre en murmure
          await this.leaveChannel(channelId)
        }
        if (!this.channelState[channelId]?.connected) {
          try { await this.joinChannel(channelId, true) } catch { /* noop */ }
        }
      }
    },

    async removePttBinding(channelId: string) {
      this.settings.pttBindings = this.settings.pttBindings.filter(b => b.channelId !== channelId)
      await window.oneCC.radioSetPttBindings(toRaw(this.settings.pttBindings).map(b => ({ ...toRaw(b) })))

      // Auto-quitter si le canal était en murmure automatique
      if (this.channelState[channelId]?.connected && this.channelState[channelId]?.whisperOnly) {
        await this.leaveChannel(channelId)
      }
    },

    // ── Settings ─────────────────────────────────────────────────────────

    async updateSettings(partial: Partial<RadioSettings>) {
      Object.assign(this.settings, partial)
      await window.oneCC.radioUpdateSettings(partial)
    },

    // ── Channels CRUD ─────────────────────────────────────────────────────

    async fetchChannels() {
      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioChannels : ''
      if (!url) return
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${appStore.bearerToken}` } })
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data.channels)) this.channels = data.channels
        else if (Array.isArray(data)) this.channels = data
      } catch {
        this.channels = [...STATIC_RADIOS]
      }
      await this._pruneInvalidPttBindings()
      await this.fetchAllParticipants()
    },

    async fetchAllParticipants() {
      const appStore = useAppStore()
      const baseUrl = appStore.settings ? createOverlayUrls(appStore.settings).radioChannels : ''
      if (!baseUrl) return
      await Promise.allSettled(
        this.channels
          .filter(ch => !this.channelState[ch.id]?.connected)
          .map(async (ch) => {
            try {
              const res = await fetch(
                `${baseUrl}/${encodeURIComponent(ch.id)}/participants`,
                { headers: { Authorization: `Bearer ${appStore.bearerToken}` } },
              )
              if (!res.ok) return
              const data = await res.json()
              const list: string[] = Array.isArray(data.participants)
                ? data.participants
                : Array.isArray(data) ? data : []
              this.channelParticipants[ch.id] = list
            } catch { /* canal inaccessible, on garde la valeur précédente */ }
          }),
      )
    },

    async createChannel(payload: { name: string; description: string }) {
      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioChannels : ''
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appStore.bearerToken}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      await this.fetchChannels()
    },

    async updateChannel(id: string, payload: { name?: string; description?: string }) {
      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioChannels : ''
      const res = await fetch(`${url}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appStore.bearerToken}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      await this.fetchChannels()
    },

    async deleteChannel(id: string) {
      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioChannels : ''
      const res = await fetch(`${url}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${appStore.bearerToken}` },
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      if (this.channelState[id]?.connected) await this.leaveChannel(id)
      await this.fetchChannels()
    },

    // ── Devices ──────────────────────────────────────────────────────────

    async loadDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()))
        this.availableInputs  = await RadioClient.getAudioInputDevices()
        this.availableOutputs = await RadioClient.getAudioOutputDevices()
      } catch { /* pas de permission micro */ }
    },

    async setAudioInput(deviceId: string) {
      this.selectedInputId = deviceId
      if (radioClient.connected) await radioClient.setAudioInput(deviceId)
    },

    async setAudioOutput(deviceId: string) {
      this.selectedOutputId = deviceId
      if (radioClient.connected) await radioClient.setAudioOutput(deviceId)
    },

    setGateThreshold(value: number) {
      this.gateThreshold = value
      radioClient.setGateThreshold(value)
    },

    setInputGain(value: number) {
      this.inputGain = value
      radioClient.setInputGain(value)
    },

    async toggleMonitor() {
      if (radioClient.isMonitoring) {
        radioClient.stopMonitor()
        this.monitoring = false
      } else {
        await radioClient.startMonitor()
        this.monitoring = radioClient.isMonitoring
      }
    },

    async cleanup() {
      this._initialized = false
      if (this._participantsInterval) {
        clearInterval(this._participantsInterval)
        this._participantsInterval = null
      }
      window.oneCC.offRadioPtt()
      radioClient.destroy()
    },
  },
})
