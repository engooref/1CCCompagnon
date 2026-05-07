<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
  maxWidth?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const open      = ref(false)
const trigger   = ref<HTMLElement | null>(null)
const dropdown  = ref<HTMLElement | null>(null)
const dropStyle = ref({ top: '0px', left: '0px', width: '0px' })

const currentLabel = computed(() =>
  props.options.find((o) => o.value === props.modelValue)?.label ?? props.modelValue
)

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    const r = trigger.value?.getBoundingClientRect()
    if (r) {
      dropStyle.value = {
        top:   `${r.bottom + 2}px`,
        left:  `${r.left}px`,
        width: `${Math.max(r.width, 100)}px`,
      }
    }
  }
}

function select(val: string) {
  emit('update:modelValue', val)
  open.value = false
}

function onOutside(e: MouseEvent) {
  const t = e.target as Node
  if (trigger.value?.contains(t)) return
  if (dropdown.value?.contains(t)) return
  open.value = false
}

onMounted(() => document.addEventListener('mousedown', onOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', onOutside))
</script>

<template>
  <div ref="trigger" class="relative shrink-0" :style="maxWidth ? `max-width:${maxWidth}` : ''">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-1 rounded border border-white/20 bg-white/[0.08] px-1.5 py-0.5 text-[9px] text-white outline-none hover:bg-white/[0.12] focus:border-accent/50"
      @click="toggle"
    >
      <span class="truncate">{{ currentLabel }}</span>
      <svg class="shrink-0 h-2.5 w-2.5 text-white/50 transition-transform" :class="open ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="dropdown"
        class="fixed z-[9999] overflow-hidden rounded border border-white/15 shadow-xl"
        style="background: #12121f"
        :style="dropStyle"
      >
        <button
          v-for="opt in options"
          :key="opt.value"
          type="button"
          class="block w-full px-2.5 py-1.5 text-left text-[9px] hover:bg-white/10"
          :class="opt.value === modelValue ? 'bg-accent/15 text-accent' : 'text-white/85'"
          @mousedown.stop
          @click="select(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
