<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  show: boolean
  title?: string
}>()
const emit = defineEmits<{ close: [] }>()

// ── Drag ─────────────────────────────────────────────────────────────────────
const x = ref(0)
const y = ref(0)
let dragging = false
let startX = 0
let startY = 0

watch(() => props.show, (v) => { if (v) { x.value = 0; y.value = 0 } })

function onDragStart(e: MouseEvent) {
  dragging = true
  startX = e.clientX - x.value
  startY = e.clientY - y.value
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent) {
  if (!dragging) return
  x.value = e.clientX - startX
  y.value = e.clientY - startY
}
function onDragEnd() {
  dragging = false
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.show) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-[200] pointer-events-none">
      <!-- backdrop cliquable uniquement là où il n'y a pas la modale -->
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-auto" @click="emit('close')" />
      <div
        class="pointer-events-auto absolute w-full max-w-2xl rounded-2xl border border-th-subtle bg-[#0d1117] shadow-2xl"
        :style="{ top: `calc(2rem + ${y}px)`, left: `calc(50% - min(384px, 50%) + ${x}px)` }"
      >
        <div v-if="title"
          class="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 cursor-grab active:cursor-grabbing select-none"
          @mousedown="onDragStart"
        >
          <p class="text-xs font-semibold uppercase tracking-widest text-accent/70">{{ title }}</p>
          <button type="button" @click.stop="emit('close')" class="rounded-lg px-2 py-1 text-base leading-none text-th-muted hover:bg-white/5 hover:text-th-primary">✕</button>
        </div>
        <div class="p-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
