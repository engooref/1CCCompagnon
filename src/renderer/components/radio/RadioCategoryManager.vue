<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRadioStore } from '../../stores/radio'
import type { RadioCategory } from '@shared/radio'

const props = withDefaults(
  defineProps<{
    showInlineNewButton?: boolean
    startCreateTrigger?: number
  }>(),
  {
    showInlineNewButton: true,
    startCreateTrigger: 0,
  },
)

const radio = useRadioStore()

// ── Gestion des catégories ────────────────────────────────────────────────────
const editingCategoryId = ref<number | null>(null)
const editCategoryForm = ref({ name: '', description: '' })
const newCategoryForm = ref({ name: '', description: '' })
const showNewCategory = ref(false)
const savingCategory = ref(false)
const errorCategory = ref<string | null>(null)

watch(
  () => props.startCreateTrigger,
  () => {
    showNewCategory.value = true
    editingCategoryId.value = null
  },
)

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
    await radio.updateCategory(editingCategoryId.value, editCategoryForm.value)
    editingCategoryId.value = null
  } catch (e: any) {
    errorCategory.value = e?.message ?? 'Erreur'
  } finally {
    savingCategory.value = false
  }
}

async function deleteCategory(id: number) {
  if (!confirm('Supprimer cette catégorie ?')) return
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
</script>

<template>
  <div class="space-y-2">
    <!-- Erreur -->
    <p v-if="errorCategory" class="text-[10px] text-rose-300">{{ errorCategory }}</p>

    <!-- Catégories existantes -->
    <div
      v-for="category in radio.categories"
      :key="category.id"
      class="rounded-lg border border-th-subtle bg-black/20 overflow-hidden"
    >
      <!-- Formulaire d'édition de catégorie -->
      <div v-if="editingCategoryId === category.id" class="p-3 space-y-2 border-b border-th-subtle">
        <input
          v-model="editCategoryForm.name"
          placeholder="Nom de la catégorie"
          class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50"
        />
        <input
          v-model="editCategoryForm.description"
          placeholder="Description"
          class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50"
        />
        <div class="flex gap-2">
          <button
            @click="saveEditCategory"
            :disabled="savingCategory"
            class="text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition disabled:opacity-50"
          >
            {{ savingCategory ? 'Sauvegarde…' : 'Sauvegarder' }}
          </button>
          <button
            @click="cancelEditCategory"
            class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-th-primary transition"
          >
            Annuler
          </button>
          <button
            @click="deleteCategory(category.id)"
            :disabled="savingCategory"
            class="text-[10px] px-2 py-1 rounded border border-rose-400/30 text-rose-300 hover:bg-rose-400/10 transition disabled:opacity-50 ml-auto"
          >
            Supprimer
          </button>
        </div>
      </div>

      <!-- En-tête catégorie -->
      <div v-else class="p-2.5 flex items-center justify-between">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-th-primary">{{ category.name }}</p>
          <p v-if="category.description" class="text-[11px] text-th-muted mt-0.5">{{ category.description }}</p>
          <p v-else class="text-[11px] text-th-muted/50 mt-0.5 italic">Aucune description</p>
        </div>
        <button
          @click="startEditCategory(category)"
          class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-accent hover:border-accent/30 transition shrink-0 ml-2"
          title="Éditer la catégorie"
        >
          📝
        </button>
      </div>

      <!-- Canaux de cette catégorie -->
      <div v-if="category.channels.length" class="border-t border-th-subtle bg-black/40 p-2 space-y-1">
        <div
          v-for="channel in category.channels"
          :key="channel.id"
          class="rounded border border-th-subtle/30 bg-th-card px-2 py-1"
          :class="radio.channelState[channel.id]?.connected
            ? 'border-accent/30 bg-accent/10'
            : 'hover:border-accent/20'"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold text-th-primary truncate">{{ channel.name }}</p>
              <p class="text-[10px] text-th-muted truncate">{{ channel.description }}</p>
            </div>
            <span
              v-if="radio.channelState[channel.id]?.connected"
              class="text-[10px] text-emerald-300 font-semibold shrink-0"
            >
              ✓
            </span>
          </div>
        </div>
      </div>

      <!-- Aucun canal dans cette catégorie -->
      <div v-else class="border-t border-th-subtle bg-black/40 p-2">
        <p class="text-[10px] text-th-muted/50 italic">Aucun canal</p>
      </div>
    </div>

    <!-- Formulaire création catégorie -->
    <div v-if="showNewCategory" class="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
      <input
        v-model="newCategoryForm.name"
        placeholder="Nom de la nouvelle catégorie"
        class="w-full rounded border border-accent/30 bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50"
      />
      <input
        v-model="newCategoryForm.description"
        placeholder="Description (optionnel)"
        class="w-full rounded border border-accent/30 bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50"
      />
      <div class="flex gap-2">
        <button
          @click="createCategory"
          :disabled="!newCategoryForm.name.trim() || savingCategory"
          class="text-[10px] px-2 py-1 rounded border border-accent/50 text-accent hover:bg-accent/10 transition disabled:opacity-50"
        >
          {{ savingCategory ? 'Création…' : 'Créer' }}
        </button>
        <button
          @click="showNewCategory = false"
          class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-th-primary transition"
        >
          Annuler
        </button>
      </div>
    </div>

    <!-- Bouton nouveau catégorie -->
    <button
      v-if="props.showInlineNewButton && !showNewCategory && radio.canManageChannels"
      @click="showNewCategory = true"
      class="w-full text-[10px] px-2 py-2 rounded border border-accent/30 text-accent hover:bg-accent/10 transition"
    >
      + Nouvelle catégorie
    </button>
  </div>
</template>
