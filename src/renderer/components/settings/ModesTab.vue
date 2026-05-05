<script setup lang="ts">
import { ref, computed, type Ref, onMounted } from 'vue'
import { useAppStore } from '../../stores/app'
import { useModeStore } from '../../stores/mode'
import type { OverlayMode } from '@shared/general'

const modeStore = useModeStore()
const app = useAppStore()

onMounted(async () => {
  if (!modeStore.registry) await modeStore.load()
})

// ─── Utilitaire capture touche ────────────────────────────────────────────────

function toAccel(e: KeyboardEvent): string | null {
  const modOnly = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']
  if (modOnly.includes(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey)  parts.push('Ctrl')
  if (e.altKey)   parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let k = e.key
  if (k === ' ') k = 'Space'
  else if (k.length === 1) k = k.toUpperCase()
  parts.push(k)
  return parts.join('+')
}

function captureKey(
  recording: Ref<boolean>,
  onDone: (payload: { accel: string; keyCode: number | null } | null) => void,
) {
  recording.value = true
  const handler = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const modOnly = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']
    if (modOnly.includes(e.key)) return
    window.removeEventListener('keydown', handler, true)
    recording.value = false
    if (e.key === 'Escape') { onDone(null); return }
    const accel = toAccel(e)
    if (!accel) { onDone(null); return }
    onDone({ accel, keyCode: (e as any).keyCode ?? null })
  }
  window.addEventListener('keydown', handler, true)
}

// ─── Touche cycle tous les modes ─────────────────────────────────────────────

const cycleKey       = computed(() => app.settings?.cycleModeKey ?? null)
const recordingCycle = ref(false)
const cycleSaving    = ref(false)

function startRecordingCycle() {
  captureKey(recordingCycle, async (payload) => {
    if (!payload) return
    cycleSaving.value = true
    try {
      await window.oneCC.setCycleModeKey(payload)
      app.settings = await window.oneCC.getSettings()
    } finally { cycleSaving.value = false }
  })
}

async function clearCycleKey() {
  cycleSaving.value = true
  try {
    await window.oneCC.setCycleModeKey(null)
    app.settings = await window.oneCC.getSettings()
  } finally { cycleSaving.value = false }
}

// ─── Touche cycle modes généraux ─────────────────────────────────────────────

const cycleBuiltInKey     = computed(() => app.settings?.cycleBuiltInKey ?? null)
const recordingBuiltIn    = ref(false)
const cycleBuiltInSaving  = ref(false)

function startRecordingBuiltIn() {
  captureKey(recordingBuiltIn, async (payload) => {
    if (!payload) return
    cycleBuiltInSaving.value = true
    try {
      await window.oneCC.setCycleBuiltInKey(payload)
      app.settings = await window.oneCC.getSettings()
    } finally { cycleBuiltInSaving.value = false }
  })
}

async function clearBuiltInKey() {
  cycleBuiltInSaving.value = true
  try {
    await window.oneCC.setCycleBuiltInKey(null)
    app.settings = await window.oneCC.getSettings()
  } finally { cycleBuiltInSaving.value = false }
}

// ─── Touche cycle modes personnalisés ─────────────────────────────────────────

const cycleCustomKey     = computed(() => app.settings?.cycleCustomKey ?? null)
const recordingCustom    = ref(false)
const cycleCustomSaving  = ref(false)

function startRecordingCustom() {
  captureKey(recordingCustom, async (payload) => {
    if (!payload) return
    cycleCustomSaving.value = true
    try {
      await window.oneCC.setCycleCustomKey(payload)
      app.settings = await window.oneCC.getSettings()
    } finally { cycleCustomSaving.value = false }
  })
}

async function clearCustomKey() {
  cycleCustomSaving.value = true
  try {
    await window.oneCC.setCycleCustomKey(null)
    app.settings = await window.oneCC.getSettings()
  } finally { cycleCustomSaving.value = false }
}

// ─── Création d'un mode custom ────────────────────────────────────────────────

const showCreateForm = ref(false)
const newModeLabel   = ref('')
const newModeBaseId  = ref('default')
const creating       = ref(false)
const createError    = ref<string | null>(null)

async function createMode() {
  const label = newModeLabel.value.trim()
  if (!label) return
  creating.value = true
  createError.value = null
  try {
    await modeStore.createCustomMode(label, newModeBaseId.value)
    newModeLabel.value  = ''
    showCreateForm.value = false
  } catch (e: any) {
    createError.value = e?.message ?? 'Impossible de créer le mode'
  } finally {
    creating.value = false
  }
}

// ─── Suppression ─────────────────────────────────────────────────────────────

const deletingId = ref<string | null>(null)
const confirmDeleteId = ref<string | null>(null)

async function deleteMode(modeId: string) {
  deletingId.value = modeId
  try {
    await modeStore.deleteMode(modeId)
  } finally {
    deletingId.value   = null
    confirmDeleteId.value = null
  }
}

// ─── Activation ──────────────────────────────────────────────────────────────

const switchingId = ref<string | null>(null)

async function activateMode(modeId: string) {
  switchingId.value = modeId
  try {
    await modeStore.switchMode(modeId)
  } finally {
    switchingId.value = null
  }
}

// ─── Raccourcis clavier par mode ─────────────────────────────────────────────

const recordingHotkeyId = ref<string | null>(null)

function startRecordingHotkey(modeId: string) {
  recordingHotkeyId.value = modeId

  const handler = async (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const modOnly = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']
    if (modOnly.includes(e.key)) return
    window.removeEventListener('keydown', handler, true)
    recordingHotkeyId.value = null
    if (e.key === 'Escape') return
    const accel = toAccel(e)
    if (!accel) return
    await modeStore.updateModeMetadata(modeId, {
      hotkey: accel,
      hotkeyCode: (e as any).keyCode ?? null,
    })
  }
  window.addEventListener('keydown', handler, true)
}

async function clearHotkey(modeId: string) {
  await modeStore.updateModeMetadata(modeId, { hotkey: null, hotkeyCode: null })
}

// ─── Renommage mode custom ────────────────────────────────────────────────────

const renamingId    = ref<string | null>(null)
const renameLabel   = ref('')
const renameSaving  = ref(false)

function startRename(mode: OverlayMode) {
  renamingId.value  = mode.id
  renameLabel.value = mode.label
}

async function saveRename(modeId: string) {
  const label = renameLabel.value.trim()
  if (!label) return
  renameSaving.value = true
  try {
    await modeStore.updateModeMetadata(modeId, { label })
    renamingId.value = null
  } finally {
    renameSaving.value = false
  }
}

// ─── Résumé des modules d'un mode ────────────────────────────────────────────

function moduleSummary(mode: OverlayMode): string {
  const visibles = mode.layout.modules.filter((m) => m.visible)
  if (!visibles.length) return 'Aucun module visible'
  return visibles.map((m) => m.title).join(' · ')
}

const activeId    = computed(() => modeStore.activeModeId)
const builtInModes = computed(() => modeStore.modes.filter((m) => m.builtIn))
const customModes  = computed(() => modeStore.modes.filter((m) => !m.builtIn))
</script>

<template>
  <div class="space-y-4">

    <!-- Touche de cycle de modes -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Touche de cycle</p>
      <p class="text-xs text-th-muted mb-3">
        Appuyer sur cette touche fait défiler les modes dans l'ordre : Général → Minage → Combat → … → retour au début.
        Fonctionne même quand le jeu est au premier plan.
      </p>
      <div class="flex items-center gap-3 flex-wrap">
        <template v-if="recordingCycle">
          <span class="text-xs text-amber-300 animate-pulse">Appuyez sur la touche souhaitée… (Echap pour annuler)</span>
        </template>
        <template v-else>
          <kbd
            v-if="cycleKey"
            class="inline-flex items-center rounded border border-th-subtle bg-th-card px-2.5 py-1 text-sm font-mono font-semibold text-accent shadow-sm"
          >{{ cycleKey }}</kbd>
          <span v-else class="text-xs text-th-muted italic">Aucune touche</span>
          <button
            :disabled="cycleSaving"
            class="flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-50"
            @click="startRecordingCycle"
          >
            {{ cycleKey ? 'Modifier' : 'Assigner' }}
          </button>
          <button
            v-if="cycleKey"
            :disabled="cycleSaving"
            class="text-xs text-rose-400/70 hover:text-rose-300 transition disabled:opacity-50"
            @click="clearCycleKey"
          >
            Supprimer
          </button>
        </template>
      </div>
    </div>

    <!-- Touche cycle modes généraux -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Cycle modes généraux</p>
      <p class="text-xs text-th-muted mb-3">Fait défiler uniquement les modes intégrés (Général, Minage…).</p>
      <div class="flex items-center gap-3 flex-wrap">
        <template v-if="recordingBuiltIn">
          <span class="text-xs text-amber-300 animate-pulse">Appuyez sur la touche… (Echap pour annuler)</span>
        </template>
        <template v-else>
          <kbd v-if="cycleBuiltInKey" class="inline-flex items-center rounded border border-th-subtle bg-th-card px-2.5 py-1 text-sm font-mono font-semibold text-accent shadow-sm">{{ cycleBuiltInKey }}</kbd>
          <span v-else class="text-xs text-th-muted italic">Aucune touche</span>
          <button :disabled="cycleBuiltInSaving" class="flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-50" @click="startRecordingBuiltIn">
            {{ cycleBuiltInKey ? 'Modifier' : 'Assigner' }}
          </button>
          <button v-if="cycleBuiltInKey" :disabled="cycleBuiltInSaving" class="text-xs text-rose-400/70 hover:text-rose-300 transition disabled:opacity-50" @click="clearBuiltInKey">Supprimer</button>
        </template>
      </div>
    </div>

    <!-- Touche cycle modes personnalisés -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Cycle modes personnalisés</p>
      <p class="text-xs text-th-muted mb-3">Fait défiler uniquement les modes que vous avez créés.</p>
      <div class="flex items-center gap-3 flex-wrap">
        <template v-if="recordingCustom">
          <span class="text-xs text-amber-300 animate-pulse">Appuyez sur la touche… (Echap pour annuler)</span>
        </template>
        <template v-else>
          <kbd v-if="cycleCustomKey" class="inline-flex items-center rounded border border-th-subtle bg-th-card px-2.5 py-1 text-sm font-mono font-semibold text-accent shadow-sm">{{ cycleCustomKey }}</kbd>
          <span v-else class="text-xs text-th-muted italic">Aucune touche</span>
          <button :disabled="cycleCustomSaving" class="flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-50" @click="startRecordingCustom">
            {{ cycleCustomKey ? 'Modifier' : 'Assigner' }}
          </button>
          <button v-if="cycleCustomKey" :disabled="cycleCustomSaving" class="text-xs text-rose-400/70 hover:text-rose-300 transition disabled:opacity-50" @click="clearCustomKey">Supprimer</button>
        </template>
      </div>
    </div>

    <!-- En-tête + bouton créer -->
    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-semibold text-th-primary">Modes d'overlay</p>
        <p class="text-xs text-th-muted mt-0.5">
          Chaque mode a sa propre disposition et configuration de modules.
          Changez de mode en un clic depuis le panneau d'édition de l'overlay.
        </p>
      </div>
      <button
        class="shrink-0 flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition"
        @click="showCreateForm = !showCreateForm"
      >
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Nouveau mode
      </button>
    </div>

    <!-- Formulaire création -->
    <div v-if="showCreateForm" class="rounded-lg border border-accent/25 bg-accent/[0.05] p-4 space-y-3">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted">Créer un nouveau mode</p>
      <div class="flex flex-wrap gap-3">
        <div class="flex-1 min-w-[160px]">
          <label class="mb-1 block text-xs text-th-muted">Nom</label>
          <input
            v-model="newModeLabel"
            type="text"
            placeholder="Ex: Exploration, PvP…"
            class="w-full rounded-md border border-th-subtle bg-black/30 px-3 py-1.5 text-xs text-th-primary placeholder-th-muted focus:border-accent/50 focus:outline-none"
            @keydown.enter="createMode"
          />
        </div>
        <div class="min-w-[140px]">
          <label class="mb-1 block text-xs text-th-muted">Basé sur</label>
          <select
            v-model="newModeBaseId"
            class="w-full rounded-md border border-th-subtle bg-black/30 px-3 py-1.5 text-xs text-th-primary focus:border-accent/50 focus:outline-none"
          >
            <option v-for="m in modeStore.modes" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
        </div>
      </div>
      <p v-if="createError" class="text-xs text-rose-300">{{ createError }}</p>
      <div class="flex gap-2">
        <button
          :disabled="creating || !newModeLabel.trim()"
          class="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/[0.1] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 transition disabled:opacity-50"
          @click="createMode"
        >
          <svg v-if="creating" class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Créer
        </button>
        <button
          class="rounded-md border border-th-subtle px-3 py-1.5 text-xs text-th-muted hover:text-th-primary transition"
          @click="showCreateForm = false"
        >
          Annuler
        </button>
      </div>
    </div>

    <!-- Liste des modes -->
    <div v-if="modeStore.loading" class="text-xs text-th-muted">Chargement…</div>

    <template v-else>

    <!-- Modes généraux -->
    <div class="space-y-2">
      <p class="text-xs font-bold uppercase tracking-wider text-sky-300/70">Modes généraux</p>
      <div
        v-for="mode in builtInModes"
        :key="mode.id"
        class="rounded-lg border bg-black/20 p-4 transition-colors"
        :class="mode.id === activeId
          ? 'border-amber-400/35 bg-amber-400/5'
          : 'border-th-subtle'"
      >
        <div class="flex items-start justify-between gap-3">
          <!-- Infos mode -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <!-- Nom (inline edit pour custom) -->
              <template v-if="renamingId === mode.id">
                <input
                  v-model="renameLabel"
                  type="text"
                  class="rounded border border-accent/40 bg-black/40 px-2 py-0.5 text-sm font-semibold text-th-primary focus:outline-none"
                  @keydown.enter="saveRename(mode.id)"
                  @keydown.escape="renamingId = null"
                />
                <button
                  :disabled="renameSaving"
                  class="text-xs text-accent hover:underline disabled:opacity-50"
                  @click="saveRename(mode.id)"
                >
                  Sauver
                </button>
                <button class="text-xs text-th-muted hover:underline" @click="renamingId = null">
                  Annuler
                </button>
              </template>
              <template v-else>
                <span class="text-sm font-semibold text-th-primary">{{ mode.label }}</span>
                <button
                  v-if="!mode.builtIn"
                  class="text-[10px] text-th-muted hover:text-th-primary transition"
                  title="Renommer"
                  @click="startRename(mode)"
                >
                  ✎
                </button>
              </template>

              <!-- Badges -->
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                :class="mode.builtIn
                  ? 'bg-sky-500/15 text-sky-300'
                  : 'bg-violet-500/15 text-violet-300'"
              >
                {{ mode.builtIn ? 'Intégré' : 'Custom' }}
              </span>
              <span
                v-if="mode.id === activeId"
                class="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200"
              >
                Actif
              </span>
            </div>
            <p class="mt-1 text-[11px] text-th-muted">{{ moduleSummary(mode) }}</p>
          </div>

          <!-- Actions -->
          <div class="flex shrink-0 items-center gap-1.5 flex-wrap justify-end">
            <!-- Activer -->
            <button
              v-if="mode.id !== activeId"
              :disabled="switchingId === mode.id"
              class="rounded-md border border-amber-400/30 bg-amber-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/15 transition disabled:opacity-50"
              @click="activateMode(mode.id)"
            >
              <svg v-if="switchingId === mode.id" class="h-3 w-3 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Activer
            </button>

            <!-- Raccourci clavier -->
            <template v-if="recordingHotkeyId === mode.id">
              <span class="text-[11px] text-amber-300 animate-pulse">Appuyez sur une touche… (Echap pour annuler)</span>
            </template>
            <template v-else>
              <kbd
                v-if="mode.hotkey"
                class="inline-flex items-center gap-1 rounded border border-th-subtle bg-th-card px-2 py-0.5 text-[11px] font-mono text-accent cursor-pointer hover:border-rose-400/40 hover:text-rose-300 transition"
                title="Cliquer pour supprimer le raccourci"
                @click="clearHotkey(mode.id)"
              >{{ mode.hotkey }} ×</kbd>
              <button
                v-else
                class="rounded-md border border-th-subtle bg-white/5 px-2.5 py-1 text-[11px] text-th-muted hover:text-th-primary hover:bg-white/10 transition"
                @click="startRecordingHotkey(mode.id)"
              >
                + Raccourci
              </button>
            </template>

            <!-- Dupliquer -->
            <button
              class="rounded-md border border-th-subtle bg-white/5 px-2.5 py-1 text-[11px] text-th-muted hover:text-th-primary hover:bg-white/10 transition"
              @click="showCreateForm = true; newModeBaseId = mode.id"
              title="Créer une copie de ce mode"
            >
              Dupliquer
            </button>

            <!-- Supprimer (custom seulement) -->
            <template v-if="!mode.builtIn">
              <template v-if="confirmDeleteId === mode.id">
                <span class="text-[11px] text-rose-300">Confirmer ?</span>
                <button
                  :disabled="deletingId === mode.id"
                  class="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
                  @click="deleteMode(mode.id)"
                >
                  Supprimer
                </button>
                <button
                  class="rounded-md border border-th-subtle px-2.5 py-1 text-[11px] text-th-muted hover:text-th-primary transition"
                  @click="confirmDeleteId = null"
                >
                  Annuler
                </button>
              </template>
              <button
                v-else
                class="rounded-md border border-th-subtle bg-white/5 px-2.5 py-1 text-[11px] text-rose-400/70 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 transition"
                @click="confirmDeleteId = mode.id"
              >
                Supprimer
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Modes personnalisés -->
    <div class="space-y-2">
      <p class="text-xs font-bold uppercase tracking-wider text-violet-300/70">Modes personnalisés</p>
      <p v-if="!customModes.length" class="text-xs text-th-muted italic">Aucun mode personnalisé. Créez-en un avec le bouton ci-dessus.</p>
      <div
        v-for="mode in customModes"
        :key="mode.id"
        class="rounded-lg border bg-black/20 p-4 transition-colors"
        :class="mode.id === activeId
          ? 'border-amber-400/35 bg-amber-400/5'
          : 'border-th-subtle'"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <template v-if="renamingId === mode.id">
                <input v-model="renameLabel" type="text" class="rounded border border-accent/40 bg-black/40 px-2 py-0.5 text-sm font-semibold text-th-primary focus:outline-none" @keydown.enter="saveRename(mode.id)" @keydown.escape="renamingId = null" />
                <button :disabled="renameSaving" class="text-xs text-accent hover:underline disabled:opacity-50" @click="saveRename(mode.id)">Sauver</button>
                <button class="text-xs text-th-muted hover:underline" @click="renamingId = null">Annuler</button>
              </template>
              <template v-else>
                <span class="text-sm font-semibold text-th-primary">{{ mode.label }}</span>
                <button class="text-[10px] text-th-muted hover:text-th-primary transition" title="Renommer" @click="startRename(mode)">✎</button>
              </template>
              <span class="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-300">Custom</span>
              <span v-if="mode.id === activeId" class="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">Actif</span>
            </div>
            <p class="mt-1 text-[11px] text-th-muted">{{ moduleSummary(mode) }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1.5 flex-wrap justify-end">
            <button v-if="mode.id !== activeId" :disabled="switchingId === mode.id" class="rounded-md border border-amber-400/30 bg-amber-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/15 transition disabled:opacity-50" @click="activateMode(mode.id)">Activer</button>
            <template v-if="recordingHotkeyId === mode.id">
              <span class="text-[11px] text-amber-300 animate-pulse">Appuyez sur une touche… (Echap pour annuler)</span>
            </template>
            <template v-else>
              <kbd v-if="mode.hotkey" class="inline-flex items-center gap-1 rounded border border-th-subtle bg-th-card px-2 py-0.5 text-[11px] font-mono text-accent cursor-pointer hover:border-rose-400/40 hover:text-rose-300 transition" title="Cliquer pour supprimer le raccourci" @click="clearHotkey(mode.id)">{{ mode.hotkey }} ×</kbd>
              <button v-else class="rounded-md border border-th-subtle bg-white/5 px-2.5 py-1 text-[11px] text-th-muted hover:text-th-primary hover:bg-white/10 transition" @click="startRecordingHotkey(mode.id)">+ Raccourci</button>
            </template>
            <button class="rounded-md border border-th-subtle bg-white/5 px-2.5 py-1 text-[11px] text-th-muted hover:text-th-primary hover:bg-white/10 transition" @click="showCreateForm = true; newModeBaseId = mode.id" title="Créer une copie de ce mode">Dupliquer</button>
            <template v-if="confirmDeleteId === mode.id">
              <span class="text-[11px] text-rose-300">Confirmer ?</span>
              <button :disabled="deletingId === mode.id" class="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50" @click="deleteMode(mode.id)">Supprimer</button>
              <button class="rounded-md border border-th-subtle px-2.5 py-1 text-[11px] text-th-muted hover:text-th-primary transition" @click="confirmDeleteId = null">Annuler</button>
            </template>
            <button v-else class="rounded-md border border-th-subtle bg-white/5 px-2.5 py-1 text-[11px] text-rose-400/70 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 transition" @click="confirmDeleteId = mode.id">Supprimer</button>
          </div>
        </div>
      </div>
    </div>

    </template>

  </div>
</template>
