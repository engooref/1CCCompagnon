import { http } from './http'
import { createOverlayUrls } from '../config/api'
import { useAppStore } from '../stores/app'
import type { MiningLoadout } from '@shared/general'

function _base() {
  const app = useAppStore()
  return (app.settings?.siteUrl ?? '').replace(/\/$/, '')
}

function _headers() {
  const app = useAppStore()
  const token = app.bearerToken
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function _urls() {
  const app = useAppStore()
  return app.settings ? createOverlayUrls(app.settings) : null
}

export async function fetchBootstrap() {
  const headers = _headers()
  const urls = _urls()
  const base = _base()
  const mUrl = urls?.mining?.minerals ?? `${base}/mining/api/minerals`
  const rUrl = urls?.mining?.refineries ?? `${base}/mining/api/refineries`
  const mthUrl = urls?.mining?.refineryMethods ?? `${base}/mining/api/refinery/methods`

  const [mRes, rRes, mthRes] = await Promise.all([
    http.get(mUrl, { headers }),
    http.get(rUrl, { headers }),
    http.get(mthUrl, { headers }),
  ])
  const minerals = Array.isArray(mRes.data) ? mRes.data : (mRes.data?.data ?? [])
  const refineries = Array.isArray(rRes.data) ? rRes.data : (rRes.data?.data ?? [])
  const refineryMethods = Array.isArray(mthRes.data) ? mthRes.data : (mthRes.data?.data ?? [])
  return { minerals, refineries, refineryMethods }
}

export async function fetchWorkOrders() {
  const headers = _headers()
  const urls = _urls()
  const ordersUrl = urls?.mining?.refineryOrders ?? `${_base()}/mining/api/refinery/orders`
  const { data } = await http.get(ordersUrl, { headers })
  return Array.isArray(data) ? data : (data?.data ?? [])
}

export async function createWorkOrder(payload: any) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const ordersUrl = urls?.mining?.refineryOrders ?? `${_base()}/mining/api/refinery/orders`
  const { data } = await http.post(ordersUrl, payload, { headers })
  return data?.data ?? data
}

export async function deleteWorkOrder(id: number) {
  const headers = _headers()
  const urls = _urls()
  const ordersUrl = urls?.mining?.refineryOrders ?? `${_base()}/mining/api/refinery/orders`
  await http.delete(`${ordersUrl}/${id}`, { headers })
}

export async function postCompleteWorkOrder(id: number) {
  const headers = _headers()
  const urls = _urls()
  const ordersUrl = urls?.mining?.refineryOrders ?? `${_base()}/mining/api/refinery/orders`
  await http.post(`${ordersUrl}/${id}/complete`, null, { headers })
}

export async function getRefineryPoiYields(poiId: string | number) {
  if (!poiId) return []
  const headers = _headers()
  const urls = _urls()
  const base = urls?.mining?.refineryYieldsBonus ?? `${_base()}/mining/api/refinery/yields-bonus`
  const { data } = await http.get(`${base}?poiId=${poiId}`, { headers })
  return Array.isArray(data) ? data : (data?.data ?? [])
}

export async function getAllRefineryYields() {
  const headers = _headers()
  const urls = _urls()
  const yieldsUrl = urls?.mining?.refineryYieldsBonus ?? (urls as any)?.mining?.refineryYields ?? `${_base()}/mining/api/refinery/yields-bonus`
  const { data } = await http.get(yieldsUrl, { headers })
  return Array.isArray(data) ? data : (data?.data ?? [])
}

export async function fetchSessionList() {
  const headers = _headers()
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  const { data } = await http.get(sessionsUrl, { headers })
  return Array.isArray(data) ? data : (data?.data ?? [])
}

export async function fetchSessionDetail(id: number) {
  const headers = _headers()
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  const { data } = await http.get(`${sessionsUrl}/${id}`, { headers })
  return data?.data ?? data
}

export async function createSession(name: string) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  const { data } = await http.post(sessionsUrl, { name: name.trim() }, { headers })
  return data?.data ?? data
}

export async function loadZones(commodityId: string, bodyId?: string | number | null) {
  if (!commodityId && !bodyId) return []
  const headers = _headers()
  const urls = _urls()
  const zonesUrl = urls?.mining?.zones ?? `${_base()}/mining/api/zones`
  const params = new URLSearchParams()
  if (commodityId) params.set('commodityId', String(commodityId))
  if (bodyId) params.set('bodyId', String(bodyId))
  const { data } = await http.get(`${zonesUrl}?${params.toString()}`, { headers })
  return Array.isArray(data) ? data : (data?.data ?? [])
}

export async function previewRefineryTime(method: string, lines: any[]) {
  const urls = _urls()
  const url = urls?.mining?.refineryPreviewTime ?? `${_base()}/mining/api/refinery/previewTime`
  const headers = { 'Content-Type': 'application/json', ..._headers() }
  const { data } = await http.post(url, { method, lines }, { headers })
  return data?.data ?? data
}

export async function joinSession(sessionId: number, payload: { role: string; shipId?: number | null; crewSize?: number | null }) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  const { data } = await http.post(`${sessionsUrl}/${sessionId}/join`, payload, { headers })
  return data?.data ?? data
}

export async function leaveSession(sessionId: number) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  await http.post(`${sessionsUrl}/${sessionId}/leave`, null, { headers })
}

export async function addRock(sessionId: number, payload: { bodyName?: string; sizeScuEstimate?: number | null; minerals?: Array<{ commodityId: number | null; percentage: number }> }) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  const { data } = await http.post(`${sessionsUrl}/${sessionId}/rocks`, payload, { headers })
  return data?.data ?? data
}

export async function claimRock(rockId: number) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  await http.post(`${base}/mining/api/rocks/${rockId}/claim`, null, { headers })
}

export async function unclaimRock(rockId: number) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  await http.post(`${base}/mining/api/rocks/${rockId}/unclaim`, null, { headers })
}

export async function collectRock(rockId: number, payload: { lines: Array<{ commodityId: number | null; quantityScuActual: number }> }) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const { data } = await http.post(`${base}/mining/api/rocks/${rockId}/collect`, payload, { headers })
  return data?.data ?? data
}

export async function closeSessionApi(sessionId: number) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  await http.post(`${sessionsUrl}/${sessionId}/close`, null, { headers })
}

export async function updateRockStatus(rockId: number, status: string) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const { data } = await http.patch(`${base}/mining/api/rocks/${rockId}`, { status }, { headers })
  return data?.data ?? data
}

// ─── Loadout Simulator ────────────────────────────────────────────────────────

export async function fetchLoadoutCatalog() {
  const headers = _headers()
  const base = _base()
  const urls = _urls()
  const shipsUrl   = (urls?.mining as any)?.loadoutShips   ?? `${base}/mining/api/loadout/ships`
  const lasersUrl  = (urls?.mining as any)?.loadoutLasers  ?? `${base}/mining/api/loadout/lasers`
  const modulesUrl = (urls?.mining as any)?.loadoutModules ?? `${base}/mining/api/loadout/modules`
  const [sRes, lRes, mRes] = await Promise.all([
    http.get(shipsUrl,   { headers }),
    http.get(lasersUrl,  { headers }),
    http.get(modulesUrl, { headers }),
  ])
  const ships   = Array.isArray(sRes.data) ? sRes.data : (sRes.data?.data ?? [])
  const lasers  = Array.isArray(lRes.data) ? lRes.data : (lRes.data?.data ?? [])
  const modules = Array.isArray(mRes.data) ? mRes.data : (mRes.data?.data ?? [])
  return { ships, lasers, modules }
}

export async function fetchUserLoadouts(): Promise<MiningLoadout[]> {
  const headers = _headers()
  const base = _base()
  const urls = _urls()
  const url = (urls?.mining as any)?.loadouts ?? `${base}/mining/api/loadouts`
  const { data } = await http.get(url, { headers })
  return Array.isArray(data) ? data : (data?.data ?? [])
}

export async function createLoadout(payload: Omit<MiningLoadout, 'id'>): Promise<MiningLoadout> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const urls = _urls()
  const url = (urls?.mining as any)?.loadouts ?? `${base}/mining/api/loadouts`
  const { data } = await http.post(url, payload, { headers })
  return data?.data ?? data
}

export async function updateLoadout(id: number, payload: Partial<Omit<MiningLoadout, 'id'>>): Promise<MiningLoadout> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const urls = _urls()
  const url = (urls?.mining as any)?.loadouts ?? `${base}/mining/api/loadouts`
  const { data } = await http.put(`${url}/${id}`, payload, { headers })
  return data?.data ?? data
}

export async function deleteLoadout(id: number): Promise<void> {
  const headers = _headers()
  const base = _base()
  const urls = _urls()
  const url = (urls?.mining as any)?.loadouts ?? `${base}/mining/api/loadouts`
  await http.delete(`${url}/${id}`, { headers })
}

export async function fetchPublicLoadouts(): Promise<MiningLoadout[]> {
  const headers = _headers()
  const base = _base()
  const urls = _urls()
  const url = (urls?.mining as any)?.loadouts ?? `${base}/mining/api/loadouts`
  const { data } = await http.get(`${url}?isPublic=1`, { headers })
  return Array.isArray(data) ? data : (data?.data ?? [])
}

export async function searchWhereBodies(q: string): Promise<any[]> {
  if (!q || q.length < 2) return []
  try {
    const urls = _urls()
    const searchUrl = urls?.mining?.bodiesSearch ?? `${_base()}/mining/api/bodies/search`
    const { data } = await http.get(`${searchUrl}?q=${encodeURIComponent(q)}`, { headers: _headers() })
    const results: any[] = Array.isArray(data) ? data : (data?.data ?? [])

    // If server already returns hierarchical structure, use it
    if (results.length > 0 && Array.isArray(results[0]?.children)) return results

    // Build hierarchy: system → planet → moon
    const systemsMap = new Map<string | number, any>()
    for (const r of results) {
      const sysId = r.systemId ?? '__nosys__'
      if (!systemsMap.has(sysId)) {
        systemsMap.set(sysId, { id: r.systemId ?? null, name: r.systemName ?? '(Système inconnu)', type: 'system', children: [] })
      }
    }
    for (const r of results) {
      const sysId = r.systemId ?? '__nosys__'
      const sys = systemsMap.get(sysId)!
      if (!r.parentName) sys.children.push({ ...r, children: [] })
    }
    for (const r of results) {
      if (!r.parentName) continue
      const sysId = r.systemId ?? '__nosys__'
      const sys = systemsMap.get(sysId)
      if (!sys) continue
      let parent = sys.children.find((p: any) => p.name === r.parentName)
      if (!parent) {
        parent = { id: null, name: r.parentName, type: 'planet', children: [] }
        sys.children.push(parent)
      }
      parent.children.push({ ...r })
    }
    const out = Array.from(systemsMap.values())
    out.forEach((sys) => {
      sys.children.sort((a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''))
      sys.children.forEach((p: any) => {
        if (p.children?.length) p.children.sort((a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''))
      })
    })
    out.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    return out
  } catch {
    return []
  }
}

export async function suggestZone(payload: {
  locationId: string
  locationType: string
  minerals: Array<{ slot: string; commodityId: string; qualityMax: number }>
}): Promise<void> {
  const urls = _urls()
  const url = urls?.mining?.zonesSuggest ?? `${_base()}/mining/api/zones/suggest`
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  await http.post(url, payload, { headers })
}
