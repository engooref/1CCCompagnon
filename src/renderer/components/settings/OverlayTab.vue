<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '../../stores/app'

const app = useAppStore()

// ─── Overlay toggle ───────────────────────────────────────────────────────────

const overlayToggling = ref(false)
const overlayEnabled  = computed(() => app.settings?.overlayEnabled ?? true)

async function toggleOverlay() {
  if (!app.settings) return
  overlayToggling.value = true
  try {
    await app.saveSettings({ overlayEnabled: !overlayEnabled.value })
  } finally {
    overlayToggling.value = false
  }
}

// ─── Touche toggle overlay ────────────────────────────────────────────────────

const toggleKey  = computed(() => app.settings?.toggleKey ?? 'F10')
const recording  = ref(false)
const keySaving  = ref(false)
const keyError   = ref<string | null>(null)

function toAccelerator(e: KeyboardEvent): string | null {
  const modOnly = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']
  if (modOnly.includes(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey)  parts.push('Ctrl')
  if (e.altKey)   parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  let k = e.key
  if (k === ' ')           k = 'Space'
  else if (k.length === 1) k = k.toUpperCase()
  parts.push(k)

  return parts.join('+')
}

function startRecording() {
  recording.value = true
  keyError.value  = null

  const handler = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      recording.value = false
      window.removeEventListener('keydown', handler, true)
      return
    }

    const key = toAccelerator(e)
    if (!key) return

    window.removeEventListener('keydown', handler, true)
    recording.value = false
    saveToggleKey({ accel: key, keyCode: (e as any).keyCode ?? (e as any).which ?? null })
  }

  window.addEventListener('keydown', handler, true)
}

async function saveToggleKey(key: string | { accel: string; keyCode: number | null }) {
  keySaving.value = true
  keyError.value  = null
  try {
    await window.oneCC.setToggleKey(key)
    app.settings = await window.oneCC.getSettings()
  } catch (e: any) {
    keyError.value = e?.message ?? 'Impossible de sauvegarder'
  } finally {
    keySaving.value = false
  }
}

// ─── Touche interaction modules ───────────────────────────────────────────────

const interactionKey     = computed(() => app.settings?.interactionKey ?? null)
const interactionKeyMode = computed(() => app.settings?.interactionKeyMode ?? 'toggle')
const recordingInteract  = ref(false)
const interactSaving     = ref(false)
const interactError      = ref<string | null>(null)

async function setInteractionMode(mode: 'hold' | 'toggle') {
  interactSaving.value = true
  try {
    await window.oneCC.setInteractionKeyMode(mode)
    app.settings = await window.oneCC.getSettings()
  } finally {
    interactSaving.value = false
  }
}

/** Capture une combinaison clavier avec modificateurs. Retourne { accel, keyCode } ou null si Escape. */
function recordKey(onDone: (result: { accel: string; keyCode: number | null } | null) => void) {
  const handler = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const modOnly = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']
    if (modOnly.includes(e.key)) return
    window.removeEventListener('keydown', handler, true)
    if (e.key === 'Escape') { onDone(null); return }
    const parts: string[] = []
    if (e.ctrlKey)  parts.push('Ctrl')
    if (e.altKey)   parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    let k = e.key
    if (k === ' ')           k = 'Space'
    else if (k.length === 1) k = k.toUpperCase()
    parts.push(k)
    onDone({ accel: parts.join('+'), keyCode: (e as any).keyCode ?? null })
  }
  window.addEventListener('keydown', handler, true)
}

function startRecordingInteract() {
  recordingInteract.value = true
  interactError.value = null
  recordKey((result) => {
    recordingInteract.value = false
    if (result) saveInteractionKey(result)
  })
}

async function saveInteractionKey(key: { accel: string; keyCode: number | null } | null) {
  interactSaving.value = true
  interactError.value = null
  try {
    await window.oneCC.setInteractionKey(key)
    app.settings = await window.oneCC.getSettings()
  } catch (e: any) {
    interactError.value = e?.message ?? 'Impossible de sauvegarder'
  } finally {
    interactSaving.value = false
  }
}

async function clearInteractionKey() {
  await saveInteractionKey(null)
}

// ─── Touche d'édition overlay ─────────────────────────────────────────────────

const overlayEditKey    = computed(() => app.settings?.overlayEditKey ?? 'Ctrl+Shift+E')
const recordingEditKey  = ref(false)
const editKeySaving     = ref(false)
const editKeyError      = ref<string | null>(null)

function startRecordingEditKey() {
  recordingEditKey.value = true
  editKeyError.value = null
  recordKey((result) => {
    recordingEditKey.value = false
    if (result) saveEditKey(result)
  })
}

async function saveEditKey(key: { accel: string; keyCode: number | null } | null) {
  editKeySaving.value = true
  editKeyError.value = null
  try {
    await window.oneCC.setOverlayEditKey(key)
    app.settings = await window.oneCC.getSettings()
  } catch (e: any) {
    editKeyError.value = e?.message ?? 'Impossible de sauvegarder'
  } finally {
    editKeySaving.value = false
  }
}

async function clearEditKey() {
  await saveEditKey(null)
}
</script>

<template>
  <div class="space-y-4">

    <!-- Activer l'overlay -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-th-primary">Activer l'overlay</p>
          <p class="text-xs text-th-muted mt-0.5">
            Active ou désactive l'affichage de l'overlay au démarrage de l'application.
          </p>
        </div>
        <button
          @click="toggleOverlay"
          :disabled="overlayToggling"
          class="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-200 disabled:opacity-50"
          :class="overlayEnabled ? 'bg-accent/30 border-accent/40' : 'bg-slate-800 border-slate-600'"
        >
          <span
            class="inline-block h-4 w-4 rounded-full shadow transition-transform duration-200"
            :class="overlayEnabled ? 'translate-x-6' : 'translate-x-1 bg-slate-500'"
            :style="overlayEnabled ? { backgroundColor: 'rgb(var(--accent-rgb))' } : {}"
          />
        </button>
      </div>
      <div class="mt-3 pt-3 border-t border-th-muted">
        <span
          class="inline-flex items-center gap-1.5 text-xs font-semibold"
          :class="overlayEnabled ? 'text-emerald-400' : 'text-th-muted'"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="overlayEnabled ? 'bg-emerald-400' : 'bg-[rgb(var(--text-muted-rgb,100,116,139))]'"/>
          {{ overlayEnabled ? 'Overlay activé' : 'Overlay désactivé' }}
        </span>
      </div>
    </div>

    <!-- Touche de bascule -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Touche de bascule</p>
      <p class="text-xs text-th-muted mb-4">
        Raccourci clavier pour afficher / masquer l'overlay, même quand le jeu est au premier plan.
      </p>

      <div class="flex items-center gap-3 flex-wrap">
        <kbd class="inline-flex items-center rounded border border-th-subtle bg-th-card px-2.5 py-1 text-sm font-mono font-semibold text-accent shadow-sm">
          {{ toggleKey }}
        </kbd>

        <template v-if="recording">
          <span class="text-xs text-amber-300 animate-pulse">Appuyez sur la touche souhaitée… (Echap pour annuler)</span>
        </template>

        <template v-else>
          <button
            @click="startRecording"
            :disabled="keySaving"
            class="shrink-0 flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-50"
          >
            <svg v-if="keySaving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-.586 1.414H9v-2a2 2 0 01.586-1.414z"/>
            </svg>
            Modifier
          </button>
        </template>
      </div>

      <p v-if="keyError" class="mt-2 text-xs text-rose-300">{{ keyError }}</p>
    </div>

    <!-- Touche d'interaction modules -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Touche d'interaction</p>
      <p class="text-xs text-th-muted mb-4">
        Maintenez cette touche enfoncée pour activer l'interaction souris sur les modules qui le supportent (ex: Radio).
        Relâchez pour revenir en mode passthrough.
      </p>
      <div class="flex items-center gap-3 flex-wrap">
        <template v-if="recordingInteract">
          <span class="text-xs text-amber-300 animate-pulse">Appuyez sur la touche souhaitée… (Echap pour annuler)</span>
        </template>
        <template v-else>
          <kbd v-if="interactionKey" class="inline-flex items-center rounded border border-th-subtle bg-th-card px-2.5 py-1 text-sm font-mono font-semibold text-accent shadow-sm">
            {{ interactionKey }}
          </kbd>
          <span v-else class="text-xs text-th-muted italic">Aucune touche</span>
          <button
            :disabled="interactSaving"
            class="shrink-0 flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-50"
            @click="startRecordingInteract"
          >
            {{ interactionKey ? 'Modifier' : 'Assigner' }}
          </button>
          <button
            v-if="interactionKey"
            :disabled="interactSaving"
            class="text-xs text-rose-400/70 hover:text-rose-300 transition disabled:opacity-50"
            @click="clearInteractionKey"
          >
            Supprimer
          </button>
        </template>
      </div>
      <p v-if="interactError" class="mt-2 text-xs text-rose-300">{{ interactError }}</p>

      <!-- Sélecteur mode hold / toggle -->
      <div v-if="interactionKey" class="mt-3 pt-3 border-t border-th-subtle flex items-center gap-2">
        <span class="text-xs text-th-muted shrink-0">Mode :</span>
        <button
          :disabled="interactSaving"
          class="rounded-md border px-3 py-1 text-xs font-semibold transition disabled:opacity-50"
          :class="interactionKeyMode === 'toggle'
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-th-subtle bg-white/5 text-th-muted hover:text-th-primary hover:bg-white/10'"
          @click="setInteractionMode('toggle')"
        >
          Bascule
        </button>
        <button
          :disabled="interactSaving"
          class="rounded-md border px-3 py-1 text-xs font-semibold transition disabled:opacity-50"
          :class="interactionKeyMode === 'hold'
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-th-subtle bg-white/5 text-th-muted hover:text-th-primary hover:bg-white/10'"
          @click="setInteractionMode('hold')"
        >
          Maintien
        </button>
        <span class="text-xs text-th-muted italic">
          {{ interactionKeyMode === 'toggle' ? '— appui active/désactive' : '— maintenu enfoncé pour interagir' }}
        </span>
      </div>
    </div>

    <!-- Touche d'édition overlay -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Touche d'édition overlay</p>
      <p class="text-xs text-th-muted mb-4">
        Raccourci pour activer l'édition de la disposition de l'overlay. Supporte les combinaisons (ex: Ctrl+F10).
        Défaut : Ctrl+Shift+E.
      </p>
      <div class="flex items-center gap-3 flex-wrap">
        <template v-if="recordingEditKey">
          <span class="text-xs text-amber-300 animate-pulse">Appuyez sur la combinaison souhaitée… (Echap pour annuler)</span>
        </template>
        <template v-else>
          <kbd class="inline-flex items-center rounded border border-th-subtle bg-th-card px-2.5 py-1 text-sm font-mono font-semibold text-accent shadow-sm">
            {{ overlayEditKey }}
          </kbd>
          <button
            :disabled="editKeySaving"
            class="shrink-0 flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-50"
            @click="startRecordingEditKey"
          >
            Modifier
          </button>
          <button
            v-if="app.settings?.overlayEditKey"
            :disabled="editKeySaving"
            class="text-xs text-rose-400/70 hover:text-rose-300 transition disabled:opacity-50"
            @click="clearEditKey"
          >
            Réinitialiser
          </button>
        </template>
      </div>
      <p v-if="editKeyError" class="mt-2 text-xs text-rose-300">{{ editKeyError }}</p>
    </div>

  </div>
</template>
