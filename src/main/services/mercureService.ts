import https from 'node:https'
import http from 'node:http'
import type { ClientRequest } from 'node:http'
import { logger } from './logger'

interface SseSession {
  req: ClientRequest | null
  url: string
  onMessage: (data: string) => void
  onError: (reason: string) => void
  retryDelay: number
  retryTimer: ReturnType<typeof setTimeout> | null
  stopped: boolean
}

const sessions = new Map<number, SseSession>()

const MIN_RETRY_MS  = 1_000
const MAX_RETRY_MS  = 30_000

function connect(senderId: number, session: SseSession) {
  if (session.stopped) return

  const parsed = new URL(session.url)
  const lib = parsed.protocol === 'https:' ? https : http

  logger.info(`[Mercure:${senderId}] connexion SSE vers`, session.url.split('?')[0])

  const req = lib.get(
    session.url,
    {
      headers: {
        'Accept':     'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    },
    (res) => {
      logger.info(`[Mercure:${senderId}] réponse HTTP status=${res.statusCode}`)

      if (res.statusCode !== 200) {
        logger.error(`[Mercure:${senderId}] statut inattendu ${res.statusCode}, reconnexion dans ${session.retryDelay}ms`)
        res.resume()
        scheduleReconnect(senderId, session)
        return
      }

      // Connexion établie → reset backoff
      session.retryDelay = MIN_RETRY_MS

      let buffer = ''
      res.setEncoding('utf8')

      res.on('data', (chunk: string) => {
        logger.debug(`[Mercure:${senderId}] chunk (${chunk.length} chars):`, JSON.stringify(chunk.slice(0, 200)))
        buffer += chunk
        let boundary: number
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          for (const line of block.split('\n')) {
            if (line.startsWith('data:')) {
              const msg = line.slice(5).trim()
              logger.debug(`[Mercure:${senderId}] message:`, msg.slice(0, 200))
              session.onMessage(msg)
            }
          }
        }
      })

      res.on('end', () => {
        if (session.stopped) return
        logger.warn(`[Mercure:${senderId}] SSE fermée par le serveur, reconnexion dans ${session.retryDelay}ms`)
        scheduleReconnect(senderId, session)
      })

      res.on('error', (e: Error) => {
        if (session.stopped) return
        logger.error(`[Mercure:${senderId}] erreur SSE:`, e.message, '→ reconnexion dans', session.retryDelay, 'ms')
        scheduleReconnect(senderId, session)
      })
    },
  )

  req.on('error', (e: Error) => {
    if (session.stopped) return
    logger.error(`[Mercure:${senderId}] erreur requête:`, e.message, '→ reconnexion dans', session.retryDelay, 'ms')
    scheduleReconnect(senderId, session)
  })

  session.req = req
}

function scheduleReconnect(senderId: number, session: SseSession) {
  if (session.stopped) return
  if (session.retryTimer) return // déjà planifié

  session.retryTimer = setTimeout(() => {
    session.retryTimer = null
    if (!session.stopped) connect(senderId, session)
  }, session.retryDelay)

  // Backoff exponentiel plafonné
  session.retryDelay = Math.min(session.retryDelay * 2, MAX_RETRY_MS)
}

export function startMercureSse(
  senderId: number,
  url: string,
  onMessage: (data: string) => void,
  onError: (reason: string) => void,
) {
  stopMercureSse(senderId)

  const session: SseSession = {
    req: null,
    url,
    onMessage,
    onError,
    retryDelay: MIN_RETRY_MS,
    retryTimer: null,
    stopped: false,
  }

  sessions.set(senderId, session)
  connect(senderId, session)
}

export function stopMercureSse(senderId: number) {
  const session = sessions.get(senderId)
  if (!session) return
  session.stopped = true
  if (session.retryTimer) { clearTimeout(session.retryTimer); session.retryTimer = null }
  session.req?.destroy()
  sessions.delete(senderId)
  logger.info(`[Mercure:${senderId}] arrêté`)
}

export function stopAllMercureSse() {
  for (const id of sessions.keys()) stopMercureSse(id)
}
