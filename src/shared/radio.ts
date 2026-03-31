// ─── Types partagés radio ─────────────────────────────────────────────────────

export interface RadioChannel {
  id: string
  name: string
  description: string
  categoryId?: number | null
}

export interface RadioCategory {
  id: number
  name: string
  description: string
  channels: RadioChannel[]
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
  /**
   * Cible PTT:
   * - channelId classique (ex: "alpha")
   * - catégorie (ex: "category:12")
   */
  channelId: string
  keyCode: number | null
  key: string
}

export const PTT_CATEGORY_PREFIX = 'category:'

export function toCategoryPttTarget(categoryId: number): string {
  return `${PTT_CATEGORY_PREFIX}${categoryId}`
}

export function isCategoryPttTarget(target: string): boolean {
  return target.startsWith(PTT_CATEGORY_PREFIX)
}

export function categoryIdFromPttTarget(target: string): number | null {
  if (!isCategoryPttTarget(target)) return null
  const raw = target.slice(PTT_CATEGORY_PREFIX.length)
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
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