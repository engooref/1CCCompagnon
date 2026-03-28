<script setup lang="ts">
// ─── RadioModule — widget overlay radio ──────────────────────────────────────
// Reçoit l'état radio depuis la main window via IPC relay (radio:state).

import { ref, onMounted, onUnmounted } from 'vue'

interface OverlayRadioState {
  connected: boolean
  currentChannel: string | null
  transmitting: boolean
  muted: boolean
  activeSpeakers: { identity: string; channel: string; audioLevel: number }[]
}

const state = ref<OverlayRadioState | null>(null)

onMounted(() => {
  window.oneCC.onRadioState?.((s: unknown) => {
    state.value = s as OverlayRadioState
  })
})

onUnmounted(() => {
  window.oneCC.offRadioState?.()
})
</script>

<template>
  <Transition name="radio-fade">
    <div
      v-if="state?.connected"
      class="inline-flex items-center gap-2.5 rounded-xl border px-3 py-2 backdrop-blur-sm text-xs font-semibold select-none pointer-events-none"
      :class="state.transmitting
        ? 'border-rose-500/60 bg-rose-500/20 text-rose-300 shadow-[0_0_16px_rgba(239,68,68,0.3)]'
        : 'border-white/10 bg-black/60 text-white/80'"
    >
      <!-- Icône micro -->
      <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
      </svg>

      <!-- Indicateur transmission -->
      <span v-if="state.transmitting" class="flex items-center gap-1">
        <span class="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
        TX
      </span>
      <span v-else>{{ state.currentChannel ?? 'Radio' }}</span>

      <!-- Speakers actifs -->
      <span
        v-if="state.activeSpeakers.length && !state.transmitting"
        class="flex items-center gap-1 text-emerald-300"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        {{ state.activeSpeakers.length }}
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.radio-fade-enter-active, .radio-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.radio-fade-enter-from, .radio-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
