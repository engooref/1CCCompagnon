<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '../../stores/app'

const app = useAppStore()

// ─── Notifications agenda ─────────────────────────────────────────────────────

const agendaNotificationsEnabled = computed(() => app.settings?.agendaNotificationsEnabled ?? true)
const agendaNotifSaving = ref(false)

async function toggleAgendaNotifications() {
  if (!app.settings) return
  agendaNotifSaving.value = true
  try {
    await app.saveSettings({ agendaNotificationsEnabled: !agendaNotificationsEnabled.value })
  } finally {
    agendaNotifSaving.value = false
  }
}

// ─── Mode preProd (testers uniquement) ────────────────────────────────────────

const isTester   = computed(() => app.profile?.tester === true)
const preProd    = computed(() => app.settings?.preProd ?? false)
const preProdSaving = ref(false)
const preProdChanged = ref(false)

async function togglePreProd() {
  if (!app.settings) return
  preProdSaving.value = true
  try {
    await app.saveSettings({ preProd: !preProd.value })
    preProdChanged.value = true
  } finally {
    preProdSaving.value = false
  }
}

// ─── Résolution de la fenêtre ─────────────────────────────────────────────────

const WINDOW_SIZES = [
  { value: '800x600',   label: '800 × 600   — Tiny' },
  { value: '960x640',  label: '960 × 640   — Mini' },
  { value: '1024x680',  label: '1024 × 680  — Compact' },
  { value: '1120x760',  label: '1120 × 760  — Standard (défaut)' },
  { value: '1280x800',  label: '1280 × 800  — Large' },
  { value: '1440x900',  label: '1440 × 900  — HD' },
  { value: '1600x1000', label: '1600 × 1000 — Wide HD' },
  { value: '1920x1080', label: '1920 × 1080 — Full HD' },
  { value: '2560x1440', label: '2560 × 1440 — QHD' },
  { value: '3840x2160', label: '3840 × 2160 — 4K UHD' },
]

const windowSize    = computed(() => app.settings?.windowSize ?? '1120x760')
const windowSizing  = ref(false)
const windowSizeErr = ref<string | null>(null)

async function applyWindowSize(size: string) {
  windowSizing.value  = true
  windowSizeErr.value = null
  try {
    await window.oneCC.setWindowSize(size)
    app.settings = await window.oneCC.getSettings()
  } catch (e: any) {
    windowSizeErr.value = e?.message ?? 'Impossible de redimensionner'
  } finally {
    windowSizing.value = false
  }
}
</script>

<template>
  <div class="space-y-4">

    <!-- Notifications agenda -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-th-primary">Alertes agenda</p>
          <p class="text-xs text-th-muted mt-0.5">
            Envoie une notification Windows 15 minutes avant le début d'un événement.
          </p>
        </div>
        <button
          @click="toggleAgendaNotifications"
          :disabled="agendaNotifSaving"
          class="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-200 disabled:opacity-50"
          :class="agendaNotificationsEnabled ? 'bg-accent/30 border-accent/40' : 'bg-th-card border-th-subtle'"
        >
          <span
            class="inline-block h-4 w-4 rounded-full shadow transition-transform duration-200"
            :class="agendaNotificationsEnabled ? 'translate-x-6' : 'translate-x-1 bg-th-muted'"
            :style="agendaNotificationsEnabled ? { backgroundColor: 'rgb(var(--accent-rgb))' } : {}"
          />
        </button>
      </div>
    </div>

    <!-- Mode preProd (testers uniquement) -->
    <div v-if="isTester" class="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-amber-300">Mode pré-production</p>
          <p class="text-xs text-th-muted mt-0.5">
            Connecte l'overlay sur l'environnement de pré-production. Réservé aux testeurs.
          </p>
        </div>
        <button
          @click="togglePreProd"
          :disabled="preProdSaving"
          class="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-200 disabled:opacity-50"
          :class="preProd ? 'bg-amber-400/30 border-amber-400/40' : 'bg-th-card border-th-subtle'"
        >
          <span
            class="inline-block h-4 w-4 rounded-full shadow transition-transform duration-200"
            :class="preProd ? 'translate-x-6 bg-amber-400' : 'translate-x-1 bg-slate-500'"
          />
        </button>
      </div>
      <p v-if="preProdChanged" class="text-xs text-amber-300/80 mt-2">
        ⚠ Redémarrez l'application pour appliquer ce changement.
      </p>
    </div>

    <!-- Résolution de la fenêtre -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Résolution du compagnon</p>
      <p class="text-xs text-th-muted mb-4">
        Taille de la fenêtre principale. Le changement est appliqué immédiatement.
      </p>

      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="res in WINDOW_SIZES"
          :key="res.value"
          @click="applyWindowSize(res.value)"
          :disabled="windowSizing"
          class="flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition disabled:opacity-50"
          :class="windowSize === res.value
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-th-subtle bg-th-card text-th-secondary hover:border-th-subtle hover:text-th-primary'"
        >
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            :class="windowSize === res.value ? '' : 'bg-[rgb(var(--text-muted-rgb,100,116,139))]'"
            :style="windowSize === res.value ? { backgroundColor: 'rgb(var(--accent-rgb))' } : {}"
          />
          {{ res.label }}
        </button>
      </div>

      <p v-if="windowSizeErr" class="mt-2 text-xs text-rose-300">{{ windowSizeErr }}</p>
    </div>

  </div>
</template>
