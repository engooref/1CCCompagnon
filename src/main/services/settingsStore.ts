import ElectronStore from 'electron-store'
import type { AppSettings } from '@shared/general'

const defaults: AppSettings = {
  siteUrl: 'https://www.preprod.1ercorpscolonial.fr',
  urls: {
    auth: '/overlay/auth',
    transports: {
      index:       '/overlay/transport',
      show:        '/overlay/transport/{id}',
      progress:    '/overlay/transport/legs/{id}/progress',
      generate:    '/overlay/transport/{id}/generate',
      mercureInfo: '/overlay/transport/mercure-info',
      opportunities: '/overlay/transport/market-opportunities',
    },
    starmap: {
      poiSearch: '/overlay/reference/pois',
    },
    market: {
      shipModels:  '/overlay/reference/ships',
      commodities: '/overlay/reference/commodities',
    },
    maps: {
      index:      '/overlay/map',
      show:       '/overlay/map/{id}',
      features:   '/overlay/map/{id}/features',
      mercureInfo: '/overlay/map/{id}/mercure-info',
    },
    updateUrl: '/overlay/update',
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
    urls: {
      ...defaults.urls,
      ...(saved?.urls ?? {}),
      maps: {
        ...(defaults.urls.maps as object),
        ...((saved?.urls?.maps as object | undefined) ?? {}),
      },
    },
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
    urls: {
      ...current.urls,
      ...(partial.urls ?? {})
    },
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
