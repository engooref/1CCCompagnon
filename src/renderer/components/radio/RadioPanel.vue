<script setup lang="ts">
import { computed, ref, nextTick, watch, type Ref } from 'vue'
import { useRadioStore } from '../../stores/radio'
import type { RadioCategory, RadioChannel } from '@shared/radio'
import { toCategoryPttTarget, toGlobalPttTarget } from '@shared/radio'
import { useConfirm } from '../../composables/useConfirm'

const radio = useRadioStore()
const { visible: confirmVisible, message: confirmMessage, confirm: askConfirm, accept: confirmAccept, cancel: confirmCancel } = useConfirm()

const managing = ref(false)

const editingId = ref<string | null>(null)
const editForm = ref({ name: '', description: '' })
const newForm = ref({ name: '', description: '' })
const showNewForm = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const creatingChannelCategoryId = ref<number | null>(null)
const newFormNameRef = ref<HTMLInputElement | null>(null)
const newCategoryNameRef = ref<HTMLInputElement | null>(null)
const confirmBtnRef = ref<HTMLButtonElement | null>(null)

watch(confirmVisible, (v) => {
  if (v) nextTick(() => confirmBtnRef.value?.focus())
})

async function focusWhenReady(elRef: Ref<HTMLInputElement | null>, timeout = 500, interval = 50) {
  const attempts = Math.max(1, Math.ceil(timeout / interval))
  for (let i = 0; i < attempts; i++) {
    await nextTick()
    const el = elRef.value
    if (el) {
      try { el.focus() } catch {}
      if (document.activeElement === el) return true
    }
    await new Promise(r => setTimeout(r, interval))
  }
  return false
}

const editingCategoryId = ref<number | null>(null)
const editCategoryForm = ref({ name: '', description: '' })
const newCategoryForm = ref({ name: '', description: '' })
const showNewCategory = ref(false)
const savingCategory = ref(false)
const errorCategory = ref<string | null>(null)

const collapsedCategories = ref<Record<number, boolean>>({})
const uncategorizedCollapsed = ref(false)

const visibleCategories = computed(() => {
  return radio.categories.filter(category => Number.isFinite(category.id))
})

const uncategorizedChannels = computed(() => {
  const categorizedChannelIds = new Set<string>()
  const uncategorizedById = new Map<string, RadioChannel>()

  for (const category of radio.categories) {
    const hasRealCategoryId = Number.isFinite(category.id)
    for (const channel of category.channels) {
      if (hasRealCategoryId) {
        categorizedChannelIds.add(channel.id)
      } else {
        uncategorizedById.set(channel.id, channel)
      }
    }
  }

  for (const channel of radio.channels) {
    if (!categorizedChannelIds.has(channel.id)) {
      uncategorizedById.set(channel.id, channel)
    }
  }

  return Array.from(uncategorizedById.values())
})

function resetManageUi() {
  showNewForm.value = false
  showNewCategory.value = false
  editingId.value = null
  editingCategoryId.value = null
  creatingChannelCategoryId.value = null
}

function toggleManaging() {
  managing.value = !managing.value
  resetManageUi()
}

function startEdit(channel: RadioChannel) {
  editingId.value = channel.id
  editForm.value = { name: channel.name, description: channel.description }
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit() {
  if (!editingId.value) return
  saving.value = true
  error.value = null
  try {
    await radio.updateChannel(editingId.value, {
      name: editForm.value.name,
      description: editForm.value.description,
    })
    editingId.value = null
  } catch (e: any) {
    error.value = e?.message ?? 'Erreur'
  } finally {
    saving.value = false
  }
}

async function deleteChannel(id: string) {
  if (!await askConfirm('Supprimer ce canal ?')) return
  saving.value = true
  error.value = null
  try {
    await radio.deleteChannel(id)
  } catch (e: any) {
    error.value = e?.message ?? 'Erreur'
  } finally {
    saving.value = false
  }
}

async function createChannel() {
  if (!newForm.value.name.trim()) return
  saving.value = true
  error.value = null
  try {
    await radio.createChannel({
      name: newForm.value.name.trim(),
      description: newForm.value.description.trim(),
      categoryId: creatingChannelCategoryId.value,
    })
    newForm.value = { name: '', description: '' }
    showNewForm.value = false
    creatingChannelCategoryId.value = null
  } catch (e: any) {
    error.value = e?.message ?? 'Erreur'
  } finally {
    saving.value = false
  }
}

function startEditCategory(category: RadioCategory) {
  editingCategoryId.value = category.id
  editCategoryForm.value = { name: category.name, description: category.description }
}

function cancelEditCategory() {
  editingCategoryId.value = null
}

async function saveEditCategory() {
  if (!editingCategoryId.value) return
  savingCategory.value = true
  errorCategory.value = null
  try {
    await radio.updateCategory(editingCategoryId.value, {
      name: editCategoryForm.value.name,
      description: editCategoryForm.value.description,
    })
    editingCategoryId.value = null
  } catch (e: any) {
    errorCategory.value = e?.message ?? 'Erreur'
  } finally {
    savingCategory.value = false
  }
}

async function deleteCategory(id: number) {
  if (!await askConfirm('Supprimer cette catégorie ?')) return
  savingCategory.value = true
  errorCategory.value = null
  try {
    await radio.deleteCategory(id)
  } catch (e: any) {
    errorCategory.value = e?.message ?? 'Erreur'
  } finally {
    savingCategory.value = false
  }
}

async function createCategory() {
  if (!newCategoryForm.value.name.trim()) return
  savingCategory.value = true
  errorCategory.value = null
  try {
    await radio.createCategory({
      name: newCategoryForm.value.name.trim(),
      description: newCategoryForm.value.description.trim(),
    })
    newCategoryForm.value = { name: '', description: '' }
    showNewCategory.value = false
  } catch (e: any) {
    errorCategory.value = e?.message ?? 'Erreur'
  } finally {
    savingCategory.value = false
  }
}

async function openNewChannelForm(categoryId: number | null) {
  showNewCategory.value = false
  showNewForm.value = true
  creatingChannelCategoryId.value = categoryId
  if (categoryId !== null && isCategoryCollapsed(categoryId)) {
    toggleCategory(categoryId)
  }
  // Focus the name input of the newly shown form (robust: retry until available)
  await focusWhenReady(newFormNameRef, 800, 40)
}

async function openNewCategoryForm() {
  showNewCategory.value = true
  showNewForm.value = false
  creatingChannelCategoryId.value = null
  await focusWhenReady(newCategoryNameRef, 800, 40)
}

function isCategoryCollapsed(categoryId: number): boolean {
  return Boolean(collapsedCategories.value[categoryId])
}

function toggleCategory(categoryId: number) {
  collapsedCategories.value = {
    ...collapsedCategories.value,
    [categoryId]: !collapsedCategories.value[categoryId],
  }
}

function toggleUncategorized() {
  uncategorizedCollapsed.value = !uncategorizedCollapsed.value
}

function findChannelById(channelId: string): RadioChannel | null {
  const fromChannels = radio.channels.find(ch => ch.id === channelId)
  if (fromChannels) return fromChannels

  for (const category of radio.categories) {
    const fromCategory = category.channels.find(ch => ch.id === channelId)
    if (fromCategory) return fromCategory
  }

  return null
}

function findChannelCategoryId(channelId: string): number | null {
  for (const category of radio.categories) {
    if (category.channels.some(ch => ch.id === channelId)) {
      return category.id
    }
  }
  return null
}

async function onChannelDblClick(channelId: string) {
  if (managing.value) return
  if (radio.channelState[channelId]?.connecting) return

  const cs = radio.channelState[channelId]

  if (cs?.connected && !cs.whisperOnly) {
    await radio.leaveChannel(channelId)
    for (const cid of [...radio.connectedChannels]) {
      if (radio.channelState[cid]?.whisperOnly) {
        await radio.leaveChannel(cid)
      }
    }
  } else {
    for (const cid of radio.connectedChannels) {
      if (radio.channelState[cid]?.connected && !radio.channelState[cid]?.whisperOnly) {
        await radio.leaveChannel(cid)
      }
    }

    if (cs?.connected && cs.whisperOnly) {
      await radio.leaveChannel(channelId)
    }

    radio.joinChannel(channelId, false)
  }
}

const recordingTarget = ref<string | null>(null)

function startPttRecord(targetId: string) {
  recordingTarget.value = targetId
  const handler = async (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      recordingTarget.value = null
      window.removeEventListener('keydown', handler, true)
      return
    }
    const modOnly = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']
    if (modOnly.includes(e.key)) return
    const code = (e as any).keyCode ?? (e as any).which ?? null
    if (!code) return
    window.removeEventListener('keydown', handler, true)
    recordingTarget.value = null
    error.value = null
    try {
      await radio.setPttBinding(targetId, code, e.key.length === 1 ? e.key.toUpperCase() : e.key)
    } catch (err: any) {
      error.value = err?.message ?? 'Touche déjà assignée'
    }
  }
  window.addEventListener('keydown', handler, true)
}

function startCategoryPttRecord(categoryId: number) {
  startPttRecord(toCategoryPttTarget(categoryId))
}


function setNewFormNameRef(el: any, categoryId: number | null) {
  // Only assign the input element if the current "creating" category matches.
  // `creatingChannelCategoryId` is a ref so compare its `.value`.
  if (creatingChannelCategoryId.value === categoryId) {
    if (el && typeof el.focus === 'function') newFormNameRef.value = el as HTMLInputElement
    else newFormNameRef.value = null
  }
}

</script>

<template>
  <div class="space-y-3 pr-1">
    <div class="flex items-center justify-between">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted">Canaux disponibles</p>
      <button
        v-if="radio.canManageChannels"
        @click="toggleManaging"
        class="text-[10px] px-2 py-0.5 rounded border transition"
        :class="managing
          ? 'border-accent/40 text-accent bg-accent/10'
          : 'border-th-subtle text-th-muted hover:text-accent hover:border-accent/30'"
      >
        {{ managing ? 'Terminer' : 'Gérer' }}
      </button>
    </div>

    <div v-if="radio.connected" class="flex items-center gap-2">
      <button
        @click="radio.leaveAll()"
        class="flex-1 flex items-center justify-center gap-1.5 rounded border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-400/20 transition"
        title="Se déconnecter de tous les canaux"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/>
        </svg>
        Déconnecter
      </button>
      <button
        @click="radio.toggleMutedIncoming()"
        class="flex items-center justify-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold transition"
        :class="radio.mutedIncoming
          ? 'border-amber-400/40 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
          : 'border-th-subtle text-th-muted hover:text-accent hover:border-accent/30'"
        :title="radio.mutedIncoming ? 'Réactiver les sons entrants' : 'Couper les sons entrants'"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path v-if="!radio.mutedIncoming" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M9 9H5a1 1 0 00-1 1v4a1 1 0 001 1h4l5 5V4L9 9z"/>
          <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
        </svg>
        {{ radio.mutedIncoming ? 'Son coupé' : 'Son' }}
      </button>
    </div>

    <!-- Global PTT binding -->
    <div class="rounded-lg border border-th-subtle/50 bg-black/30 overflow-hidden">
      <div class="px-2.5 py-1.5 flex items-start gap-2 bg-th-card/40 border-b border-th-subtle/30">
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-th-primary">PTT global</p>
          <p class="text-[10px] text-th-muted/70">Transmet sur tous les canaux en mode murmure</p>

          <div class="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <template v-if="recordingTarget === toGlobalPttTarget()">
              <span class="text-[10px] text-amber-300 animate-pulse">Touche globale… (Esc annule)</span>
            </template>
            <template v-else>
              <kbd v-if="radio.pttBinding(toGlobalPttTarget())" class="inline-flex items-center rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-accent">
                {{ radio.pttBinding(toGlobalPttTarget())!.key }}
              </kbd>
              <button @click="startPttRecord(toGlobalPttTarget())" class="text-[10px] text-th-muted hover:text-accent transition px-1.5 py-0.5 rounded border border-th-subtle/50 hover:border-accent/30">
                {{ radio.pttBinding(toGlobalPttTarget()) ? 'Changer PTT global' : '+ PTT global' }}
              </button>
              <button v-if="radio.pttBinding(toGlobalPttTarget())" @click="radio.removePttBinding(toGlobalPttTarget())" class="text-[10px] text-th-muted/50 hover:text-rose-300 transition">
                ✕
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <p v-if="error" class="text-[10px] text-rose-300">{{ error }}</p>
    <p v-if="errorCategory" class="text-[10px] text-rose-300">{{ errorCategory }}</p>

    <div
      v-for="category in visibleCategories"
      :key="category.id"
      class="rounded-lg border border-th-subtle/50 bg-black/30 overflow-hidden"
      
    >
      <div class="px-2.5 py-1.5 flex items-start gap-2 bg-th-card/40 border-b border-th-subtle/30">
        <button
          class="mt-0.5 text-th-muted hover:text-accent transition"
          :title="isCategoryCollapsed(category.id) ? 'Déplier' : 'Replier'"
          @click="toggleCategory(category.id)"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" :class="isCategoryCollapsed(category.id) ? '' : 'rotate-90'">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
          </svg>
        </button>

        <div class="flex-1 min-w-0">
          <template v-if="managing && editingCategoryId === category.id">
            <div class="space-y-2">
              <input v-model="editCategoryForm.name" @keydown.enter.prevent="saveEditCategory" placeholder="Nom" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
              <input v-model="editCategoryForm.description" @keydown.enter.prevent="saveEditCategory" placeholder="Description" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
              <div class="flex gap-2">
                <button @click="saveEditCategory" :disabled="savingCategory" class="text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition disabled:opacity-50">
                  {{ savingCategory ? 'Sauvegarde…' : 'Sauvegarder' }}
                </button>
                <button @click="cancelEditCategory" class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-th-primary transition">
                  Annuler
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <p class="text-xs font-bold text-th-primary">{{ category.name }}</p>
            <p v-if="category.description" class="text-[10px] text-th-muted/70">{{ category.description }}</p>

            <div class="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <template v-if="recordingTarget === toCategoryPttTarget(category.id)">
                <span class="text-[10px] text-amber-300 animate-pulse">Touche catégorie… (Esc annule)</span>
              </template>
              <template v-else>
                <kbd v-if="radio.pttBindingForCategory(category.id)" class="inline-flex items-center rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-accent">
                  {{ radio.pttBindingForCategory(category.id)!.key }}
                </kbd>
                <button @click="startCategoryPttRecord(category.id)" class="text-[10px] text-th-muted hover:text-accent transition px-1.5 py-0.5 rounded border border-th-subtle/50 hover:border-accent/30">
                  {{ radio.pttBindingForCategory(category.id) ? 'Changer PTT catégorie' : '+ PTT catégorie' }}
                </button>
                <button v-if="radio.pttBindingForCategory(category.id)" @click="radio.removePttBinding(toCategoryPttTarget(category.id))" class="text-[10px] text-th-muted/50 hover:text-rose-300 transition">
                  ✕
                </button>
              </template>
            </div>
          </template>
        </div>

        <div v-if="managing && editingCategoryId !== category.id" class="flex items-center gap-1.5">
          <button @click="openNewChannelForm(category.id)" class="px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-accent hover:border-accent/30 transition text-[10px]" title="Nouveau channel">
            + Channel
          </button>
          <button @click="startEditCategory(category)" class="p-1.5 rounded border border-th-subtle text-th-muted hover:text-accent hover:border-accent/30 transition" title="Modifier catégorie">
            ✏️
          </button>
          <button @click="deleteCategory(category.id)" class="p-1.5 rounded border border-rose-400/30 text-rose-300 hover:bg-rose-400/10 transition" title="Supprimer catégorie">
            🗑️
          </button>
        </div>
      </div>

      <div v-show="!isCategoryCollapsed(category.id)" class="space-y-1 p-1.5">
        <div v-if="managing && showNewForm && creatingChannelCategoryId === category.id" class="rounded border border-accent/30 bg-accent/[0.05] p-3 space-y-2 mb-2">
          <p class="text-[10px] font-bold uppercase tracking-wider text-accent">Nouveau channel</p>
          <input v-model="newForm.name" @keydown.enter.prevent="createChannel" :ref="el => setNewFormNameRef(el, category.id)" placeholder="Nom du channel" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
          <input v-model="newForm.description" @keydown.enter.prevent="createChannel" placeholder="Description" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
          <div class="flex gap-2">
            <button @click="createChannel" :disabled="saving || !newForm.name.trim()" class="text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition disabled:opacity-50">
              {{ saving ? 'Création…' : 'Créer' }}
            </button>
            <button @click="showNewForm = false; creatingChannelCategoryId = null" class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-th-primary transition">
              Annuler
            </button>
          </div>
        </div>

        <div
          v-for="channel in category.channels"
          :key="channel.id"
          class="rounded border transition-colors select-none"
          :class="[radio.channelState[channel.id]?.connected && !radio.channelState[channel.id]?.whisperOnly
            ? 'border-accent/50 bg-accent/10'
            : radio.channelState[channel.id]?.connected && radio.channelState[channel.id]?.whisperOnly
              ? 'border-violet-500/30 bg-violet-500/[0.05]'
              : 'border-th-subtle/40 bg-black/20 hover:border-accent/10',
            managing ? '' : 'cursor-pointer']"
          @dblclick="onChannelDblClick(channel.id)"
        >
          <div v-if="managing && editingId === channel.id" class="p-2 space-y-2">
            <input v-model="editForm.name" @keydown.enter.prevent="saveEdit" placeholder="Nom" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
            <input v-model="editForm.description" @keydown.enter.prevent="saveEdit" placeholder="Description" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
            <div class="flex gap-2">
              <button @click="saveEdit" :disabled="saving" class="text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition disabled:opacity-50">
                {{ saving ? 'Sauvegarde…' : 'Sauvegarder' }}
              </button>
              <button @click="cancelEdit" class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-th-primary transition">
                Annuler
              </button>
            </div>
          </div>

          <div v-else class="flex items-start justify-between gap-2 p-2">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="text-sm font-semibold text-th-primary truncate">{{ channel.name }}</p>
                <span v-if="radio.activeSpeakers.some(s => s.channel === channel.id)" class="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-semibold shrink-0">
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
                <span v-if="radio.channelState[channel.id]?.transmitting" class="inline-flex items-center gap-1 text-[10px] text-rose-300 font-semibold shrink-0">
                  <span class="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                  TX
                </span>
              </div>
              <p class="text-[11px] text-th-muted mt-0.5 truncate">{{ channel.description }}</p>
              <div class="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <template v-if="recordingTarget === channel.id">
                  <span class="text-[10px] text-amber-300 animate-pulse">Touche… (Esc annule)</span>
                </template>
                <template v-else>
                  <kbd v-if="radio.pttBinding(channel.id)" class="inline-flex items-center rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-accent">
                    {{ radio.pttBinding(channel.id)!.key }}
                  </kbd>
                  <button @click="startPttRecord(channel.id)" class="text-[10px] text-th-muted hover:text-accent transition px-1.5 py-0.5 rounded border border-th-subtle/50 hover:border-accent/30">
                    {{ radio.pttBinding(channel.id) ? 'Changer' : '+ PTT' }}
                  </button>
                  <button v-if="radio.pttBinding(channel.id)" @click="radio.removePttBinding(channel.id)" class="text-[10px] text-th-muted/50 hover:text-rose-300 transition">
                    ✕
                  </button>
                </template>
              </div>
            </div>
            <div v-if="managing" class="flex items-center gap-1.5 shrink-0">
              <button @click.stop="startEdit(channel)" class="p-1.5 rounded border border-th-subtle text-th-muted hover:text-accent hover:border-accent/30 transition">✏️</button>
              <button @click.stop="deleteChannel(channel.id)" class="p-1.5 rounded border border-rose-400/30 text-rose-300 hover:bg-rose-400/10 transition">🗑️</button>
            </div>
          </div>
        </div>

        <div
          v-if="!category.channels.length"
          class="rounded border px-2 py-2 text-[10px] text-center"
          :class="managing
            ? 'border-dashed border-th-subtle/40 text-th-muted/70'
            : 'border-th-subtle/30 bg-black/10 text-th-muted/60'"
        >
          {{ managing ? 'Ajouter un channel ici' : 'Aucun channel dans cette catégorie' }}
        </div>
      </div>
    </div>

    <div
      class="rounded-lg border border-th-subtle/50 bg-black/30 overflow-hidden"
    >
      <div class="px-2.5 py-1.5 flex items-start gap-2 bg-th-card/40 border-b border-th-subtle/30">
        <button
          class="mt-0.5 text-th-muted hover:text-accent transition"
          :title="uncategorizedCollapsed ? 'Déplier' : 'Replier'"
          @click="toggleUncategorized"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" :class="uncategorizedCollapsed ? '' : 'rotate-90'">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
          </svg>
        </button>

        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-th-primary">Sans catégorie</p>
          <p class="text-[10px] text-th-muted/70">Channels non classés</p>
        </div>

        <button
          v-if="managing"
          @click="openNewChannelForm(null)"
          class="px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-accent hover:border-accent/30 transition text-[10px]"
          title="Nouveau channel sans catégorie"
        >
          + Channel
        </button>
      </div>

      <div v-show="!uncategorizedCollapsed" class="space-y-1 p-1.5">
        <div v-if="managing && showNewForm && creatingChannelCategoryId === null" class="rounded border border-accent/30 bg-accent/[0.05] p-3 space-y-2 mb-2">
          <p class="text-[10px] font-bold uppercase tracking-wider text-accent">Nouveau channel</p>
          <input v-model="newForm.name" @keydown.enter.prevent="createChannel" :ref="el => setNewFormNameRef(el, null)" placeholder="Nom du channel" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
          <input v-model="newForm.description" @keydown.enter.prevent="createChannel" placeholder="Description" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
          <div class="flex gap-2">
            <button @click="createChannel" :disabled="saving || !newForm.name.trim()" class="text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition disabled:opacity-50">
              {{ saving ? 'Création…' : 'Créer' }}
            </button>
            <button @click="showNewForm = false; creatingChannelCategoryId = null" class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-th-primary transition">
              Annuler
            </button>
          </div>
        </div>

        <div
          v-for="channel in uncategorizedChannels"
          :key="channel.id"
          class="rounded-lg border transition-colors select-none"
          :class="[radio.channelState[channel.id]?.connected && !radio.channelState[channel.id]?.whisperOnly
            ? 'border-accent/50 bg-accent/10'
            : radio.channelState[channel.id]?.connected && radio.channelState[channel.id]?.whisperOnly
              ? 'border-violet-500/30 bg-violet-500/[0.05]'
              : 'border-th-subtle bg-black/20 hover:border-accent/10',
            managing ? '' : 'cursor-pointer']"
          @dblclick="onChannelDblClick(channel.id)"
        >
          <div v-if="managing && editingId === channel.id" class="p-3 space-y-2">
            <input v-model="editForm.name" @keydown.enter.prevent="saveEdit" placeholder="Nom" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
            <input v-model="editForm.description" @keydown.enter.prevent="saveEdit" placeholder="Description" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
            <div class="flex gap-2">
              <button @click="saveEdit" :disabled="saving" class="text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition disabled:opacity-50">
                {{ saving ? 'Sauvegarde…' : 'Sauvegarder' }}
              </button>
              <button @click="cancelEdit" class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-th-primary transition">
                Annuler
              </button>
            </div>
          </div>

          <div v-else class="flex items-start justify-between gap-3 p-2.5">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="text-sm font-semibold text-th-primary truncate">{{ channel.name }}</p>
                <span v-if="radio.activeSpeakers.some(s => s.channel === channel.id)" class="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-semibold shrink-0">
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
                <span v-if="radio.channelState[channel.id]?.transmitting" class="inline-flex items-center gap-1 text-[10px] text-rose-300 font-semibold shrink-0">
                  <span class="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                  TX
                </span>
                <span v-if="radio.participantsFor(channel.id).length" class="inline-flex items-center gap-0.5 text-[10px] text-th-muted shrink-0">
                  <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-5.477-3.662M9 20H4v-2a4 4 0 015.477-3.662M15 8a4 4 0 11-8 0 4 4 0 018 0zm6 4a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  {{ radio.participantsFor(channel.id).length }}
                </span>
              </div>

              <p class="text-[11px] text-th-muted mt-0.5 truncate">{{ channel.description }}</p>

              <div class="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <template v-if="recordingTarget === channel.id">
                  <span class="text-[10px] text-amber-300 animate-pulse">Touche… (Esc annule)</span>
                </template>
                <template v-else>
                  <kbd v-if="radio.pttBinding(channel.id)" class="inline-flex items-center rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-accent">
                    {{ radio.pttBinding(channel.id)!.key }}
                  </kbd>
                  <button @click="startPttRecord(channel.id)" class="text-[10px] text-th-muted hover:text-accent transition px-1.5 py-0.5 rounded border border-th-subtle/50 hover:border-accent/30">
                    {{ radio.pttBinding(channel.id) ? 'Changer' : '+ PTT' }}
                  </button>
                  <button v-if="radio.pttBinding(channel.id)" @click="radio.removePttBinding(channel.id)" class="text-[10px] text-th-muted/50 hover:text-rose-300 transition">
                    ✕
                  </button>
                </template>
              </div>
            </div>

            <div v-if="managing" class="flex items-center gap-1.5 shrink-0">
              <button @click.stop="startEdit(channel)" class="p-1.5 rounded border border-th-subtle text-th-muted hover:text-accent hover:border-accent/30 transition">✏️</button>
              <button @click.stop="deleteChannel(channel.id)" :disabled="saving || radio.participantsFor(channel.id).length > 0" class="p-1.5 rounded border border-th-subtle text-th-muted hover:text-rose-300 hover:border-rose-400/30 transition disabled:opacity-40">🗑️</button>
            </div>
          </div>
        </div>

        <div
          v-if="!uncategorizedChannels.length"
          class="rounded border px-2 py-2 text-[10px] text-center"
          :class="managing
            ? 'border-dashed border-th-subtle/40 text-th-muted/70'
            : 'border-th-subtle/30 bg-black/10 text-th-muted/60'"
        >
          {{ managing ? 'Utilisez Gérer pour déplacer un channel' : 'Aucun channel sans catégorie' }}
        </div>
      </div>
    </div>

    <div v-if="managing && showNewCategory" class="rounded-lg border border-accent/30 bg-accent/[0.05] p-3 space-y-2">
      <p class="text-[10px] font-bold uppercase tracking-wider text-accent">Nouvelle catégorie</p>
      <input ref="newCategoryNameRef" v-model="newCategoryForm.name" @keydown.enter.prevent="createCategory" placeholder="Nom de la catégorie" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
      <input v-model="newCategoryForm.description" @keydown.enter.prevent="createCategory" placeholder="Description" class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50" />
      <div class="flex gap-2">
        <button @click="createCategory" :disabled="savingCategory || !newCategoryForm.name.trim()" class="text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition disabled:opacity-50">
          {{ savingCategory ? 'Création…' : 'Créer' }}
        </button>
        <button @click="showNewCategory = false" class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-th-primary transition">
          Annuler
        </button>
      </div>
    </div>

    <div v-if="managing" class="space-y-2">
      <button
        @click="openNewCategoryForm()"
        class="w-full rounded-lg border border-dashed border-th-subtle/50 py-3 text-[11px] text-th-muted hover:text-accent hover:border-accent/30 transition flex items-center justify-center gap-1.5"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Nouvelle catégorie
      </button>
    </div>

    <!-- Confirm modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="confirmVisible"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          @click.self="confirmCancel"
        >
          <div class="w-[340px] rounded-xl border border-th-subtle/50 bg-th-base shadow-2xl shadow-black/80 p-5 space-y-4">
            <p class="text-sm text-th-primary">{{ confirmMessage }}</p>
            <div class="flex justify-end gap-2">
              <button
                @click="confirmCancel"
                class="px-3 py-1.5 rounded-md border border-th-subtle text-xs text-th-muted hover:text-th-primary transition"
              >
                Annuler
              </button>
              <button
                ref="confirmBtnRef"
                @click="confirmAccept"
                class="px-3 py-1.5 rounded-md border border-rose-400/40 bg-rose-400/10 text-xs font-semibold text-rose-300 hover:bg-rose-400/20 transition"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
</style>
