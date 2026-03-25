import axios from 'axios'
import { app as electronApp } from 'electron'
import type { ConnectionState, OverlayAuthResponse, OverlayProfile } from '@shared/general'
import { getApiKey } from './secureStore'
import { getSettings } from './settingsStore'
import { logger } from './logger'

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

export function getAppVersion(): string {
  try { return electronApp.getVersion() } catch { return '0.0.0' }
}
