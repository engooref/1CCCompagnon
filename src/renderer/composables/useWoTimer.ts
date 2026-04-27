import { ref, computed } from 'vue'

export type WoTimer = ReturnType<typeof createWoTimer>

export function createWoTimer(initialWo: any) {
  const remaining = ref<number>(0)
  const totalSeconds = ref<number>(1)
  let _interval: number | null = null
  let endAtMs: number | null = null
  let startAtMs: number | null = null

  function init(wo: any = initialWo) {
    update(wo)
    tick()
    _interval = window.setInterval(tick, 1000)
  }

  function destroy() {
    if (_interval) {
      clearInterval(_interval)
      _interval = null
    }
  }

  function update(wo: any) {
    endAtMs = wo?.endAt ? new Date(wo.endAt).getTime() : null
    startAtMs = wo?.startedAt ? new Date(wo.startedAt).getTime() : null
    totalSeconds.value = (endAtMs && startAtMs) ? Math.max(1, Math.floor((endAtMs - startAtMs) / 1000)) : 1
    tick()
  }

  function tick() {
    if (!endAtMs) {
      remaining.value = 0
      return
    }
    remaining.value = Math.max(0, Math.floor((endAtMs - Date.now()) / 1000))
  }

  const remainingLabel = computed(() => {
    if (remaining.value <= 0) return 'Terminé ✓'
    const h = Math.floor(remaining.value / 3600)
    const m = Math.floor((remaining.value % 3600) / 60)
    const s = remaining.value % 60
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })

  const progressPct = computed(() => {
    if (totalSeconds.value <= 0) return 100
    const elapsed = totalSeconds.value - remaining.value
    return Math.min(100, Math.round((elapsed / totalSeconds.value) * 100))
  })

  const timerColor = computed(() => {
    if (remaining.value <= 0) return 'text-emerald-400'
    const pct = progressPct.value
    if (pct >= 75) return 'text-amber-400'
    return 'text-sky-400'
  })

  return {
    remaining,
    totalSeconds,
    init,
    destroy,
    update,
    remainingLabel,
    progressPct,
    timerColor,
  }
}
