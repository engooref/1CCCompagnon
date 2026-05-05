<script setup lang="ts">
import { ref } from 'vue'
import type { OverlayMode } from '@shared/general'
import { useModeStore } from '../../stores/mode'

const modeStore = useModeStore()

// ─── Sélection ───────────────────────────────────────────────────────────────

async function selectMode(modeId: string) {
  if (modeId === modeStore.activeModeId) return
  await modeStore.switchMode(modeId)
}

// ─── Création ────────────────────────────────────────────────────────────────

const showCreate  = ref(false)
const newLabel    = ref('')
const newBaseId   = ref('')
const creating    = ref(false)

function openCreate(baseId: string) {
  newBaseId.value   = baseId
  newLabel.value    = ''
  showCreate.value  = true
  renamingId.value  = null
  confirmDeleteId.value = null
}

async function createMode() {
  const label = newLabel.value.trim()
  if (!label) return
  creating.value = true
  try {
    await modeStore.createCustomMode(label, newBaseId.value)
    showCreate.value = false
  } finally {
    creating.value = false
  }
}

// ─── Renommage ───────────────────────────────────────────────────────────────

const renamingId   = ref<string | null>(null)
const renameLabel  = ref('')
const renameSaving = ref(false)

function startRename(mode: OverlayMode) {
  renamingId.value  = mode.id
  renameLabel.value = mode.label
  showCreate.value  = false
  confirmDeleteId.value = null
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

// ─── Suppression ─────────────────────────────────────────────────────────────

const confirmDeleteId = ref<string | null>(null)
const deletingId      = ref<string | null>(null)

async function deleteMode(modeId: string) {
  deletingId.value = modeId
  try {
    await modeStore.deleteMode(modeId)
  } finally {
    deletingId.value      = null
    confirmDeleteId.value = null
  }
}
</script>

<template>
  <div class="space-y-2">

    <!-- Modes intégrés -->
    <div class="space-y-1">
      <span class="text-[10px] font-semibold uppercase tracking-wider text-sky-300/65">Par défaut</span>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="mode in modeStore.builtInModes"
          :key="mode.id"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors"
          :class="mode.id === modeStore.activeModeId
            ? 'border-amber-400/60 bg-amber-400/20 text-amber-100'
            : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'"
          @click="selectMode(mode.id)"
        >
          {{ mode.label }}
          <span
            class="text-[10px] text-slate-500 hover:text-slate-300 transition"
            title="Créer une copie"
            @click.stop="openCreate(mode.id)"
          >＋</span>
        </button>
      </div>
    </div>

    <!-- Modes personnalisés -->
    <div class="space-y-1">
      <span class="text-[10px] font-semibold uppercase tracking-wider text-violet-300/65">Personnalisés</span>
      <div class="flex flex-wrap gap-1.5">

        <template v-for="mode in modeStore.customModes" :key="mode.id">

          <!-- Renommage inline -->
          <div v-if="renamingId === mode.id" class="flex items-center gap-1">
            <input
              v-model="renameLabel"
              type="text"
              class="w-28 rounded border border-accent/40 bg-black/40 px-2 py-0.5 text-xs text-th-primary focus:outline-none"
              @keydown.enter="saveRename(mode.id)"
              @keydown.escape="renamingId = null"
            />
            <button
              :disabled="renameSaving"
              class="text-[10px] text-accent hover:underline disabled:opacity-50"
              @click="saveRename(mode.id)"
            >✓</button>
            <button class="text-[10px] text-th-muted hover:underline" @click="renamingId = null">✕</button>
          </div>

          <!-- Confirmation suppression -->
          <div v-else-if="confirmDeleteId === mode.id" class="flex items-center gap-1">
            <span class="text-[10px] text-rose-300">Supprimer « {{ mode.label }} » ?</span>
            <button
              :disabled="deletingId === mode.id"
              class="text-[10px] text-rose-400 hover:text-rose-200 disabled:opacity-50"
              @click="deleteMode(mode.id)"
            >✓</button>
            <button class="text-[10px] text-th-muted hover:underline" @click="confirmDeleteId = null">✕</button>
          </div>

          <!-- Bouton mode normal -->
          <div v-else class="group inline-flex items-center rounded-full border transition-colors"
            :class="mode.id === modeStore.activeModeId
              ? 'border-amber-400/60 bg-amber-400/20'
              : 'border-violet-400/20 bg-violet-500/5 hover:bg-violet-500/15'"
          >
            <button
              class="py-1 pl-3 text-[12px] font-semibold transition-colors"
              :class="mode.id === modeStore.activeModeId ? 'text-amber-100' : 'text-violet-300/70 hover:text-violet-200'"
              @click="selectMode(mode.id)"
            >{{ mode.label }}</button>
            <span class="flex items-center gap-0.5 pr-2 pl-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                class="text-[10px] text-slate-500 hover:text-slate-200 transition"
                title="Renommer"
                @click.stop="startRename(mode)"
              >✎</button>
              <button
                class="text-[10px] text-slate-500 hover:text-rose-300 transition"
                title="Supprimer"
                @click.stop="confirmDeleteId = mode.id; showCreate = false; renamingId = null"
              >×</button>
            </span>
          </div>

        </template>

        <!-- Bouton nouveau mode -->
        <button
          class="inline-flex shrink-0 items-center rounded-full border border-dashed border-white/15 bg-white/3 px-3 py-1 text-[11px] text-slate-500 hover:border-accent/40 hover:text-accent transition-colors"
          @click="openCreate(modeStore.activeModeId ?? 'default')"
        >+ Nouveau</button>

      </div>
    </div>

    <!-- Formulaire création -->
    <div v-if="showCreate" class="flex items-center gap-1.5 pt-1">
      <input
        v-model="newLabel"
        type="text"
        placeholder="Nom du mode…"
        class="w-32 rounded border border-accent/40 bg-black/40 px-2 py-1 text-xs text-th-primary placeholder-th-muted focus:outline-none"
        @keydown.enter="createMode"
        @keydown.escape="showCreate = false"
      />
      <button
        :disabled="creating || !newLabel.trim()"
        class="rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-accent hover:bg-accent/20 disabled:opacity-50 transition"
        @click="createMode"
      >Créer</button>
      <button
        class="text-[11px] text-th-muted hover:text-th-primary transition"
        @click="showCreate = false"
      >Annuler</button>
    </div>

  </div>
</template>
