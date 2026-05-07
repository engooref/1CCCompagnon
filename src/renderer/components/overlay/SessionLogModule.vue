<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { MiningSessionLog } from '@shared/general'
import { useMiningStore } from '../../stores/mining'

defineProps<{ preview?: boolean }>()

const mining = useMiningStore()
const listEl = ref<HTMLElement | null>(null)

const PREVIEW_LOGS: MiningSessionLog[] = [
  { id: 3, icon: '🪨', message: 'Rocher signalé — Yela Belt', time: new Date(Date.now() - 12000).toISOString(), category: 'info' },
  { id: 2, icon: '👤', message: 'Pilot01 a rejoint la session.', time: new Date(Date.now() - 45000).toISOString(), category: 'success' },
  { id: 1, icon: '✅', message: 'Rocher #4 collecté.', time: new Date(Date.now() - 120000).toISOString(), category: 'success' },
]

function logs(): MiningSessionLog[] {
  if (mining.sessionActive) return mining.sessionActive.logs
  return PREVIEW_LOGS
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return '' }
}

const CATEGORY_DOT: Record<string, string> = {
  info:    'bg-sky-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error:   'bg-rose-400',
}

function dotClass(cat: string): string {
  return CATEGORY_DOT[cat] ?? 'bg-white/30'
}

// Scroll au top quand un nouveau log arrive (logs sont unshift donc le plus récent est en index 0)
watch(
  () => mining.sessionActive?.logs.length,
  async () => {
    await nextTick()
    listEl.value?.scrollTo({ top: 0, behavior: 'smooth' })
  },
)
</script>

<template>
  <div
    class="relative w-full h-full overflow-hidden rounded-xl border border-white/[0.08] shadow-2xl backdrop-blur-md"
    style="background-color: rgb(from var(--bg-color, #000000) r g b / var(--bg-alpha, 0.65))"
  >
    <div class="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent/70 to-transparent pointer-events-none" />

    <div class="flex h-full min-h-0 flex-col px-3 pb-2.5 pt-2.5">
      <!-- Header -->
      <div class="mb-2 flex items-center gap-2">
        <span class="shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-accent/50">Session · Journal</span>
        <div class="h-px flex-1 bg-white/[0.05]" />
        <span class="shrink-0 text-[10px] font-semibold tabular-nums text-white/40">{{ logs().length }}</span>
      </div>

      <!-- Liste -->
      <div
        v-if="logs().length"
        ref="listEl"
        class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1 log-scrollbar"
      >
        <div
          v-for="entry in logs()"
          :key="entry.id"
          class="flex items-start gap-2 rounded-md border border-white/[0.05] bg-white/[0.03] px-2 py-1"
        >
          <span class="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full" :class="dotClass(entry.category)" />
          <span class="flex-1 text-[10px] leading-snug text-white/80">
            {{ entry.icon }} {{ entry.message }}
          </span>
          <span class="shrink-0 text-[9px] tabular-nums text-white/30">{{ fmt(entry.time) }}</span>
        </div>
      </div>

      <div v-else class="flex flex-1 items-center justify-center text-[10px] uppercase tracking-widest text-white/30">
        Aucun événement
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-scrollbar::-webkit-scrollbar { width: 3px; }
.log-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb), 0.25); border-radius: 999px; }
.log-scrollbar::-webkit-scrollbar-track { background: transparent; }
</style>
