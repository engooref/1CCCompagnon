<script setup lang="ts">
import type { MiningSessionDetail } from '@shared/general'

const props = defineProps<{
  session: MiningSessionDetail | null
}>()
</script>

<template>
  <div v-if="props.session" class="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
    <button
      class="group flex w-full items-center justify-between rounded-md border border-accent/25 bg-accent/10 px-2.5 py-2 text-left transition hover:border-accent/45 hover:bg-accent/15"
      type="button"
    >
      <span class="text-[10px] font-black uppercase tracking-[0.18em] text-accent/80">Continuer</span>
      <span class="text-[10px] text-accent/50 transition group-hover:translate-x-0.5">→</span>
    </button>

    <button
      class="group flex w-full items-center justify-between rounded-md border border-amber-400/20 bg-amber-950/30 px-2.5 py-2 text-left transition hover:border-amber-400/40 hover:bg-amber-950/45"
      type="button"
    >
      <span class="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/75">Ouvrir raffinerie</span>
      <span class="text-[10px] text-amber-300/50 transition group-hover:translate-x-0.5">→</span>
    </button>

    <button
      class="group flex w-full items-center justify-between rounded-md border border-rose-400/20 bg-rose-950/30 px-2.5 py-2 text-left transition hover:border-rose-400/40 hover:bg-rose-950/45"
      type="button"
    >
      <span class="text-[10px] font-black uppercase tracking-[0.18em] text-rose-300/70">Terminer session</span>
      <span class="text-[10px] text-rose-300/45 transition group-hover:translate-x-0.5">×</span>
    </button>
  </div>

  <div v-else class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 text-[10px] uppercase tracking-widest text-th-disabled">
    Aucune session active
  </div>
</template>
