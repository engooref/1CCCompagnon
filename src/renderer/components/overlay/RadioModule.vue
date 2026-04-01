<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { OverlayModuleConfig, OverlayRadioDensity } from '@shared/general'

interface OverlayRadioState {
  connected: boolean
  connecting?: boolean
  currentChannel: string | null
  currentChannelName?: string
  participantCount?: number
  transmitting: boolean
  muted: boolean
  mutedIncoming?: boolean
  activeSpeakers: { identity: string; channel: string; audioLevel: number }[]
}

const props = withDefaults(defineProps<{
  config?: OverlayModuleConfig | null
  preview?: boolean
  previewState?: OverlayRadioState | null
}>(), {
  config: null,
  preview: false,
  previewState: null,
})

const state = ref<OverlayRadioState | null>(null)

const density = computed<OverlayRadioDensity>(() => {
  return props.config?.radioDensity ?? 'medium'
})

const showSpeakers = computed(() => {
  return props.config?.radioShowSpeakers ?? true
})

const showParticipants = computed(() => {
  return props.config?.radioShowParticipants ?? true
})

const showAdvancedStatus = computed(() => {
  return props.config?.radioShowAdvancedStatus ?? true
})

const effectiveState = computed<OverlayRadioState | null>(() => {
  if (props.preview) return props.previewState
  return state.value
})

const shouldRender = computed(() => {
  if (props.preview) return true
  return Boolean(effectiveState.value?.connected)
})

const channelLabel = computed(() => {
  const s = effectiveState.value
  if (!s) return 'Radio'
  return s.currentChannelName ?? s.currentChannel ?? 'Radio'
})

const channelStatusLabel = computed(() => {
  const s = effectiveState.value
  if (!s) return ''
  if (s.transmitting) {
    return `TX sur ${s.currentChannelName ?? s.currentChannel ?? 'Canal'}`
  }
  return s.currentChannelName ?? s.currentChannel ?? ''
})

const participantLabel = computed(() => {
  const count = effectiveState.value?.participantCount ?? 0
  return `${count} en ligne`
})

const incomingTransmissions = computed(() => {
  const s = effectiveState.value
  if (!s) return []
  // Affiche les personnes qui parlent actuellement (communications entrantes)
  return s.activeSpeakers
})

const displayedSpeakers = computed(() => {
  return incomingTransmissions.value.slice(0, 5)
})

const hiddenSpeakersCount = computed(() => {
  const total = effectiveState.value?.activeSpeakers?.length ?? 0
  return Math.max(0, total - displayedSpeakers.value.length)
})

const showSpeakerList = computed(() => {
  const s = effectiveState.value
  if (!s || !showSpeakers.value) return false
  if (density.value === 'compact') return false
  return displayedSpeakers.value.length > 0
})

const rootClass = computed(() => {
  const s = effectiveState.value
  if (!s) return 'border-white/10 bg-black/60 text-white/80'
  if (s.transmitting) return 'border-rose-500/60 bg-rose-500/20 text-rose-300 shadow-[0_0_16px_rgba(239,68,68,0.3)]'
  if (s.connecting) return 'border-amber-400/50 bg-amber-400/15 text-amber-200'
  return 'border-white/10 bg-black/60 text-white/80'
})

onMounted(() => {
  if (props.preview) return
  window.oneCC.onRadioState?.((s: unknown) => {
    state.value = s as OverlayRadioState
  })
})

onUnmounted(() => {
  if (props.preview) return
  window.oneCC.offRadioState?.()
})
</script>

<template>
  <Transition name="radio-fade">
    <div
      v-if="shouldRender"
      class="rounded-xl border px-3 py-2 backdrop-blur-sm text-xs font-semibold select-none pointer-events-none"
      :class="rootClass"
    >
      <div class="flex items-center gap-2.5">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
        </svg>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <!-- État de connexion / PTT -->
            <span v-if="effectiveState?.connecting" class="inline-flex items-center gap-1 text-amber-200">
              <span class="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
              Connexion…
            </span>
            <span v-else-if="effectiveState?.transmitting" class="inline-flex items-center gap-1 text-rose-200 font-bold">
              <span class="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
              {{ channelStatusLabel }}
            </span>
            
            <!-- Canal actif -->
            <span v-else-if="!effectiveState?.connecting" class="inline-flex items-center gap-1 text-blue-200">
              <span class="h-1.5 w-1.5 rounded-full bg-blue-400" />
              {{ channelLabel }}
            </span>

            <!-- Participants connectés en ligne -->
            <span
              v-if="density !== 'compact' && showParticipants && (effectiveState?.participantCount ?? 0) > 0"
              class="inline-flex items-center gap-1 text-emerald-300"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {{ participantLabel }}
            </span>
          </div>

          <div
            v-if="density === 'detailed' && showAdvancedStatus"
            class="mt-1 flex items-center gap-2 text-[10px] text-white/70"
          >
            <span :class="effectiveState?.muted ? 'text-rose-200' : 'text-emerald-200'">
              {{ effectiveState?.muted ? 'Micro coupé' : 'Micro actif' }}
            </span>
            <span v-if="effectiveState?.mutedIncoming" class="text-amber-200">Son entrant coupé</span>
          </div>
        </div>
      </div>

      <div
        v-if="showSpeakerList"
        class="mt-2 border-t border-white/10 pt-2 space-y-1"
      >
        <div class="text-[10px] font-semibold text-white/60 mb-1">
          📡 Communications entrantes:
        </div>
        <div
          v-for="speaker in displayedSpeakers"
          :key="`${speaker.identity}-${speaker.channel}`"
          class="flex items-center justify-between gap-2 pl-2 border-l-2 border-emerald-400/50"
        >
          <span class="truncate text-[11px] text-emerald-200 font-medium">{{ speaker.identity }}</span>
          <span class="text-[10px] text-white/60 shrink-0">{{ speaker.channel }}</span>
        </div>
        <div v-if="hiddenSpeakersCount > 0" class="text-[10px] text-white/60 pl-2">
          +{{ hiddenSpeakersCount }} autre(s)
        </div>
      </div>
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
