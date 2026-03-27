import {
  Room,
  RoomEvent,
  LocalAudioTrack,
  createLocalAudioTrack,
  Track,
  type RemoteParticipant,
  type Participant,
} from 'livekit-client'

export interface RadioParticipant {
  identity: string
  isSpeaking: boolean
  isMuted: boolean
}

export type RadioConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

type RadioEventMap = {
  connectionStateChange: RadioConnectionState
  participantsChange: RadioParticipant[]
  activeSpeakersChange: string[]  // identities
  error: string
}

type EventHandler<K extends keyof RadioEventMap> = (payload: RadioEventMap[K]) => void

class RadioService {
  private room: Room | null = null
  private localTrack: LocalAudioTrack | null = null
  private _state: RadioConnectionState = 'disconnected'
  private _participants: RadioParticipant[] = []
  private _activeSpeakers: string[] = []
  private listeners: { [K in keyof RadioEventMap]?: EventHandler<K>[] } = {}

  // ── Event bus ─────────────────────────────────────────────────────────────

  on<K extends keyof RadioEventMap>(event: K, handler: EventHandler<K>) {
    if (!this.listeners[event]) this.listeners[event] = [] as any
    ;(this.listeners[event] as EventHandler<K>[]).push(handler)
  }

  off<K extends keyof RadioEventMap>(event: K, handler: EventHandler<K>) {
    this.listeners[event] = (this.listeners[event] as EventHandler<K>[])?.filter(h => h !== handler) as any
  }

  private emit<K extends keyof RadioEventMap>(event: K, payload: RadioEventMap[K]) {
    ;(this.listeners[event] as EventHandler<K>[])?.forEach(h => h(payload))
  }

  // ── State ─────────────────────────────────────────────────────────────────

  get state() { return this._state }
  get participants() { return this._participants }
  get activeSpeakers() { return this._activeSpeakers }

  private setState(s: RadioConnectionState) {
    this._state = s
    this.emit('connectionStateChange', s)
  }

  // ── Token fetch ───────────────────────────────────────────────────────────

  private async fetchToken(tokenUrl: string, roomName: string, identity: string): Promise<string> {
    const url = new URL(tokenUrl)
    url.searchParams.set('room', roomName)
    url.searchParams.set('identity', identity)
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`)
    const json = await res.json()
    if (!json.token) throw new Error('No token in response')
    return json.token
  }

  // ── Connect ───────────────────────────────────────────────────────────────

  async connect(serverUrl: string, tokenUrl: string, roomName: string, identity: string, inputDeviceId?: string) {
    if (this.room) await this.disconnect()

    this.setState('connecting')
    try {
      const token = await this.fetchToken(tokenUrl, roomName, identity)

      this.room = new Room({
        adaptiveStream: false,
        dynacast: false,
        audioCaptureDefaults: {
          deviceId: inputDeviceId ?? undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      this.room
        .on(RoomEvent.ParticipantConnected,    () => this.refreshParticipants())
        .on(RoomEvent.ParticipantDisconnected, () => this.refreshParticipants())
        .on(RoomEvent.TrackMuted,              () => this.refreshParticipants())
        .on(RoomEvent.TrackUnmuted,            () => this.refreshParticipants())
        .on(RoomEvent.ActiveSpeakersChanged,   (speakers: Participant[]) => {
          this._activeSpeakers = speakers.map(s => s.identity)
          this.emit('activeSpeakersChange', this._activeSpeakers)
        })
        .on(RoomEvent.Disconnected, () => {
          this.setState('disconnected')
          this._participants = []
          this._activeSpeakers = []
          this.emit('participantsChange', [])
          this.emit('activeSpeakersChange', [])
        })
        .on(RoomEvent.MediaDevicesError, (e: Error) => {
          this.emit('error', e.message)
        })

      await this.room.connect(serverUrl, token, { autoSubscribe: true })

      // Créer le track audio local, initialement muté (PTT)
      this.localTrack = await createLocalAudioTrack({
        deviceId: inputDeviceId ?? undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      })
      this.localTrack.mute()

      await this.room.localParticipant.publishTrack(this.localTrack, {
        source: Track.Source.Microphone,
      })

      this.refreshParticipants()
      this.setState('connected')
    } catch (err: any) {
      this.setState('error')
      this.emit('error', err?.message ?? 'Connexion échouée')
      this.room = null
      this.localTrack = null
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  async disconnect() {
    if (this.localTrack) {
      try { await this.localTrack.stop() } catch {}
      this.localTrack = null
    }
    if (this.room) {
      try { await this.room.disconnect() } catch {}
      this.room = null
    }
    this._participants = []
    this._activeSpeakers = []
    this.setState('disconnected')
    this.emit('participantsChange', [])
    this.emit('activeSpeakersChange', [])
  }

  // ── PTT ───────────────────────────────────────────────────────────────────

  pttStart() {
    if (this.localTrack) this.localTrack.unmute()
  }

  pttEnd() {
    if (this.localTrack) this.localTrack.mute()
  }

  get isMicActive(): boolean {
    return this.localTrack ? !this.localTrack.isMuted : false
  }

  // ── Participants ──────────────────────────────────────────────────────────

  private refreshParticipants() {
    if (!this.room) return
    const remotes: RadioParticipant[] = []
    this.room.remoteParticipants.forEach((p: RemoteParticipant) => {
      const audioTrack = p.getTrackPublication(Track.Source.Microphone)
      remotes.push({
        identity: p.identity,
        isSpeaking: p.isSpeaking,
        isMuted: audioTrack?.isMuted ?? true,
      })
    })
    // Ajouter le participant local
    const local = this.room.localParticipant
    remotes.unshift({
      identity: local.identity + ' (moi)',
      isSpeaking: local.isSpeaking,
      isMuted: this.localTrack?.isMuted ?? true,
    })
    this._participants = remotes
    this.emit('participantsChange', remotes)
  }

  // ── Devices ───────────────────────────────────────────────────────────────

  async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(d => d.kind === 'audioinput')
  }
}

export const radioService = new RadioService()
