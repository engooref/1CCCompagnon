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
    auth: url(base, o, 'auth'),
    update: url('https://updates.1ercorpscolonial.fr', o, settings.preProd ? 'preProd' : 'update'),
    transports: {
      index: url(base, o, 'transports', 'index'),
      show: (id: number) => url(base, o, 'transports', 'show').replace('{id}', String(id)),
      progress: (id: string | number) => url(base, o, 'transports', 'progress').replace('{id}', String(id)),
      generate: (id: number) => url(base, o, 'transports', 'generate').replace('{id}', String(id)),
      mercureInfo: url(base, o, 'transports', 'mercureInfo'),
      opportunities: url(base, o, 'transports', 'opportunities'),
      settings: (id: number) => url(base, o, 'transports', 'settings').replace('{id}', String(id)),
    },
    starmap: {
      poiSearch: `${url(base, o, 'starmap', 'poiSearch')}`,
    },
    market: {
      shipModels: `${url(base, o, 'market', 'shipModels')}`,
      commodities: `${url(base, o, 'market', 'commodities')}`,
    },
    maps: {
      index: url(base, o, 'maps', 'index'),
      show: (id: number) => url(base, o, 'maps', 'show').replace('{id}', String(id)),
      features: (id: number) => url(base, o, 'maps', 'features').replace('{id}', String(id)),
      mercureInfo: (id: number) => url(base, o, 'maps', 'mercureInfo').replace('{id}', String(id)),
    },
    agenda: {
      index: url(base, o, 'agenda', 'index'),
      show: (id: number) => url(base, o, 'agenda', 'show').replace('{id}', String(id)),
      store: url(base, o, 'agenda', 'store'),
    },
    inventory: {
      index: url(base, o, 'inventory', 'index'),
      show: (id: number) => url(base, o, 'inventory', 'show').replace('{id}', String(id)),
      search: url(base, o, 'inventory', 'search'),
      mercureInfo: url(base, o, 'inventory', 'mercureInfo'),
    },
    fabricator: {
      index: url(base, o, 'fabricator', 'index'),
      items: url(base, o, 'fabricator', 'items'),
      itemSearch: url(base, o, 'fabricator', 'itemSearch'),
      catalog: url(base, o, 'fabricator', 'catalog'),
      detail: (id: number) => url(base, o, 'fabricator', 'detail').replace('{id}', String(id)),
      blueprintToggle: (id: number) => url(base, o, 'fabricator', 'blueprintToggle').replace('{id}', String(id)),
    },
    radio: {
      token: url(base, o, 'radio', 'token'),
      channels: url(base, o, 'radio', 'channels'),
      categories: url(base, o, 'radio', 'categories'),
      mercureInfo: url(base, o, 'radio', 'mercureInfo'),
      participants: (id: string | number) => url(base, o, 'radio', 'participants').replace('{id}', String(id)),
      webhook: url(base, o, 'radio', 'webhook'),
    },
    mining: {
      minerals: url(base, o, 'mining', 'minerals'),
      refineries: url(base, o, 'mining', 'refineries'),
      refineryMethods: url(base, o, 'mining', 'refinery', 'methods'),
      refineryCompare: url(base, o, 'mining', 'refinery', 'compare'),
      refineryPreviewTime: url(base, o, 'mining', 'refinery', 'previewTime'),
      refineryOrders: url(base, o, 'mining', 'refinery', 'orders'),
      refineryMercureInfo: url(base, o, 'mining', 'refinery', 'mercureInfo'),
      zones: url(base, o, 'mining', 'zones', 'index'),
      zonesSuggest: url(base, o, 'mining', 'zones', 'suggest'),
      systems: url(base, o, 'mining', 'systems'),
      bodiesSearch: url(base, o, 'mining', 'bodies', 'search'),
      rocks: url(base, o, 'mining', 'rocks'),
      refineryNotifyAck: url(base, o, 'mining', 'refinery', 'notifyAck'),
      refineryYieldsBonus: url(base, o, 'mining', 'refinery', 'yieldsBonus'),
      sessions:      url(base, o, 'mining', 'sessions'),
      ships:         url(base, o, 'mining', 'ships'),
      loadoutShips:  url(base, o, 'mining', 'loadout', 'ships'),
      loadoutLasers: url(base, o, 'mining', 'loadout', 'lasers'),
      loadoutModules:url(base, o, 'mining', 'loadout', 'modules'),
      loadouts:      url(base, o, 'mining', 'loadouts'),
    },
  }
}
