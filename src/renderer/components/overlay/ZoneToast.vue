<script setup lang="ts">
import type { GameEvent } from '../../../main/services/logParserService'

defineProps<{ event: GameEvent }>()

const ZONE_CONFIG: Record<string, { icon: string; label: string; borderClass: string }> = {
  'Armistice': {
    icon:        '🛡',
    label:       'Zone Armistice',
    borderClass: 'border-amber-400/30 text-amber-200',
  },
  'Monitored Space': {
    icon:        '👁',
    label:       'Espace Surveillé',
    borderClass: 'border-blue-400/30 text-blue-200',
  },
}
</script>

<template>
  <div
    class="rounded-lg border backdrop-blur-sm px-3 py-2 shadow-xl"
    :class="event.payload.zone
      ? (ZONE_CONFIG[event.payload.zone!]?.borderClass ?? 'border-white/10 text-slate-200')
      : 'border-slate-700/50 text-slate-400'"
    :style="{ 'background-color': `rgb(0 0 0 / var(--bg-alpha, 0.65))` }"
  >
    <p class="text-xs font-semibold">
      <template v-if="event.payload.zone">
        {{ ZONE_CONFIG[event.payload.zone!]?.icon ?? '📍' }}
        {{ ZONE_CONFIG[event.payload.zone!]?.label ?? event.payload.zone }}
      </template>
      <template v-else>
        Zone quittée
      </template>
    </p>
    <p v-if="event.payload.notification" class="mt-0.5 text-[10px] opacity-60 leading-snug">
      {{ event.payload.notification }}
    </p>
  </div>
</template>
