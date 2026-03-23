import ElectronStore from 'electron-store'
import type { AppSettings, AppearanceSettings } from '@shared/general'

const DEFAULT_APPEARANCE: AppearanceSettings = {
  primaryColor: '#22d3ee',
  accentColor:  '#0e7490',
  textColor:    '#f1f5f9',
  navPosition:  'left',
  fontSize:     16,
}

const defaults: AppSettings = {
  siteUrl: 'https://www.preprod.1ercorpscolonial.fr/compagnon',
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
    updateUrl: '/update',
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
  return {
    ...defaults,
    ...(saved ?? {}),
    siteUrl: defaults.siteUrl,
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
  const next: AppSettings = {
    ...current,
    ...partial,
    siteUrl: defaults.siteUrl,
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
