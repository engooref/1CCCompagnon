<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { OverlayNotification } from '@shared/general'
import { useNotificationBus } from '../../composables/useNotificationBus'

const props = defineProps<{
  preview?: boolean
}>()

const { subscribe } = useNotificationBus()

interface ActiveNotification extends OverlayNotification {
  timer?: ReturnType<typeof setTimeout>
  exiting: boolean
}

const notifications = ref<ActiveNotification[]>([])

const PREVIEW_NOTIFS: OverlayNotification[] = [
  { id: 'prev-1', title: 'Briefing', message: 'Rendez-vous au point Bravo dans 5 min.', type: 'info', duration: 0 },
  { id: 'prev-2', message: 'Session de minage démarrée.', type: 'success', duration: 0 },
]

function push(notif: OverlayNotification) {
  // Dédoublonnage par id
  if (notifications.value.find((n) => n.id === notif.id)) return

  const active: ActiveNotification = { ...notif, exiting: false }
  notifications.value.push(active)

  const duration = notif.duration ?? 5000
  if (duration > 0) {
    active.timer = setTimeout(() => dismiss(notif.id), duration)
  }
}

function dismiss(id: string) {
  const notif = notifications.value.find((n) => n.id === id)
  if (!notif) return
  if (notif.timer) clearTimeout(notif.timer)
  notif.exiting = true
  setTimeout(() => {
    notifications.value = notifications.value.filter((n) => n.id !== id)
  }, 300)
}

const TYPE_STYLES: Record<OverlayNotification['type'], string> = {
  info:    'border-sky-400/50 bg-sky-900/70 text-sky-100',
  success: 'border-emerald-400/50 bg-emerald-900/70 text-emerald-100',
  warning: 'border-amber-400/50 bg-amber-900/70 text-amber-100',
  error:   'border-rose-400/50 bg-rose-900/70 text-rose-100',
}

const TYPE_DOT: Record<OverlayNotification['type'], string> = {
  info:    'bg-sky-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error:   'bg-rose-400',
}

let unsubBus: (() => void) | null = null

// Pousse les fausses notifs dès que le mode preview s'active (mode édition)
// et les retire quand on en sort. Utilise un watch pour réagir au changement
// dynamique du prop (le composant reste monté en dehors du mode édition).
watch(
  () => props.preview,
  (isPreview) => {
    if (isPreview) {
      PREVIEW_NOTIFS.forEach(push)
    } else {
      // Retirer les fausses notifs quand on quitte l'édition
      PREVIEW_NOTIFS.forEach((n) => dismiss(n.id))
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (props.preview) return
  window.oneCC.onOverlayNotification?.((notif: OverlayNotification) => push(notif))
  unsubBus = subscribe((notif) => push(notif))
})

onUnmounted(() => {
  unsubBus?.()
  if (props.preview) return
  notifications.value.forEach((n) => { if (n.timer) clearTimeout(n.timer) })
  window.oneCC.offOverlayNotification?.()
})
</script>

<template>
  <div class="pointer-events-none flex flex-col gap-1.5 p-2">
    <TransitionGroup name="notif">
      <div
        v-for="notif in notifications"
        :key="notif.id"
        class="pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs font-semibold backdrop-blur-sm shadow-lg select-none"
        :class="[TYPE_STYLES[notif.type], notif.exiting ? 'opacity-0 translate-y-1' : '']"
        style="transition: opacity 0.3s, transform 0.3s"
      >
        <span class="mt-0.5 h-2 w-2 shrink-0 rounded-full" :class="TYPE_DOT[notif.type]" />
        <div class="min-w-0 flex-1">
          <div v-if="notif.title" class="font-bold leading-tight">{{ notif.title }}</div>
          <div class="leading-snug opacity-90">{{ notif.message }}</div>
        </div>
        <button
          class="ml-1 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          @click="dismiss(notif.id)"
        >
          <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notif-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.notif-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.notif-enter-from   { opacity: 0; transform: translateY(-6px); }
.notif-leave-to     { opacity: 0; transform: translateY(-4px); }
</style>
