import { computed, watch } from 'vue'
import { useMiningStore } from '../stores/mining'
import { useAppStore } from '../stores/app'
import { usePinnedSession } from './usePinnedSession'
import { useNow } from './useNow'
import type { MiningSessionDetail, MiningRock } from '@shared/general'

export function useCurrentSession() {
  const mining = useMiningStore()
  const app = useAppStore()
  const { pinnedSessionId, unpin } = usePinnedSession()
  const { now } = useNow(1000)

  watch([pinnedSessionId, () => app.bearerToken], async ([id, token]) => {
    if (!id || !token) return
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
      .filter((r) => ['available','en_route','fracturing','extraction'].includes(String(r.status ?? '').toLowerCase()))
      .slice(0, 5)
  })

  const cargoSummary = computed(() => {
    const result: Record<string, { mineralId: string; mineralName: string; totalScu: number; qualitySum: number; qualityCount: number; avgQuality: number | null }> = {}
    if (!sessionDetail.value?.rocks) return Object.values(result)
    const rocks = sessionDetail.value.rocks ?? []
    for (const cargo of sessionDetail.value.cargos ?? []) {
      const mId = String(cargo.commodityId ?? '')
      const mName = String(cargo.commodityName || mining.minerals.find((m) => String(m.id) === mId)?.name || mId || '')
      const scu = Number(cargo.quantityScu ?? 0)
      if (!result[mId]) result[mId] = { mineralId: mId, mineralName: mName, totalScu: 0, qualitySum: 0, qualityCount: 0, avgQuality: null }
      result[mId].totalScu += scu
      // Qualité : chercher dans le rocher source (actual en priorité, sinon scan)
      const rock = cargo.rockId != null ? rocks.find((r) => r.id === cargo.rockId) : null
      if (rock) {
        const mineral =
          rock.minerals?.find((m) => String(m.commodityId) === mId && m.phase === 'actual' && m.quality != null) ??
          rock.minerals?.find((m) => String(m.commodityId) === mId && m.quality != null)
        if (mineral?.quality != null) {
          result[mId].qualitySum += mineral.quality * scu
          result[mId].qualityCount += scu
        }
      }
    }
    for (const entry of Object.values(result)) {
      entry.avgQuality = entry.qualityCount > 0 ? Math.round(entry.qualitySum / entry.qualityCount) : null
    }
    return Object.values(result).sort((a, b) => b.totalScu - a.totalScu)
  })

  const totalCargoScu = computed(() =>
    cargoSummary.value.reduce((s, i) => s + i.totalScu, 0),
  )

  const participants = computed(() => {
    if (!sessionDetail.value?.participants) return []
    return sessionDetail.value.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      userLabel: p.username || `User ${p.userId}`,
      role: String(p.role ?? 'crew').toLowerCase(),
      status: String(p.status ?? '').toLowerCase(),
      duty: p.duty ?? null,
      isCaptain: !!p.isCaptain,
      isSubCaptain: !!p.isSubCaptain,
      shipName: p.shipName ?? null,
      crewKey: p.crewKey ?? null,
    }))
  })

  const loadingSession = computed(() => mining.loading.sessionDetail)

  return { sessionDetail, activeRocks, cargoSummary, totalCargoScu, participants, now, loadingSession }
}
