<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '../../stores/app'

const app = useAppStore()

// ─── Dossier du jeu ───────────────────────────────────────────────────────────

const gameFolderSaving = ref(false)
const gameFolderError  = ref<string | null>(null)

const gameFolder = computed(() => app.settings?.gameFolder ?? '')

async function pickGameFolder() {
  gameFolderError.value = null
  const folder = await window.oneCC.pickFolder()
  if (!folder) return
  gameFolderSaving.value = true
  try {
    await app.saveSettings({ gameFolder: folder })
  } catch (e: any) {
    gameFolderError.value = e?.message ?? 'Impossible de sauvegarder'
  } finally {
    gameFolderSaving.value = false
  }
}

async function clearGameFolder() {
  gameFolderError.value = null
  try {
    await app.saveSettings({ gameFolder: '' })
  } catch (e: any) {
    gameFolderError.value = e?.message ?? 'Impossible de supprimer'
  }
}

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

    <!-- Dossier du jeu -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Dossier du jeu</p>
      <p class="text-xs text-th-muted mb-4">
        Chemin vers le dossier d'installation de Star Citizen. Utilisé pour accéder aux fichiers de log du jeu.
      </p>

      <div
        v-if="gameFolder"
        class="flex items-center gap-3 rounded-md border border-th-muted bg-th-surface px-3 py-2.5 mb-3"
      >
        <svg class="w-4 h-4 shrink-0 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
        </svg>
        <span class="flex-1 min-w-0 text-xs text-th-secondary font-mono truncate" :title="gameFolder">{{ gameFolder }}</span>
        <button @click="clearGameFolder" class="shrink-0 text-th-muted hover:text-rose-400 transition" title="Supprimer">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div v-else class="flex items-center gap-2 rounded-md border border-dashed border-th-subtle px-3 py-2.5 mb-3">
        <svg class="w-4 h-4 shrink-0 text-th-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
        </svg>
        <span class="text-xs text-th-muted italic">Aucun dossier sélectionné</span>
      </div>

      <p v-if="gameFolderError" class="text-xs text-rose-300 mb-3">{{ gameFolderError }}</p>

      <button
        @click="pickGameFolder"
        :disabled="gameFolderSaving"
        class="flex items-center gap-2 rounded-md border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-50"
      >
        <svg v-if="gameFolderSaving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
        </svg>
        {{ gameFolder ? 'Changer le dossier' : 'Choisir un dossier' }}
      </button>
    </div>

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
