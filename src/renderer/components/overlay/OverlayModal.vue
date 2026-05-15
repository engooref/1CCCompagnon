<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  show: boolean
  title?: string
}>()
const emit = defineEmits<{ close: [] }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.show) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="show"
      class="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto p-4"
      @click.self="emit('close')">
      <div class="w-full max-w-2xl rounded-2xl border border-th-subtle bg-[#0d1117] shadow-2xl mt-8">
        <div v-if="title" class="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p class="text-xs font-semibold uppercase tracking-widest text-accent/70">{{ title }}</p>
          <button type="button" @click="emit('close')" class="rounded-lg px-2 py-1 text-base leading-none text-th-muted hover:bg-white/5 hover:text-th-primary">✕</button>
        </div>
        <div class="p-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
