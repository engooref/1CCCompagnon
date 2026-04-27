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

export type OverlayModuleType = 'transport' | 'radio' | 'notification'
export type OverlayAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
export type OverlayRadioDensity = 'compact' | 'medium' | 'detailed'

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
  // Radio-only display options (ignored by other module types)
  radioDensity?: OverlayRadioDensity
  radioShowSpeakers?: boolean
  radioShowParticipants?: boolean
  radioShowAdvancedStatus?: boolean
}

export const DEFAULT_OVERLAY_MODULES: OverlayModuleConfig[] = [
  { id: 'transport', type: 'transport', title: 'Transport', visible: true, minimized: false, width: 260, height: 150, opacity: 0.65, locked: false, zIndex: 10, fontSize: 1, bgColor: '', anchor: 'top-right' },
  { id: 'radio', type: 'radio', title: 'Radio', visible: true, minimized: false, width: 280, height: 100, opacity: 0.65, locked: false, zIndex: 100, fontSize: 1, bgColor: '', anchor: 'bottom-left', radioDensity: 'medium', radioShowSpeakers: true, radioShowParticipants: true, radioShowAdvancedStatus: true },
  { id: 'notification', type: 'notification', title: 'Notifications', visible: true, minimized: false, width: 320, height: 80, opacity: 0.9, locked: false, zIndex: 200, fontSize: 1, bgColor: '', anchor: 'top-left' },
]

// ─── Notifications overlay ────────────────────────────────────────────────────

export type OverlayNotificationType = 'info' | 'success' | 'warning' | 'error'

export interface OverlayNotification {
  id: string
  title?: string
  message: string
  type: OverlayNotificationType
  /** Durée affichage en ms. 0 = permanent jusqu'à dismiss manuel. Défaut : 5000 */
  duration?: number
}

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
  cycleModeKey?: string | null
  cycleModeKeyCode?: number | null
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
  /** Échelle dédiée aux cartes Loadouts (1.0 = normal). Défaut conseillé : 1.06 */
  loadoutCardScale?: number
  defaultPage?: string    // route path shown on startup e.g. '/transport'
  appearance?: AppearanceSettings
  /** Intervalle polling agenda (ms) */
  agendaPollIntervalMs?: number
  // ── Radio settings ─────────────────────────────────────────────
  /** @deprecated remplacé par radioPttBindings */
  radioPttKeyCode?: number | null
  /** @deprecated remplacé par radioPttBindings */
  radioPttKey?: string
  radioVolume?: number
  /** Associations canal → touche PTT (multi-canal murmure) */
  radioPttBindings?: Array<{ channelId: string; keyCode: number | null; key: string }>
}

// ─── Système de modes overlay ─────────────────────────────────────────────────

export interface OverlayMode {
  /** Identifiant unique (slug) — ex: 'mining', 'custom-1234' */
  id: string
  /** Nom affiché dans l'UI */
  label: string
  /** Mode natif non supprimable */
  builtIn: boolean
  /** Raccourci Electron pour activer ce mode (ex: 'F8') */
  hotkey?: string | null
  /** Code uIOhook fallback */
  hotkeyCode?: number | null
  /** Layout complet de ce mode */
  layout: LayoutState
}

export interface ModeRegistry {
  modes: OverlayMode[]
  activeModeId: string
}

export type OverlayModeUpdate = Partial<Pick<OverlayMode, 'label' | 'hotkey' | 'hotkeyCode'>>

export const DEFAULT_MODES: OverlayMode[] = [
  {
    id: 'default',
    label: 'Général',
    builtIn: true,
    layout: {
      modules: [...DEFAULT_OVERLAY_MODULES],
      positions: {},
    },
  },
  {
    id: 'mining',
    label: 'Minage',
    builtIn: true,
    layout: {
      modules: [
        { ...DEFAULT_OVERLAY_MODULES[0] },
        { ...DEFAULT_OVERLAY_MODULES[1], radioDensity: 'compact' },
        { ...DEFAULT_OVERLAY_MODULES[2] },
      ],
      positions: {},
    },
  },
  {
    id: 'combat',
    label: 'Combat',
    builtIn: true,
    layout: {
      modules: [
        { ...DEFAULT_OVERLAY_MODULES[0], visible: false },
        { ...DEFAULT_OVERLAY_MODULES[1], radioDensity: 'detailed', radioShowAdvancedStatus: true },
        { ...DEFAULT_OVERLAY_MODULES[2] },
      ],
      positions: {},
    },
  },
  {
    id: 'command',
    label: 'Commandement',
    builtIn: true,
    layout: {
      modules: [
        { ...DEFAULT_OVERLAY_MODULES[0], opacity: 0.75 },
        { ...DEFAULT_OVERLAY_MODULES[1], radioDensity: 'detailed', radioShowParticipants: true, width: 320 },
        { ...DEFAULT_OVERLAY_MODULES[2] },
      ],
      positions: {},
    },
  },
]

// ─── Minage ───────────────────────────────────────────────────────────────────

export interface MiningZoneMineral {
  commodityId: number | null
  commodityName?: string | null
  slot: 'primary' | 'secondary' | 'tertiary' | string
  qualityMax?: number | null
  quality?: number | null
  notes?: string | null
}

export interface MiningZone {
  id: number
  systemName?: string | null
  bodyName?: string | null
  locationName?: string | null
  priceSell?: number | null
  minerals: MiningZoneMineral[]
}

export interface MiningMineral {
  id: number
  name: string
  signal?: number | null
  priceSell?: number | null
}

export interface MiningRefinery {
  id: number | string
  name: string
  systemName?: string | null
  locationName?: string | null
}

export interface MiningRefineryMethod {
  method: string
  label: string
  durationMultiplier?: number | null
  durationFactor?: number | null
  yieldMultiplier?: number | null
  yieldPercent?: number | null
  costPerScuInput?: number | null
}

export interface MiningRefineryYield {
  commodityName?: string | null
  systemName?: string | null
  poiName?: string | null
  terminalName?: string | null
  bonusPercent: number
}

export interface MiningRefineryYieldBonus {
  refineryPoiId?: number | null
  refineryName?: string | null
  commodityId?: number | null
  commodityName?: string | null
  bonusPercent: number
}

export interface MiningWOLine {
  id: number
  commodityId: number
  commodityName: string
  commodityCode: string
  scuInput: number
  scuOutput: number
  yieldPercent: number
  quantityScuInput: number
  quantityScuOutput: number
}

export interface MiningWorkOrder {
  id: number
  userId?: number | null
  refineryPoiId?: number | null
  refineryName?: string | null
  method: string
  methodLabel?: string | null
  status?: string | null
  startedAt?: string | null
  endAt?: string | null
  durationSeconds?: number | null
  confidence?: string | null
  isReady: boolean
  notes?: string | null
  notifyOnComplete?: boolean
  isNotified?: boolean
  notifiedAt?: string | null
  lines: MiningWOLine[]
}

// ─── Minage — Session collaborative ──────────────────────────────────────────

export interface MiningSession {
  id: number
  name: string
  status: 'active' | 'closed' | string
  participantsCount?: number
  createdAt?: string | null
  defaultBodyId?: number | null
  defaultBodyName?: string | null
  defaultRefineryId?: number | null
  defaultRefineryName?: string | null
}

export interface MiningSessionParticipant {
  id: number
  userId: number
  username: string
  role: 'miner' | 'prospector' | 'support' | string
  isCaptain?: boolean
  isSubCaptain?: boolean
  rank?: string | null
  duty?: string | null
  shipId?: number | null
  shipName?: string | null
  crewKey?: string | null
  status?: string | null
  crewSize?: number | null
  crewIsManual?: boolean
  suggestedStatus?: string | null
  effectiveStatus?: string | null
}

export interface MiningRockMineral {
  commodityId: number | null
  commodityName: string
  commodityCode?: string | null
  percentage: number
  quantityScuActual: number
  phase: 'scan' | 'actual' | string
  quality?: number | null
}

export interface MiningRock {
  id: number
  sessionId?: number | null
  bodyId?: number | null
  bodyName?: string | null
  status: 'available' | 'en_route' | 'fracturing' | 'extraction' | 'completed' | 'depleted' | string
  sizeScuEstimate?: number | null
  minerals: MiningRockMineral[]
  reportedBy?: string | null
  claimedByUserId?: number | null
}

export interface MiningSessionLog {
  id: number
  icon: string
  message: string
  time: string
  category: 'info' | 'success' | 'warning' | 'error' | string
}

export interface MiningCargo {
  id: number
  rockId?: number | null
  sessionId?: number | null
  commodityId?: number | null
  commodityName?: string | null
  commodityCode?: string | null
  quantityScu?: number | null
  status?: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'refined' | string
  transporterName?: string | null
}

export interface MiningSessionDetail extends MiningSession {
  participants: MiningSessionParticipant[]
  rocks: MiningRock[]
  cargos: MiningCargo[]
  logs: MiningSessionLog[]
}

// ─── Minage — Loadout Simulator ───────────────────────────────────────────────

export interface MiningLoadoutTurretDef {
  portName: string
  label?: string | null
  maxSize?: number | null
  minSize?: number | null
  defaultLaser?: any | null
}

export interface MiningShip {
  id: number
  name: string
  nameFull?: string | null
  companyName?: string | null
  price?: number | null
  priceCurrency?: string | null
  laserEditable?: boolean
  turrets: MiningLoadoutTurretDef[]
}

export interface MiningLaserPriceOption {
  terminalId: number
  terminalName: string
  priceBuy: number
}

export interface MiningLaser {
  id: number
  name: string
  shortName?: string | null
  manufacturer?: string | null
  size: number
  grade?: number | null
  moduleSlots: number
  powerMin?: number | null
  powerMax?: number | null
  zeroDamageRange?: number | null
  maxRange?: number | null
  fullDamageRange?: number | null
  optimumRange?: number | null
  laserInstability?: number | null
  resistanceModifier?: number | null
  filterModifier?: number | null
  priceBuy?: number | null
  priceCurrency?: string | null
  priceOptions?: MiningLaserPriceOption[]
}

export interface MiningModule {
  id: number
  name: string
  shortName?: string | null
  manufacturer?: string | null
  size?: number | null
  grade?: number | null
  isActive?: boolean
  resistanceModifier?: number | null
  laserInstability?: number | null
  optimalChargeWindowSizeModifier?: number | null
  optimalChargeWindowRateModifier?: number | null
  shatterDamageModifier?: number | null
  laserDamageMultiplier?: number | null
  filterModifier?: number | null
  priceBuy?: number | null
  priceCurrency?: string | null
  priceOptions?: MiningLaserPriceOption[]
}

export interface MiningLoadoutSlot {
  slotType: 'laser' | 'module'
  slotIndex: number
  laserSlotIndex?: number | null
  laserId?: number | null
  componentId?: number | null
  portName?: string | null
}

export interface MiningLoadout {
  id: number
  name: string
  shipId: number | null
  isPublic?: boolean
  notes?: string | null
  slots: MiningLoadoutSlot[]
}

export interface LoadoutBuilderTurret {
  portName: string
  label?: string | null
  maxSize?: number | null
  minSize?: number | null
  laser: MiningLaser | null
  modules: (MiningModule | null)[]
  _modified: boolean
  _saved: boolean
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
  radio: boolean
}

export interface OverlayProfile {
  id: number | string
  discordId: string
  username: string
  avatar: string
  rh: RhMember | null
  tester: boolean
  isBureau: boolean
}

export interface OverlayAuthResponse {
  token: string
  tokenType?: string
  user?: OverlayProfile | null
}
