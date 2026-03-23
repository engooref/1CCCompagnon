<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'
import { logger } from '../services/logger'
import { useMercure } from '../composables/useMercure'
import { url } from 'inspector'

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryLocation {
  id: number
  name: string
  systemName?: string
}

interface InventoryEntry {
  id: number
  name: string
  section: string
  categoryName: string
  quantity: number
  screenshot?: string
  location?: InventoryLocation | null
}

interface SearchResult {
  externalId: string
  name: string
  section: string
  categoryName: string
  screenshot?: string
}

interface StackLine {
  qty: number
  locationQ: string
  locationResults: InventoryLocation[]
  locationSearching: boolean
  selectedLocation: InventoryLocation | null
}

// ─── State ────────────────────────────────────────────────────────────────────

const app = useAppStore()
const { connect: connectMercure } = useMercure()

const items     = ref<InventoryEntry[]>([])
const loading   = ref(false)
const error     = ref<string | null>(null)

const q              = ref('')
const filterSection  = ref('')
const groupBy        = ref<'item' | 'location'>('item')

// Edit row
const editRow = ref<{
  id: number
  qty: number
  locationQ: string
  locationResults: InventoryLocation[]
  locationSearching: boolean
  selectedLocation: InventoryLocation | null
} | null>(null)

// Add modal
const addModal = reactive({
  open: false,
  q: '',
  results: [] as SearchResult[],
  searching: false,
  selected: null as SearchResult | null,
  stacks: [] as StackLine[],
  saving: false,
  status: '',
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urls = computed(() => app.settings ? createOverlayUrls(app.settings) : null)

function authHeaders() {
  return { Authorization: `Bearer ${app.bearerToken}` }
}

const totalQuantity = computed(() => items.value.reduce((s, e) => s + e.quantity, 0))

const sections = computed(() => [...new Set(items.value.map(i => i.section))].sort())

const filteredItems = computed(() => {
  let list = items.value
  if (q.value) {
    const search = q.value.toLowerCase()
    list = list.filter(i =>
      i.name.toLowerCase().includes(search) ||
      i.section.toLowerCase().includes(search) ||
      i.categoryName.toLowerCase().includes(search) ||
      i.location?.name?.toLowerCase().includes(search)
    )
  }
  if (filterSection.value && groupBy.value === 'item') {
    list = list.filter(i => i.section === filterSection.value)
  }
  return list
})

// Grouped by section → category → itemName
const grouped = computed(() => {
  const map: Record<string, Record<string, Record<string, InventoryEntry[]>>> = {}
  for (const entry of filteredItems.value) {
    const s = entry.section || 'Autre'
    const c = entry.categoryName || 'Non catégorisé'
    const n = entry.name
    if (!map[s]) map[s] = {}
    if (!map[s][c]) map[s][c] = {}
    if (!map[s][c][n]) map[s][c][n] = []
    map[s][c][n].push(entry)
  }
  return map
})

// Grouped by location
const groupedByLocation = computed(() => {
  const map: Record<string, InventoryEntry[]> = {}
  for (const entry of filteredItems.value) {
    const loc = entry.location?.name || 'Localisation inconnue'
    if (!map[loc]) map[loc] = []
    map[loc].push(entry)
  }
  return map
})

// ─── API — Fetch ──────────────────────────────────────────────────────────────

async function fetchAll(force = false) {
  if (!app.bearerToken || !urls.value) return
  loading.value = true
  error.value = null
  try {
    const { data } = await http.get(urls.value.inventoryIndex, { headers: authHeaders() })
    const raw = data?.data ?? data
    items.value = (Array.isArray(raw) ? raw : []).filter(Boolean) as InventoryEntry[]
  } catch (e: any) {
    logger.error('[Inventory] fetch error', e?.response?.data ?? e?.message)
    error.value = e?.response?.data?.message ?? e?.message ?? 'Erreur de chargement'
    items.value = []
  } finally {
    loading.value = false
  }
}

// ─── API — Search items catalog ───────────────────────────────────────────────

async function searchItems() {
  if (!urls.value || addModal.q.length < 2) { addModal.results = []; return }
  addModal.searching = true
  try {
    const { data } = await http.get(urls.value.inventorySearch, { params: { q: addModal.q }, headers: authHeaders() })
    addModal.results = (data?.data ?? data ?? []) as SearchResult[]
  } catch { addModal.results = [] }
  finally { addModal.searching = false }
}

// ─── API — Search POI ─────────────────────────────────────────────────────────

async function searchPoi(query: string): Promise<InventoryLocation[]> {
  if (!urls.value || query.length < 2) return []
  try {
    const { data } = await http.get(urls.value.poiSearch, { params: { q: query }, headers: authHeaders() })
    return (data?.data ?? data ?? []) as InventoryLocation[]
  } catch { return [] }
}

async function searchPoiEdit() {
  if (!editRow.value) return
  editRow.value.locationSearching = true
  editRow.value.locationResults = await searchPoi(editRow.value.locationQ)
  editRow.value.locationSearching = false
}

async function searchPoiStack(i: number) {
  const stack = addModal.stacks[i]
  if (!stack) return
  stack.locationSearching = true
  stack.locationResults = await searchPoi(stack.locationQ)
  stack.locationSearching = false
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

function startEdit(entry: InventoryEntry) {
  editRow.value = {
    id: entry.id,
    qty: entry.quantity,
    locationQ: '',
    locationResults: [],
    locationSearching: false,
    selectedLocation: entry.location ?? null,
  }
}

function cancelEdit() {
  editRow.value = null
}

async function saveEdit() {
  if (!editRow.value || !urls.value) return
  const { id, qty, selectedLocation } = editRow.value
  if (qty <= 0) { await removeEntryById(id); return }
  try {
    await http.put(urls.value.inventoryShow(id), {
      quantity: qty,
      poiId: selectedLocation?.id ?? null,
    }, { headers: authHeaders() })
    await fetchAll(true)
    editRow.value = null
  } catch (e: any) {
    logger.error('[Inventory] save error', e?.response?.data ?? e?.message)
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function removeEntry(entry: InventoryEntry) {
  if (!confirm(`Supprimer « ${entry.name} » ?`)) return
  await removeEntryById(entry.id)
}

async function removeEntryById(id: number) {
  if (!urls.value) return
  try {
    await http.delete(urls.value.inventoryShow(id), { headers: authHeaders() })
    items.value = items.value.filter(i => i.id !== id)
    if (editRow.value?.id === id) editRow.value = null
  } catch (e: any) {
    logger.error('[Inventory] delete error', e?.response?.data ?? e?.message)
    await fetchAll(true)
  }
}

// ─── Add modal ────────────────────────────────────────────────────────────────

function addStack() {
  addModal.stacks.push({ qty: 1, locationQ: '', locationResults: [], locationSearching: false, selectedLocation: null })
}

function removeStack(i: number) {
  addModal.stacks.splice(i, 1)
}

function selectPoiForStack(i: number, poi: InventoryLocation) {
  const stack = addModal.stacks[i]
  if (!stack) return
  stack.selectedLocation = poi
  stack.locationQ = ''
  stack.locationResults = []
}

function clearPoiForStack(i: number) {
  const stack = addModal.stacks[i]
  if (!stack) return
  stack.selectedLocation = null
  stack.locationQ = ''
  stack.locationResults = []
}

function resetAddModal() {
  addModal.open = false
  addModal.q = ''
  addModal.results = []
  addModal.searching = false
  addModal.selected = null
  addModal.stacks = []
  addModal.saving = false
  addModal.status = ''
}

async function confirmAdd() {
  if (!urls.value || !addModal.selected || !addModal.stacks.length) return
  addModal.saving = true
  addModal.status = ''
  try {
    for (const stack of addModal.stacks) {
      await http.post(urls.value.inventoryIndex, {
        externalId: addModal.selected.externalId,
        name: addModal.selected.name,
        section: addModal.selected.section,
        categoryName: addModal.selected.categoryName,
        screenshot: addModal.selected.screenshot ?? null,
        quantity: stack.qty,
        poiId: stack.selectedLocation?.id ?? null,
      }, { headers: authHeaders() })
    }
    addModal.status = '✅ Ajouté avec succès'
    await fetchAll(true)
    setTimeout(resetAddModal, 600)
  } catch (e: any) {
    addModal.status = '⚠ ' + (e?.response?.data?.message ?? e?.message ?? 'Erreur')
  } finally {
    addModal.saving = false
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  if (!app.status.authReady) return
  fetchAll()
  console.log('[Inventory] mounted, connecting Mercure…');
  console.log(urls.value?.inventoryMercureInfo);
  if (urls.value?.inventoryMercureInfo) {
    connectMercure(
      urls.value.inventoryMercureInfo,
      `Bearer ${app.bearerToken}`,
      (msg: any) => {
        if (msg?.action === 'upsert' && msg.item) {
          const idx = items.value.findIndex(i => i.id === msg.item.id)
          if (idx >= 0) items.value[idx] = msg.item
          else items.value.push(msg.item)
        } else if (msg?.action === 'delete' && msg.id) {
          items.value = items.value.filter(i => i.id !== msg.id)
          if (editRow.value?.id === msg.id) editRow.value = null
        } else {
          fetchAll()
        }
      },
    )
  }
})
</script>

<template>
  <section class="h-full flex flex-col gap-4">

    <!-- Not authenticated -->
    <div
      v-if="!app.status.authReady"
      class="flex flex-1 items-center justify-center text-th-muted text-sm"
    >
      Connexion requise pour accéder à l'inventaire.
    </div>

    <template v-else>

      <!-- ── Header bar ─────────────────────────────────────────────────── -->
      <div class="shrink-0 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <div class="h-7 w-7 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
          </div>
          <span class="text-xs font-semibold uppercase tracking-widest text-th-secondary">
            Inventaire
            <span v-if="items.length" class="ml-1 font-normal text-th-muted">
              ({{ items.length }} · {{ totalQuantity }} unités)
            </span>
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="fetchAll(true)"
            :disabled="loading"
            class="flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent/70 hover:bg-accent/10 hover:text-accent transition disabled:opacity-40"
          >
            <svg class="w-3 h-3" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Actualiser
          </button>

          <button
            @click="addModal.open = true; if (!addModal.stacks.length) addStack()"
            class="flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-400/8 px-2.5 py-1 text-xs font-medium text-emerald-300/80 hover:bg-emerald-400/12 hover:text-emerald-200 transition"
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Ajouter
          </button>
        </div>
      </div>

      <!-- ── Toolbar: filter / search / group toggle ───────────────────── -->
      <div class="shrink-0 flex flex-wrap items-center gap-2">
        <input
          v-model="q"
          type="text"
          placeholder="Filtrer…"
          class="px-2.5 py-1 rounded-md bg-black/20 border border-accent/15 text-xs text-th-primary placeholder-th-muted focus:outline-none focus:ring-1 focus:ring-accent/40 w-40"
        />

        <!-- Section filters -->
        <div v-if="sections.length > 1 && groupBy === 'item'" class="flex flex-wrap gap-1">
          <button
            @click="filterSection = ''"
            :class="filterSection === ''
              ? 'bg-accent/15 text-accent border-accent/30'
              : 'bg-black/15 text-th-muted border-accent/10 hover:bg-black/25'"
            class="px-2 py-0.5 rounded-md text-xs font-medium border transition"
          >Tous</button>
          <button
            v-for="s in sections" :key="s"
            @click="filterSection = s"
            :class="filterSection === s
              ? 'bg-accent/15 text-accent border-accent/30'
              : 'bg-black/15 text-th-muted border-accent/10 hover:bg-black/25'"
            class="px-2 py-0.5 rounded-md text-xs font-medium border transition"
          >{{ s }}</button>
        </div>

        <div class="ml-auto flex rounded-md overflow-hidden border border-accent/15">
          <button
            @click="groupBy = 'item'"
            :class="groupBy === 'item' ? 'bg-accent/15 text-accent' : 'bg-black/15 text-th-muted hover:text-th-secondary'"
            class="px-2.5 py-1 text-xs font-medium transition"
          >📦 Item</button>
          <button
            @click="groupBy = 'location'"
            :class="groupBy === 'location' ? 'bg-amber-400/15 text-amber-300' : 'bg-black/15 text-th-muted hover:text-th-secondary'"
            class="px-2.5 py-1 text-xs font-medium border-l border-accent/15 transition"
          >📍 Lieu</button>
        </div>
      </div>

      <!-- ── Scrollable content ────────────────────────────────────────── -->
      <div class="flex-1 min-h-0 overflow-y-auto">

        <!-- Loading -->
        <div v-if="loading && !items.length" class="rounded-lg border border-accent/10 bg-black/20 p-4 text-sm text-th-muted">
          Chargement de l'inventaire…
        </div>

        <!-- Error -->
        <div v-else-if="error" class="rounded-lg border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-300">
          <span class="font-semibold">Erreur :</span> {{ error }}
        </div>

        <!-- Empty -->
        <div
          v-else-if="!items.length"
          class="rounded-lg border border-dashed border-accent/15 bg-black/10 p-6 text-center text-sm text-th-muted"
        >
          <div class="text-3xl mb-2 opacity-40">📭</div>
          Inventaire vide — cliquez sur « Ajouter » pour commencer.
        </div>

        <!-- No filter results -->
        <div
          v-else-if="filteredItems.length === 0"
          class="rounded-lg border border-dashed border-accent/15 bg-black/10 p-6 text-center text-sm text-th-muted"
        >
          Aucun résultat pour ce filtre.
        </div>

        <!-- ── View: by location ─────────────────────────────────────── -->
        <div v-else-if="groupBy === 'location'" class="space-y-4">
          <div v-for="(entries, loc) in groupedByLocation" :key="loc">
            <p class="text-sm font-bold uppercase tracking-widest text-amber-400/60 mb-1.5">{{ loc }}</p>
            <div class="rounded-lg border border-accent/15 bg-black/15 overflow-hidden divide-y divide-white/5">
              <div v-for="entry in entries" :key="entry.id">

                <!-- Read mode -->
                <div
                  v-if="!editRow || editRow.id !== entry.id"
                  class="flex items-center gap-3 px-3 py-2 hover:bg-black/20 transition group"
                >
                  <div class="w-8 h-8 rounded-md overflow-hidden bg-black/30 shrink-0 flex items-center justify-center">
                    <img v-if="entry.screenshot" :src="entry.screenshot" class="w-full h-full object-cover opacity-90" loading="lazy" />
                    <span v-else class="text-th-muted text-sm">📦</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-th-primary truncate">{{ entry.name }}</p>
                    <p class="text-xs text-th-muted truncate">{{ entry.section }} › {{ entry.categoryName }}</p>
                  </div>
                  <span class="text-sm font-bold text-accent tabular-nums shrink-0">× {{ entry.quantity }}</span>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    <button @click="startEdit(entry)" class="rounded p-1 hover:bg-accent/10 text-th-muted hover:text-accent transition" title="Modifier">
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button @click="removeEntry(entry)" class="rounded p-1 hover:bg-rose-400/10 text-th-muted hover:text-rose-400 transition" title="Supprimer">
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </div>

                <!-- Edit mode -->
                <div
                  v-else
                  class="px-3 py-3 bg-accent/5 border-t border-accent/15 space-y-2"
                >
                  <div class="flex items-center gap-2 flex-wrap">
                    <label class="text-xs text-th-muted w-14 shrink-0">Quantité</label>
                    <input
                      v-model.number="editRow.qty" type="number" min="0"
                      class="w-20 px-2 py-1 rounded-md bg-black/20 border border-accent/15 text-xs text-th-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                    />
                    <span class="text-xs text-th-muted">( 0 = supprimer )</span>
                  </div>
                  <!-- Location edit -->
                  <div class="space-y-1">
                    <label class="text-xs text-th-muted">Localisation</label>
                    <div v-if="editRow.selectedLocation" class="flex items-center gap-2 px-2 py-1 rounded-md bg-amber-400/10 border border-amber-400/25 text-amber-300 text-xs">
                      <svg class="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
                      <span class="flex-1 truncate">{{ editRow.selectedLocation.name }}<template v-if="editRow.selectedLocation.systemName"> — {{ editRow.selectedLocation.systemName }}</template></span>
                      <button @click="editRow.selectedLocation = null; editRow.locationQ = ''; editRow.locationResults = []" class="text-th-muted hover:text-th-secondary">✕</button>
                    </div>
                    <div v-else class="relative">
                      <input
                        v-model="editRow.locationQ" @input="searchPoiEdit" type="text"
                        placeholder="Chercher un POI…"
                        class="w-full px-2.5 py-1 rounded-md bg-black/20 border border-accent/15 text-xs text-th-primary placeholder-th-muted focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                      />
                      <span v-if="editRow.locationSearching" class="absolute right-2 top-1 text-th-muted text-xs">⏳</span>
                    </div>
                    <div v-if="editRow.locationResults.length && !editRow.selectedLocation" class="max-h-28 overflow-y-auto space-y-0.5">
                      <button
                        v-for="poi in editRow.locationResults" :key="poi.id"
                        @click="editRow.selectedLocation = poi; editRow.locationQ = ''; editRow.locationResults = []"
                        class="w-full flex items-center gap-2 px-2 py-1 rounded-md bg-black/15 border border-accent/10 hover:bg-amber-400/10 text-left transition text-xs"
                      >
                        <svg class="w-3 h-3 text-amber-400/60 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
                        <span class="text-th-primary truncate">{{ poi.name }}</span>
                        <span class="text-th-muted text-[11px] ml-auto shrink-0">{{ poi.systemName }}</span>
                      </button>
                    </div>
                  </div>
                  <div class="flex gap-2 pt-1">
                    <button @click="saveEdit" class="px-2.5 py-1 rounded-md bg-accent/15 border border-accent/30 text-accent text-xs font-semibold hover:bg-accent/25 transition">💾 Sauvegarder</button>
                    <button @click="cancelEdit" class="px-2.5 py-1 rounded-md bg-black/15 border border-accent/10 text-th-muted text-xs hover:bg-black/25 transition">Annuler</button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        <!-- ── View: by item ──────────────────────────────────────── -->
        <div v-else class="space-y-5">
          <div v-for="(categories, section) in grouped" :key="section">
            <p class="text-sm font-bold uppercase tracking-widest text-accent/50 mb-1.5">{{ section }}</p>

            <div v-for="(itemGroups, catName) in categories" :key="catName" class="mb-4">
              <p class="text-sm text-th-muted mb-1 pl-1">{{ catName }}</p>

              <div v-for="(entries, itemName) in itemGroups" :key="itemName" class="mb-2 rounded-lg border border-accent/15 bg-black/15 overflow-hidden">

                <!-- Item header -->
                <div class="flex items-center gap-3 px-3 py-2 bg-black/20 border-b border-accent/10">
                  <div class="w-8 h-8 rounded-md overflow-hidden bg-black/30 shrink-0 flex items-center justify-center">
                    <img v-if="entries[0]?.screenshot" :src="entries[0].screenshot" class="w-full h-full object-cover opacity-90" loading="lazy" />
                    <span v-else class="text-th-muted text-sm">📦</span>
                  </div>
                  <span class="flex-1 text-sm font-semibold text-th-primary truncate">{{ itemName }}</span>
                  <span class="text-sm text-th-muted shrink-0">
                    Total : <span class="text-accent font-bold">{{ entries.reduce((s: number, e: InventoryEntry) => s + e.quantity, 0) }}</span>
                  </span>
                </div>

                <!-- Row per location/entry -->
                <div v-for="entry in entries" :key="entry.id">

                  <!-- Read mode -->
                  <div
                    v-if="!editRow || editRow.id !== entry.id"
                    class="flex items-center gap-3 px-3 py-2 hover:bg-black/20 transition group"
                  >
                    <div class="flex-1 min-w-0">
                      <template v-if="entry.location">
                        <span class="inline-flex items-center gap-1 text-sm text-amber-300/90">
                          <svg class="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
                          <span class="font-medium truncate">{{ entry.location.name }}</span>
                          <span v-if="entry.location.systemName" class="text-th-muted truncate">— {{ entry.location.systemName }}</span>
                        </span>
                      </template>
                      <span v-else class="text-sm text-th-muted italic">Localisation inconnue</span>
                    </div>
                    <span class="text-sm font-bold text-accent tabular-nums shrink-0">× {{ entry.quantity }}</span>
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                      <button @click="startEdit(entry)" class="rounded p-1 hover:bg-accent/10 text-th-muted hover:text-accent transition" title="Modifier">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button @click="removeEntry(entry)" class="rounded p-1 hover:bg-rose-400/10 text-th-muted hover:text-rose-400 transition" title="Supprimer">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  </div>

                  <!-- Edit mode -->
                  <div
                    v-else
                    class="px-3 py-3 bg-accent/5 border-t border-accent/15 space-y-2"
                  >
                    <div class="flex items-center gap-2 flex-wrap">
                      <label class="text-xs text-th-muted w-14 shrink-0">Quantité</label>
                      <input
                        v-model.number="editRow.qty" type="number" min="0"
                        class="w-20 px-2 py-1 rounded-md bg-black/20 border border-accent/15 text-xs text-th-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                      />
                      <span class="text-xs text-th-muted">( 0 = supprimer )</span>
                    </div>
                    <div class="space-y-1">
                      <label class="text-xs text-th-muted">Localisation</label>
                      <div v-if="editRow.selectedLocation" class="flex items-center gap-2 px-2 py-1 rounded-md bg-amber-400/10 border border-amber-400/25 text-amber-300 text-xs">
                        <svg class="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
                        <span class="flex-1 truncate">{{ editRow.selectedLocation.name }}<template v-if="editRow.selectedLocation.systemName"> — {{ editRow.selectedLocation.systemName }}</template></span>
                        <button @click="editRow.selectedLocation = null; editRow.locationQ = ''; editRow.locationResults = []" class="text-th-muted hover:text-th-secondary">✕</button>
                      </div>
                      <div v-else class="relative">
                        <input
                          v-model="editRow.locationQ" @input="searchPoiEdit" type="text"
                          placeholder="Chercher un POI…"
                          class="w-full px-2.5 py-1 rounded-md bg-black/20 border border-accent/15 text-xs text-th-primary placeholder-th-muted focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                        />
                        <span v-if="editRow.locationSearching" class="absolute right-2 top-1 text-th-muted text-xs">⏳</span>
                      </div>
                      <div v-if="editRow.locationResults.length && !editRow.selectedLocation" class="max-h-28 overflow-y-auto space-y-0.5">
                        <button
                          v-for="poi in editRow.locationResults" :key="poi.id"
                          @click="editRow.selectedLocation = poi; editRow.locationQ = ''; editRow.locationResults = []"
                          class="w-full flex items-center gap-2 px-2 py-1 rounded-md bg-black/15 border border-accent/10 hover:bg-amber-400/10 text-left transition text-xs"
                        >
                          <svg class="w-3 h-3 text-amber-400/60 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
                          <span class="text-th-primary truncate">{{ poi.name }}</span>
                          <span class="text-th-muted text-[11px] ml-auto shrink-0">{{ poi.systemName }}</span>
                        </button>
                      </div>
                    </div>
                    <div class="flex gap-2 pt-1">
                      <button @click="saveEdit" class="px-2.5 py-1 rounded-md bg-accent/15 border border-accent/30 text-accent text-xs font-semibold hover:bg-accent/25 transition">💾 Sauvegarder</button>
                      <button @click="cancelEdit" class="px-2.5 py-1 rounded-md bg-black/15 border border-accent/10 text-th-muted text-xs hover:bg-black/25 transition">Annuler</button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>

      </div><!-- /scrollable -->

    </template>

    <!-- ══════════════════════════════════════════════════════════════════
         ADD MODAL
         ══════════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <div
        v-if="addModal.open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        @click.self="resetAddModal"
      >
        <div class="rounded-lg border border-accent/20 bg-th-card w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4" @click.stop>

          <!-- Title -->
          <div class="flex items-center justify-between">
            <h2 class="font-bold text-th-primary text-base">Ajouter un item</h2>
            <button @click="resetAddModal" class="text-th-muted hover:text-th-secondary transition text-base">✕</button>
          </div>

          <!-- Step 1: Search item -->
          <div>
            <label class="text-xs text-th-muted uppercase tracking-wider mb-1.5 block">
              <template v-if="!addModal.selected">1. Rechercher l'item</template>
              <template v-else>Item sélectionné</template>
            </label>

            <!-- Selected item chip -->
            <div v-if="addModal.selected" class="flex items-center gap-3 p-2.5 rounded-lg bg-accent/10 border border-accent/25">
              <div class="w-10 h-10 rounded-md overflow-hidden bg-black/30 shrink-0 flex items-center justify-center">
                <img v-if="addModal.selected.screenshot" :src="addModal.selected.screenshot" class="w-full h-full object-cover" />
                <span v-else class="text-th-muted text-lg">📦</span>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-accent truncate">{{ addModal.selected.name }}</p>
                <p class="text-xs text-th-muted">{{ addModal.selected.section }} › {{ addModal.selected.categoryName }}</p>
              </div>
              <button @click="addModal.selected = null; addModal.q = ''; addModal.stacks = []" class="text-th-muted hover:text-th-secondary shrink-0 text-sm">✕</button>
            </div>

            <!-- Search field -->
            <div v-else>
              <input
                v-model="addModal.q"
                @input="searchItems"
                type="text"
                placeholder="Nom de l'item…"
                class="w-full px-3 py-2 rounded-md bg-black/20 border border-accent/15 text-sm text-th-primary placeholder-th-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
              <div v-if="addModal.searching" class="text-xs text-th-muted mt-1 pl-1">⏳ Recherche…</div>
              <div v-if="addModal.results.length" class="mt-1.5 max-h-44 overflow-y-auto space-y-1">
                <button
                  v-for="r in addModal.results" :key="r.externalId"
                  @click="addModal.selected = r; addModal.results = []; addModal.q = ''; if (!addModal.stacks.length) addStack()"
                  class="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-accent/10 bg-black/15 hover:bg-accent/10 hover:border-accent/25 text-left transition"
                >
                  <div class="w-8 h-8 rounded overflow-hidden bg-black/30 shrink-0 flex items-center justify-center">
                    <img v-if="r.screenshot" :src="r.screenshot" class="w-full h-full object-cover" />
                    <span v-else class="text-th-muted text-sm">📦</span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-th-primary truncate">{{ r.name }}</p>
                    <p class="text-xs text-th-muted truncate">{{ r.section }} › {{ r.categoryName }}</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Step 2: Stacks (location + quantity) -->
          <template v-if="addModal.selected">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <label class="text-xs text-th-muted uppercase tracking-wider">2. Localisations & quantités</label>
                <button
                  @click="addStack"
                  class="flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/15 border border-accent/10 hover:bg-black/25 text-th-muted hover:text-th-secondary text-xs transition"
                >+ Localisation</button>
              </div>

              <div class="space-y-2">
                <div v-for="(stack, i) in addModal.stacks" :key="i" class="rounded-lg border border-accent/15 bg-black/15 overflow-hidden">
                  <!-- Stack header -->
                  <div class="flex items-center justify-between px-3 py-1.5 bg-black/20 border-b border-accent/10">
                    <span class="text-xs text-th-muted font-medium">Lot #{{ i + 1 }}</span>
                    <button v-if="addModal.stacks.length > 1" @click="removeStack(i)" class="text-th-muted hover:text-rose-400 text-xs transition">✕</button>
                  </div>

                  <div class="p-3 space-y-2">
                    <!-- Quantity -->
                    <div class="flex items-center gap-2">
                      <label class="text-xs text-th-muted w-16 shrink-0">Quantité</label>
                      <input
                        v-model.number="stack.qty" type="number" min="1"
                        class="w-24 px-2.5 py-1.5 rounded-md bg-black/20 border border-accent/15 text-sm text-th-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                      />
                    </div>

                    <!-- Location -->
                    <div class="space-y-1">
                      <label class="text-xs text-th-muted">Localisation <span class="text-th-muted/50">(optionnel)</span></label>
                      <div v-if="stack.selectedLocation" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-amber-400/10 border border-amber-400/25 text-amber-300 text-xs">
                        <svg class="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
                        <span class="flex-1 truncate">{{ stack.selectedLocation.name }}<template v-if="stack.selectedLocation.systemName"> — {{ stack.selectedLocation.systemName }}</template></span>
                        <button @click="clearPoiForStack(i)" class="text-th-muted hover:text-th-secondary">✕</button>
                      </div>
                      <div v-else class="relative">
                        <input
                          v-model="stack.locationQ"
                          @input="() => searchPoiStack(i)"
                          type="text"
                          placeholder="Station, base, outpost…"
                          class="w-full px-2.5 py-1.5 rounded-md bg-black/20 border border-accent/15 text-xs text-th-primary placeholder-th-muted focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                        />
                        <span v-if="stack.locationSearching" class="absolute right-2 top-1.5 text-th-muted text-xs">⏳</span>
                      </div>
                      <div v-if="stack.locationResults.length && !stack.selectedLocation" class="max-h-28 overflow-y-auto space-y-0.5">
                        <button
                          v-for="poi in stack.locationResults" :key="poi.id"
                          @click="selectPoiForStack(i, poi)"
                          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-black/15 border border-accent/10 hover:bg-amber-400/10 text-left transition text-xs"
                        >
                          <svg class="w-3.5 h-3.5 text-amber-400/60 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
                          <span class="text-th-primary truncate">{{ poi.name }}</span>
                          <span class="text-th-muted text-xs ml-auto shrink-0">{{ poi.systemName }}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Confirm button -->
              <button
                @click="confirmAdd"
                :disabled="addModal.saving || !addModal.stacks.length"
                class="w-full px-3 py-2.5 rounded-md bg-accent/10 border border-accent/25 text-accent text-sm font-semibold hover:bg-accent/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span v-if="!addModal.saving">
                  ✅ Enregistrer
                  <span v-if="addModal.stacks.length > 1">({{ addModal.stacks.length }} lots)</span>
                </span>
                <span v-else>⏳…</span>
              </button>

              <p v-if="addModal.status" class="text-xs text-center" :class="addModal.status.startsWith('⚠') ? 'text-rose-300' : 'text-accent'">
                {{ addModal.status }}
              </p>
            </div>
          </template>

        </div>
      </div>
    </Teleport>

  </section>
</template>
