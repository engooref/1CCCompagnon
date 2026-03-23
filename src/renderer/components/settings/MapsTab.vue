<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '../../stores/app'

const app = useAppStore()

// ─── Opacité carte overlay ────────────────────────────────────────────────────

const mapOpacityInput  = ref(85)
const mapOpacitySaving = ref(false)

function initMapOpacity() {
  const v = app.settings?.mapOverlayOpacity
  mapOpacityInput.value = v != null ? Math.round(v * 100) : 85
}

async function saveMapOpacity() {
  mapOpacitySaving.value = true
  try {
    await app.saveSettings({ mapOverlayOpacity: mapOpacityInput.value / 100 })
  } finally {
    mapOpacitySaving.value = false
  }
}

// ─── Touche toggle carte ──────────────────────────────────────────────────────

const mapToggleKey = computed(() => app.settings?.mapToggleKey ?? '')
const mapRecording = ref(false)
const mapKeySaving = ref(false)
const mapKeyError  = ref<string | null>(null)

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

function startMapRecording() {
  mapRecording.value = true
  mapKeyError.value  = null

  const handler = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      mapRecording.value = false
      window.removeEventListener('keydown', handler, true)
      return
    }

    const key = toAccelerator(e)
    if (!key) return

    window.removeEventListener('keydown', handler, true)
    mapRecording.value = false
    saveMapToggleKey({ accel: key, keyCode: (e as any).keyCode ?? (e as any).which ?? null })
  }

  window.addEventListener('keydown', handler, true)
}

async function saveMapToggleKey(key: string | { accel: string; keyCode: number | null }) {
  mapKeySaving.value = true
  mapKeyError.value  = null
  try {
    await window.oneCC.setMapToggleKey(key)
    app.settings = await window.oneCC.getSettings()
  } catch (e: any) {
    mapKeyError.value = e?.message ?? 'Impossible de sauvegarder'
  } finally {
    mapKeySaving.value = false
  }
}

async function clearMapToggleKey() {
  mapKeySaving.value = true
  mapKeyError.value  = null
  try {
    await app.saveSettings({ mapToggleKey: '', mapToggleKeyCode: null })
  } catch (e: any) {
    mapKeyError.value = e?.message ?? 'Impossible de supprimer'
  } finally {
    mapKeySaving.value = false
  }
}

onMounted(() => { initMapOpacity() })
</script>

<template>
  <div class="space-y-4">

    <!-- Opacité de la carte overlay -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Opacité sur l'overlay</p>
      <p class="text-xs text-th-muted mb-4">
        Transparence de la carte tactique affichée sur l'overlay. 100 % = totalement opaque.
      </p>

      <div class="flex items-center gap-4">
        <input
          v-model.number="mapOpacityInput"
          type="range"
          min="10"
          max="100"
          step="5"
          class="flex-1"
          style="accent-color: rgb(var(--accent-rgb))"
          @change="saveMapOpacity"
        />
        <span class="shrink-0 w-10 text-right text-sm font-mono font-semibold text-accent">
          {{ mapOpacityInput }}%
        </span>
      </div>

      <!-- Aperçu visuel -->
      <div class="mt-3 rounded-md border border-th-muted overflow-hidden h-8 relative">
        <div
          class="absolute inset-0 bg-accent/5"
          style="background-image: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,.03) 4px, rgba(255,255,255,.03) 8px)"
        />
        <div
          class="absolute inset-0 bg-gradient-to-r from-accent/60 to-accent/30 rounded"
          :style="{ opacity: mapOpacityInput / 100 }"
        />
      </div>
      <p v-if="mapOpacitySaving" class="mt-1 text-[10px] text-th-muted">Sauvegarde…</p>
    </div>

    <!-- Touche d'affichage carte -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Touche d'affichage carte</p>
      <p class="text-xs text-th-muted mb-4">
        Raccourci clavier pour afficher ou masquer la carte tactique sur l'overlay. La carte doit être épinglée depuis la section <span class="text-accent/70">Cartes</span>.
      </p>

      <div class="flex items-center gap-3 flex-wrap">
        <kbd
          v-if="mapToggleKey"
          class="inline-flex items-center rounded border border-th-subtle bg-th-card px-2.5 py-1 text-sm font-mono font-semibold text-accent shadow-sm"
        >
          {{ mapToggleKey }}
        </kbd>
        <span v-else class="text-xs text-th-muted italic">Aucune touche définie</span>

        <template v-if="mapRecording">
          <span class="text-xs text-amber-300 animate-pulse">Appuyez sur la touche souhaitée… (Echap pour annuler)</span>
        </template>

        <template v-else>
          <button
            @click="startMapRecording"
            :disabled="mapKeySaving"
            class="shrink-0 flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-50"
          >
            <svg v-if="mapKeySaving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-.586 1.414H9v-2a2 2 0 01.586-1.414z"/>
            </svg>
            {{ mapToggleKey ? 'Modifier' : 'Définir une touche' }}
          </button>

          <button
            v-if="mapToggleKey"
            @click="clearMapToggleKey"
            :disabled="mapKeySaving"
            class="shrink-0 flex items-center gap-1.5 rounded-md border border-th-subtle bg-th-card px-3 py-1.5 text-xs font-semibold text-th-secondary hover:text-rose-300 hover:border-rose-400/30 transition disabled:opacity-50"
            title="Supprimer la touche"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Supprimer
          </button>
        </template>
      </div>

      <p v-if="mapKeyError" class="mt-2 text-xs text-rose-300">{{ mapKeyError }}</p>
    </div>

  </div>
</template>
