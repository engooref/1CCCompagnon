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

const sessions = new Map<string, SseSession>()

const MIN_RETRY_MS  = 1_000
const MAX_RETRY_MS  = 30_000

function extractMessages(buffer: string): { messages: string[]; rest: string } {
  const messages: string[] = []
  let cursor = 0

  while (cursor < buffer.length) {
    const lfBoundary = buffer.indexOf('\n\n', cursor)
    const crlfBoundary = buffer.indexOf('\r\n\r\n', cursor)

    let boundary = -1
    let separatorLength = 0

    if (lfBoundary !== -1 && (crlfBoundary === -1 || lfBoundary < crlfBoundary)) {
      boundary = lfBoundary
      separatorLength = 2
    } else if (crlfBoundary !== -1) {
      boundary = crlfBoundary
      separatorLength = 4
    }

    if (boundary === -1) break

    const block = buffer.slice(cursor, boundary)
    cursor = boundary + separatorLength

    const dataLines: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      dataLines.push(line.slice(5).trimStart())
    }

    if (dataLines.length) messages.push(dataLines.join('\n'))
  }

  return { messages, rest: buffer.slice(cursor) }
}

function connect(key: string, session: SseSession) {
  if (session.stopped) return

  const parsed = new URL(session.url)
  const lib = parsed.protocol === 'https:' ? https : http

  logger.info(`[Mercure:${key}] connexion SSE vers`, session.url.split('?')[0])

  const req = lib.get(
    session.url,
    {
      headers: {
        'Accept':        'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    },
    (res) => {
      logger.info(`[Mercure:${key}] réponse HTTP status=${res.statusCode}`)

      if (res.statusCode !== 200) {
        logger.error(`[Mercure:${key}] statut inattendu ${res.statusCode}, reconnexion dans ${session.retryDelay}ms`)
        session.onError(`Erreur Mercure HTTP ${res.statusCode}`)
        res.resume()
        scheduleReconnect(key, session)
        return
      }

      session.retryDelay = MIN_RETRY_MS

      let buffer = ''
      res.setEncoding('utf8')

      res.on('data', (chunk: string) => {
        logger.debug(`[Mercure:${key}] chunk (${chunk.length} chars):`, JSON.stringify(chunk.slice(0, 200)))
        buffer += chunk
        const parsed = extractMessages(buffer)
        buffer = parsed.rest
        for (const msg of parsed.messages) {
          logger.debug(`[Mercure:${key}] message:`, msg.slice(0, 200))
          session.onMessage(msg)
        }
      })

      res.on('end', () => {
        if (session.stopped) return
        logger.warn(`[Mercure:${key}] SSE fermée par le serveur, reconnexion dans ${session.retryDelay}ms`)
        scheduleReconnect(key, session)
      })

      res.on('error', (e: Error) => {
        if (session.stopped) return
        logger.error(`[Mercure:${key}] erreur SSE:`, e.message, '→ reconnexion dans', session.retryDelay, 'ms')
        session.onError(e.message)
        scheduleReconnect(key, session)
      })
    },
  )

  req.on('error', (e: Error) => {
    if (session.stopped) return
    logger.error(`[Mercure:${key}] erreur requête:`, e.message, '→ reconnexion dans', session.retryDelay, 'ms')
    session.onError(e.message)
    scheduleReconnect(key, session)
  })

  session.req = req
}

function scheduleReconnect(key: string, session: SseSession) {
  if (session.stopped) return
  if (session.retryTimer) return

  session.retryTimer = setTimeout(() => {
    session.retryTimer = null
    if (!session.stopped) connect(key, session)
  }, session.retryDelay)

  session.retryDelay = Math.min(session.retryDelay * 2, MAX_RETRY_MS)
}

export function startMercureSse(
  key: string,
  url: string,
  onMessage: (data: string) => void,
  onError: (reason: string) => void,
) {
  stopMercureSse(key)

  const session: SseSession = {
    req: null,
    url,
    onMessage,
    onError,
    retryDelay: MIN_RETRY_MS,
    retryTimer: null,
    stopped: false,
  }

  sessions.set(key, session)
  connect(key, session)
}

export function stopMercureSse(key: string) {
  const session = sessions.get(key)
  if (!session) return
  session.stopped = true
  if (session.retryTimer) { clearTimeout(session.retryTimer); session.retryTimer = null }
  session.req?.destroy()
  sessions.delete(key)
  logger.info(`[Mercure:${key}] arrêté`)
}

export function stopAllMercureSse() {
  for (const key of sessions.keys()) stopMercureSse(key)
}
