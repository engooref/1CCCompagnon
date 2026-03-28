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
    transportSettings:   (id: number) => url(base, o, 'transports', 'settings').replace('{id}', String(id)),
    poiSearch:            `${url(base, o, 'starmap', 'poiSearch')}`,
    shipModels:           `${url(base, o, 'market', 'shipModels')}`,
    commodities:          `${url(base, o, 'market', 'commodities')}`,
    mapsIndex:            url(base, o, 'maps', 'index'),
    mapShow:              (id: number) => url(base, o, 'maps', 'show').replace('{id}', String(id)),
    mapFeatures:          (id: number) => url(base, o, 'maps', 'features').replace('{id}', String(id)),
    mapMercureInfo:       (id: number) => url(base, o, 'maps', 'mercureInfo').replace('{id}', String(id)),
    update:           url('https://updates.1ercorpscolonial.fr', o, settings.preProd ? 'preProd' : 'update'),
    agendaIndex:         url(base, o, 'agenda', 'index'),
    agendaShow:          (id: number) => url(base, o, 'agenda', 'show').replace('{id}', String(id)),
    agendaStore:         url(base, o, 'agenda', 'store'),
    inventoryIndex:       url(base, o, 'inventory', 'index'),
    inventoryShow:        (id: number) => url(base, o, 'inventory', 'show').replace('{id}', String(id)),
    inventorySearch:      url(base, o, 'inventory', 'search'),
    inventoryMercureInfo: url(base, o, 'inventory', 'mercureInfo'),
    fabricatorIndex:          url(base, o, 'fabricator', 'index'),
    fabricatorItems:          url(base, o, 'fabricator', 'items'),
    fabricatorItemSearch:     url(base, o, 'fabricator', 'itemSearch'),
    fabricatorCatalog:        url(base, o, 'fabricator', 'catalog'),
    fabricatorDetail:         (id: number) => url(base, o, 'fabricator', 'detail').replace('{id}', String(id)),
    fabricatorBlueprintToggle:(id: number) => url(base, o, 'fabricator', 'blueprintToggle').replace('{id}', String(id)),
    radioToken:         url(base, o, 'radio', 'token'),
    radioChannels:      url(base, o, 'radio', 'channels'),
    radioMercureInfo:   url(base, o, 'radio', 'mercureInfo'),
  }
}
