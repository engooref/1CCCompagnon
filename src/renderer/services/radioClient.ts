// ─── Radio Client (renderer) ──────────────────────────────────────────────────
// Multi-canal : une Room LiveKit par canal, pipeline audio partagé.
// L'utilisateur peut rejoindre plusieurs canaux simultanément (écoute active)
// et transmettre sur chacun indépendamment via sa touche PTT dédiée.
//
// Pipeline audio partagé (Discord-like) :
//   getUserMedia → PreAmpGain → HighPassFilter(80Hz) → DynamicsCompressor
//                → Analyser → GateGain → Destination
//                                       ↘ clone par canal → LiveKit Room

import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteAudioTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  Participant,
  LocalAudioTrack,
} from 'livekit-client'
import type { RadioSpeaker } from '@shared/radio'

export type RadioClientEvents = {
  channelConnected: (channelId: string) => void
  channelDisconnected: (channelId: string, reason?: string) => void
  speakersChanged: (speakers: RadioSpeaker[]) => void
  participantJoined: (channelId: string, identity: string) => void
  participantLeft: (channelId: string, identity: string) => void
  micLevel: (level: number) => void
  error: (err: Error) => void
}

interface ChannelEntry {
  room: Room
  micTrack: LocalAudioTrack | null
  /** true = émission seulement, les pistes audio entrantes ne sont pas attachées */
  whisperOnly: boolean
}

export class RadioClient {
  // ── Shared audio pipeline ──────────────────────────────────────────────
  private rawStream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private analyserData: Uint8Array<ArrayBuffer> | null = null
  private preAmpGain: GainNode | null = null
  private gateGain: GainNode | null = null
  private processedDestination: MediaStreamAudioDestinationNode | null = null
  private micLevelInterval: ReturnType<typeof setInterval> | null = null
  private _gateThreshold = 0
  private _gateOpen = false
  private _monitoring = false

  // ── Per-channel rooms ──────────────────────────────────────────────────
  private channels: Map<string, ChannelEntry> = new Map()
  private _volume = 1.0

  // ── Event emitter ──────────────────────────────────────────────────────
  private listeners: Partial<{ [K in keyof RadioClientEvents]: RadioClientEvents[K][] }> = {}

  on<K extends keyof RadioClientEvents>(event: K, cb: RadioClientEvents[K]) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event]!.push(cb)
  }

  off<K extends keyof RadioClientEvents>(event: K, cb: RadioClientEvents[K]) {
    const list = this.listeners[event]
    if (!list) return
    const idx = list.indexOf(cb)
    if (idx >= 0) list.splice(idx, 1)
  }

  private emit<K extends keyof RadioClientEvents>(event: K, ...args: Parameters<RadioClientEvents[K]>) {
    const list = this.listeners[event]
    if (!list) return
    for (const cb of list) (cb as (...a: any[]) => void)(...args)
  }

  // ── State getters ──────────────────────────────────────────────────────

  get connected(): boolean {
    return this.channels.size > 0
  }

  get joinedChannelIds(): string[] {
    return Array.from(this.channels.keys())
  }

  isChannelConnected(channelId: string): boolean {
    return this.channels.get(channelId)?.room.state === 'connected'
  }

  isTransmitting(channelId: string): boolean {
    const entry = this.channels.get(channelId)
    return entry?.micTrack ? !entry.micTrack.isMuted : false
  }

  participants(channelId: string): string[] {
    const entry = this.channels.get(channelId)
    if (!entry) return []
    return Array.from(entry.room.remoteParticipants.values()).map(p => p.identity)
  }

  // ── Device enumeration ─────────────────────────────────────────────────

  static async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(d => d.kind === 'audioinput')
  }

  static async getAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(d => d.kind === 'audiooutput')
  }

  async setAudioInput(deviceId: string): Promise<void> {
    // Reconstruire le pipeline avec le nouvel input (affecte tous les canaux)
    if (!this.audioCtx) return
    const inputDeviceId = deviceId
    // Stopper l'ancien stream et recapturer
    this.rawStream?.getTracks().forEach(t => t.stop())
    this.rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: inputDeviceId || undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
        sampleRate: 48000,
      },
    })
    // Reconnecter la source dans le graphe audio existant
    const source = this.audioCtx.createMediaStreamSource(this.rawStream)
    if (this.preAmpGain) source.connect(this.preAmpGain)
  }

  async setAudioOutput(deviceId: string): Promise<void> {
    for (const entry of this.channels.values()) {
      await entry.room.switchActiveDevice('audiooutput', deviceId)
    }
  }

  // ── Connection ─────────────────────────────────────────────────────────

  /**
   * Rejoindre un canal radio.
   * Si c'est le premier canal, le pipeline audio est initialisé.
   * Les canaux suivants réutilisent le même pipeline (track cloné).
   */
  /**
   * @param whisperOnly true = émission uniquement (pas d'écoute des autres)
   */
  async join(channelId: string, livekitUrl: string, token: string, inputDeviceId?: string | null, whisperOnly = false): Promise<void> {
    console.debug(`[RADIO][client] join canal=${channelId} whisperOnly=${whisperOnly} state=${this.channels.get(channelId)?.room.state ?? 'absent'}`)

    // Si une Room existe déjà pour ce canal, la nettoyer avant de rejoindre.
    // Si elle est vraiment connectée → leave propre (signal au serveur).
    // Si elle est en état bogué (connexion partielle/échouée) → nettoyage forcé
    // SANS appeler room.disconnect() qui déclencherait unpublishTrack → createOffer
    // sur une peer connection fermée et provoquerait "could not createOffer with closed PC".
    if (this.channels.has(channelId)) {
      const existing = this.channels.get(channelId)!
      if (existing.room.state === 'connected' || existing.room.state === 'reconnecting') {
        console.debug(`[RADIO][client] join — room connectée, leave propre`)
        await this.leave(channelId)
      } else {
        console.debug(`[RADIO][client] join — room en état bogué (${existing.room.state}), nettoyage forcé`)
        existing.micTrack?.stop()
        existing.micTrack = null
        try { await existing.room.disconnect() } catch { /* ignore errors on broken room */ }
        this.channels.delete(channelId)
        if (this.channels.size === 0) this.teardownAudioPipeline()
      }
    }

    // Initialiser le pipeline audio partagé au premier canal
    if (!this.audioCtx || !this.processedDestination) {
      await this.setupAudioPipeline(inputDeviceId ?? undefined)
    }

    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    })
    const entry: ChannelEntry = { room, micTrack: null, whisperOnly }
    this.channels.set(channelId, entry)
    this.setupRoomEvents(channelId, room, entry)
    

    // Si room.connect() échoue (ex: serveur envoie Leave immédiatement), nettoyer
    // l'entrée pour ne pas laisser de Room zombie dans this.channels.
    try {
      await room.connect(livekitUrl, token, {
        autoSubscribe: !whisperOnly,
      })
      await room.localParticipant.setAttributes({
        mode: whisperOnly ? 'whisper' : 'normal'
      })
    } catch (err) {
      console.debug(`[RADIO][client] room.connect() échoué pour ${channelId}:`, err)
      entry.micTrack?.stop()
      this.channels.delete(channelId)
      if (this.channels.size === 0) this.teardownAudioPipeline()
      throw err
    }

    try {
      const canPublish = room.localParticipant.permissions?.canPublish ?? true
      if (canPublish && this.processedDestination) {
        // Cloner le track traité pour ce canal (indépendant du mute des autres)
        const clonedTrack = this.processedDestination.stream.getAudioTracks()[0].clone()
        const micTrack = new LocalAudioTrack(clonedTrack, undefined, true)
        entry.micTrack = micTrack
        await room.localParticipant.publishTrack(micTrack, { source: Track.Source.Microphone })
        await micTrack.mute() // PTT : muté par défaut
      }
    } catch {
      entry.micTrack = null
    }

    // Appliquer le volume courant
    this.applyVolumeToRoom(room)
    this.emit('channelConnected', channelId)
  }

  async leave(channelId: string): Promise<void> {
    console.debug(`[RADIO][client] leave canal=${channelId} connu=${this.channels.has(channelId)}`, new Error('trace').stack)
    const entry = this.channels.get(channelId)
    if (!entry) {
      // Canal inconnu du client mais peut-être encore dans le store → émettre quand même
      this.emit('channelDisconnected', channelId)
      return
    }

    entry.micTrack?.stop()
    entry.micTrack = null
    await entry.room.disconnect()
    this.channels.delete(channelId)

    // Libérer le pipeline audio si plus aucun canal actif
    if (this.channels.size === 0) {
      this.teardownAudioPipeline()
    }

    this.emit('channelDisconnected', channelId)
  }

  async leaveAll(): Promise<void> {
    for (const [channelId, entry] of this.channels) {
      entry.micTrack?.stop()
      entry.micTrack = null
      await entry.room.disconnect()
      this.emit('channelDisconnected', channelId)
    }
    this.channels.clear()
    this.teardownAudioPipeline()
  }

  // ── PTT ────────────────────────────────────────────────────────────────

  async startTransmit(channelId: string): Promise<void> {
    const entry = this.channels.get(channelId)
    console.debug(`[RADIO][client] startTransmit canal=${channelId} hasMicTrack=${!!entry?.micTrack}`)
    if (!entry?.micTrack) return
    await entry.micTrack.unmute()
  }

  async stopTransmit(channelId: string): Promise<void> {
    const entry = this.channels.get(channelId)
    console.debug(`[RADIO][client] stopTransmit canal=${channelId} hasMicTrack=${!!entry?.micTrack}`)
    if (!entry?.micTrack) return
    await entry.micTrack.mute()
  }

  // ── Volume audio entrant ──────────────────────────────────────────────

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume))
    for (const entry of this.channels.values()) {
      this.applyVolumeToRoom(entry.room)
    }
  }

  private applyVolumeToRoom(room: Room): void {
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) {
        if (pub.track) (pub.track as RemoteAudioTrack).setVolume(this._volume)
      }
    }
  }

  // ── Monitor micro (écoute son propre micro traité) ────────────────────

  get isMonitoring(): boolean { return this._monitoring }

  async startMonitor(): Promise<void> {
    if (!this.gateGain || !this.audioCtx || this._monitoring) return
    await this.audioCtx.resume()
    this.gateGain.connect(this.audioCtx.destination)
    this._monitoring = true
  }

  stopMonitor(): void {
    if (!this.gateGain || !this.audioCtx || !this._monitoring) return
    try { this.gateGain.disconnect(this.audioCtx.destination) } catch {}
    this._monitoring = false
  }

  // ── Audio pipeline (partagé entre tous les canaux) ────────────────────
  //
  // Chaîne : getUserMedia → PreAmp → HPF → Compressor → Analyser → Gate → Destination
  //
  // HPF 80 Hz           : retire bruits graves (ventilateurs, vibrations bureau)
  // DynamicsCompressor  : normalise le volume comme Discord/TS
  //   threshold -26 dB, knee 30 dB, ratio 4:1, attack 3 ms, release 100 ms
  // Analyser            : niveau RMS indépendant du mute PTT
  // Gate                : coupe le signal sous le seuil vocal configuré

  private async setupAudioPipeline(inputDeviceId?: string): Promise<void> {
    this.teardownAudioPipeline()

    this.rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: inputDeviceId || undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
        sampleRate: 48000,
      },
    })

    this.audioCtx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    await this.audioCtx.resume()

    const source = this.audioCtx.createMediaStreamSource(this.rawStream)

    const hpf = this.audioCtx.createBiquadFilter()
    hpf.type = 'highpass'
    hpf.frequency.value = 80
    hpf.Q.value = 0.7

    const compressor = this.audioCtx.createDynamicsCompressor()
    compressor.threshold.value = -26
    compressor.knee.value = 30
    compressor.ratio.value = 4
    compressor.attack.value = 0.003
    compressor.release.value = 0.1

    this.preAmpGain = this.audioCtx.createGain()
    this.preAmpGain.gain.value = 1.0

    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.3
    this.analyserData = new Uint8Array(this.analyser.fftSize) as Uint8Array<ArrayBuffer>

    this.gateGain = this.audioCtx.createGain()
    this.gateGain.gain.value = 1.0

    this.processedDestination = this.audioCtx.createMediaStreamDestination()

    // source → preAmp → HPF → compressor → analyser → gate → destination
    source.connect(this.preAmpGain)
    this.preAmpGain.connect(hpf)
    hpf.connect(compressor)
    compressor.connect(this.analyser)
    this.analyser.connect(this.gateGain)
    this.gateGain.connect(this.processedDestination)

    // Polling niveau RMS + contrôle noise gate
    this.micLevelInterval = setInterval(() => {
      if (!this.analyser || !this.analyserData || !this.audioCtx || !this.gateGain) return

      this.analyser.getByteTimeDomainData(this.analyserData)
      let sumSq = 0
      for (const v of this.analyserData) {
        const n = (v - 128) / 128
        sumSq += n * n
      }
      const rms = Math.sqrt(sumSq / this.analyserData.length)
      const level = Math.min(rms * 4, 1)
      this.emit('micLevel', level)

      if (this._gateThreshold > 0) {
        const shouldOpen = level > this._gateThreshold
        if (shouldOpen && !this._gateOpen) {
          this._gateOpen = true
          this.gateGain.gain.setTargetAtTime(1.0, this.audioCtx.currentTime, 0.005)
        } else if (!shouldOpen && this._gateOpen) {
          this._gateOpen = false
          this.gateGain.gain.setTargetAtTime(0.0, this.audioCtx.currentTime, 0.08)
        }
      } else {
        if (!this._gateOpen) {
          this._gateOpen = true
          this.gateGain.gain.setTargetAtTime(1.0, this.audioCtx.currentTime, 0.005)
        }
      }
    }, 50)
  }

  private teardownAudioPipeline(): void {
    if (this.micLevelInterval) {
      clearInterval(this.micLevelInterval)
      this.micLevelInterval = null
    }
    this._monitoring = false
    this._gateOpen = false
    this.analyser = null
    this.analyserData = null
    this.preAmpGain = null
    this.gateGain = null
    this.processedDestination = null
    this.audioCtx?.close()
    this.audioCtx = null
    this.rawStream?.getTracks().forEach(t => t.stop())
    this.rawStream = null
  }

  setGateThreshold(value: number): void {
    this._gateThreshold = Math.max(0, Math.min(1, value))
  }

  setInputGain(value: number): void {
    if (this.preAmpGain) this.preAmpGain.gain.value = Math.max(0, value)
  }

  // ── Room events ────────────────────────────────────────────────────────

  private setupRoomEvents(channelId: string, room: Room, entry: ChannelEntry): void {
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        // En mode murmure, on n'écoute pas les autres — émission uniquement
        if (entry.whisperOnly) return
        track.attach()
        ;(track as RemoteAudioTrack).setVolume(this._volume)
      }
    })

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach()
    })

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const radioSpeakers: RadioSpeaker[] = speakers
        .filter(s => s.identity !== room.localParticipant.identity)
        .map(s => ({
          identity: s.identity,
          channel: channelId,
          audioLevel: s.audioLevel,
        }))
      // Merge avec les speakers des autres canaux
      const otherSpeakers = this._collectSpeakersExcept(channelId)
      this.emit('speakersChanged', [...otherSpeakers, ...radioSpeakers])
    })

    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      this.emit('participantJoined', channelId, participant.identity)
    })

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.emit('participantLeft', channelId, participant.identity)
    })

    room.on(RoomEvent.Disconnected, (reason) => {
      console.debug(`[RADIO][client][LiveKit] Disconnected canal=${channelId} reason=${reason}`, new Error('trace').stack)
      const entry = this.channels.get(channelId)
      if (entry) {
        entry.micTrack?.stop()
        entry.micTrack = null
        this.channels.delete(channelId)
      }
      if (this.channels.size === 0) this.teardownAudioPipeline()
      this.emit('channelDisconnected', channelId, reason?.toString())
    })

    room.on(RoomEvent.MediaDevicesError, (err) => {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    })
  }

  private _collectSpeakersExcept(excludeChannelId: string): RadioSpeaker[] {
    const result: RadioSpeaker[] = []
    for (const [cid, entry] of this.channels) {
      if (cid === excludeChannelId) continue
      for (const speaker of entry.room.activeSpeakers) {
        if (speaker.identity === entry.room.localParticipant.identity) continue
        result.push({ identity: speaker.identity, channel: cid, audioLevel: speaker.audioLevel })
      }
    }
    return result
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  destroy(): void {
    this.leaveAll()
    this.listeners = {}
  }
}
