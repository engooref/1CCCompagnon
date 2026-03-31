// ─── Radio Pinia Store ────────────────────────────────────────────────────────

import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import type { RadioClient } from '../services/radioClient'
import type { RadioChannel, RadioCategory, RadioSettings, RadioSpeaker, PttBinding } from '@shared/radio'
import { DEFAULT_RADIO_SETTINGS, categoryIdFromPttTarget, isCategoryPttTarget, isGlobalPttTarget } from '@shared/radio'
import { useAppStore } from './app'
import { createOverlayUrls } from '../config/api'

type ChannelCreatePayload = Pick<RadioChannel, 'name' | 'description'> & { categoryId?: number | null }
type ChannelUpdatePayload = Partial<Pick<RadioChannel, 'name' | 'description' | 'categoryId'>>

let radioClient: RadioClient | null = null

async function getRadioClient(): Promise<RadioClient> {
  if (!radioClient) {
    const { RadioClient } = await import('../services/radioClient')
    radioClient = new RadioClient()
  }
  return radioClient
}

type RadioParticipant = {
  identity: string
  avatar: string | null
}

function normalizeParticipant(raw: unknown): RadioParticipant | null {
  if (typeof raw === 'string') {
    const identity = raw.trim()
    if (!identity) return null
    return { identity, avatar: null }
  }

  if (!raw || typeof raw !== 'object') return null

  const obj = raw as Record<string, unknown>
  const identity = [
    obj.identity,
    obj.username,
    obj.name,
    obj.displayName,
    obj.user,
  ].find(v => typeof v === 'string' && v.trim().length > 0) as string | undefined

  if (!identity) return null

  const avatarRaw = [
    obj.avatar,
    obj.avatarUrl,
    obj.image,
    obj.imageUrl,
    obj.discordAvatar,
    obj.discordAvatarUrl,
  ].find(v => typeof v === 'string' && v.trim().length > 0) as string | undefined

  return {
    identity: identity.trim(),
    avatar: avatarRaw?.trim() ?? null,
  }
}

function normalizeParticipants(raw: unknown): RadioParticipant[] {
  if (!Array.isArray(raw)) return []

  const out: RadioParticipant[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const p = normalizeParticipant(item)
    if (!p) continue
    const key = p.identity.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}


interface ChannelState {
  connected: boolean
  connecting: boolean
  participants: RadioParticipant[]
  transmitting: boolean
  /** true = murmure (émission uniquement, pas d'écoute) */
  whisperOnly: boolean
}

export const useRadioStore = defineStore('radio', {
  state: () => ({
    settings: { ...DEFAULT_RADIO_SETTINGS } as RadioSettings,
    channels: [] as RadioChannel[],
    categories: [] as RadioCategory[],

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
    channelParticipants: {} as Record<string, RadioParticipant[]>,
    /** Channels auto-joined by a PTT press (targetId -> [channelId]) */
    _pttAutoJoined: {} as Record<string, string[]>,
    _participantsInterval: null as ReturnType<typeof setInterval> | null,
    _errorTimeout: null as ReturnType<typeof setTimeout> | null,
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
        for (const p of cs.participants) all.add(p.identity)
      }
      return Array.from(all)
    },
    /** Binding PTT pour un canal donné */
    pttBinding: (state) => (channelId: string): PttBinding | undefined => {
      return state.settings.pttBindings.find(b => b.channelId === channelId)
    },
    /** Binding PTT pour une catégorie donnée */
    pttBindingForCategory: (state) => (categoryId: number): PttBinding | undefined => {
      return state.settings.pttBindings.find(b => b.channelId === `category:${categoryId}`)
    },
    /**
     * Participants d'un canal : live si connecté, sinon depuis le polling.
     */
    participantsFor: (state) => (channelId: string): RadioParticipant[] => {
      if (state.channelState[channelId]?.connected) {
        return state.channelState[channelId].participants
      }
      return state.channelParticipants[channelId] ?? []
    },
  },

  actions: {
    _channelExists(channelId: string): boolean {
      console.log(this.channels)
      return this.channels.some(ch => ch.id === channelId)
    },

    _categoryExists(categoryId: number): boolean {
      return this.categories.some(cat => cat.id === categoryId)
    },

    setError(message: string | null, durationMs = 3000) {
      if (this._errorTimeout) {
        clearTimeout(this._errorTimeout)
        this._errorTimeout = null
      }
      this.error = message
      if (message !== null && durationMs > 0) {
        this._errorTimeout = setTimeout(() => {
          this.error = null
          this._errorTimeout = null
        }, durationMs)
      }
    },

    _playPttWarningBeep() {
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
        if (!AudioCtx) return
        const ctx = new AudioCtx()
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = 'sine'
        o.frequency.value = 880
        g.gain.value = 0.0001
        o.connect(g)
        g.connect(ctx.destination)
        o.start()
        // montée rapide
        g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.01)
        // descente et arrêt
        setTimeout(() => {
          try { g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.05) } catch {}
          setTimeout(() => { try { o.stop(); ctx.close() } catch {} }, 80)
        }, 120)
      } catch (e) {
        console.debug('[RADIO] beep failed', e)
      }
    },

    _resolvePttTargetChannelIds(targetId: string): string[] {
      if (isGlobalPttTarget(targetId)) {
        return this.channels.map(ch => ch.id)
      }

      if (!isCategoryPttTarget(targetId)) return [targetId]

      const categoryId = categoryIdFromPttTarget(targetId)
      if (categoryId === null) return []

      const category = this.categories.find(cat => cat.id === categoryId)
      if (!category) return []

      return category.channels.map(ch => ch.id)
    },

    _hasPttBindingForTarget(targetId: string): boolean {
      return this.settings.pttBindings.some(b => b.channelId === targetId)
    },

    async _pruneInvalidPttBindings() {
      const validChannelIds = new Set(this.channels.map(ch => ch.id))
      const validCategoryIds = new Set(this.categories.map(cat => cat.id))
      const invalidBindings = this.settings.pttBindings.filter((b) => {
        if (isGlobalPttTarget(b.channelId)) return false

        if (!isCategoryPttTarget(b.channelId)) {
          return !validChannelIds.has(b.channelId)
        }

        if (validCategoryIds.size === 0) {
          // Quand les catégories ne sont pas encore chargées, on évite de supprimer trop tôt.
          return false
        }

        const categoryId = categoryIdFromPttTarget(b.channelId)
        return categoryId === null || !validCategoryIds.has(categoryId)
      })
      if (!invalidBindings.length) return

      this.settings.pttBindings = this.settings.pttBindings.filter((b) => {
        if (isGlobalPttTarget(b.channelId)) return true
        if (!isCategoryPttTarget(b.channelId)) return validChannelIds.has(b.channelId)
        if (validCategoryIds.size === 0) return true
        const categoryId = categoryIdFromPttTarget(b.channelId)
        return categoryId !== null && validCategoryIds.has(categoryId)
      })
      await window.oneCC.radioSetPttBindings(toRaw(this.settings.pttBindings).map(b => ({ ...toRaw(b) })))

      // Si une cible invalide était connectée en murmure auto, on quitte ses canaux.
      for (const binding of invalidBindings) {
        for (const channelId of this._resolvePttTargetChannelIds(binding.channelId)) {
          if (this.channelState[channelId]?.connected && this.channelState[channelId]?.whisperOnly) {
            await this.leaveChannel(channelId)
          }
        }
      }
    },

    async _fetchChannelParticipants(channelId: string): Promise<RadioParticipant[] | null> {
      const appStore = useAppStore()
      const participantsUrl = appStore.settings ? createOverlayUrls(appStore.settings).radioParticipants(channelId) : ''
      if (!participantsUrl) return null

      try {
        const res = await fetch(participantsUrl, {
          headers: { Authorization: `Bearer ${appStore.bearerToken}` },
        })
        if (!res.ok) return null

        const data = await res.json()
        console.log(data)
        const list = normalizeParticipants(Array.isArray(data.participants)
          ? data.participants
          : Array.isArray(data) ? data : [])

        this.channelParticipants[channelId] = list
        if (this.channelState[channelId]) {
          this.channelState[channelId].participants = list
        }
        return list
      } catch {
        return null
      }
    },

    async _notifyChannelEvent(channelId: string, event: 'participant_joined' | 'participant_left') {
      const appStore = useAppStore()
      const notifyUrl = appStore.settings ? createOverlayUrls(appStore.settings).radioWebhook : ''
      if (!notifyUrl) return

      try {
        await fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appStore.bearerToken}` },
          body: JSON.stringify({ event, channelId }),
        })
      } catch (err) {
        console.warn(`[RADIO][store] Failed to notify channel event: ${event} for ${channelId}`, err)
      }
    },

    // ── Init ───────────────────────────────────────────────────────────────

    async init() {
      if (this._initialized) return
      this._initialized = true

      // Charger RadioClient de manière lazy (évite d'importer livekit-client au démarrage)
      const client = await getRadioClient()

      this.settings = await window.oneCC.radioGetSettings()
      await this.fetchChannels()
      await this.fetchCategories()
      await this.loadDevices()

      // Écouter les events RadioClient
      client.on('channelConnected', (channelId) => {
        this._ensureChannelState(channelId)
        this.channelState[channelId].connected = true
        this.channelState[channelId].connecting = false
        this.channelState[channelId].participants = normalizeParticipants(client.participants(channelId))
          this.setError(null)
        // Notifier le backend
        this._notifyChannelEvent(channelId, 'participant_joined')
      })

      client.on('channelDisconnected', (channelId, reason) => {
        console.debug(`[RADIO][store] channelDisconnected canal=${channelId} reason=${reason ?? 'none'}`, new Error('trace').stack)
        if (this.channelState[channelId]) {
          this.channelState[channelId].connected = false
          this.channelState[channelId].transmitting = false
          this.channelState[channelId].participants = []
        }
        // Retirer les speakers de ce canal
        this.activeSpeakers = this.activeSpeakers.filter(s => s.channel !== channelId)
        if (reason) this.setError(`Canal ${channelId} déconnecté: ${reason}`)
        // Notifier le backend
        this._notifyChannelEvent(channelId, 'participant_left')
      })

      client.on('speakersChanged', (speakers) => {
        this.activeSpeakers = speakers
      })

      client.on('participantJoined', (channelId) => {
        if (this.channelState[channelId]) {
          this.channelState[channelId].participants = normalizeParticipants(client.participants(channelId))
        }
      })

      client.on('participantLeft', (channelId) => {
        if (this.channelState[channelId]) {
          this.channelState[channelId].participants = normalizeParticipants(client.participants(channelId))
        }
      })

      client.on('micLevel', (level) => {
        this.micLevel = level
      })

      client.on('error', (err) => {
        this.setError(err.message)
      })

      // Écouter les événements PTT du main process (uIOhook) — avec channelId
      window.oneCC.onRadioPttStart(async (targetId) => {
        try {
          await (this as any).handlePttStart?.(targetId)
        } catch (e) {
          console.debug('[RADIO][PTT] handlePttStart error', e)
        }
      })

      window.oneCC.onRadioPttStop(async (targetId) => {
        try {
          await (this as any).handlePttStop?.(targetId)
        } catch (e) {
          console.debug('[RADIO][PTT] handlePttStop error', e)
        }
      })

      // Enregistrer les bindings PTT dans le main process
      if (this.settings.pttBindings.length) {
        window.oneCC.radioSetPttBindings(toRaw(this.settings.pttBindings).map(b => ({ ...toRaw(b) })))
      }

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
      this.setError(null)

      try {
        const appStore = useAppStore()
        const channelsBaseUrl = appStore.settings ? createOverlayUrls(appStore.settings).radioChannels : ''

        const res = await fetch(`${channelsBaseUrl}/${encodeURIComponent(channelId)}/token`, {
          headers: { Authorization: `Bearer ${appStore.bearerToken}` },
        })
        if (!res.ok) throw new Error(`Token server error: ${res.status}`)
        const { token, url } = await res.json()

        await radioClient!.join(channelId, url as string, token as string, this.selectedInputId, whisperOnly)

        // Si radioClient.join() a retourné sans erreur mais n'a pas créé
        // de Room (cas whisperOnly ignoré parce qu'aucun canal normal connecté),
        // réinitialiser l'état "connecting" pour permettre une auto-join
        // ultérieure (ex: on rejoint ensuite un canal normal).
        if (!radioClient!.isChannelConnected(channelId)) {
          console.debug(`[RADIO][store] joinChannel canal=${channelId} — join ignoré (whisperOnly probablement)`)
          if (this.channelState[channelId]) this.channelState[channelId].connecting = false
          return
        }

        // Appliquer le volume
        radioClient!.setVolume(this.settings.radioVolume)

        // Si on rejoint en écoute normale, connecter en murmure tous les autres
        // canaux qui :
        // - ont au moins une touche PTT configurée (binding avec keyCode)
        // - contiennent au moins un participant
        if (!whisperOnly) {
          const resolved = new Set<string>()
          for (const binding of this.settings.pttBindings) {
            if (!binding.keyCode) continue
            for (const whisperTargetId of this._resolvePttTargetChannelIds(binding.channelId)) {
              if (whisperTargetId === channelId) continue
              if (resolved.has(whisperTargetId)) continue
              resolved.add(whisperTargetId)

              // Vérifier présence de participants (cache puis live)
              let participantsCount = this.channelParticipants[whisperTargetId]?.length ?? 0
              try {
                const live = await this._fetchChannelParticipants(whisperTargetId)
                if (Array.isArray(live)) participantsCount = live.length
              } catch {}

              if (participantsCount === 0) continue

              const otherCs = this.channelState[whisperTargetId]
              if (!otherCs?.connected && !otherCs?.connecting) {
                this.joinChannel(whisperTargetId, true).catch(() => {})
              }
            }
          }
        }
        // Si on a rejoint en écoute normale, activer le transmit automatiquement
        // pour permettre de parler librement sans PTT dans le canal où l'on est connecté.
        if (!whisperOnly) {
          try {
            await this.startTransmit(channelId)
          } catch (e) {
            console.debug(`[RADIO][store] failed auto-start transmit canal=${channelId}`, e)
          }
        }
      } catch (err: any) {
        this.setError(err?.message || 'Erreur de connexion radio')
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
      await radioClient!.leave(channelId)
    },

    async leaveAll() {
      await radioClient!.leaveAll()
    },

    // ── PTT ──────────────────────────────────────────────────────────────

    async startTransmit(channelId: string) {
      const cs = this.channelState[channelId]
      console.debug(`[RADIO][store] startTransmit canal=${channelId} cs.connected=${cs?.connected} muted=${this.muted}`)
      if (!cs?.connected || this.muted) return
      await radioClient!.startTransmit(channelId)
      cs.transmitting = true
    },

    async stopTransmit(channelId: string) {
      const cs = this.channelState[channelId]
      console.debug(`[RADIO][store] stopTransmit canal=${channelId} cs=${!!cs}`)
      if (!cs) return
      await radioClient!.stopTransmit(channelId)
      cs.transmitting = false
    },

    async startPttTarget(targetId: string) {
      for (const channelId of this._resolvePttTargetChannelIds(targetId)) {
        await this.startTransmit(channelId)
      }
    },

    async stopPttTarget(targetId: string) {
      for (const channelId of this._resolvePttTargetChannelIds(targetId)) {
        await this.stopTransmit(channelId)
      }
    },

    // ── Handle PTT lifecycle (used by main IPC and local keyboard fallback) ──
    async handlePttStart(targetId: string) {
      const targetChannels = this._resolvePttTargetChannelIds(targetId)
      if (!targetChannels.length) {
        await this.removePttBinding(targetId)
        return
      }

      const connectedCount = targetChannels.filter(cid => this.channelState[cid]?.connected).length
      console.debug(`[RADIO][PTT] handleStart cible=${targetId} channels=${targetChannels.join(',')} connected=${connectedCount} muted=${this.muted}`)
      if (this.muted) return

      if (!this._hasPttBindingForTarget(targetId)) return

      const isGlobal = isGlobalPttTarget(targetId)

      // Current vocal channel where we have non-whisper connection
      const currentNonWhisperChannel = Object.entries(this.channelState).find(([, s]) => s.connected && !s.whisperOnly)?.[0] ?? null

      if (isGlobal) {
        const filtered: string[] = []
        for (const channelId of targetChannels) {
          if (currentNonWhisperChannel && channelId === currentNonWhisperChannel) continue
          let participantsCount = this.channelParticipants[channelId]?.length ?? 0
          try {
            const live = await this._fetchChannelParticipants(channelId)
            if (Array.isArray(live)) participantsCount = live.length
          } catch {}
          if (participantsCount > 0) filtered.push(channelId)
        }

        if (!filtered.length) return

        for (const channelId of filtered) {
          if (this.channelState[channelId]?.connected) continue
          const wasConnected = Boolean(this.channelState[channelId]?.connected)
          try {
            await this.joinChannel(channelId, true)
            if (!wasConnected && this.channelState[channelId]?.connected && this.channelState[channelId]?.whisperOnly) {
              this._pttAutoJoined[targetId] = this._pttAutoJoined[targetId] ?? []
              if (!this._pttAutoJoined[targetId].includes(channelId)) this._pttAutoJoined[targetId].push(channelId)
            }
          } catch (e) {
            console.debug(`[RADIO][PTT] auto-join échoué canal=${channelId}:`, e)
          }
        }

        for (const channelId of filtered) {
          try { await this.startTransmit(channelId) } catch (e) { console.debug(`[RADIO][PTT] startTransmit échoué canal=${channelId}:`, e) }
        }

        return
      }

      // Non-global target (single channel or category)
      for (const channelId of targetChannels) {
        // If we are already in the channel non-whisper, no PTT needed
        if (this.channelState[channelId]?.connected && !this.channelState[channelId]?.whisperOnly) continue

        let participantsCount = this.channelParticipants[channelId]?.length ?? 0
        try {
          const live = await this._fetchChannelParticipants(channelId)
          if (Array.isArray(live)) participantsCount = live.length
        } catch {}

        if (participantsCount === 0) {
          if ((this as any).connected) {
            try { this._playPttWarningBeep() } catch {}
            const ch = this.channels.find(c => c.id === channelId)
            this.setError(ch ? `Aucun participant dans "${ch.name}"` : 'Aucun participant dans le canal')
          }
          console.debug(`[RADIO][PTT] skip auto-join canal=${channelId} — aucun participant`)
          continue
        }

        const wasConnected = Boolean(this.channelState[channelId]?.connected)
        try {
          await this.joinChannel(channelId, true)
          if (!wasConnected && this.channelState[channelId]?.connected && this.channelState[channelId]?.whisperOnly) {
            this._pttAutoJoined[targetId] = this._pttAutoJoined[targetId] ?? []
            if (!this._pttAutoJoined[targetId].includes(channelId)) this._pttAutoJoined[targetId].push(channelId)
          }
        } catch (e) {
          console.debug(`[RADIO][PTT] auto-join échoué canal=${channelId}:`, e)
        }
      }

      await this.startPttTarget(targetId)
    },

    async handlePttStop(targetId: string) {
      console.debug(`[RADIO][PTT] handleStop cible=${targetId}`)
      await this.stopPttTarget(targetId)

      const auto = this._pttAutoJoined[targetId] ?? []
      if (auto.length) {
        for (const channelId of auto) {
          try {
            if (this.channelState[channelId]?.connected && this.channelState[channelId]?.whisperOnly) {
              await this.leaveChannel(channelId)
            }
          } catch (e) {
            console.debug(`[RADIO][PTT] leave auto-joined failed canal=${channelId}:`, e)
          }
        }
        delete this._pttAutoJoined[targetId]
      }
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
      radioClient!.setVolume(this.mutedIncoming ? 0 : this.settings.radioVolume)
    },

    // ── Volume ───────────────────────────────────────────────────────────

    setVolume(volume: number) {
      this.settings.radioVolume = volume
      radioClient!.setVolume(volume)
      window.oneCC.radioUpdateSettings({ radioVolume: volume })
    },

    // ── PTT Bindings ──────────────────────────────────────────────────────

    async setPttBinding(targetId: string, keyCode: number | null, key: string) {
      console.log(`[RADIO][store] setPttBinding targetId=${targetId} keyCode=${keyCode} key=${key}`)
      if (isCategoryPttTarget(targetId)) {
        const categoryId = categoryIdFromPttTarget(targetId)
        console.log(`[RADIO][store] setPttBinding cible=${targetId} est une catégorie`)
        if (categoryId === null || !this._categoryExists(categoryId)) {
          console.log(`[RADIO][store] setPttBinding catégorie invalide cible=${targetId} → suppression du binding`)
          await this.removePttBinding(targetId)
          return
        }
      } else if (!this._channelExists(targetId) && !isGlobalPttTarget(targetId)) {
        console.log(`[RADIO][store] setPttBinding cible=${targetId} est un canal invalide → suppression du binding`)
        await this.removePttBinding(targetId)
        return
      }

      if (keyCode !== null) {
        const existing = this.settings.pttBindings.find(b => b.keyCode === keyCode && b.channelId !== targetId)
        console.log(`[RADIO][store] setPttBinding targetId=${targetId} keyCode=${keyCode} existing=${existing ? `${existing.channelId}` : 'none'}`)
        if (existing) {
          let allow = false
          // Si l'existant est un binding de catégorie et que la cible
          // est un canal appartenant à cette catégorie, autoriser.
          if (isCategoryPttTarget(existing.channelId) && !isCategoryPttTarget(targetId)) {
            const existingCid = categoryIdFromPttTarget(existing.channelId)
            const targetChannel = this.channels.find(c => c.id === targetId)
            if (existingCid !== null && targetChannel && targetChannel.categoryId === existingCid) {
              allow = true
            }
          }

          if (!allow) {
            // Construire un libellé lisible pour l'erreur
            let label = existing.channelId
            if (isGlobalPttTarget(existing.channelId)) {
              label = 'tous les canaux'
            } else if (isCategoryPttTarget(existing.channelId)) {
              const cid = categoryIdFromPttTarget(existing.channelId)
              const cat = cid !== null ? this.categories.find(c => c.id === cid) : undefined
              label = cat ? `catégorie "${cat.name}"` : `cible ${existing.channelId}`
            } else {
              const ch = this.channels.find(c => c.id === existing.channelId)
              label = ch ? `canal "${ch.name}"` : `canal ${existing.channelId}`
            }
            const errMsg = `Touche déjà assignée à ${label}`
            this.setError(errMsg)
            throw new Error(errMsg)
          }
        }
      }

      console.debug(`[RADIO][store] setPttBinding cible=${targetId} keyCode=${keyCode} key=${key}`)
      const bindings = this.settings.pttBindings.filter(b => b.channelId !== targetId)
      if (keyCode !== null) bindings.push({ channelId: targetId, keyCode, key })
      this.settings.pttBindings = bindings
      await window.oneCC.radioSetPttBindings(bindings.map(b => ({ ...b })))

      // Ne pas auto-rejoindre lors du paramétrage d'une touche PTT.
    },

    async removePttBinding(targetId: string) {
      this.settings.pttBindings = this.settings.pttBindings.filter(b => b.channelId !== targetId)
      await window.oneCC.radioSetPttBindings(toRaw(this.settings.pttBindings).map(b => ({ ...toRaw(b) })))

      // Auto-quitter si les canaux de la cible étaient en murmure automatique
      for (const channelId of this._resolvePttTargetChannelIds(targetId)) {
        if (this.channelState[channelId]?.connected && this.channelState[channelId]?.whisperOnly) {
          await this.leaveChannel(channelId)
        }
      }
    },

    // ── Settings ─────────────────────────────────────────────────────────

    async updateSettings(partial: Partial<RadioSettings>) {
      Object.assign(this.settings, partial)
      await window.oneCC.radioUpdateSettings(partial)
    },

    // ── Channels CRUD ─────────────────────────────────────────────────────

    async fetchChannels() {
      // Channels are now provided inside categories (category.channels).
      // Ensure categories are loaded, then flatten their channels list.
      if (this.categories.length === 0) {
        await this.fetchCategories()
      }

      this.channels = this.categories.flatMap(cat => Array.isArray(cat.channels) ? cat.channels : [])

      await this._pruneInvalidPttBindings()
      await this.fetchAllParticipants()
    },

    async fetchAllParticipants(includeConnected = false) {
      const targetChannels = includeConnected
        ? this.channels
        : this.channels.filter(ch => !this.channelState[ch.id]?.connected)

      await Promise.allSettled(
        targetChannels.map(async (ch) => {
          await this._fetchChannelParticipants(ch.id)
        }),
      )
    },

    async refreshParticipantsFromMercureEvent(payload: unknown) {
      await this.fetchAllParticipants(true)
    },

    async createChannel(payload: ChannelCreatePayload) {
      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioChannels : ''
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appStore.bearerToken}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      await this.fetchChannels()
      await this.fetchCategories()
    },

    async updateChannel(id: string, payload: ChannelUpdatePayload) {
      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioChannels : ''
      const res = await fetch(`${url}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appStore.bearerToken}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      await this.fetchChannels()
      await this.fetchCategories()
    },

    async deleteChannel(id: string) {
      const liveParticipants = await this._fetchChannelParticipants(id)
      const participantsCount = liveParticipants?.length ?? this.participantsFor(id).length
      if (participantsCount > 0) {
        throw new Error('Impossible de supprimer ce canal: au moins un participant est present.')
      }

      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioChannels : ''
      const res = await fetch(`${url}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${appStore.bearerToken}` },
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      if (this.channelState[id]?.connected) await this.leaveChannel(id)
      await this.fetchCategories()
      await this.fetchChannels()
    },

    // ── Categories CRUD ───────────────────────────────────────────────────

    async fetchCategories() {
      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioCategories : ''
      if (!url) return
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${appStore.bearerToken}` } })
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data.categories)) this.categories = data.categories
        else if (Array.isArray(data)) this.categories = data
      } catch {
        this.categories = []
      }
      await this._pruneInvalidPttBindings()
    },

    async createCategory(payload: { name: string; description?: string }) {
      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioCategories : ''
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appStore.bearerToken}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      await this.fetchCategories()
      await this.fetchChannels()
    },

    async updateCategory(id: number, payload: { name?: string; description?: string }) {
      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioCategories : ''
      const res = await fetch(`${url}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appStore.bearerToken}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      await this.fetchCategories()
    },

    async deleteCategory(id: number) {
      const appStore = useAppStore()
      const url = appStore.settings ? createOverlayUrls(appStore.settings).radioCategories : ''
      const res = await fetch(`${url}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${appStore.bearerToken}` },
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      await this.fetchCategories()
      // After removing a category the server may reassign or move channels
      // to the uncategorized bucket; refresh channels as well to keep
      // the client state consistent.
      await this.fetchChannels()
    },

    // ── Devices ──────────────────────────────────────────────────────────

    async loadDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()))
        const { RadioClient: RC } = await import('../services/radioClient')
        this.availableInputs  = await RC.getAudioInputDevices()
        this.availableOutputs = await RC.getAudioOutputDevices()
      } catch { /* pas de permission micro */ }
    },

    async setAudioInput(deviceId: string) {
      this.selectedInputId = deviceId
      if (radioClient?.connected) await radioClient.setAudioInput(deviceId)
    },

    async setAudioOutput(deviceId: string) {
      this.selectedOutputId = deviceId
      if (radioClient?.connected) await radioClient.setAudioOutput(deviceId)
    },

    setGateThreshold(value: number) {
      this.gateThreshold = value
      radioClient?.setGateThreshold(value)
    },

    setInputGain(value: number) {
      this.inputGain = value
      radioClient?.setInputGain(value)
    },

    async toggleMonitor() {
      if (radioClient?.isMonitoring) {
        radioClient.stopMonitor()
        this.monitoring = false
      } else if (radioClient) {
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
      radioClient?.destroy()
    },
  },
})
