import ElectronStore from 'electron-store'
import type { AppSettings, AppearanceSettings } from '@shared/general'

const PROD_URL    = 'https://www.1ercorpscolonial.fr/compagnon'

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
      settings:      '/transport/{id}/settings',
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
    radio: {
      token:    '/radio/token',
      channels: '/radio/channels',
      categories: '/radio/categories',
      mercureInfo: '/radio/mercure-info',
      participants: '/radio/channels/{id}/participants',
      webhook:   '/radio/livekit-webhook',
    },
    mining: {
      minerals: '/mining/api/minerals',
      refineries: '/mining/api/refineries',
      refinery: {
        methods: '/mining/api/refinery/methods',
        compare: '/mining/api/refinery/compare',
        orders: '/mining/api/refinery/orders',
        mercureInfo: '/mining/api/refinery/mercure-info',
        previewTime: '/mining/api/refinery/preview-time',
        notifyAck: '/mining/api/refinery/orders/notify-ack',
        yieldsBonus: '/mining/api/refinery/yields',
      },
      zones: {
        index: '/mining/api/zones',
        suggest: '/mining/api/zones/suggest',
      },
      systems: '/mining/api/systems',
      bodies: {
        search: '/mining/api/bodies/search',
      },
      rocks: '/mining/api/rocks',
      session: {
        index: '/mining/api/sessions',
        bagChange: '/mining/api/sessions/{id}/bag-change',
        shipsSearch: '/mining/api/ships/search',
        ships: '/mining/api/ships/mining'
      },

      loadout: {
        ships:   '/mining/api/loadout/ships',
        lasers:  '/mining/api/loadout/lasers',
        modules: '/mining/api/loadout/modules',
        scraperModules: '/mining/api/loadout/scraper-modules',
      },
      loadouts: '/mining/api/loadouts',
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
  radioPttKeyCode: null,
  radioPttKey:     '',
  radioVolume:     1.0,
  radioEffectEnabled: true,
  radioEffectIntensity: 0.6,
  radioPan: 0,
  radioSelectedInputId: null,
  radioSelectedOutputId: null,
  radioInputGain: 1.0,
  radioGateThreshold: 0,
  radioPttBindings: [],
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
    siteUrl: PROD_URL,
    urls: defaults.urls,
    overlayLayout: {
      ...(defaults.overlayLayout ?? {}),
      ...(saved?.overlayLayout ?? {})
    },
    appearance: { ...DEFAULT_APPEARANCE, ...(saved?.appearance ?? {}) },
  }
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const preProd = 'preProd' in partial ? (partial.preProd ?? false) : (current.preProd ?? false)
  const next: AppSettings = {
    ...current,
    ...partial,
    siteUrl: PROD_URL,
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
  }

  store.set('settings', next)
  return next
}
