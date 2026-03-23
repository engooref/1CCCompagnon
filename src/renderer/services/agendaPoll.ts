import { http } from './http'
import { createOverlayUrls } from '../config/api'
import { logger } from './logger'

let _timer: number | null = null
// Map eventId -> timestampNotified
const _notified = new Map<string | number, number>()

function purgeNotified(olderThanMs = 24 * 60 * 60 * 1000) {
  const now = Date.now()
  for (const [id, ts] of _notified.entries()) {
    if (now - ts > olderThanMs) _notified.delete(id)
  }
}

export function startAgendaPoll(app: any, intervalMs = 5 * 60 * 1000) {
  if (_timer) return

  async function fetchAndEmit() {
    if (!app?.bearerToken) return
    const urls = createOverlayUrls(app.settings)
    const url = urls?.agendaIndex
    if (!url) return

    try {
      logger.info('[AgendaPoll] GET', url)
      const { data } = await http.get(url, { headers: { Authorization: `Bearer ${app.bearerToken}` }, params: { limit: 20 } })
      const events = data?.events ?? []

      // Dispatch update for UI
      window.dispatchEvent(new CustomEvent('agenda:updated', { detail: events }))

      // Notifications
      try {
        purgeNotified()
        const thresholdMin: number = app?.settings?.agendaNotificationThresholdMin ?? 15
        const now = Date.now()
        const thresholdMs = thresholdMin * 60 * 1000

        for (const ev of events) {
          const id = ev.id
          const startIso = ev.start
          if (!startIso) continue
          const startTs = new Date(startIso).getTime()
          const timeToStart = startTs - now
          if (timeToStart <= 0 || timeToStart > thresholdMs) continue
          if (_notified.has(id)) continue

          // send notification
          try {
            const title = `⏰ Événement dans ${thresholdMin} min`
            const body = ev.name || 'Événement'
            if (window.oneCC?.showNotification) {
              void window.oneCC.showNotification(title, body)
            }
            _notified.set(id, Date.now())
            logger.info('[AgendaPoll] notification envoyée pour', id)
          } catch (e: any) {
            logger.error('[AgendaPoll] erreur notification :', e)
          }
        }
      } catch (e: any) {
        logger.error('[AgendaPoll] erreur notifications :', e)
      }
    } catch (e: any) {
      logger.error('[AgendaPoll] erreur :', e)
    }
  }

  // initial fetch
  void fetchAndEmit()

  _timer = window.setInterval(() => {
    void fetchAndEmit()
  }, intervalMs)
}

export function stopAgendaPoll() {
  if (!_timer) return
  clearInterval(_timer)
  _timer = null
  _notified.clear()
}
