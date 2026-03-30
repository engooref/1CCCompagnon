// ─── Types partagés radio ─────────────────────────────────────────────────────

export interface RadioChannel {
  id: string
  name: string
  description: string
}

export interface RadioState {
  /** Radios auxquelles on est connecté (écoute) */
  joinedChannels: string[]
  /** Radio active d'émission */
  activeChannel: string | null
  /** true si le PTT est enfoncé */
  transmitting: boolean
  /** true si connecté au serveur LiveKit */
  connected: boolean
  /** true si le micro est muté localement */
  muted: boolean
  /** Niveau micro 0.0 – 1.0 */
  micLevel: number
  /** Identité des participants qui parlent actuellement */
  activeSpeakers: RadioSpeaker[]
}

export interface RadioSpeaker {
  identity: string
  channel: string
  audioLevel: number
}

/** Association canal ↔ touche PTT (système murmure TeamSpeak) */
export interface PttBinding {
  channelId: string
  keyCode: number | null
  key: string
}

export interface RadioSettings {
  /** Liste des associations canal → touche PTT */
  pttBindings: PttBinding[]
  /** Volume audio entrant 0.0 – 1.0 */
  radioVolume: number
}

export const DEFAULT_RADIO_SETTINGS: RadioSettings = {
  pttBindings: [],
  radioVolume: 1.0,
}