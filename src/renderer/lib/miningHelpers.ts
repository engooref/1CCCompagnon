export function formatRemaining(endAt: string | null | undefined, now: number): string {
  if (!endAt) return '—'
  const diff = Math.max(0, new Date(endAt).getTime() - now)
  if (diff === 0) return 'Prêt'
  const totalMin = Math.ceil(diff / 60_000)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours === 0) return `${minutes}min`
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`
}

export function formatDuration(startedAt: string | null | undefined, endAt: string | null | undefined): string {
  if (!startedAt || !endAt) return '—'
  const diff = Math.max(0, new Date(endAt).getTime() - new Date(startedAt).getTime())
  return formatMinutes(diff / 60_000)
}

export function progressPct(startedAt: string | null | undefined, endAt: string | null | undefined, now: number): number {
  if (!startedAt || !endAt) return 0
  const start = new Date(startedAt).getTime()
  const end = new Date(endAt).getTime()
  const total = end - start
  if (total <= 0) return 100
  const elapsed = now - start
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
}

export function isNearReady(startedAt: string | null | undefined, endAt: string | null | undefined, now: number): boolean {
  return progressPct(startedAt, endAt, now) >= 75 && formatRemaining(endAt, now) !== 'Prêt'
}

export function workOrderNotified(wo: { isNotified?: boolean | null; notifiedAt?: string | null }): boolean {
  return Boolean(wo.isNotified || wo.notifiedAt)
}

export function formatDateTime(dt: string | null | undefined): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatMinutes(mins: number): string {
  if (!Number.isFinite(mins) || mins <= 0) return '0min'
  const totalMin = Math.round(mins)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours === 0) return `${minutes}min`
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`
}

export function woDisplayDuration(secs: number): string {
  if (!secs || secs <= 0) return '0:00:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
