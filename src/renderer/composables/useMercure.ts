import { ref, onUnmounted, getCurrentInstance } from 'vue'
import { http } from '../services/http'
import { logger } from '../services/logger'

type MercureChannel = 'refinery' | 'session'

// Helpers to pick the right IPC methods depending on the channel.
function ipc(channel: MercureChannel) {
  if (channel === 'session') {
    return {
      connect:    (url: string) => window.oneCC.sessionSseConnect(url),
      disconnect: ()            => window.oneCC.sessionSseDisconnect(),
      onMessage:  (cb: (data: string) => void) => window.oneCC.onSessionSseMessage(cb),
      offMessage: ()            => window.oneCC.offSessionSseMessage(),
      onError:    (cb: (reason: string) => void) => window.oneCC.onSessionSseError(cb),
      offError:   ()            => window.oneCC.offSessionSseError(),
    }
  }
  return {
    connect:    (url: string) => window.oneCC.mercureConnect(url),
    disconnect: ()            => window.oneCC.mercureDisconnect(),
    onMessage:  (cb: (data: string) => void) => window.oneCC.onMercureMessage(cb),
    offMessage: ()            => window.oneCC.offMercureMessage(),
    onError:    (cb: (reason: string) => void) => window.oneCC.onMercureError(cb),
    offError:   ()            => window.oneCC.offMercureError(),
  }
}

export function useMercure(channel: MercureChannel = 'refinery') {
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
    sseError.value = null
    const ch = ipc(channel)

    try {
      logger.info(`[useMercure:${channel}] fetch mercure-info →`, mercureInfoUrl)
      const { data } = await http.get(mercureInfoUrl, {
        headers: { Authorization: authHeader },
      })
      logger.info(`[useMercure:${channel}] mercure-info reçu`, data)

      const { hubUrl, topic, token } = data
      if (!hubUrl || !topic || !token) {
        sseError.value = 'Info Mercure invalide'
        return
      }

      const url = new URL(hubUrl as string)
      url.searchParams.append('topic', topic as string)
      url.searchParams.append('authorization', token as string)
      const urlStr = url.toString()
      logger.info(`[useMercure:${channel}] connexion SSE →`, urlStr.split('?')[0], '| topic=', topic)
      if (connected.value && currentUrl.value === urlStr) {
        ch.onMessage((raw) => {
          onMessage(parseMercureMessage(raw))
        })
        return
      }
    
      ch.offMessage()
      ch.offError()
      await ch.disconnect()

      ch.onMessage((raw) => {
        try {
          logger.debug(`[useMercure:${channel}] raw message received`, raw)
          const parsed = parseMercureMessage(raw)
          logger.info(`[useMercure:${channel}] parsed message`, parsed)
          onMessage(parsed)
        } catch (err) {
          logger.error(`[useMercure:${channel}] failed to parse/forward message`, err)
        }
      })

      ch.onError((reason: string) => {
        const msg = reason || 'Connexion temps réel perdue'
        logger.error(`[useMercure:${channel}] SSE error →`, msg)
        connected.value = false
        currentUrl.value = null
        sseError.value = msg
      })

      await ch.connect(urlStr)
      logger.info(`[useMercure:${channel}] connect résolu, connected = true`)
      connected.value = true
      currentUrl.value = urlStr
    } catch (e: any) {
      logger.error(`[useMercure:${channel}] erreur connexion:`, e)
      try {
        const resp = e?.response
        if (resp) {
          logger.error(`[useMercure:${channel}] http status=`, resp.status, 'data=', resp.data)
          sseError.value = `Erreur serveur Mercure: ${resp.status}`
        } else {
          sseError.value = 'Impossible de se connecter au flux temps réel'
        }
      } catch (err) {
        logger.error(`[useMercure:${channel}] erreur logging response:`, err)
        sseError.value = 'Impossible de se connecter au flux temps réel'
      }
    }
  }

  async function disconnect() {
    const ch = ipc(channel)
    ch.offMessage()
    ch.offError()
    await ch.disconnect()
    connected.value = false
    currentUrl.value = null
  }

  if (getCurrentInstance()) onUnmounted(disconnect)

  return { connected, sseError, currentUrl, connect, disconnect }
}
