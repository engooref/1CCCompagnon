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

interface RxEffectChain {
  channelId: string
  track: RemoteAudioTrack
  element: HTMLMediaElement
  source: MediaElementAudioSourceNode
  highPass: BiquadFilterNode
  bandPass: BiquadFilterNode
  presence: BiquadFilterNode
  lowPass: BiquadFilterNode
  compressor: DynamicsCompressorNode
  drive: WaveShaperNode
  dryGain: GainNode
  wetGain: GainNode
  noiseSource: AudioBufferSourceNode
  noiseFilter: BiquadFilterNode
  noiseGain: GainNode
  outputGain: GainNode
  outputSplitter: ChannelSplitterNode
  outputLeftGain: GainNode
  outputRightGain: GainNode
  outputMerger: ChannelMergerNode
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
  private _radioEffectEnabled = true
  private _radioEffectIntensity = 0.85
  private _pan = 0
  private monitorOutputGain: GainNode | null = null
  private monitorSplitter: ChannelSplitterNode | null = null
  private monitorLeftGain: GainNode | null = null
  private monitorRightGain: GainNode | null = null
  private monitorMerger: ChannelMergerNode | null = null
  private readonly rxChains = new Map<string, RxEffectChain>()
  private readonly rxTrackToKey = new WeakMap<RemoteAudioTrack, string>()

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

    // Si c'est un whisper-only, n'autoriser la connexion que si on est
    // déjà connecté à au moins un canal "normal" (écoute possible).
    if (whisperOnly) {
      const hasNormalConnected = Array.from(this.channels.values()).some(e => !e.whisperOnly && (e.room.state === 'connected' || e.room.state === 'reconnecting'))
      if (!hasNormalConnected) {
        console.debug(`[RADIO][client] join canal=${channelId} ignoré (whisperOnly=true) — aucun canal normal connecté`)
        // Ne pas initialiser le pipeline ni créer de Room pour les whispers
        return
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
    } as any)
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

  /** Balance radio entrante : -1 = 100% gauche, 0 = centre, 1 = 100% droite. */
  setPan(pan: number): void {
    this._pan = Math.max(-1, Math.min(1, pan))
    for (const chain of this.rxChains.values()) {
      this.updateRxPan(chain)
    }
    this.updateMonitorPan()
  }

  setRadioPan(pan: number): void {
    this.setPan(pan)
  }

  private applyVolumeToRoom(room: Room): void {
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) {
        if (!pub.track) continue
        const track = pub.track as RemoteAudioTrack
        const key = this.rxTrackToKey.get(track)
        if (key) {
          const chain = this.rxChains.get(key)
          if (chain) {
            chain.outputGain.gain.value = this._volume
            track.setVolume(1)
            continue
          }
        }
        track.setVolume(this._volume)
      }
    }
  }

  // ── Monitor micro (écoute son propre micro traité) ────────────────────

  get isMonitoring(): boolean { return this._monitoring }

  async startMonitor(): Promise<void> {
    if (!this.gateGain || !this.audioCtx || this._monitoring) return
    await this.audioCtx.resume()

    this.monitorOutputGain = this.audioCtx.createGain()
    this.monitorOutputGain.gain.value = 1
    this.monitorSplitter = this.audioCtx.createChannelSplitter(2)
    this.monitorLeftGain = this.audioCtx.createGain()
    this.monitorRightGain = this.audioCtx.createGain()
    this.monitorMerger = this.audioCtx.createChannelMerger(2)

    // Monitor micro avec la même balance hard-pan que la réception radio.
    // À -1 : droite coupée. À +1 : gauche coupée.
    this.gateGain.connect(this.monitorOutputGain)
    this.monitorOutputGain.connect(this.monitorSplitter)
    this.monitorSplitter.connect(this.monitorLeftGain, 0)
    this.monitorSplitter.connect(this.monitorLeftGain, 1)
    this.monitorSplitter.connect(this.monitorRightGain, 0)
    this.monitorSplitter.connect(this.monitorRightGain, 1)
    this.monitorLeftGain.connect(this.monitorMerger, 0, 0)
    this.monitorRightGain.connect(this.monitorMerger, 0, 1)
    this.monitorMerger.connect(this.audioCtx.destination)

    this.updateMonitorPan()
    this._monitoring = true
  }

  stopMonitor(): void {
    this.disconnectMonitorChain()
    this._monitoring = false
  }

  private disconnectMonitorChain(): void {
    try { this.monitorOutputGain?.disconnect() } catch {}
    try { this.monitorSplitter?.disconnect() } catch {}
    try { this.monitorLeftGain?.disconnect() } catch {}
    try { this.monitorRightGain?.disconnect() } catch {}
    try { this.monitorMerger?.disconnect() } catch {}

    this.monitorOutputGain = null
    this.monitorSplitter = null
    this.monitorLeftGain = null
    this.monitorRightGain = null
    this.monitorMerger = null
  }

  private updateMonitorPan(): void {
    if (!this.monitorLeftGain || !this.monitorRightGain) return
    const pan = Math.max(-1, Math.min(1, this._pan))
    this.monitorLeftGain.gain.value = pan <= 0 ? 1 : 1 - pan
    this.monitorRightGain.gain.value = pan >= 0 ? 1 : 1 + pan
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

    // TX propre : l'effet radio est uniquement en réception.
    // source → preAmp → HPF → compressor
    //                                  ├→ analyser (niveau/gate)
    //                                  └→ gate → Destination LiveKit
    source.connect(this.preAmpGain)
    this.preAmpGain.connect(hpf)
    hpf.connect(compressor)
    compressor.connect(this.analyser)
    compressor.connect(this.gateGain)
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
    this.disconnectMonitorChain()
    this.analyser = null
    this.analyserData = null
    this.preAmpGain = null
    this.gateGain = null
    this.processedDestination = null
    this.cleanupRxChains()
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

  setRadioEffectEnabled(enabled: boolean): void {
    this._radioEffectEnabled = enabled
    this.applyRxEffectSettings()
  }

  setRadioEffectIntensity(value: number): void {
    this._radioEffectIntensity = Math.max(0, Math.min(1, value))
    this.applyRxEffectSettings()
  }

  private applyRxEffectSettings(): void {
    for (const chain of this.rxChains.values()) {
      this.updateRxMix(chain)
    }
  }

  private updateRxPan(chain: RxEffectChain): void {
    const pan = Math.max(-1, Math.min(1, this._pan))
    // Hard-pan linéaire : à -1 droite=0, à +1 gauche=0.
    chain.outputLeftGain.gain.value = pan <= 0 ? 1 : 1 - pan
    chain.outputRightGain.gain.value = pan >= 0 ? 1 : 1 + pan
  }

  private updateRxMix(chain: RxEffectChain): void {
    chain.outputGain.gain.value = this._volume
    this.updateRxPan(chain)

    if (!this._radioEffectEnabled) {
      chain.dryGain.gain.value = 1
      chain.wetGain.gain.value = 0
      chain.noiseGain.gain.value = 0
      chain.drive.curve = this.createDistortionCurve(0.02)
      return
    }

    const intensity = this._radioEffectIntensity
    chain.highPass.frequency.value = 300 + (260 * intensity)
    chain.bandPass.frequency.value = 1500 + (500 * intensity)
    chain.bandPass.Q.value = 0.7 + (0.85 * intensity)
    chain.presence.frequency.value = 2100 + (450 * intensity)
    chain.presence.gain.value = 7 + (9 * intensity)
    chain.lowPass.frequency.value = 3600 - (1050 * intensity)
    chain.compressor.threshold.value = -28 - (12 * intensity)
    chain.compressor.ratio.value = 6 + (8 * intensity)

    chain.dryGain.gain.value = Math.max(0.03, 0.42 - (0.34 * intensity))
    chain.wetGain.gain.value = 0.82 + (0.48 * intensity)
    chain.noiseGain.gain.value = 0.003 + (0.014 * intensity)
    chain.drive.curve = this.createDistortionCurve(0.32 + (0.9 * intensity))
  }

  private createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const k = Math.max(0.01, amount) * 100
    const nSamples = 1024
    const curve = new Float32Array(nSamples) as Float32Array<ArrayBuffer>
    for (let i = 0; i < nSamples; i += 1) {
      const x = (i * 2) / nSamples - 1
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x))
    }
    return curve
  }

  private createNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.35))
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < bufferSize; i += 1) {
      // Bruit rose simplifié : moins agressif que du white noise pur.
      const white = (Math.random() * 2) - 1
      last = (last * 0.86) + (white * 0.14)
      data[i] = last
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    return source
  }

  private attachRemoteTrackWithEffect(channelId: string, track: RemoteAudioTrack): void {
    const key = `${channelId}:${track.sid}`
    this.cleanupRxChain(key)

    const element = track.attach() as HTMLMediaElement
    track.setVolume(1)

    if (!this.audioCtx) {
      track.setVolume(this._volume)
      return
    }

    try {
      const source = this.audioCtx.createMediaElementSource(element)

      const highPass = this.audioCtx.createBiquadFilter()
      highPass.type = 'highpass'
      highPass.frequency.value = 420
      highPass.Q.value = 0.85

      const bandPass = this.audioCtx.createBiquadFilter()
      bandPass.type = 'bandpass'
      bandPass.frequency.value = 1800
      bandPass.Q.value = 0.95

      const presence = this.audioCtx.createBiquadFilter()
      presence.type = 'peaking'
      presence.frequency.value = 2350
      presence.Q.value = 1.35
      presence.gain.value = 11

      const lowPass = this.audioCtx.createBiquadFilter()
      lowPass.type = 'lowpass'
      lowPass.frequency.value = 2850
      lowPass.Q.value = 0.95

      const rxCompressor = this.audioCtx.createDynamicsCompressor()
      rxCompressor.threshold.value = -34
      rxCompressor.knee.value = 7
      rxCompressor.ratio.value = 11
      rxCompressor.attack.value = 0.001
      rxCompressor.release.value = 0.055

      const drive = this.audioCtx.createWaveShaper()
      drive.curve = this.createDistortionCurve(0.55)
      drive.oversample = '2x'

      const dryGain = this.audioCtx.createGain()
      const wetGain = this.audioCtx.createGain()
      const noiseGain = this.audioCtx.createGain()
      const outputGain = this.audioCtx.createGain()
      const outputSplitter = this.audioCtx.createChannelSplitter(2)
      const outputLeftGain = this.audioCtx.createGain()
      const outputRightGain = this.audioCtx.createGain()
      const outputMerger = this.audioCtx.createChannelMerger(2)

      const noiseSource = this.createNoiseSource(this.audioCtx)
      const noiseFilter = this.audioCtx.createBiquadFilter()
      noiseFilter.type = 'bandpass'
      noiseFilter.frequency.value = 1800
      noiseFilter.Q.value = 0.45

      source.connect(dryGain)
      dryGain.connect(outputGain)

      source.connect(highPass)
      highPass.connect(bandPass)
      bandPass.connect(presence)
      presence.connect(lowPass)
      lowPass.connect(rxCompressor)
      rxCompressor.connect(drive)
      drive.connect(wetGain)
      wetGain.connect(outputGain)

      noiseSource.connect(noiseFilter)
      noiseFilter.connect(noiseGain)
      noiseGain.connect(outputGain)
      noiseSource.start()

      outputGain.connect(outputSplitter)
      outputSplitter.connect(outputLeftGain, 0)
      outputSplitter.connect(outputLeftGain, 1)
      outputSplitter.connect(outputRightGain, 0)
      outputSplitter.connect(outputRightGain, 1)
      outputLeftGain.connect(outputMerger, 0, 0)
      outputRightGain.connect(outputMerger, 0, 1)
      outputMerger.connect(this.audioCtx.destination)

      const chain: RxEffectChain = {
        channelId,
        track,
        element,
        source,
        highPass,
        bandPass,
        presence,
        lowPass,
        compressor: rxCompressor,
        drive,
        dryGain,
        wetGain,
        noiseSource,
        noiseFilter,
        noiseGain,
        outputGain,
        outputSplitter,
        outputLeftGain,
        outputRightGain,
        outputMerger,
      }
      this.rxChains.set(key, chain)
      this.rxTrackToKey.set(track, key)
      this.updateRxMix(chain)
    } catch {
      track.setVolume(this._volume)
    }
  }

  private cleanupRxChain(key: string): void {
    const chain = this.rxChains.get(key)
    if (!chain) return

    try { chain.noiseSource.stop() } catch {}
    try { chain.source.disconnect() } catch {}
    try { chain.highPass.disconnect() } catch {}
    try { chain.bandPass.disconnect() } catch {}
    try { chain.presence.disconnect() } catch {}
    try { chain.lowPass.disconnect() } catch {}
    try { chain.compressor.disconnect() } catch {}
    try { chain.drive.disconnect() } catch {}
    try { chain.dryGain.disconnect() } catch {}
    try { chain.wetGain.disconnect() } catch {}
    try { chain.noiseSource.disconnect() } catch {}
    try { chain.noiseFilter.disconnect() } catch {}
    try { chain.noiseGain.disconnect() } catch {}
    try { chain.outputGain.disconnect() } catch {}
    try { chain.outputSplitter.disconnect() } catch {}
    try { chain.outputLeftGain.disconnect() } catch {}
    try { chain.outputRightGain.disconnect() } catch {}
    try { chain.outputMerger.disconnect() } catch {}
    try { chain.track.detach(chain.element) } catch {}
    try { chain.element.remove() } catch {}

    this.rxChains.delete(key)
  }

  private cleanupRxChains(channelId?: string): void {
    for (const [key, chain] of this.rxChains.entries()) {
      if (channelId && chain.channelId !== channelId) continue
      this.cleanupRxChain(key)
    }
  }

  // ── Room events ────────────────────────────────────────────────────────

  private setupRoomEvents(channelId: string, room: Room, entry: ChannelEntry): void {
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        // En mode murmure, on n'écoute pas les autres — émission uniquement
        if (entry.whisperOnly) return
        this.attachRemoteTrackWithEffect(channelId, track as RemoteAudioTrack)
      }
    })

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const audioTrack = track as RemoteAudioTrack
        const key = this.rxTrackToKey.get(audioTrack)
        if (key) {
          this.cleanupRxChain(key)
        } else {
          track.detach()
        }
        return
      }
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
      this.cleanupRxChains(channelId)
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
