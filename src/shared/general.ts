export type UrlsRoutes = {
  [key: string]: string | UrlsRoutes
}

export interface OverlayElementPos {
  x: number
  y: number
}

export type OverlayModuleType = 'status' | 'transport' | 'quantum' | 'zone'
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
  anchor: OverlayAnchor
}

export const DEFAULT_OVERLAY_MODULES: OverlayModuleConfig[] = [
  { id: 'status',    type: 'status',    title: 'Statut',    visible: true, minimized: false, width: 240, height: 110, opacity: 0.65, locked: false, zIndex: 10, anchor: 'top-left' },
  { id: 'transport', type: 'transport', title: 'Transport', visible: true, minimized: false, width: 260, height: 150, opacity: 0.65, locked: false, zIndex: 20, anchor: 'top-right' },
  { id: 'quantum',   type: 'quantum',   title: 'Quantum',   visible: true, minimized: false, width: 320, height: 88,  opacity: 0.65, locked: false, zIndex: 30, anchor: 'bottom-left' },
  { id: 'zone',      type: 'zone',      title: 'Zone',      visible: true, minimized: false, width: 240, height: 84,  opacity: 0.65, locked: false, zIndex: 40, anchor: 'bottom-right' },
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
}

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
}

export interface OverlayAuthResponse {
  token: string
  tokenType?: string
  user?: OverlayProfile | null
}
