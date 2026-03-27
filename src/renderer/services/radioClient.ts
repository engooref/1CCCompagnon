// ─── Radio Client (renderer) ──────────────────────────────────────────────────
// Encapsule la connexion LiveKit : join/leave room, PTT, audio entrant/sortant.

import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  Participant,
  LocalTrackPublication,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type AudioCaptureOptions,
} from 'livekit-client'
import type { RadioChannel, RadioSpeaker } from '@shared/radio'

export type RadioClientEvents = {
  connected: () => void
  disconnected: (reason?: string) => void
  speakersChanged: (speakers: RadioSpeaker[]) => void
  participantJoined: (identity: string) => void
  participantLeft: (identity: string) => void
  micLevel: (level: number) => void
  error: (err: Error) => void
}

export class RadioClient {
  private room: Room | null = null
  private micTrack: LocalAudioTrack | null = null
  private currentChannel: string | null = null
  private listeners: Partial<{ [K in keyof RadioClientEvents]: RadioClientEvents[K][] }> = {}
  private micLevelInterval: ReturnType<typeof setInterval> | null = null
  private _volume = 1.0

  // ── Event emitter ──────────────────────────────────────────────────────

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

  // ── Connection ─────────────────────────────────────────────────────────

  get connected(): boolean {
    return this.room?.state === 'connected'
  }

  get channelId(): string | null {
    return this.currentChannel
  }

  get participants(): string[] {
    if (!this.room) return []
    return Array.from(this.room.remoteParticipants.values()).map(p => p.identity)
  }

  /**
   * Rejoindre un canal radio.
   * @param livekitUrl  URL WebSocket du serveur LiveKit
   * @param token       JWT obtenu du radio-server
   * @param channelId   ID du canal
   */
  async join(livekitUrl: string, token: string, channelId: string): Promise<void> {
    // Quitter le canal actuel s'il y en a un
    if (this.room) {
      await this.leave()
    }

    this.room = new Room({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: {
        autoGainControl: true,
        noiseSuppression: true,
        echoCancellation: true,
      },
    })

    this.setupRoomEvents()

    await this.room.connect(livekitUrl, token)
    this.currentChannel = channelId

    // Créer et publier le micro (muté = PTT off)
    this.micTrack = await createLocalAudioTrack({
      autoGainControl: true,
      noiseSuppression: true,
      echoCancellation: true,
    })

    await this.room.localParticipant.publishTrack(this.micTrack)
    await this.micTrack.mute()

    // Démarrer le monitoring du niveau micro
    this.startMicMonitor()

    this.emit('connected')
  }

  async leave(): Promise<void> {
    this.stopMicMonitor()

    if (this.micTrack) {
      this.micTrack.stop()
      this.micTrack = null
    }

    if (this.room) {
      await this.room.disconnect()
      this.room = null
    }

    this.currentChannel = null
    this.emit('disconnected')
  }

  // ── PTT ────────────────────────────────────────────────────────────────

  async startTransmit(): Promise<void> {
    if (!this.micTrack) return
    await this.micTrack.unmute()
  }

  async stopTransmit(): Promise<void> {
    if (!this.micTrack) return
    await this.micTrack.mute()
  }

  get isTransmitting(): boolean {
    return this.micTrack ? !this.micTrack.isMuted : false
  }

  // ── Mute local (empêche toute émission même PTT) ──────────────────────

  async setMuted(muted: boolean): Promise<void> {
    if (!this.micTrack) return
    if (muted) {
      await this.micTrack.mute()
    }
    // Si unmute, on reste muté tant que PTT n'est pas enfoncé
    // Le mute local est géré au niveau du store
  }

  // ── Volume audio entrant ──────────────────────────────────────────────

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume))
    if (!this.room) return
    for (const p of this.room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) {
        if (pub.track) {
          (pub.track as RemoteTrack).setVolume(this._volume)
        }
      }
    }
  }

  // ── Room events ────────────────────────────────────────────────────────

  private setupRoomEvents(): void {
    if (!this.room) return

    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        track.attach()
        ;(track as RemoteTrack).setVolume(this._volume)
      }
    })

    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach()
    })

    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const radioSpeakers: RadioSpeaker[] = speakers
        .filter(s => s.identity !== this.room?.localParticipant.identity)
        .map(s => ({
          identity: s.identity,
          channel: this.currentChannel || '',
          audioLevel: s.audioLevel,
        }))
      this.emit('speakersChanged', radioSpeakers)
    })

    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      this.emit('participantJoined', participant.identity)
    })

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.emit('participantLeft', participant.identity)
    })

    this.room.on(RoomEvent.Disconnected, (reason) => {
      this.stopMicMonitor()
      this.currentChannel = null
      this.emit('disconnected', reason?.toString())
    })

    this.room.on(RoomEvent.MediaDevicesError, (err) => {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    })
  }

  // ── Mic level monitoring ──────────────────────────────────────────────

  private startMicMonitor(): void {
    this.stopMicMonitor()
    this.micLevelInterval = setInterval(() => {
      if (!this.room?.localParticipant) return
      const level = this.room.localParticipant.audioLevel
      this.emit('micLevel', level)
    }, 100)
  }

  private stopMicMonitor(): void {
    if (this.micLevelInterval) {
      clearInterval(this.micLevelInterval)
      this.micLevelInterval = null
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  destroy(): void {
    this.leave()
    this.listeners = {}
  }
}
