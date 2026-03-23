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

// ─── Disposition overlay ──────────────────────────────────────────────────────

const editLayoutBusy = ref(false)

async function enterEditLayout() {
  editLayoutBusy.value = true
  try {
    await window.oneCC.openOverlayEditor()
  } finally {
    editLayoutBusy.value = false
  }
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
          :class="overlayEnabled ? 'bg-accent/30 border-accent/40' : 'bg-th-card border-th-subtle'"
        >
          <span
            class="inline-block h-4 w-4 rounded-full shadow transition-transform duration-200"
            :class="overlayEnabled ? 'translate-x-6' : 'translate-x-1 bg-th-muted'"
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

    <!-- Disposition de l'overlay -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Disposition de l'overlay</p>
      <p class="text-xs text-th-muted mb-4">
        Personnalisez la position des éléments affichés dans l'overlay en les glissant-déposant.
        Les positions sont sauvegardées automatiquement.
      </p>

      <button
        @click="enterEditLayout"
        :disabled="editLayoutBusy"
        class="flex items-center gap-2 rounded-md border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-50"
      >
        <svg v-if="editLayoutBusy" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"/>
        </svg>
        Modifier la disposition
      </button>
    </div>

  </div>
</template>
