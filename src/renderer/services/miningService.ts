import { http } from './http'
import { createOverlayUrls } from '../config/api'
import { useAppStore } from '../stores/app'
import type { MiningLoadout } from '@shared/general'

// ─── Interprétation des erreurs API ──────────────────────────────────────────

const API_ERROR_CODES: Record<string, string> = {
  minerals_required:        'Ajoutez au moins un minéral avec une quantité non nulle.',
  mineral_over_cap:         'La quantité totale de minéraux dépasse la capacité du rocher.',
  mineral_quantity_invalid: 'La quantité saisie est invalide.',
  rock_not_found:           'Ce rocher est introuvable.',
  rock_already_claimed:     'Ce rocher est déjà revendiqué par quelqu\'un d\'autre.',
  rock_not_claimed:         'Ce rocher n\'est pas revendiqué.',
  session_not_found:        'Session introuvable.',
  session_closed:           'Cette session est déjà fermée.',
  session_already_joined:   'Vous participez déjà à cette session.',
  not_participant:          'Vous ne participez pas à cette session.',
  not_captain:              'Vous devez être capitaine pour effectuer cette action.',
  work_order_not_found:     'Bon de travail introuvable.',
  work_order_already_ready: 'Ce bon de travail est déjà terminé.',
  invalid_method:           'Méthode de raffinage invalide.',
  refinery_not_found:       'Raffinerie introuvable.',
  unauthorized:             'Action non autorisée.',
  unauthenticated:          'Session expirée. Reconnectez-vous.',
}

export function parseApiError(err: any, fallback = 'Une erreur est survenue.'): string {
  const data = err?.response?.data

  // Champ "error" (code machine) — priorité sur message
  const errorCode: string | undefined = data?.error
  if (errorCode && API_ERROR_CODES[errorCode]) return API_ERROR_CODES[errorCode]

  // Champ "message" (texte serveur)
  const serverMsg: string | undefined = data?.message
  if (serverMsg) return serverMsg

  // Code HTTP
  const status: number | undefined = err?.response?.status
  switch (status) {
    case 400: return 'Requête invalide. Vérifiez les données saisies.'
    case 401: return 'Session expirée. Reconnectez-vous.'
    case 403: return 'Action non autorisée.'
    case 404: return 'Ressource introuvable.'
    case 409: return 'Conflit : action impossible dans l\'état actuel.'
    case 422: return 'Données incorrectes. Vérifiez le formulaire.'
    case 429: return 'Trop de requêtes. Attendez un moment avant de réessayer.'
    case 500: return 'Erreur serveur interne. Réessayez plus tard.'
    case 502:
    case 503:
    case 504: return 'Service temporairement indisponible.'
    default:
      if (!err?.response) return 'Problème de connexion. Vérifiez votre réseau.'
      return fallback
  }
}

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

export async function joinSession(sessionId: number, payload: { role: string; shipId?: number | null; crewTotal?: number | null; crewKey?: string | null }) {
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

export async function addRock(sessionId: number, payload: {
  bodyId?: number | null; bodyName?: string;
  posX?: number | null; posY?: number | null; posZ?: number | null;
  sizeScuEstimate?: number | null; mass?: number | null;
  instability?: number | null; resistance?: number | null;
  notes?: string;
  minerals?: Array<{ commodityId: number | null; percentage: number; quality?: number }>
}) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  const { data } = await http.post(`${sessionsUrl}/${sessionId}/rocks`, payload, { headers })
  return data?.data ?? data
}

export async function claimRock(rockId: number) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const rocksUrl = urls?.mining?.rocks ?? `${_base()}/mining/api/rocks`
  const { data } = await http.post(`${rocksUrl}/${rockId}/claim`, null, { headers })
  return data?.data ?? data ?? null
}

export async function unclaimRock(rockId: number) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const rocksUrl = urls?.mining?.rocks ?? `${_base()}/mining/api/rocks`
  const { data } = await http.post(`${rocksUrl}/${rockId}/unclaim`, null, { headers })
  return data?.data ?? data ?? null
}

export async function collectRock(rockId: number, payload: {
  mode?: 'partial' | 'complete';
  minerals?: Array<{ commodityId: number | null; quantityScuActual: number }>;
  lines?: Array<{ commodityId: number | null; quantityScuActual: number }>;
}) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const rocksUrl = urls?.mining?.rocks ?? `${_base()}/mining/api/rocks`
  const endpoint = payload.mode === 'partial' ? 'partial-collect' : 'collect'
  const minerals = payload.minerals ?? payload.lines ?? []
  const { data } = await http.post(`${rocksUrl}/${rockId}/${endpoint}`, { minerals }, { headers })
  return data?.data ?? data
}

export async function closeSessionApi(sessionId: number) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  await http.post(`${sessionsUrl}/${sessionId}/close`, null, { headers })
}

export async function updateRock(rockId: number, payload: {
  bodyId?: number | null; bodyName?: string;
  posX?: number | null; posY?: number | null; posZ?: number | null;
  sizeScuEstimate?: number | null; mass?: number | null;
  instability?: number | null; resistance?: number | null;
  notes?: string;
  minerals?: Array<{ commodityId: number | null; percentage: number; quality?: number }>;
  status?: string;
}) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const rocksUrl = urls?.mining?.rocks ?? `${_base()}/mining/api/rocks`
  const { data } = await http.patch(`${rocksUrl}/${rockId}`, payload, { headers })
  return data?.data ?? data
}

export async function updateRockStatus(rockId: number, status: string) {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const rocksUrl = urls?.mining?.rocks ?? `${_base()}/mining/api/rocks`
  const { data } = await http.patch(`${rocksUrl}/${rockId}/status`, { status }, { headers })
  return data?.data ?? data
}

// ─── Loadout Simulator ────────────────────────────────────────────────────────

export async function fetchLoadoutCatalog() {
  const headers = _headers()
  const base = _base()
  const urls = _urls()
  const shipsUrl   = urls?.mining?.loadoutShips   ?? `${base}/mining/api/loadout/ships`
  const lasersUrl  = urls?.mining?.loadoutLasers  ?? `${base}/mining/api/loadout/lasers`
  const modulesUrl = urls?.mining?.loadoutModules ?? `${base}/mining/api/loadout/modules`
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
  const url = urls?.mining?.loadouts ?? `${base}/mining/api/loadouts`
  const { data } = await http.get(url, { headers })
  return Array.isArray(data) ? data : (data?.data ?? [])
}

export async function createLoadout(payload: Omit<MiningLoadout, 'id'>): Promise<MiningLoadout> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const urls = _urls()
  const url = urls?.mining?.loadouts ?? `${base}/mining/api/loadouts`
  const { data } = await http.post(url, payload, { headers })
  return data?.data ?? data
}

export async function updateLoadout(id: number, payload: Partial<Omit<MiningLoadout, 'id'>>): Promise<MiningLoadout> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const urls = _urls()
  const url = urls?.mining?.loadouts ?? `${base}/mining/api/loadouts`
  const { data } = await http.put(`${url}/${id}`, payload, { headers })
  return data?.data ?? data
}

export async function deleteLoadout(id: number): Promise<void> {
  const headers = _headers()
  const base = _base()
  const urls = _urls()
  const url = urls?.mining?.loadouts ?? `${base}/mining/api/loadouts`
  await http.delete(`${url}/${id}`, { headers })
}

export async function fetchPublicLoadouts(): Promise<MiningLoadout[]> {
  const headers = _headers()
  const base = _base()
  const urls = _urls()
  const url = urls?.mining?.loadouts ?? `${base}/mining/api/loadouts`
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

// ─── Session ships ────────────────────────────────────────────────────────────

export async function searchMiningShips(q: string): Promise<any[]> {
  if (!q || q.length < 2) return []
  const headers = _headers()
  const urls = _urls()
  const shipsUrl = urls?.mining?.sessionsShipsSearch;
  const { data } = await http.get(`${shipsUrl}?q=${encodeURIComponent(q)}`, { headers })
  return Array.isArray(data) ? data : (data?.data ?? [])
}

export async function fetchSessionShips(): Promise<any[]> {
  const headers = _headers()
  const urls = _urls()
  const shipsUrl = urls?.mining?.sessionsShips;
  if (!shipsUrl) return [];
  const { data } = await http.get(shipsUrl, { headers })
  return Array.isArray(data) ? data : (data?.data ?? [])
}

// ─── Rock operations ──────────────────────────────────────────────────────────

export async function deleteRock(rockId: number): Promise<void> {
  const headers = _headers()
  const urls = _urls()
  const rocksUrl = urls?.mining?.rocks ?? `${_base()}/mining/api/rocks`
  await http.delete(`${rocksUrl}/${rockId}`, { headers })
}

export async function assignRock(rockId: number): Promise<any> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const rocksUrl = urls?.mining?.rocks ?? `${_base()}/mining/api/rocks`
  const { data } = await http.post(`${rocksUrl}/${rockId}/assign`, null, { headers })
  return data?.data ?? data
}

// ─── Session participant operations ───────────────────────────────────────────

export async function updateParticipant(sessionId: number, participantId: number, updates: { duty?: string; status?: string }): Promise<any> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${base}/mining/api/sessions`
  const { data } = await http.patch(`${sessionsUrl}/${sessionId}/participants/${participantId}`, updates, { headers })
  return data?.data ?? data
}

export async function updateCrewStatus(sessionId: number, crewId: number, status: string | null): Promise<any> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  const { data } = await http.patch(`${sessionsUrl}/${sessionId}/crews/${crewId}`, { status }, { headers })
  return data?.data ?? data
}

export async function assignSubCaptain(sessionId: number, participantId: number): Promise<any> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${base}/mining/api/sessions`
  const { data } = await http.post(`${sessionsUrl}/${sessionId}/participants/${participantId}/sub-captain`, null, { headers })
  return data?.data ?? data
}

export async function leaveParticipant(sessionId: number, participantId: number, newCaptainId?: number | null): Promise<void> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${base}/mining/api/sessions`
  await http.post(`${sessionsUrl}/${sessionId}/participants/${participantId}/leave`, newCaptainId ? { newCaptainId } : null, { headers })
}

export async function createSessionOperation(sessionId: number): Promise<any> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${_base()}/mining/api/sessions`
  const { data } = await http.post(`${sessionsUrl}/${sessionId}/create-operation`, null, { headers })
  return data?.data ?? data
}

// ─── Session default body / refinery ─────────────────────────────────────────

export async function updateSessionDefaultBody(sessionId: number, bodyId: number | null): Promise<any> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${base}/mining/api/sessions`
  const { data } = await http.patch(`${sessionsUrl}/${sessionId}/default-body`, { bodyId }, { headers })
  return data?.data ?? data
}

export async function updateSessionDefaultRefinery(sessionId: number, refineryId: number | null): Promise<any> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${base}/mining/api/sessions`
  const { data } = await http.patch(`${sessionsUrl}/${sessionId}/default-refinery`, { refineryId }, { headers })
  return data?.data ?? data
}

// ─── Cargo ────────────────────────────────────────────────────────────────────

export async function pickupCargo(sessionId: number, cargoId: number): Promise<any> {
  const headers = { ..._headers(), 'Content-Type': 'application/json' }
  const base = _base()
  const urls = _urls()
  const sessionsUrl = urls?.mining?.sessions ?? `${base}/mining/api/sessions`
  const { data } = await http.post(`${sessionsUrl}/${sessionId}/cargos/${cargoId}/pickup`, null, { headers })
  return data?.data ?? data
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
