import { computed, watch } from 'vue'
import { useMiningStore } from '../stores/mining'
import { usePinnedSession } from './usePinnedSession'
import { useNow } from './useNow'
import type { MiningSessionDetail, MiningRock } from '@shared/general'

export function useCurrentSession() {
  const mining = useMiningStore()
  const { pinnedSessionId, unpin } = usePinnedSession()
  const { now } = useNow(1000)

  watch(pinnedSessionId, async (id) => {
    if (!id) return
    if (mining.sessionActive?.id === id) return
    try { await mining.openSession(id) } catch { /* network */ }
  }, { immediate: true })

  watch(() => mining.sessionActive?.status, (status) => {
    if (status === 'closed' || status === 'finished') {
      unpin()
      mining.closeSession()
    }
  })

  const sessionDetail = computed<MiningSessionDetail | null>(
    () => mining.sessionActive ?? null,
  )

  const activeRocks = computed<MiningRock[]>(() => {
    if (!sessionDetail.value?.rocks) return []
    return (sessionDetail.value.rocks as MiningRock[])
      .filter((r) => ['mining','ready','collected'].includes(String(r.status ?? '').toLowerCase()))
      .slice(0, 5)
  })

  const cargoSummary = computed(() => {
    const result: Record<string, { mineralId: string; mineralName: string; totalScu: number }> = {}
    if (!sessionDetail.value?.rocks) return Object.values(result)
    for (const cargo of sessionDetail.value.cargos ?? []) {
      const mId = String(cargo.commodityId ?? '')
      const mName = String(cargo.commodityName || mining.minerals.find((m) => String(m.id) === mId)?.name || mId || '')
      const scu = Number(cargo.quantityScu ?? 0)
      if (!result[mId]) result[mId] = { mineralId: mId, mineralName: mName, totalScu: 0 }
      result[mId].totalScu += scu
    }
    return Object.values(result).sort((a, b) => b.totalScu - a.totalScu)
  })

  const totalCargoScu = computed(() =>
    cargoSummary.value.reduce((s, i) => s + i.totalScu, 0),
  )

  const participants = computed(() => {
    if (!sessionDetail.value?.participants) return []
    return sessionDetail.value.participants.map((p) => ({
      userId: p.userId,
      userLabel: p.username || `User ${p.userId}`,
      role: String(p.role ?? 'crew').toLowerCase(),
      status: String(p.status ?? 'ready').toLowerCase(),
      isReady: String(p.status ?? 'ready').toLowerCase() === 'ready',
      isMining: String(p.status ?? 'ready').toLowerCase() === 'mining',
    }))
  })

  const loadingSession = computed(() => mining.loading.sessionDetail)

  return { sessionDetail, activeRocks, cargoSummary, totalCargoScu, participants, now, loadingSession }
}
