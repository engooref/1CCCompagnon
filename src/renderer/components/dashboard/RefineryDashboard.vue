<script setup lang="ts">
import { computed } from 'vue'
import { useMiningStore } from '../../stores/mining'
import { useNow } from '../../composables/useNow'
import { formatRemaining, progressPct, isNearReady } from '../../lib/miningHelpers'
import { RouterLink } from 'vue-router'

const mining = useMiningStore()
const { now } = useNow(30_000)

const workOrders = computed(() => mining.workOrders)
const activeCount = computed(() => workOrders.value.filter(wo => !wo.isReady).length)
const readyCount = computed(() => workOrders.value.filter(wo => wo.isReady).length)

function getRefineryLabel(wo: any): string {
  return wo.refineryName ?? `Raffinerie #${wo.refineryPoiId}`
}

function getMethodLabel(wo: any): string {
  return wo.methodLabel ?? mining.methodByKey(wo.method)?.label ?? wo.method ?? '—'
}
</script>

<template>
  <div v-if="workOrders.length" class="shrink-0 flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="h-6 w-6 rounded-md bg-orange-400/10 border border-orange-400/20 flex items-center justify-center shrink-0">
          <svg class="w-3.5 h-3.5 text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 3v4m-3 0h6M8 11h8M6 15h12M4 19h16" />
          </svg>
        </div>
        <span class="text-xs font-semibold uppercase tracking-widest text-th-secondary">Raffineries</span>
        <span v-if="workOrders.length" class="text-xs text-th-muted">({{ workOrders.length }})</span>
      </div>
      <RouterLink
        to="/mining"
        class="text-[11px] text-orange-400/60 hover:text-orange-300 transition flex items-center gap-1"
      >
        Voir tous
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </RouterLink>
    </div>

    <!-- Stats rapides -->
    <div class="grid grid-cols-2 gap-2">
      <div class="rounded-lg border border-orange-400/15 bg-black/20 p-3 flex items-center gap-3">
        <div class="h-8 w-8 rounded-md bg-orange-400/10 border border-orange-400/20 flex items-center justify-center shrink-0">
          <svg class="w-4 h-4 text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-lg font-bold text-th-primary leading-none">{{ activeCount }}</p>
          <p class="text-[10px] text-th-muted mt-0.5 truncate">En cours</p>
        </div>
      </div>

      <div class="rounded-lg border border-emerald-400/15 bg-black/20 p-3 flex items-center gap-3">
        <div class="h-8 w-8 rounded-md bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center shrink-0">
          <svg class="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-lg font-bold text-th-primary leading-none">{{ readyCount }}</p>
          <p class="text-[10px] text-th-muted mt-0.5 truncate">Prêtes</p>
        </div>
      </div>
    </div>

    <!-- Liste compacte -->
    <div class="space-y-2 max-h-64 overflow-y-auto">
      <RouterLink
        v-for="wo in workOrders.slice(0, 5)"
        :key="wo.id"
        to="/mining"
        class="group block rounded-lg border p-3 transition-colors"
        :class="wo.isReady
          ? 'border-emerald-500/30 bg-emerald-500/[0.05] hover:border-emerald-500/50 hover:bg-emerald-500/10'
          : isNearReady(wo.startedAt, wo.endAt, now)
            ? 'border-amber-400/30 bg-amber-400/[0.04] hover:border-amber-400/50 hover:bg-amber-400/10'
            : 'border-orange-400/15 bg-black/20 hover:border-orange-400/35 hover:bg-black/30'"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-xs font-semibold truncate text-th-primary group-hover:text-orange-200 transition-colors">
                {{ getRefineryLabel(wo) }}
              </p>
              <span v-if="wo.isReady" class="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                Prêt
              </span>
            </div>
            <p class="text-[10px] text-th-muted mt-0.5">{{ getMethodLabel(wo) }}</p>

            <!-- Barre progression -->
            <div v-if="!wo.isReady" class="mt-2">
              <div class="h-1 w-full overflow-hidden rounded-full bg-th-card">
                <div
                  class="h-full rounded-full transition-all duration-1000"
                  :class="isNearReady(wo.startedAt, wo.endAt, now)
                    ? 'bg-amber-300'
                    : 'bg-orange-400'"
                  :style="{ width: `${progressPct(wo.startedAt, wo.endAt, now)}%` }"
                />
              </div>
              <div class="flex items-center justify-between mt-1 text-[9px] text-th-muted">
                <span>{{ formatRemaining(wo.endAt, now) }}</span>
                <span>{{ progressPct(wo.startedAt, wo.endAt, now) }}%</span>
              </div>
            </div>
          </div>
          <svg class="shrink-0 w-3 h-3 mt-0.5 text-th-disabled group-hover:text-th-muted transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
