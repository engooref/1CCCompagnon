import axios from 'axios'
import type { ConnectionState } from '@shared/general'
import { getApiKey } from './secureStore'
import { getSettings } from './settingsStore'

export async function checkConnection(): Promise<ConnectionState> {
  const settings = getSettings()
  const apiKey = await getApiKey()

  if (!apiKey) {
    return {
      connected: false,
      message: 'Aucune clé API enregistrée',
      checkedAt: new Date().toISOString(),
      latencyMs: null,
      level: 'missing_api_key',
      siteOnline: false,
      authReady: false
    }
  }

  const url = `${settings.siteUrl.replace(/\/$/, '')}${settings.urls.auth}`
  const startedAt = Date.now()

  try {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: {
        'X-API-KEY': apiKey,
        Authorization: `Bearer ${apiKey}`
      },
      validateStatus: () => true
    })

    const latencyMs = Date.now() - startedAt

    if (response.status >= 200 && response.status < 300) {
      return {
        connected: true,
        message: 'Connectée au site',
        checkedAt: new Date().toISOString(),
        latencyMs,
        level: 'connected',
        siteOnline: true,
        authReady: true
      }
    }

    return {
      connected: false,
      message: `Site joignable mais refus (${response.status})`,
      checkedAt: new Date().toISOString(),
      latencyMs,
      level: 'auth_error',
      siteOnline: true,
      authReady: false
    }
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error ? error.message : 'Erreur réseau',
      checkedAt: new Date().toISOString(),
      latencyMs: null,
      level: 'network_error',
      siteOnline: false,
      authReady: false
    }
  }
}
