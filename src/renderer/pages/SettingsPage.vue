<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { logger } from '../services/logger'

const app = useAppStore()

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'general' | 'overlay' | 'transport' | 'maps'
const activeTab = ref<Tab>('general')

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

// ─── Window size ──────────────────────────────────────────────────────────────

const WINDOW_SIZES = [
  { value: '1024x680',  label: '1024 × 680  — Compact' },
  { value: '1120x760',  label: '1120 × 760  — Standard (défaut)' },
  { value: '1280x800',  label: '1280 × 800  — Large' },
  { value: '1440x900',  label: '1440 × 900  — HD' },
  { value: '1600x1000', label: '1600 × 1000 — Wide HD' },
  { value: '1920x1080', label: '1920 × 1080 — Full HD' },
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

// ─── Game folder ──────────────────────────────────────────────────────────────

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

// ─── Touche toggle overlay ─────────────────────────────────────────────────────

const toggleKey  = computed(() => app.settings?.toggleKey ?? 'F10')
const recording  = ref(false)
const keySaving  = ref(false)
const keyError   = ref<string | null>(null)

function toAccelerator(e: KeyboardEvent): string | null {
  const modOnly = ['Control','Alt','Shift','Meta','AltGraph']
  if (modOnly.includes(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey)  parts.push('Ctrl')
  if (e.altKey)   parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  let k = e.key
  if (k === ' ')         k = 'Space'
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
    // send both accelerator and keyCode to main so iohook can match low-level events
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

// ─── Disposition overlay ────────────────────────────────────────────────────

const editLayoutBusy = ref(false)

async function enterEditLayout() {
  editLayoutBusy.value = true
  try {
    await window.oneCC.openOverlayEditor()
  } finally {
    editLayoutBusy.value = false
  }
}

// ─── Opportunités de marché ─────────────────────────────────────────────────

// ─── Opacité carte overlay ───────────────────────────────────────────────────

const mapOpacityInput   = ref(85)
const mapOpacitySaving  = ref(false)

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

const mapToggleKey     = computed(() => app.settings?.mapToggleKey ?? '')
const mapRecording     = ref(false)
const mapKeySaving     = ref(false)
const mapKeyError      = ref<string | null>(null)

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

// ─── Opportunités de marché ─────────────────────────────────────────────────

const marketOppsEnabled = computed(() => app.settings?.marketOppsEnabled ?? false)
const marketOppsBudgetInput = ref<string>('')
const marketOppsSaving = ref(false)

function initMarketBudget() {
  const savedBudget = app.settings?.marketOppsBudget
  marketOppsBudgetInput.value = savedBudget != null ? String(savedBudget) : ''
}

async function toggleMarketOpps() {
  if (!app.settings) return
  marketOppsSaving.value = true
  try {
    logger.info('[Settings] toggling market opps to', !marketOppsEnabled.value)
    await app.saveSettings({ marketOppsEnabled: !marketOppsEnabled.value })
  } finally {
    marketOppsSaving.value = false
  }
}

async function saveMarketBudget() {
  const raw = marketOppsBudgetInput.value
  const budget = raw === '' ? null : Number(raw)
  if (raw !== '' && (isNaN(budget!) || budget! < 0)) return
  marketOppsSaving.value = true
  try {
    await app.saveSettings({ marketOppsBudget: budget })
  } finally {
    marketOppsSaving.value = false
  }
}

onMounted(() => { initMarketBudget(); initMapOpacity() })
</script>

<template>
  <section class="h-full flex flex-col gap-5">

    <!-- Page title -->
    <div class="shrink-0">
      <h2 class="text-base font-bold text-slate-100">Paramètres</h2>
      <p class="text-xs text-slate-500 mt-0.5">Configuration de l'application</p>
    </div>

    <!-- Tabs -->
    <div class="shrink-0 flex gap-1 border-b border-slate-800 pb-0">
      <button
        v-for="tab in ([
          { id: 'general',   label: 'Général' },
          { id: 'overlay',   label: 'Overlay' },
          { id: 'transport', label: 'Transport' },
          { id: 'maps',      label: 'Cartes' },
        ] as const)"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
        :class="activeTab === tab.id
          ? 'border-cyan-400 text-cyan-300'
          : 'border-transparent text-slate-500 hover:text-slate-300'"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- ── Tab : Overlay ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'overlay'" class="flex-1 min-h-0 overflow-y-auto space-y-4">

      <div class="rounded-lg border border-slate-800 bg-black/20 p-4">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-slate-200">Activer l'overlay</p>
            <p class="text-xs text-slate-500 mt-0.5">
              Active ou désactive l'affichage de l'overlay au démarrage de l'application.
            </p>
          </div>
          <button
            @click="toggleOverlay"
            :disabled="overlayToggling"
            class="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-200 disabled:opacity-50"
            :class="overlayEnabled ? 'bg-cyan-500/30 border-cyan-400/40' : 'bg-slate-800 border-slate-700'"
          >
            <span
              class="inline-block h-4 w-4 rounded-full shadow transition-transform duration-200"
              :class="overlayEnabled ? 'translate-x-6 bg-cyan-400' : 'translate-x-1 bg-slate-500'"
            />
          </button>
        </div>
        <div class="mt-3 pt-3 border-t border-slate-800/60">
          <span
            class="inline-flex items-center gap-1.5 text-xs font-semibold"
            :class="overlayEnabled ? 'text-emerald-400' : 'text-slate-500'"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="overlayEnabled ? 'bg-emerald-400' : 'bg-slate-600'"/>
            {{ overlayEnabled ? 'Overlay activé' : 'Overlay désactivé' }}
          </span>
        </div>
      </div>

      <!-- Touche toggle overlay -->
      <div class="rounded-lg border border-slate-800 bg-black/20 p-4">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Touche de bascule</p>
        <p class="text-xs text-slate-500 mb-4">
          Raccourci clavier pour afficher / masquer l'overlay, même quand le jeu est au premier plan.
        </p>

        <div class="flex items-center gap-3 flex-wrap">
          <!-- Touche actuelle -->
          <kbd class="inline-flex items-center rounded border border-slate-600 bg-slate-800 px-2.5 py-1 text-sm font-mono font-semibold text-cyan-300 shadow-sm">
            {{ toggleKey }}
          </kbd>

          <!-- Enregistrement en cours -->
          <template v-if="recording">
            <span class="text-xs text-amber-300 animate-pulse">Appuyez sur la touche souhaitée… (Echap pour annuler)</span>
          </template>

          <!-- Bouton modifier -->
          <template v-else>
            <button
              @click="startRecording"
              :disabled="keySaving"
              class="shrink-0 flex items-center gap-1.5 rounded-md border border-cyan-400/25 bg-cyan-400/8 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-400/15 transition disabled:opacity-50"
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
      <div class="rounded-lg border border-slate-800 bg-black/20 p-4">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Disposition de l'overlay</p>
        <p class="text-xs text-slate-500 mb-4">
          Personnalisez la position des éléments affichés dans l'overlay en les glissant-déposant.
          Les positions sont sauvegardées automatiquement.
        </p>

        <button
          @click="enterEditLayout"
          :disabled="editLayoutBusy"
          class="flex items-center gap-2 rounded-md border border-purple-400/25 bg-purple-400/8 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-400/15 transition disabled:opacity-50"
        >
          <svg v-if="editLayoutBusy" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 8h16M4 16h16"/>
          </svg>
          Modifier la disposition
        </button>
      </div>

    </div>

    <!-- ── Tab : Transport ───────────────────────────────────────────────── -->
    <div v-if="activeTab === 'transport'" class="flex-1 min-h-0 overflow-y-auto space-y-4">

      <!-- Opportunités de marché -->
      <div class="rounded-lg border border-slate-800 bg-black/20 p-4">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Opportunités de marché</p>
        <p class="text-xs text-slate-500 mb-4">
          Affiche des suggestions de cargo rentables dans le module Transport de l'overlay.
        </p>

        <!-- Toggle -->
        <div class="flex items-center justify-between gap-4 mb-4">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-slate-200">Activer</p>
            <p class="text-xs text-slate-500 mt-0.5">Affiche jusqu'à 3 opportunités par étape.</p>
          </div>
          <button
            @click="toggleMarketOpps"
            :disabled="marketOppsSaving"
            class="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-200 disabled:opacity-50"
            :class="marketOppsEnabled ? 'bg-cyan-500/30 border-cyan-400/40' : 'bg-slate-800 border-slate-700'"
          >
            <span
              class="inline-block h-4 w-4 rounded-full shadow transition-transform duration-200"
              :class="marketOppsEnabled ? 'translate-x-6 bg-cyan-400' : 'translate-x-1 bg-slate-500'"
            />
          </button>
        </div>

        <!-- Budget -->
        <div v-if="marketOppsEnabled" class="space-y-2">
          <p class="text-xs font-semibold text-slate-400">Budget disponible <span class="text-slate-600 font-normal">(aUEC · laisser vide = illimité)</span></p>
          <div class="flex gap-2">
            <input
              v-model="marketOppsBudgetInput"
              type="number"
              min="0"
              placeholder="Ex : 500000"
              class="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none transition"
              @keydown.enter="saveMarketBudget"
            />
            <button
              @click="saveMarketBudget"
              :disabled="marketOppsSaving"
              class="shrink-0 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-400/15 transition disabled:opacity-50"
            >
              <svg v-if="marketOppsSaving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <span v-else>Valider</span>
            </button>
          </div>
          <p class="text-[11px] text-slate-600">
            <span v-if="app.settings?.marketOppsBudget != null">
              Budget actuel : <span class="text-slate-400 tabular-nums">{{ app.settings.marketOppsBudget.toLocaleString('fr-FR') }} aUEC</span>
            </span>
            <span v-else>Aucun budget défini — les offres ne filtrent pas par coût.</span>
          </p>
        </div>
      </div>

    </div>

    <!-- ── Tab : Cartes ──────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'maps'" class="flex-1 min-h-0 overflow-y-auto space-y-4">

      <!-- Opacité de la carte overlay -->
      <div class="rounded-lg border border-slate-800 bg-black/20 p-4">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Opacité sur l'overlay</p>
        <p class="text-xs text-slate-500 mb-4">
          Transparence de la carte tactique affichée sur l'overlay. 100 % = totalement opaque.
        </p>

        <div class="flex items-center gap-4">
          <input
            v-model.number="mapOpacityInput"
            type="range"
            min="10"
            max="100"
            step="5"
            class="flex-1 accent-cyan-400"
            @change="saveMapOpacity"
          />
          <span class="shrink-0 w-10 text-right text-sm font-mono font-semibold text-cyan-300">
            {{ mapOpacityInput }}%
          </span>
        </div>

        <!-- Aperçu visuel -->
        <div class="mt-3 rounded-md border border-slate-700/50 overflow-hidden h-8 relative">
          <div
            class="absolute inset-0 bg-gradient-to-r from-cyan-900/40 to-slate-800/40"
            style="background-image: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,.03) 4px, rgba(255,255,255,.03) 8px)"
          />
          <div
            class="absolute inset-0 bg-gradient-to-r from-cyan-500/60 to-cyan-300/40 rounded"
            :style="{ opacity: mapOpacityInput / 100 }"
          />
        </div>
        <p v-if="mapOpacitySaving" class="mt-1 text-[10px] text-slate-600">Sauvegarde…</p>
      </div>

      <!-- Touche d'affichage de la carte -->
      <div class="rounded-lg border border-slate-800 bg-black/20 p-4">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Touche d'affichage carte</p>
        <p class="text-xs text-slate-500 mb-4">
          Raccourci clavier pour afficher ou masquer la carte tactique sur l'overlay. La carte doit être épinglée depuis la section <span class="text-cyan-400/70">Cartes</span>.
        </p>

        <div class="flex items-center gap-3 flex-wrap">
          <!-- Touche actuelle -->
          <kbd
            v-if="mapToggleKey"
            class="inline-flex items-center rounded border border-slate-600 bg-slate-800 px-2.5 py-1 text-sm font-mono font-semibold text-cyan-300 shadow-sm"
          >
            {{ mapToggleKey }}
          </kbd>
          <span v-else class="text-xs text-slate-600 italic">Aucune touche définie</span>

          <!-- Enregistrement en cours -->
          <template v-if="mapRecording">
            <span class="text-xs text-amber-300 animate-pulse">Appuyez sur la touche souhaitée… (Echap pour annuler)</span>
          </template>

          <!-- Boutons -->
          <template v-else>
            <button
              @click="startMapRecording"
              :disabled="mapKeySaving"
              class="shrink-0 flex items-center gap-1.5 rounded-md border border-cyan-400/25 bg-cyan-400/8 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-400/15 transition disabled:opacity-50"
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
              class="shrink-0 flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-rose-300 hover:border-rose-400/30 transition disabled:opacity-50"
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

    <!-- ── Tab : Général ──────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'general'" class="flex-1 min-h-0 overflow-y-auto space-y-4">

      <!-- Dossier du jeu -->
      <div class="rounded-lg border border-slate-800 bg-black/20 p-4">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Dossier du jeu</p>
        <p class="text-xs text-slate-500 mb-4">
          Chemin vers le dossier d'installation de Star Citizen. Utilisé pour accéder aux fichiers de log du jeu.
        </p>

        <div
          v-if="gameFolder"
          class="flex items-center gap-3 rounded-md border border-slate-700/60 bg-slate-900/60 px-3 py-2.5 mb-3"
        >
          <svg class="w-4 h-4 shrink-0 text-cyan-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
          </svg>
          <span class="flex-1 min-w-0 text-xs text-slate-300 font-mono truncate" :title="gameFolder">{{ gameFolder }}</span>
          <button @click="clearGameFolder" class="shrink-0 text-slate-600 hover:text-rose-400 transition" title="Supprimer">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div v-else class="flex items-center gap-2 rounded-md border border-dashed border-slate-700 px-3 py-2.5 mb-3">
          <svg class="w-4 h-4 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
          </svg>
          <span class="text-xs text-slate-600 italic">Aucun dossier sélectionné</span>
        </div>

        <p v-if="gameFolderError" class="text-xs text-rose-300 mb-3">{{ gameFolderError }}</p>

        <button
          @click="pickGameFolder"
          :disabled="gameFolderSaving"
          class="flex items-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-400/8 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-400/15 transition disabled:opacity-50"
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

      <!-- Résolution de la fenêtre -->
      <div class="rounded-lg border border-slate-800 bg-black/20 p-4">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Résolution du compagnon</p>
        <p class="text-xs text-slate-500 mb-4">
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
              ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
              : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'"
          >
            <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="windowSize === res.value ? 'bg-cyan-400' : 'bg-slate-600'"/>
            {{ res.label }}
          </button>
        </div>

        <p v-if="windowSizeErr" class="mt-2 text-xs text-rose-300">{{ windowSizeErr }}</p>
      </div>

    </div>

  </section>
</template>
