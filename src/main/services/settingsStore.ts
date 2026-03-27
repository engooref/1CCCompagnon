import ElectronStore from 'electron-store'
import type { AppSettings, AppearanceSettings, RadioSettings } from '@shared/general'

const PROD_URL    = 'https://www.1ercorpscolonial.fr/compagnon'
const PREPROD_URL = 'https://www.preprod.1ercorpscolonial.fr/compagnon'

const DEFAULT_RADIO: RadioSettings = {
  enabled: false,
  serverUrl: '',
  tokenUrl: '',
  pttKey: '',
  pttKeyCode: null,
  channels: [],
  activeChannelId: null,
  inputDeviceId: undefined,
}

const DEFAULT_APPEARANCE: AppearanceSettings = {
  primaryColor: '#22d3ee',
  accentColor:  '#0e7490',
  textColor:    '#f1f5f9',
  navPosition:  'left',
  fontSize:     16,
}

const defaults: AppSettings = {
  siteUrl: PROD_URL,
  preProd: false,
  urls: {
    auth: '/auth',
    transports: {
      index:       '/transport',
      show:        '/transport/{id}',
      progress:    '/transport/legs/{id}/progress',
      generate:    '/transport/{id}/generate',
      mercureInfo: '/transport/mercure-info',
      opportunities: '/transport/market-opportunities',
    },
    starmap: {
      poiSearch: '/reference/pois',
    },
    market: {
      shipModels:  '/reference/ships',
      commodities: '/reference/commodities',
    },
    maps: {
      index:      '/map',
      show:       '/map/{id}',
      features:   '/map/{id}/features',
      mercureInfo: '/map/{id}/mercure-info',
    },
    agenda: {
      index: '/agenda',
      show:  '/agenda/{id}',
      store: '/events',
    },
    inventory: {
      index:  '/inventory',
      show:   '/inventory/{id}',
      search: '/inventory/search',
      mercureInfo: '/inventory/mercure-info',
    },
    fabricator: {
      index:           '/fabricator',
      items:           '/fabricator/items',
      itemSearch:      '/fabricator/item-search',
      catalog:         '/fabricator/catalog',
      detail:          '/fabricator/detail/{id}',
      blueprintToggle: '/fabricator/blueprint/toggle/{id}',
    },
  },
  
  rememberConnection: true,
  overlayEnabled: true,
  agendaNotificationsEnabled: true,
  gameFolder: '',
  toggleKey: 'F10',
  windowSize: '1120x760',
  toggleKeyCode: null,
  mapOverlayOpacity: 0.85,
  overlayLayout: {},
  appearance: { ...DEFAULT_APPEARANCE },
  radio: { ...DEFAULT_RADIO },
}

function createStore() {
  const StoreCtor: any = (ElectronStore as any).default ?? ElectronStore

  return new StoreCtor({
    name: '1cc-overlay',
    defaults: {
      settings: defaults
    }
  })
}

export const store = createStore()

export function getSettings(): AppSettings {
  const saved = store.get('settings') as Partial<AppSettings> | undefined
  const preProd = saved?.preProd ?? false
  return {
    ...defaults,
    ...(saved ?? {}),
    siteUrl: preProd ? PREPROD_URL : PROD_URL,
    urls: defaults.urls,
    overlayLayout: {
      ...(defaults.overlayLayout ?? {}),
      ...(saved?.overlayLayout ?? {})
    },
    appearance: { ...DEFAULT_APPEARANCE, ...(saved?.appearance ?? {}) },
    radio: { ...DEFAULT_RADIO, ...(saved?.radio ?? {}) },
  }
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const preProd = 'preProd' in partial ? (partial.preProd ?? false) : (current.preProd ?? false)
  const next: AppSettings = {
    ...current,
    ...partial,
    siteUrl: preProd ? PREPROD_URL : PROD_URL,
    urls: defaults.urls,
    overlayLayout: 'overlayLayout' in partial
      ? (partial.overlayLayout ?? {})
      : (current.overlayLayout ?? {}),
    overlayModules: 'overlayModules' in partial
      ? (partial.overlayModules ?? undefined)
      : current.overlayModules,
    appearance: 'appearance' in partial
      ? { ...DEFAULT_APPEARANCE, ...(current.appearance ?? {}), ...(partial.appearance ?? {}) }
      : current.appearance,
    radio: 'radio' in partial
      ? { ...DEFAULT_RADIO, ...(current.radio ?? {}), ...(partial.radio ?? {}) }
      : current.radio,
  }

  store.set('settings', next)
  return next
}
