<script setup lang="ts">
// ─── RadioMeter — Vu-mètre micro ─────────────────────────────────────────────
import { computed } from 'vue'

const props = defineProps<{
  level: number  // 0.0 – 1.0
  active: boolean
}>()

const barWidth = computed(() => `${Math.min(props.level * 100, 100)}%`)

const barColor = computed(() => {
  if (!props.active) return 'bg-gray-600'
  if (props.level > 0.8) return 'bg-red-500'
  if (props.level > 0.5) return 'bg-yellow-500'
  return 'bg-green-500'
})
</script>

<template>
  <div class="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
    <div
      class="h-full rounded-full transition-all duration-75"
      :class="barColor"
      :style="{ width: barWidth }"
    />
  </div>
</template>
