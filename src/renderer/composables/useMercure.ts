import { ref, onUnmounted, getCurrentInstance } from 'vue'
import { http } from '../services/http'
import { logger } from '../services/logger'

export function useMercure() {
  const connected = ref(false)
  const sseError  = ref<string | null>(null)
  const currentUrl = ref<string | null>(null)

  function parseMercureMessage(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  async function connect(
    mercureInfoUrl: string,
    authHeader: string,
    onMessage: (data: unknown) => void,
  ) {
    // Do not forcibly disconnect immediately — we will reuse if identical URL.
    sseError.value = null

    try {
      logger.info('[useMercure] fetch mercure-info →', mercureInfoUrl)
      const { data } = await http.get(mercureInfoUrl, {
        headers: { Authorization: authHeader },
      })
      logger.info('[useMercure] mercure-info reçu', data)

      const { hubUrl, topic, token } = data
      if (!hubUrl || !topic || !token) {
        sseError.value = 'Info Mercure invalide'
        return
      }

      const url = new URL(hubUrl as string)
      url.searchParams.append('topic', topic as string)
      url.searchParams.append('authorization', token as string)
      const urlStr = url.toString()
      logger.info('[useMercure] connexion SSE →', urlStr.split('?')[0], '| topic=', topic)

      // If already connected to the same url, just add listener and return
      if (connected.value && currentUrl.value === urlStr) {
        window.oneCC.onMercureMessage((raw) => {
          onMessage(parseMercureMessage(raw))
        })
        return
      }

      // Otherwise clean previous listeners and connect anew
      window.oneCC.offMercureMessage()
      window.oneCC.offMercureError()
      await window.oneCC.mercureDisconnect()

      window.oneCC.onMercureMessage((raw) => {
        try {
          logger.debug('[useMercure] raw message received', raw)
          const parsed = parseMercureMessage(raw)
          logger.info('[useMercure] parsed message', parsed)
          onMessage(parsed)
        } catch (err) {
          logger.error('[useMercure] failed to parse/forward message', err)
        }
      })

      window.oneCC.onMercureError((reason: string) => {
        const msg = reason || 'Connexion temps réel perdue'
        logger.error('[useMercure] SSE error →', msg)
        connected.value = false
        currentUrl.value = null
        sseError.value = msg
      })

      await window.oneCC.mercureConnect(urlStr)
      logger.info('[useMercure] mercureConnect résolu, connected = true')
      connected.value = true
      currentUrl.value = urlStr
    } catch (e: any) {
      logger.error('[useMercure] erreur connexion:', e)
      try {
        const resp = e?.response
        if (resp) {
          logger.error('[useMercure] http status=', resp.status, 'data=', resp.data)
          sseError.value = `Erreur serveur Mercure: ${resp.status}`
        } else {
          sseError.value = 'Impossible de se connecter au flux temps réel'
        }
      } catch (err) {
        logger.error('[useMercure] erreur logging response:', err)
        sseError.value = 'Impossible de se connecter au flux temps réel'
      }
    }
  }

  async function disconnect() {
    window.oneCC.offMercureMessage()
    window.oneCC.offMercureError()
    await window.oneCC.mercureDisconnect()
    connected.value = false
    currentUrl.value = null
  }

  if (getCurrentInstance()) onUnmounted(disconnect)

  return { connected, sseError, currentUrl, connect, disconnect }
}
