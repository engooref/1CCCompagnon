<script setup lang="ts">
// ─── RadioMeter — Vu-mètre micro ─────────────────────────────────────────────
import { computed } from 'vue'

const props = defineProps<{
  level: number      // 0.0 – 1.0
  active: boolean
  threshold?: number // 0.0 – 1.0, ligne de seuil noise gate
}>()

const barWidth = computed(() => `${Math.min(props.level * 100, 100)}%`)

const barColor = computed(() => {
  if (!props.active) return 'bg-gray-600'
  if (props.level > 0.8) return 'bg-red-500'
  if (props.level > 0.5) return 'bg-yellow-500'
  return 'bg-green-500'
})

const thresholdLeft = computed(() =>
  props.threshold ? `${Math.min(props.threshold * 100, 100)}%` : null
)
</script>

<template>
  <div class="relative h-2 w-full rounded-full bg-gray-800 overflow-hidden">
    <div
      class="h-full rounded-full transition-all duration-75"
      :class="barColor"
      :style="{ width: barWidth }"
    />
    <!-- Ligne de seuil noise gate -->
    <div
      v-if="thresholdLeft"
      class="absolute top-0 bottom-0 w-px bg-amber-400/80"
      :style="{ left: thresholdLeft }"
    />
  </div>
</template>
