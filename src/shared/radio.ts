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

export interface RadioSettings {
  /** URL WebSocket du serveur LiveKit */
  livekitUrl: string
  /** URL HTTP du serveur radio (tokens) */
  radioServerUrl: string
  /** Code clavier DOM du PTT */
  pttKeyCode: number | null
  /** Nom accelerator du PTT (pour affichage) */
  pttKey: string
  /** Volume audio entrant 0.0 – 1.0 */
  radioVolume: number
}

export const DEFAULT_RADIO_SETTINGS: RadioSettings = {
  livekitUrl: 'ws://localhost:7880',
  radioServerUrl: 'http://localhost:3200',
  pttKeyCode: 20, // CapsLock (DOM keyCode)
  pttKey: 'CapsLock',
  radioVolume: 1.0,
}

export const STATIC_RADIOS: RadioChannel[] = [
  { id: 'command', name: 'Commandement', description: 'Canal de commandement général' },
  { id: 'logistics', name: 'Logistique', description: 'Canal logistique' },
  { id: 'recon', name: 'Reconnaissance', description: 'Canal de reconnaissance' },
]
