<script setup lang="ts">
import type { MiningRock } from '@shared/general'
import { useMiningStore } from '../../../stores/mining'

const props = defineProps<{
  rocks: MiningRock[]
}>()

const mining = useMiningStore()

function mineralName(rock: MiningRock): string {
  const raw = rock as MiningRock & { commodityId?: string | number | null; commodityName?: string | null }
  const rawId = raw.commodityId
  if (raw.commodityName) return String(raw.commodityName)
  if (!rawId) return '?'
  return mining.minerals.find((m) => String(m.id) === String(rawId))?.name ?? String(rawId)
}

function assignedUserName(userId: string | null | undefined): string {
  if (!userId) return 'Non assigné'
  return `Crew #${String(userId).slice(-4)}`
}

function rockStatus(rock: MiningRock): string | null | undefined {
  return (rock as MiningRock & { status?: string | null }).status
}

function statusLabel(status: string | null | undefined): string {
  switch ((status ?? '').toLowerCase()) {
    case 'mining': return 'Minage'
    case 'ready': return 'Prêt'
    case 'collected': return 'Récupéré'
    case 'lost': return 'Perdu'
    default: return status || 'Actif'
  }
}

function statusClass(status: string | null | undefined): string {
  switch ((status ?? '').toLowerCase()) {
    case 'mining': return 'border-accent/30 bg-accent/10 text-accent/90'
    case 'ready': return 'border-emerald-400/25 bg-emerald-950/40 text-emerald-300/80'
    case 'collected': return 'border-sky-400/25 bg-sky-950/40 text-sky-300/80'
    case 'lost': return 'border-rose-400/25 bg-rose-950/40 text-rose-300/80'
    default: return 'border-white/[0.08] bg-th-card/40 text-th-muted'
  }
}
</script>

<template>
  <div v-if="props.rocks.length" class="flex h-full min-h-0 flex-col gap-1.5 overflow-y-auto pr-1 session-scrollbar">
    <div
      v-for="rock in props.rocks"
      :key="rock.id"
      class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <p class="truncate text-[11px] font-bold text-th-primary">
            {{ mineralName(rock) }}
            <span class="font-semibold text-th-muted">· {{ rock.scuInput ?? 0 }} SCU</span>
          </p>
          <p class="mt-0.5 truncate text-[9px] uppercase tracking-widest text-th-muted">
            {{ assignedUserName(rock.assignedTo) }}
          </p>
        </div>
        <span
          class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          :class="statusClass(rockStatus(rock))"
        >
          {{ statusLabel(rockStatus(rock)) }}
        </span>
      </div>
    </div>
  </div>

  <div v-else class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 text-[10px] uppercase tracking-widest text-th-disabled">
    Aucun rocher actif
  </div>
</template>

<style scoped>
.session-scrollbar::-webkit-scrollbar { width: 3px; }
.session-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb), 0.25); border-radius: 999px; }
.session-scrollbar::-webkit-scrollbar-track { background: transparent; }
</style>
