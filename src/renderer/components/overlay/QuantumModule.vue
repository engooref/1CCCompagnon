<script setup lang="ts">
import type { GameState } from '../../../main/services/logParserService'

defineProps<{ state: GameState }>()
</script>

<template>
  <div class="rounded-lg border border-violet-400/25 backdrop-blur-sm px-4 py-2.5 shadow-xl"
       style="background-color: rgb(from var(--bg-color, #000000) r g b / var(--bg-alpha, 0.65))">
    <!-- Indicateur pulsant -->
    <div class="flex items-center gap-2.5 mb-1.5">
      <span class="relative flex h-2 w-2 shrink-0">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"/>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-violet-400"/>
      </span>
      <span class="text-[11px] font-bold uppercase tracking-widest text-violet-300">Voyage quantique</span>
    </div>

    <!-- Route -->
    <div class="flex items-center gap-2 text-sm">
      <span v-if="state.location" class="text-th-muted text-xs truncate max-w-[130px]">
        {{ state.location }}
      </span>
      <svg
        v-if="state.location && state.destination"
        class="w-3.5 h-3.5 text-violet-500/70 shrink-0"
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
      </svg>
      <span v-if="state.destination" class="font-bold text-th-primary truncate max-w-[160px]">
        {{ state.destination }}
      </span>
    </div>
  </div>
</template>
