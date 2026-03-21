import type { AppSettings } from '@shared/general'

function path(routes: AppSettings['urls'], ...keys: string[]): string {
  let node: any = routes
  for (const key of keys) node = node?.[key]
  return (node as string) ?? ''
}

function url(base: string, routes: AppSettings['urls'], ...keys: string[]): string {
  const p = path(routes, ...keys)
  return p ? `${base}/${p.replace(/^\//, '')}` : ''
}

export function createOverlayUrls(settings: AppSettings) {
  const base = settings.siteUrl.replace(/\/$/, '')
  const o = settings.urls

  return {
    auth:              url(base, o, 'auth'),
    transports:        url(base, o, 'transports', 'index'),
    transportShow:     (id: number) => url(base, o, 'transports', 'show').replace('{id}', String(id)),
    transportProgress: (id: string | number) => url(base, o, 'transports', 'progress').replace('{id}', String(id)),
    transportGenerate: (id: number) => url(base, o, 'transports', 'generate').replace('{id}', String(id)),
    mercureInfo:          url(base, o, 'transports', 'mercureInfo'),
    marketOpportunities:  url(base, o, 'transports', 'opportunities'),
    poiSearch:            `${url(base, o, 'starmap', 'poiSearch')}`,
    shipModels:           `${url(base, o, 'market', 'shipModels')}`,
    commodities:          `${url(base, o, 'market', 'commodities')}`,
    mapsIndex:            url(base, o, 'maps', 'index'),
    mapShow:              (id: number) => url(base, o, 'maps', 'show').replace('{id}', String(id)),
    mapFeatures:          (id: number) => url(base, o, 'maps', 'features').replace('{id}', String(id)),
    mapMercureInfo:       (id: number) => url(base, o, 'maps', 'mercureInfo').replace('{id}', String(id)),
    updateUrl:           url('https://updates.1ercorpscolonial.fr', o, 'updateUrl'),
  }
}
