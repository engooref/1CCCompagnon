import axios from 'axios'
import { app as electronApp, shell } from 'electron'
import type { ConnectionState, OverlayAuthResponse, OverlayProfile } from '@shared/general'
import { getApiKey } from './secureStore'
import { getSettings } from './settingsStore'
import { logger } from './logger'
import { sendToOverlay } from '../windows/overlayWindow'
import { createOverlayUrls } from '../../renderer/config/api'

type RawOverlayAuthResponse = {
  token?: string
  accessToken?: string
  bearer?: string
  tokenType?: string
  user?: OverlayProfile
  profile?: OverlayProfile
  data?: OverlayProfile | { user?: OverlayProfile; profile?: OverlayProfile }
}


export async function authenticateOverlay(): Promise<OverlayAuthResponse> {
  const settings = getSettings()
  const apiKey = await getApiKey()

  if (!apiKey) {
    throw new Error('Aucune clé API enregistrée')
  }

  const url = `${settings.siteUrl}${settings.urls.auth}`
  const { data } = await axios.post<RawOverlayAuthResponse>(
    url,
    { accessKey: apiKey },
    {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )

  const token = data.token ?? data.accessToken ?? data.bearer
  const dataAsObject = typeof data.data === 'object' && data.data !== null ? data.data : undefined
  const userFromData = 'user' in (dataAsObject ?? {}) ? (dataAsObject as { user?: OverlayProfile }).user : undefined
  const profileFromData = 'profile' in (dataAsObject ?? {}) ? (dataAsObject as { profile?: OverlayProfile }).profile : undefined
  const user = data.user ?? data.profile ?? userFromData ?? profileFromData ?? (dataAsObject as OverlayProfile | undefined)

  logger.debug('[overlayService] réponse authentification overlay:', user)
  if (!token) {
    throw new Error('Réponse auth invalide: token manquant')
  }

  return {
    token,
    tokenType: data.tokenType,
    user: user ?? null
  }
}


export async function checkConnection(): Promise<ConnectionState> {
  const apiKey = await getApiKey()

  if (!apiKey) {
    return {
      connected: false,
      level: 'missing_api_key',
      siteOnline: false,
      authReady: false,
      message: 'Aucune clé API enregistrée',
      checkedAt: new Date().toISOString(),
      latencyMs: null
    }
  }

  const startedAt = Date.now()

  try {
    const auth = await authenticateOverlay()
    const latencyMs = Date.now() - startedAt

    if (!auth.token) {
      return {
        connected: false,
        level: 'auth_error',
        siteOnline: true,
        authReady: false,
        message: 'Le site répond mais aucun bearer n\'a été renvoyé',
        checkedAt: new Date().toISOString(),
        latencyMs
      }
    }

    return {
      connected: true,
      level: 'connected',
      siteOnline: true,
      authReady: true,
      message: 'Connexion overlay valide',
      checkedAt: new Date().toISOString(),
      latencyMs
    }
  } catch (error: any) {
    const status = error?.response?.status
    const latencyMs = Date.now() - startedAt

    if (status) {
      return {
        connected: false,
        level: 'auth_error',
        siteOnline: true,
        authReady: false,
        message: `Authentification refusée (${status})`,
        checkedAt: new Date().toISOString(),
        latencyMs
      }
    }

    return {
      connected: false,
      level: 'network_error',
      siteOnline: false,
      authReady: false,
      message: error instanceof Error ? error.message : 'Erreur réseau',
      checkedAt: new Date().toISOString(),
      latencyMs: null
    }
  }
}

// ─── Updates support ───────────────────────────────────────────────────────

let autoUpdateInterval: NodeJS.Timeout | null = null

export function getAppVersion(): string {
  try { return electronApp.getVersion() } catch { return '0.0.0' }
}

function semverCompare(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n || '0', 10))
  const pb = b.split('.').map(n => parseInt(n || '0', 10))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

export async function checkForUpdates(): Promise<{ available: boolean; latest?: string; notes?: string; url?: string }> {
  const settings = getSettings()
  if (!settings) return { available: false }
  const urls = createOverlayUrls(settings)
  const updateUrl = urls.update
  if (!updateUrl) return { available: false }

  try {
    const { data: text } = await axios.get(updateUrl, { timeout: 10000, responseType: 'text' })
    const raw = String(text)

    const mver = raw.match(/^version:\s*(.+)$/m)
    const mpath = raw.match(/^path:\s*(.+)$/m)
    const mnotes = raw.match(/^releaseNotes:\s*(.+)$/m)

    const latest = mver ? mver[1].trim() : null
    if (!latest) return { available: false }

    const notes = mnotes ? mnotes[1].trim() : ''

    // Build download URL from the YAML base URL + path value
    const base = updateUrl.replace(/[^/]+$/, '')
    const filePath = mpath ? mpath[1].trim() : null
    const url = filePath ? `${base}${filePath}` : null

    const current = getAppVersion()
    if (semverCompare(latest, current) > 0) return { available: true, latest, notes, url: url ?? undefined }
    return { available: false }
  } catch (e: any) {
    logger.warn('[overlayService] checkForUpdates failed:', e?.message ?? e)
    return { available: false }
  }
}

export async function installUpdate(url?: string): Promise<boolean> {
  if (!url) return false
  try {
    await shell.openExternal(url)
    return true
  } catch (e: any) {
    logger.error('[overlayService] installUpdate error', e?.message ?? e)
    return false
  }
}

export function startAutoUpdateChecker(intervalMs?: number) {
  stopAutoUpdateChecker()
  const settings = getSettings()
  const ms = typeof intervalMs === 'number' ? intervalMs : (settings?.updateCheckInterval ?? 3600000)
  autoUpdateInterval = setInterval(async () => {
    try {
      const result = await checkForUpdates()
      if (result.available) sendToOverlay('app:update-available', result)
    } catch (e) {
      logger.debug('[overlayService] auto update check failed')
    }
  }, ms)
}

export function stopAutoUpdateChecker() {
  if (autoUpdateInterval) { clearInterval(autoUpdateInterval); autoUpdateInterval = null }
}
