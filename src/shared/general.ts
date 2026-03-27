// ─── Système d'apparence ──────────────────────────────────────────────────────

export interface AppearanceSettings {
  /** Couleur principale du HUD (hex). Défaut : #22d3ee */
  primaryColor: string
  /** Couleur d'accent secondaire (hex). Défaut : #0e7490 */
  accentColor:  string
  /** Couleur du texte principal (hex). Défaut : #f1f5f9 */
  textColor:    string
  /** Position de la barre de navigation. Défaut : left */
  navPosition:  'left' | 'right' | 'top'
  /** Taille de base du texte en px. Défaut : 16 */
  fontSize?: number
}

// ─────────────────────────────────────────────────────────────────────────────

export type UrlsRoutes = {
  [key: string]: string | UrlsRoutes
}

export interface OverlayElementPos {
  /** Position X en fraction de la largeur overlay (0.0 = gauche · 1.0 = droite) */
  xPct: number
  /** Position Y en fraction de la hauteur overlay (0.0 = haut · 1.0 = bas) */
  yPct: number
}

export type OverlayModuleType = 'transport'
export type OverlayAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

export interface OverlayModuleConfig {
  id: string
  type: OverlayModuleType
  title: string
  visible: boolean
  minimized: boolean
  width: number
  height: number
  opacity: number
  locked: boolean
  zIndex: number
  fontSize: number  // zoom scale 0.75–1.5, default 1.0
  bgColor: string   // hex background tint color, empty = pure black
  anchor: OverlayAnchor
}

export const DEFAULT_OVERLAY_MODULES: OverlayModuleConfig[] = [
  { id: 'transport', type: 'transport', title: 'Transport', visible: true, minimized: false, width: 260, height: 150, opacity: 0.65, locked: false, zIndex: 10, fontSize: 1, bgColor: '', anchor: 'top-right' },
]

export type OverlayLayoutKey = string
export type OverlayLayout = Partial<Record<string, OverlayElementPos>>

export interface LayoutState {
  modules: OverlayModuleConfig[]
  positions: OverlayLayout
}

export interface OverlayBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayContext {
  layout: LayoutState
  gameBounds: OverlayBounds | null
}

export interface AppSettings {
  siteUrl: string
  urls: UrlsRoutes
  rememberConnection: boolean
  overlayEnabled: boolean
  gameFolder: string
  toggleKey: string
  toggleKeyCode?: number | null
  mapToggleKey?: string
  mapToggleKeyCode?: number | null
  mapOverlayOpacity?: number
  overlayLayout?: OverlayLayout
  overlayModules?: OverlayModuleConfig[]
  windowSize?: string
  marketOppsEnabled?: boolean
  marketOppsBudget?: number | null
  agendaNotificationsEnabled?: boolean
  preProd?: boolean       // activer l'environnement de pré-production (testers uniquement)
  appHue?: number         // hue-rotate deg for app accent (0 = cyan default)
  appScale?: number       // UI zoom scale 0.85–1.15, default 1
  appBrightness?: number  // brightness filter 0.7–1.3, default 1
  defaultPage?: string    // route path shown on startup e.g. '/transport'
  appearance?: AppearanceSettings
  radio?: RadioSettings
}

// ─── Système Radio ────────────────────────────────────────────────────────────

export interface RadioChannel {
  id: string
  name: string
  roomName: string  // Nom de la room LiveKit
}

export interface RadioSettings {
  enabled: boolean
  serverUrl: string       // wss://livekit.example.com
  tokenUrl: string        // URL backend qui génère les tokens JWT LiveKit
  pttKey: string          // Nom de touche Electron accelerator (ex: "CapsLock")
  pttKeyCode?: number | null  // Code uIOhook (fonctionne jeu au focus)
  channels: RadioChannel[]
  activeChannelId: string | null
  inputDeviceId?: string  // ID du microphone sélectionné
}

// ─────────────────────────────────────────────────────────────────────────────

export type ConnectionLevel = 'idle' | 'loading' | 'connected' | 'auth_error' | 'network_error' | 'missing_api_key'

export interface ConnectionState {
  connected: boolean
  level: ConnectionLevel
  siteOnline: boolean
  authReady: boolean
  message: string
  checkedAt: string | null
  latencyMs: number | null
}

export interface RhGrade {
  id: number
  name: string
  level: number
}

export interface RhMember {
  status: string
  grade: RhGrade | null
  dateEntree: string | null
  lastPromotion: string | null
  totalXp: number
  nextLevelXp: number | null
  level: number | null
}

export interface OverlayProfile {
  id: number | string
  discordId: string
  username: string
  avatar: string
  rh: RhMember | null
  tester: boolean
}

export interface OverlayAuthResponse {
  token: string
  tokenType?: string
  user?: OverlayProfile | null
}
