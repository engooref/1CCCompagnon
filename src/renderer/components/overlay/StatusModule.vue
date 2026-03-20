<script setup lang="ts">
import type { GameState } from '../../../main/services/logParserService'

defineProps<{ state: GameState | null }>()

const ACTIVITY_LABEL: Record<string, string> = {
  hangar:  'HANGAR',
  space:   'ESPACE',
  quantum: 'QUANTUM',
  unknown: '',
}

const ACTIVITY_CLASS: Record<string, string> = {
  hangar:  'text-amber-300  border-amber-400/30  bg-amber-400/10',
  space:   'text-cyan-300   border-cyan-400/30   bg-cyan-400/10',
  quantum: 'text-violet-300 border-violet-400/30 bg-violet-400/10',
  unknown: 'text-slate-500  border-slate-700     bg-slate-800/50',
}

const ZONE_CLASS: Record<string, string> = {
  'Armistice':      'text-amber-300 border-amber-400/25 bg-amber-400/10',
  'Monitored Space':'text-blue-300  border-blue-400/25  bg-blue-400/10',
}
</script>

<template>
  <div
    v-if="state?.player"
    class="min-w-[190px] max-w-[240px] rounded-lg border border-white/10 backdrop-blur-sm px-3 py-2.5 shadow-xl"
    style="background-color: rgb(0 0 0 / var(--bg-alpha, 0.65))"
  >
    <!-- Joueur -->
    <div class="flex items-center gap-2 mb-1">
      <div class="h-5 w-5 shrink-0 rounded-full bg-cyan-400/20 border border-cyan-400/30 flex items-center justify-center">
        <svg class="w-3 h-3 text-cyan-300" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
        </svg>
      </div>
      <span class="text-sm font-bold text-slate-100 truncate">{{ state.player }}</span>
    </div>

    <!-- Vaisseau -->
    <div v-if="state.ship" class="flex items-center gap-2 mb-2">
      <div class="h-5 w-5 shrink-0 flex items-center justify-center">
        <svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
        </svg>
      </div>
      <span class="text-xs text-slate-300 truncate">{{ state.ship }}</span>
    </div>

    <!-- Badges activité + zone -->
    <div class="flex items-center gap-1.5 flex-wrap">
      <span
        v-if="state.activity && state.activity !== 'unknown'"
        class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider"
        :class="ACTIVITY_CLASS[state.activity] ?? ACTIVITY_CLASS.unknown"
      >
        {{ ACTIVITY_LABEL[state.activity] }}
      </span>
      <span
        v-if="state.zone"
        class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold"
        :class="ZONE_CLASS[state.zone] ?? 'text-slate-400 border-slate-700 bg-slate-800/50'"
      >
        🛡 {{ state.zone }}
      </span>
    </div>

    <!-- Position -->
    <div v-if="state.location" class="mt-1.5 text-[10px] text-slate-500 truncate">
      📍 {{ state.location }}
    </div>
  </div>
</template>
