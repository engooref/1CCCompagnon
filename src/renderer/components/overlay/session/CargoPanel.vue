<script setup lang="ts">
import { computed } from 'vue'

interface CargoItem {
  mineralId: string
  mineralName: string
  totalScu: number
}

const props = withDefaults(defineProps<{
  cargo: CargoItem[]
  maxScu?: number
}>(), {
  maxScu: 500,
})

const totalScu = computed(() =>
  props.cargo.reduce((sum, item) => sum + (Number(item.totalScu) || 0), 0)
)

function progressPercent(scu: number): number {
  const max = props.maxScu || 500
  return Math.min(100, Math.round((scu / max) * 100))
}
</script>

<template>
  <div v-if="props.cargo.length" class="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
    <div class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[9px] font-bold uppercase tracking-[0.18em] text-th-muted">Total raffinerie</span>
        <span class="text-[11px] font-black tabular-nums text-accent/80">{{ totalScu }} SCU</span>
      </div>
      <div class="mt-1.5 h-[3px] overflow-hidden rounded-full bg-th-card">
        <div
          class="h-full rounded-full transition-all duration-700"
          :style="{
            width: progressPercent(totalScu) + '%',
            background: 'linear-gradient(to right, rgba(var(--accent-rgb), 0.55), rgb(var(--accent-rgb)))',
            boxShadow: 'var(--shadow-glow)',
          }"
        />
      </div>
    </div>

    <div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 session-scrollbar">
      <div
        v-for="item in props.cargo"
        :key="item.mineralId"
        class="rounded-md border border-white/[0.08] bg-black/20 px-2 py-1.5"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-[11px] font-bold text-th-primary">{{ item.mineralName }}</p>
          <span class="shrink-0 text-[10px] font-semibold tabular-nums text-th-muted">{{ item.totalScu }} SCU</span>
        </div>
        <div class="mt-1.5 h-[3px] overflow-hidden rounded-full bg-th-card">
          <div
            class="h-full rounded-full bg-accent/70 transition-all duration-700"
            :style="{ width: progressPercent(item.totalScu) + '%' }"
          />
        </div>
      </div>
    </div>
  </div>

  <div v-else class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 text-[10px] uppercase tracking-widest text-th-disabled">
    Aucune cargaison
  </div>
</template>

<style scoped>
.session-scrollbar::-webkit-scrollbar { width: 3px; }
.session-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb), 0.25); border-radius: 999px; }
.session-scrollbar::-webkit-scrollbar-track { background: transparent; }
</style>
