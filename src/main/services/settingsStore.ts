import ElectronStore from 'electron-store'
import type { AppSettings } from '@shared/general'

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
    updateUrl: '/update',
  },
  
  rememberConnection: true,
  overlayEnabled: true,
  gameFolder: '',
  toggleKey: 'F10',
  windowSize: '1120x760',
  toggleKeyCode: null,
  mapOverlayOpacity: 0.85,
  overlayLayout: {},
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
    }
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
  }

  store.set('settings', next)
  return next
}
