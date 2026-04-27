<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FabSection {
  name: string
  icon?: string
  categoryCount?: number
  itemCount?: number
}

interface FabCategory {
  id: number
  name: string
  section: string
  itemCount?: number
}

interface FabItem {
  id: number
  name: string
  uuid?: string
  section?: string
  categoryName?: string
  iOwn?: boolean
  screenshot?: string
  editUrl?: string
  deleteUrl?: string
}

interface FabIngredientAlt {
  id: number | null
  name: string
  code?: string
  multiplier?: number
  wiki?: string
}

interface FabIngredient {
  position: number
  label: string
  quantity: number
  alternatives: FabIngredientAlt[]
}

interface FabDetail {
  id: number
  name: string
  uuid?: string
  section?: string
  categoryName?: string
  hasRecipe: boolean
  iOwn: boolean
  notes?: string
  ingredients: FabIngredient[]
  owners: { username: string; avatar?: string; date?: string }[]
  editUrl?: string
  deleteUrl?: string
  toggleUrl?: string
}

interface CatalogItem {
  id: number
  name: string
  uuid?: string
  section: string
  categoryName: string
  hasRecipe: boolean
  iOwn: boolean
  ownersCount?: number
  editUrl?: string
  deleteUrl?: string
}

interface CatalogSection {
  name: string
  icon?: string
  items: CatalogItem[]
}

// ─── State ────────────────────────────────────────────────────────────────────

const app = useAppStore()

const activeTab = ref<'search' | 'catalog'>('search')

// Search tab
const sections = ref<FabSection[]>([])
const categories = ref<FabCategory[]>([])
const allItems = ref<FabItem[]>([])

const selectedSection = ref('')
const selectedCategoryId = ref<number | null>(null)
const selectedItemId = ref<number | null>(null)

const sectionDropOpen = ref(false)
const catDropOpen = ref(false)
const itemDropOpen = ref(false)
const sectionSearch = ref('')
const catSearch = ref('')
const itemSearch = ref('')

const itemsLoading = ref(false)
const detailLoading = ref(false)
const detail = ref<FabDetail | null>(null)

// Catalog tab
const catalogLoading = ref(false)
const catalogSections = ref<CatalogSection[]>([])
const catalogSearch = ref('')
const catalogCategoryFilter = ref('')
const catalogRecipeFilter = ref<'all' | 'with' | 'without'>('all')
const catalogOwnedOnly = ref(false)
const catalogHasOwners = ref(false)
const catalogSectionFilter = ref('')

// Global quick search (search tab)
const globalSearch = ref('')
const globalSearchResults = ref<FabItem[]>([])
const globalSearchLoading = ref(false)
const globalSearchOpen = ref(false)
let globalSearchTimer: ReturnType<typeof setTimeout> | null = null

// Modal
const modalOpen = ref(false)
const modalDetail = ref<FabDetail | null>(null)
const modalLoading = ref(false)

// Blueprint toggle
const blueprintLoading = ref(false)
const searchPanelOpen = ref(true)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urls = computed(() => app.settings ? createOverlayUrls(app.settings) : null)

function authHeaders() {
  return { Authorization: `Bearer ${app.bearerToken}` }
}

// ─── Filtered dropdowns ───────────────────────────────────────────────────────

const filteredSections = computed(() => {
  if (!sectionSearch.value) return sections.value
  const q = sectionSearch.value.toLowerCase()
  return sections.value.filter(s => s.name.toLowerCase().includes(q))
})

const filteredCategories = computed(() => {
  const cats = categories.value.filter(c => c.section === selectedSection.value)
  if (!catSearch.value) return cats
  const q = catSearch.value.toLowerCase()
  return cats.filter(c => c.name.toLowerCase().includes(q))
})

const filteredItems = computed(() => {
  if (!itemSearch.value) return allItems.value
  const q = itemSearch.value.toLowerCase()
  return allItems.value.filter(i => i.name.toLowerCase().includes(q))
})

// ─── Catalog computed ─────────────────────────────────────────────────────────

const catalogCategoryOptions = computed(() => {
  const names = new Set<string>()
  for (const sec of catalogSections.value) {
    for (const item of sec.items) {
      if (item.categoryName) names.add(item.categoryName)
    }
  }
  return [...names].sort()
})

const filteredCatalogSections = computed(() => {
  let result = catalogSections.value

  if (catalogSectionFilter.value) {
    result = result.filter(s => s.name === catalogSectionFilter.value)
  }

  return result.map(sec => {
    let items = sec.items

    if (catalogCategoryFilter.value) {
      items = items.filter(i => i.categoryName === catalogCategoryFilter.value)
    }
    if (catalogRecipeFilter.value === 'with') {
      items = items.filter(i => i.hasRecipe)
    } else if (catalogRecipeFilter.value === 'without') {
      items = items.filter(i => !i.hasRecipe)
    }
    if (catalogOwnedOnly.value) {
      items = items.filter(i => i.iOwn)
    }
    if (catalogHasOwners.value) {
      items = items.filter(i => (i.ownersCount ?? 0) > 0)
    }
    if (catalogSearch.value) {
      const q = catalogSearch.value.toLowerCase()
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.categoryName?.toLowerCase().includes(q) ||
        i.section?.toLowerCase().includes(q) ||
        i.uuid?.toLowerCase().includes(q)
      )
    }

    return { ...sec, items }
  }).filter(sec => sec.items.length > 0)
})

// ─── API calls ────────────────────────────────────────────────────────────────

async function fetchSections() {
  if (!urls.value) return
  try {
    const { data } = await http.get(urls.value.fabricator.index, { headers: authHeaders() })
    const raw = data?.data ?? data
    const rawSections = raw?.sections ?? raw ?? []
    sections.value = rawSections.map((s: any) => typeof s === 'string' ? { name: s } : s)
    categories.value = raw?.categories ?? []
  } catch (e) {
    console.error('Failed to load fabricator sections', e)
  }
}

function normalizeId<T extends Record<string, any>>(item: T): T {
  if (item.id == null && item.itemId != null) return { ...item, id: item.itemId }
  return item
}

function normalizeDetail(raw: any, itemId: number, itemName?: string): FabDetail {
  const payload = raw?.data ?? raw?.item ?? raw
  const recipe = payload?.recipe ?? {}
  const ingredients = (recipe?.ingredients ?? payload?.ingredients ?? []).map((ing: any) => ({
    position: ing.position,
    label: ing.label,
    quantity: ing.quantity,
    alternatives: (ing.alternatives ?? []).map((alt: any) => ({
      id: null as number | null,
      name: alt.commodityName ?? alt.name ?? '',
      code: alt.commodityCode ?? alt.code,
      multiplier: alt.multiplier,
      wiki: alt.commodityWiki ?? alt.wiki,
    }))
  }))
  return {
    id: payload?.id ?? itemId,
    name: payload?.name ?? itemName ?? '',
    uuid: payload?.uuid,
    hasRecipe: payload?.hasRecipe ?? false,
    iOwn: payload?.iOwn ?? false,
    notes: recipe?.notes ?? payload?.notes,
    ingredients,
    owners: payload?.owners ?? [],
    editUrl: payload?.editUrl,
    deleteUrl: payload?.deleteUrl,
    toggleUrl: payload?.toggleUrl,
  }
}

async function fetchItems() {
  if (!urls.value || !selectedSection.value) return
  itemsLoading.value = true
  allItems.value = []
  try {
    const params: Record<string, any> = { section: selectedSection.value }
    if (selectedCategoryId.value != null) params.categoryId = selectedCategoryId.value
    const { data } = await http.get(urls.value.fabricator.items, { headers: authHeaders(), params })
    const raw = data?.data ?? data
    const list: any[] = Array.isArray(raw) ? raw : (raw?.items ?? [])
    allItems.value = list.map(normalizeId)
  } catch (e) {
    console.error('Failed to load fabricator items', e)
  } finally {
    itemsLoading.value = false
  }
}

async function fetchDetail(itemId: number) {
  if (!urls.value) return
  detailLoading.value = true
  detail.value = null
  try {
    const { data } = await http.get(urls.value.fabricator.detail(itemId), { headers: authHeaders() })
    const itemName = allItems.value.find(i => i.id === itemId)?.name
    detail.value = normalizeDetail(data, itemId, itemName)
  } catch (e) {
    console.error('Failed to load fabricator detail', e)
  } finally {
    detailLoading.value = false
  }
}

async function fetchCatalog() {
  if (!urls.value) return
  catalogLoading.value = true
  try {
    const { data } = await http.get(urls.value.fabricator.catalog, { headers: authHeaders() })
    const raw = data?.data ?? data
    let secs: any[]
    if (Array.isArray(raw)) {
      secs = raw
    } else if (raw?.sections) {
      secs = raw.sections
    } else if (raw?.items) {
      // Liste plate — grouper par section
      const grouped = new Map<string, any[]>()
      for (const item of raw.items) {
        const secName: string = item.categorySection ?? item.section ?? 'Autre'
        if (!grouped.has(secName)) grouped.set(secName, [])
        grouped.get(secName)!.push(item)
      }
      secs = [...grouped.entries()].map(([name, items]) => ({ name, items }))
    } else {
      secs = []
    }
    catalogSections.value = secs.map(sec => ({
      ...sec,
      items: (sec.items ?? []).map((item: any) => ({
        ...normalizeId(item),
        ownersCount: item.ownersCount ?? item.owners_count ?? item.ownerCount ?? undefined,
      }))
    }))
  } catch (e) {
    console.error('Failed to load fabricator catalog', e)
  } finally {
    catalogLoading.value = false
  }
}

async function fetchGlobalSearch(q: string) {
  if (!urls.value || !q.trim()) {
    globalSearchResults.value = []
    globalSearchOpen.value = false
    return
  }
  globalSearchLoading.value = true
  globalSearchOpen.value = true
  try {
    const { data } = await http.get(urls.value.fabricator.itemSearch, {
      headers: authHeaders(),
      params: { q },
    })
    const raw = data?.data ?? data
    const list: any[] = Array.isArray(raw) ? raw : (raw?.items ?? [])
    globalSearchResults.value = list.map(normalizeId)
  } catch (e) {
    console.error('Failed to search fabricator items', e)
    globalSearchResults.value = []
  } finally {
    globalSearchLoading.value = false
  }
}

function selectGlobalItem(item: FabItem) {
  globalSearch.value = ''
  globalSearchOpen.value = false
  globalSearchResults.value = []
  selectedItemId.value = item.id
  if (!allItems.value.find(i => i.id === item.id)) {
    allItems.value = [item]
  }
  fetchDetail(item.id)
}

async function openModal(itemId: number) {
  modalOpen.value = true
  modalLoading.value = true
  modalDetail.value = null
  try {
    const { data } = await http.get(urls.value!.fabricator.detail(itemId), { headers: authHeaders() })
    const itemName = allItems.value.find(i => i.id === itemId)?.name
      ?? catalogSections.value.flatMap(s => s.items).find((i: any) => i.id === itemId)?.name
    modalDetail.value = normalizeDetail(data, itemId, itemName)
  } catch (e) {
    console.error('Failed to load modal detail', e)
  } finally {
    modalLoading.value = false
  }
}

function closeModal() {
  modalOpen.value = false
  modalDetail.value = null
}

const deleteLoading = ref(false)

async function deleteRecipe(itemId: number) {
  const d = modalDetail.value
  if (!d?.deleteUrl || deleteLoading.value) return
  if (!confirm(`Supprimer la recette de « ${d.name} » ?`)) return
  deleteLoading.value = true
  try {
    const { data } = await http.post(d.deleteUrl, null, { headers: authHeaders() })
    const success = data?.success ?? data?.data?.success
    if (success) {
      // Update catalog
      for (const sec of catalogSections.value) {
        const item = sec.items.find(i => i.id === itemId)
        if (item) { item.hasRecipe = false; item.iOwn = false }
      }
      // Update allItems
      const listItem = allItems.value.find(i => i.id === itemId)
      if (listItem) { listItem.hasRecipe = false; listItem.iOwn = false }
      // Update search detail
      if (detail.value?.id === itemId) {
        detail.value.hasRecipe = false
        detail.value.iOwn = false
        detail.value.ingredients = []
      }
      // Re-fetch modal detail
      await openModal(itemId)
    }
  } catch (e) {
    console.error('Failed to delete recipe', e)
  } finally {
    deleteLoading.value = false
  }
}

async function toggleBlueprint(itemId: number) {
  if (!urls.value || blueprintLoading.value) return
  blueprintLoading.value = true
  try {
    const { data } = await http.post(urls.value.fabricator.blueprintToggle(itemId), null, { headers: authHeaders() })
    const newOwn = data?.iOwn ?? data?.data?.iOwn
    if (newOwn === undefined) return
    // Update catalog
    for (const sec of catalogSections.value) {
      const item = sec.items.find(i => i.id === itemId)
      if (item) item.iOwn = newOwn
    }
    // Update allItems dropdown
    const listItem = allItems.value.find(i => i.id === itemId)
    if (listItem) listItem.iOwn = newOwn
    // Mise à jour immédiate de iOwn dans les vues détail/modal (pas besoin d'attendre le GET)
    if (detail.value && (detail.value.id === itemId || selectedItemId.value === itemId))
      detail.value.iOwn = newOwn
    if (modalDetail.value && modalDetail.value.id === itemId)
      modalDetail.value.iOwn = newOwn
    // Re-fetch des owners en arrière-plan (non-bloquant)
    const needRefresh = (detail.value?.id === itemId) || (modalDetail.value?.id === itemId)
    if (needRefresh && urls.value) {
      const u = urls.value
      const name = modalDetail.value?.id === itemId ? modalDetail.value.name : allItems.value.find(i => i.id === itemId)?.name
      http.get(u.fabricator.detail(itemId), { headers: authHeaders() }).then(({ data: d2 }) => {
        const normalized = normalizeDetail(d2, itemId, name)
        if (modalDetail.value?.id === itemId) modalDetail.value = normalized
        if (detail.value?.id === itemId)      detail.value      = normalized
      }).catch(() => {})
    }
  } catch (e) {
    console.error('Failed to toggle blueprint', e)
  } finally {
    blueprintLoading.value = false
  }
}

// ─── Selection handlers ───────────────────────────────────────────────────────

function selectSection(name: string) {
  selectedSection.value = name
  selectedCategoryId.value = null
  selectedItemId.value = null
  detail.value = null
  allItems.value = []
  sectionDropOpen.value = false
  sectionSearch.value = ''
  fetchItems()
}

function clearSection() {
  selectedSection.value = ''
  selectedCategoryId.value = null
  selectedItemId.value = null
  detail.value = null
  allItems.value = []
}

function selectCategory(cat: FabCategory) {
  selectedCategoryId.value = cat.id
  selectedItemId.value = null
  detail.value = null
  catDropOpen.value = false
  catSearch.value = ''
  fetchItems()
}

function clearCategory() {
  selectedCategoryId.value = null
  selectedItemId.value = null
  detail.value = null
  fetchItems()
}

function selectItem(item: FabItem) {
  selectedItemId.value = item.id
  itemDropOpen.value = false
  itemSearch.value = ''
  fetchDetail(item.id)
}

function clearItem() {
  selectedItemId.value = null
  detail.value = null
}

function resetSearch() {
  selectedSection.value = ''
  selectedCategoryId.value = null
  selectedItemId.value = null
  detail.value = null
  allItems.value = []
}

// ─── Click outside ────────────────────────────────────────────────────────────

function onClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('#sectionCol')) sectionDropOpen.value = false
  if (!target.closest('#catCol')) catDropOpen.value = false
  if (!target.closest('#itemCol')) itemDropOpen.value = false
  if (!target.closest('#fabQuicksearch')) globalSearchOpen.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (modalOpen.value) { closeModal(); return }
    sectionDropOpen.value = false
    catDropOpen.value = false
    itemDropOpen.value = false
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
  if (app.status.authReady) {
    await fetchSections()
  }
})

watch(() => app.status.authReady, async (ready) => {
  if (ready) await fetchSections()
})

watch(activeTab, (tab) => {
  if (tab === 'catalog' && catalogSections.value.length === 0) {
    fetchCatalog()
  }
})

watch(globalSearch, (q) => {
  if (globalSearchTimer) clearTimeout(globalSearchTimer)
  if (!q.trim()) {
    globalSearchResults.value = []
    globalSearchOpen.value = false
    return
  }
  globalSearchTimer = setTimeout(() => fetchGlobalSearch(q), 350)
})
</script>

<template>
  <div v-if="!app.status.authReady" class="fab-auth-wall">
    Connexion requise pour accéder au Fabricator.
  </div>

  <div v-else class="fab-root">

    <!-- Header compact -->
    <div class="fab-header">
      <div class="fab-header__left">
        <span class="fab-header__icon">⚗️</span>
        <span class="fab-header__title">Fabricator</span>
      </div>
      <div class="fab-tabs">
        <button type="button" class="fab-tab-btn" :class="{ 'is-active': activeTab === 'search' }" @click="activeTab = 'search'">
          🔎 Recherche
        </button>
        <button type="button" class="fab-tab-btn" :class="{ 'is-active': activeTab === 'catalog' }" @click="activeTab = 'catalog'">
          📋 Catalogue
        </button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════
         TAB: SEARCH
    ═══════════════════════════════════════════ -->
    <section v-if="activeTab === 'search'" class="fab-main-stack">

      <!-- Recherche rapide par nom -->
      <div id="fabQuicksearch" class="fab-quicksearch">
        <div class="fab-search-row">
          <span class="fab-search-row__icon">⚡</span>
          <input
            v-model="globalSearch"
            class="fab-search-input"
            type="text"
            placeholder="Recherche rapide par nom…"
            autocomplete="off"
            @focus="globalSearchOpen = globalSearchResults.length > 0"
          >
          <button v-if="globalSearch" class="fab-clear" @click="globalSearch = ''; globalSearchResults = []; globalSearchOpen = false">✕</button>
        </div>
        <div v-if="globalSearchOpen" class="fab-quicksearch-drop">
          <div v-if="globalSearchLoading" class="fab-quicksearch-drop__status">Recherche…</div>
          <template v-else>
            <div
              v-for="item in globalSearchResults" :key="item.id"
              class="fab-quicksearch-row"
              @click="selectGlobalItem(item)"
            >
              <span class="fab-quicksearch-row__name">{{ item.name }}</span>
              <span v-if="item.categoryName" class="fab-quicksearch-row__cat">{{ item.categoryName }}</span>
              <span class="fab-drop__pill" :class="item.iOwn ? 'fab-drop__pill--yes' : 'fab-drop__pill--no'">{{ item.iOwn ? '✓' : '—' }}</span>
            </div>
            <div v-if="globalSearchResults.length === 0" class="fab-quicksearch-drop__status">
              Aucun résultat pour « {{ globalSearch }} »
            </div>
          </template>
        </div>
      </div>

      <!-- Panneau de recherche réductible -->
      <div class="fab-selectors" :class="{ 'is-collapsed': !searchPanelOpen }">

        <!-- Header toggle -->
        <button type="button" class="fab-selectors-toggle" @click="searchPanelOpen = !searchPanelOpen">
          <span class="fab-selectors-toggle__summary">
            <template v-if="selectedItemId != null">
              {{ allItems.find(i => i.id === selectedItemId)?.name }}
            </template>
            <template v-else-if="selectedCategoryId != null">
              {{ categories.find(c => c.id === selectedCategoryId)?.name }}
            </template>
            <template v-else-if="selectedSection">
              {{ selectedSection }}
            </template>
            <template v-else>Recherche guidée</template>
          </span>
          <span class="fab-selectors-toggle__caret">{{ searchPanelOpen ? '▲' : '▼' }}</span>
        </button>

        <!-- Corps réductible -->
        <div v-show="searchPanelOpen" class="fab-selectors-body">

        <!-- Section -->
        <div id="sectionCol" class="fab-select-col" :class="{ 'is-open': sectionDropOpen }">
          <div class="fab-label">
            <span>Section</span>
            <button v-if="selectedSection" class="fab-inline-clear" @click="clearSection">✕</button>
          </div>
          <button type="button" class="fab-trigger" :class="{ 'is-open': sectionDropOpen }" @click="sectionDropOpen = !sectionDropOpen">
            <span class="fab-trigger__value" :class="{ 'is-placeholder': !selectedSection }">
              {{ selectedSection || 'Choisir une section…' }}
            </span>
            <span class="fab-trigger__caret">▾</span>
          </button>
          <div class="fab-drop" :class="{ 'fab-drop--open': sectionDropOpen }">
            <div class="fab-drop__search">
              <input v-model="sectionSearch" class="fab-drop__search-input" placeholder="Rechercher…" @click.stop>
            </div>
            <div class="fab-drop__rows">
              <div
                v-for="sec in filteredSections" :key="sec.name"
                class="fab-drop__row" :class="{ 'is-active': sec.name === selectedSection }"
                @click="selectSection(sec.name)"
              >{{ sec.name }}</div>
              <div v-if="filteredSections.length === 0" class="fab-drop__empty">Aucune section</div>
            </div>
          </div>
        </div>

        <!-- Category -->
        <div id="catCol" class="fab-select-col" :class="{ 'is-open': catDropOpen }">
          <div class="fab-label">
            <span>Catégorie</span>
            <button v-if="selectedCategoryId != null" class="fab-inline-clear" @click="clearCategory">✕</button>
          </div>
          <button
            type="button"
            class="fab-trigger"
            :class="{ 'is-open': catDropOpen, 'is-disabled': !selectedSection }"
            :disabled="!selectedSection"
            @click="catDropOpen = !catDropOpen"
          >
            <span class="fab-trigger__value" :class="{ 'is-placeholder': selectedCategoryId == null }">
              {{ selectedCategoryId != null ? categories.find(c => c.id === selectedCategoryId)?.name : 'Choisir une catégorie…' }}
            </span>
            <span class="fab-trigger__caret">▾</span>
          </button>
          <div class="fab-drop" :class="{ 'fab-drop--open': catDropOpen }">
            <div class="fab-drop__search">
              <input v-model="catSearch" class="fab-drop__search-input" placeholder="Rechercher…" @click.stop>
            </div>
            <div class="fab-drop__rows">
              <div
                v-for="cat in filteredCategories" :key="cat.id"
                class="fab-drop__row" :class="{ 'is-active': cat.id === selectedCategoryId }"
                @click="selectCategory(cat)"
              >{{ cat.name }}</div>
              <div v-if="filteredCategories.length === 0" class="fab-drop__empty">Aucune catégorie</div>
            </div>
          </div>
        </div>

        <!-- Item -->
        <div id="itemCol" class="fab-select-col" :class="{ 'is-open': itemDropOpen }">
          <div class="fab-label">
            <span>Objet<span v-if="selectedCategoryId != null" class="fab-label__ctx"> · {{ categories.find(c => c.id === selectedCategoryId)?.name }}</span></span>
            <button v-if="selectedItemId != null" class="fab-inline-clear" @click="clearItem">✕</button>
          </div>
          <button
            type="button"
            class="fab-trigger"
            :class="{ 'is-open': itemDropOpen, 'is-disabled': !selectedSection }"
            :disabled="!selectedSection"
            @click="itemDropOpen = !itemDropOpen"
          >
            <span class="fab-trigger__value" :class="{ 'is-placeholder': selectedItemId == null }">
              {{ selectedItemId != null ? allItems.find(i => i.id === selectedItemId)?.name : 'Choisir un objet…' }}
            </span>
            <span class="fab-trigger__caret">▾</span>
          </button>
          <div class="fab-drop" :class="{ 'fab-drop--open': itemDropOpen }">
            <div class="fab-drop__search">
              <input v-model="itemSearch" class="fab-drop__search-input" placeholder="Rechercher…" @click.stop>
            </div>
            <div class="fab-drop__rows">
              <div v-if="itemsLoading" class="fab-drop__empty">Chargement…</div>
              <template v-else>
                <div
                  v-for="item in filteredItems" :key="item.id"
                  class="fab-drop__row" :class="{ 'is-active': item.id === selectedItemId }"
                  @click="selectItem(item)"
                >
                  <span class="fab-drop__name">{{ item.name }}</span>
                  <span class="fab-drop__pill" :class="item.iOwn ? 'fab-drop__pill--yes' : 'fab-drop__pill--no'">
                    {{ item.iOwn ? '✓' : '—' }}
                  </span>
                </div>
                <div v-if="filteredItems.length === 0" class="fab-drop__empty">Aucun objet</div>
              </template>
            </div>
          </div>
        </div>

          <button v-if="selectedSection" class="fab-reset-btn" @click="resetSearch">✕ Réinitialiser</button>
        </div><!-- /fab-selectors-body -->
      </div><!-- /fab-selectors -->

      <!-- Loading -->
      <div v-if="detailLoading" class="fab-loading">
        <div class="fab-spin"></div>
        <span>Chargement…</span>
      </div>

      <!-- Detail -->
      <div v-else-if="detail" class="fab-card">
        <div class="fab-detail-head">
          <div class="fab-modal-kicker"><span class="fab-modal-dot"></span> Recette sélectionnée</div>
          <div class="fab-modal-name">{{ detail.name }}</div>
          <div v-if="detail.uuid" class="fab-modal-uuid">{{ detail.uuid }}</div>
        </div>

        <div v-if="detail.hasRecipe && detail.ingredients?.length" class="fab-ings">
          <div v-for="(ing, idx) in detail.ingredients" :key="idx" class="fab-ing">
            <div class="fab-ing-top">
              <div class="fab-ing-num">{{ ing.position }}</div>
              <div class="fab-ing-label">{{ ing.label }}</div>
              <div class="fab-ing-qty">{{ ing.quantity }} SCU</div>
            </div>
            <div v-if="ing.alternatives?.length" class="fab-ing-bot">
              <div class="fab-ing-bot-label">Commodities acceptées</div>
              <div class="fab-alts">
                <template v-for="alt in ing.alternatives" :key="alt.code ?? alt.name">
                  <a v-if="alt.wiki" class="fab-chip fab-chip--link" :href="alt.wiki" target="_blank" rel="noopener">
                    <span class="fab-chip__name">{{ alt.name }}</span>
                    <span v-if="alt.code" class="fab-chip__div"></span>
                    <span v-if="alt.code" class="fab-chip__code">{{ alt.code }}</span>
                    <span v-if="alt.multiplier != null" class="fab-chip__div"></span>
                    <span v-if="alt.multiplier != null" class="fab-chip__mult">×{{ alt.multiplier }}</span>
                    <span class="fab-chip__arrow">↗</span>
                  </a>
                  <span v-else class="fab-chip fab-chip--dead">
                    <span class="fab-chip__name">{{ alt.name }}</span>
                    <span v-if="alt.code" class="fab-chip__div"></span>
                    <span v-if="alt.code" class="fab-chip__code">{{ alt.code }}</span>
                    <span v-if="alt.multiplier != null" class="fab-chip__div"></span>
                    <span v-if="alt.multiplier != null" class="fab-chip__mult">×{{ alt.multiplier }}</span>
                  </span>
                </template>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="!detail.hasRecipe" class="fab-no-recipe">
          <span>Aucune recette enregistrée pour cet objet.</span>
        </div>

        <div v-if="detail.notes" class="fab-notes">
          <div class="fab-notes__icon">📝</div>
          <div class="fab-notes__text">{{ detail.notes }}</div>
        </div>

        <div class="fab-bp-bar">
          <div class="fab-owners">
            <div class="fab-owners__head">🗂 Possession du blueprint</div>
            <div v-if="detail.owners?.length" class="fab-owners__list">
              <span v-for="owner in detail.owners" :key="owner.username" class="fab-owner">
                <img v-if="owner.avatar" :src="owner.avatar" :alt="owner.username">
                {{ owner.username }}
                <span v-if="owner.date" class="fab-owner__date">{{ owner.date }}</span>
              </span>
            </div>
            <div v-else class="fab-owners__none">Personne ne possède ce blueprint pour l'instant.</div>
          </div>
          <button
            class="fab-bp-btn"
            :class="[detail.iOwn ? 'fab-bp-btn--on' : 'fab-bp-btn--off', blueprintLoading ? 'fab-bp-btn--loading' : '']"
            @click="toggleBlueprint(detail.id ?? selectedItemId!)"
          >
            {{ detail.iOwn ? '✓ Blueprint possédé' : 'Marquer comme possédé' }}
          </button>
        </div>
      </div>

      <!-- Placeholder -->
      <div v-else class="fab-placeholder">
        <div class="fab-placeholder__icon">🛰️</div>
        <div class="fab-placeholder__title">Aucun objet sélectionné</div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         TAB: CATALOG
    ═══════════════════════════════════════════ -->
    <section v-if="activeTab === 'catalog'" class="fab-catalog-layout">

      <!-- Filters -->
      <div class="fab-catalog-tools">

        <!-- Section pills -->
        <div class="fab-filterbar">
          <button type="button" class="fab-filterbtn" :class="{ 'is-active': !catalogSectionFilter }" @click="catalogSectionFilter = ''">Toutes</button>
          <button
            v-for="sec in catalogSections" :key="sec.name"
            type="button" class="fab-filterbtn"
            :class="{ 'is-active': catalogSectionFilter === sec.name }"
            @click="catalogSectionFilter = sec.name"
          >{{ sec.name }}</button>
        </div>

        <!-- Recipe filter -->
        <div class="fab-filterbar">
          <button v-for="val in (['all', 'with', 'without'] as const)" :key="val"
            type="button" class="fab-filterbtn"
            :class="{ 'is-active': catalogRecipeFilter === val }"
            @click="catalogRecipeFilter = val"
          >{{ val === 'all' ? 'Toutes' : val === 'with' ? '✅ Avec' : '⛔ Sans' }}</button>
          <button type="button" class="fab-filterbtn fab-filterbtn--mine"
            :class="{ 'is-active': catalogOwnedOnly }"
            @click="catalogOwnedOnly = !catalogOwnedOnly"
          >🧾 Mes recettes</button>
          <button type="button" class="fab-filterbtn fab-filterbtn--owners"
            :class="{ 'is-active': catalogHasOwners }"
            @click="catalogHasOwners = !catalogHasOwners"
          >👥 Avec possesseur(s)</button>
        </div>

        <!-- Category + search -->
        <div class="fab-catalog-search-row">
          <select v-model="catalogCategoryFilter" class="fab-compact-select">
            <option value="">Toutes les catégories</option>
            <option v-for="cat in catalogCategoryOptions" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>
        <div class="fab-search-row">
          <span class="fab-search-row__icon">🔍</span>
          <input v-model="catalogSearch" class="fab-search-input" type="text" placeholder="Nom, catégorie, UUID…" autocomplete="off">
          <button v-if="catalogSearch" class="fab-clear" @click="catalogSearch = ''">✕</button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="catalogLoading" class="fab-loading">
        <div class="fab-spin"></div>
        <span>Chargement…</span>
      </div>

      <!-- Results -->
      <div v-else class="fab-catalog-sections">
        <div v-if="filteredCatalogSections.length === 0" class="fab-empty">
          <div class="fab-empty__icon">📭</div>
          <div class="fab-empty__title">Aucun résultat</div>
        </div>

        <div v-for="sec in filteredCatalogSections" :key="sec.name" class="fab-section-card">
          <div class="fab-section-head">
            <span class="fab-section-title">{{ sec.name }}</span>
            <span class="fab-section-meta">{{ sec.items.length }} item{{ sec.items.length > 1 ? 's' : '' }}</span>
          </div>

          <div class="fab-item-list">
            <div
              v-for="item in sec.items" :key="item.id"
              class="fab-item-row fab-item-row--clickable"
              @click="openModal(item.id)"
            >
              <div class="fab-item-row__main">
                <div class="fab-item-row__name-line">
                  <span class="fab-item-row__name">{{ item.name }}</span>
                  <span v-if="item.iOwn" class="fab-item-row__owned-badge">✓ Possédé</span>
                </div>
                <div class="fab-item-row__meta-line">
                  <span class="fab-item-row__cat">{{ item.categoryName }}</span>
                  <span class="fab-status fab-status--inline" :class="item.hasRecipe ? 'fab-status--yes' : 'fab-status--no'">
                    {{ item.hasRecipe ? 'Recette ✓' : 'Sans recette' }}
                  </span>
                </div>
              </div>
              <button
                class="fab-action-btn"
                :class="{ 'fab-action-btn--owned': item.iOwn, 'is-loading': blueprintLoading }"
                @click.stop="toggleBlueprint(item.id)"
              >{{ item.iOwn ? '✓' : '＋' }}</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         MODAL
    ═══════════════════════════════════════════ -->
    <Teleport to="body">
      <div id="fabModalOverlay" :class="{ 'is-open': modalOpen }" @click.self="closeModal">
        <div id="fabModal" :class="{ 'is-open': modalOpen }">
          <template v-if="modalLoading">
            <div class="fab-loading" style="min-height: 200px">
              <div class="fab-spin"></div>
              <span>Chargement…</span>
            </div>
          </template>
          <template v-else-if="modalDetail">
            <!-- HEAD -->
            <div id="fabModalHead">
              <div id="fabModalHeadLeft">
                <div class="fab-modal-kicker"><span class="fab-modal-dot"></span> Recette sélectionnée</div>
                <div class="fab-modal-name" id="fabModalName">{{ modalDetail.name }}</div>
                <div v-if="modalDetail.uuid" class="fab-modal-uuid" id="fabModalUuid">{{ modalDetail.uuid }}</div>
              </div>
              <button id="fabModalClose" type="button" title="Fermer (Échap)" aria-label="Fermer" @click="closeModal">✕</button>
            </div>

            <!-- BODY -->
            <div id="fabModalBody">
              <!-- Ingredients -->
              <div v-if="modalDetail.hasRecipe && modalDetail.ingredients?.length" class="fab-ings">
                <article v-for="(ing, idx) in modalDetail.ingredients" :key="idx" class="fab-ing">
                  <div class="fab-ing-top">
                    <span class="fab-ing-num">{{ ing.position }}</span>
                    <span class="fab-ing-label">{{ ing.label }}</span>
                    <span class="fab-ing-qty">{{ ing.quantity }} SCU</span>
                  </div>
                  <div v-if="ing.alternatives?.length" class="fab-ing-bot">
                    <span class="fab-ing-bot-label">Commodities acceptées</span>
                    <div class="fab-alts">
                      <template v-for="alt in ing.alternatives" :key="alt.code ?? alt.name">
                        <a v-if="alt.wiki" class="fab-chip fab-chip--link" :href="alt.wiki" target="_blank" rel="noopener">
                          <span class="fab-chip__name">{{ alt.name }}</span>
                          <span class="fab-chip__div"></span>
                          <span class="fab-chip__code">{{ alt.code }}</span>
                          <template v-if="alt.multiplier != null && alt.multiplier !== 1">
                            <span class="fab-chip__div"></span>
                            <span class="fab-chip__mult">×{{ alt.multiplier }}</span>
                          </template>
                          <span class="fab-chip__div"></span>
                          <span class="fab-chip__arrow">↗</span>
                        </a>
                        <span v-else class="fab-chip fab-chip--dead">
                          <span class="fab-chip__name">{{ alt.name }}</span>
                          <span class="fab-chip__div"></span>
                          <span class="fab-chip__code">{{ alt.code }}</span>
                          <template v-if="alt.multiplier != null && alt.multiplier !== 1">
                            <span class="fab-chip__div"></span>
                            <span class="fab-chip__mult">×{{ alt.multiplier }}</span>
                          </template>
                        </span>
                      </template>
                    </div>
                  </div>
                </article>
              </div>

              <!-- No recipe -->
              <div v-else-if="!modalDetail.hasRecipe" class="fab-empty">
                <div class="fab-empty__icon">📭</div>
                <div class="fab-empty__title">Aucune recette définie</div>
                <div class="fab-empty__desc">
                  Cet item n'a pas encore de recette.
                  <template v-if="modalDetail.editUrl">
                    Clique sur <strong style="color:var(--accent, #55D9FF)">Créer la recette</strong> pour commencer.
                  </template>
                </div>
              </div>

              <!-- Notes -->
              <div v-if="modalDetail.notes" class="fab-notes">
                <div class="fab-notes__icon">📝</div>
                <div class="fab-notes__text">{{ modalDetail.notes }}</div>
              </div>

              <!-- Blueprint bar + owners -->
              <div class="fab-bp-bar">
                <div class="fab-owners">
                  <div class="fab-owners__head">🗂 Possession du blueprint</div>
                  <div v-if="modalDetail.owners?.length" class="fab-owners__list">
                    <span v-for="owner in modalDetail.owners" :key="owner.username" class="fab-owner">
                      <img v-if="owner.avatar" :src="owner.avatar" alt="" @error="($event.target as HTMLImageElement).style.display = 'none'">
                      {{ owner.username }}
                      <span v-if="owner.date" class="fab-owner__date">{{ owner.date }}</span>
                    </span>
                  </div>
                  <div v-else class="fab-owners__none">Personne ne possède ce blueprint pour l'instant.</div>
                </div>
                <button
                  class="fab-bp-btn"
                  :class="[modalDetail.iOwn ? 'fab-bp-btn--on' : 'fab-bp-btn--off', blueprintLoading ? 'fab-bp-btn--loading' : '']"
                  @click="toggleBlueprint(modalDetail.id)"
                >
                  {{ modalDetail.iOwn ? '✅ Blueprint possédé' : '☐ Marquer comme possédé' }}
                </button>
              </div>
            </div>

            <!-- FOOT -->
            <div id="fabModalFoot">
              <div id="fabModalBtns">
                <a v-if="modalDetail.editUrl" :href="modalDetail.editUrl" target="_blank" rel="noopener" class="fab-modal-btn fab-modal-btn--cyan">
                  {{ modalDetail.hasRecipe ? '✏️ Modifier la recette' : '➕ Créer la recette' }}
                </a>
                <button
                  v-if="modalDetail.hasRecipe && modalDetail.deleteUrl"
                  type="button"
                  class="fab-modal-btn fab-modal-btn--red"
                  :class="{ 'is-loading': deleteLoading }"
                  @click="deleteRecipe(modalDetail.id)"
                >🗑 Supprimer</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ─── ROOT ───────────────────────────────────────────────────────────────────── */
.fab-auth-wall { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--th-secondary); font-size: .9rem; }

.fab-root {
  display: flex;
  flex-direction: column;
  gap: .75rem;
  padding: .75rem .75rem 2rem;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
}

/* ─── HEADER ─────────────────────────────────────────────────────────────────── */
.fab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  flex-wrap: wrap;
}
.fab-header__left { display: flex; align-items: center; gap: .5rem; }
.fab-header__icon { font-size: 1.1rem; }
.fab-header__title { font-size: .95rem; font-weight: 800; letter-spacing: -.02em; }

/* ─── TABS ───────────────────────────────────────────────────────────────────── */
.fab-tabs { display: flex; gap: .45rem; }
.fab-tab-btn {
  display: inline-flex; align-items: center; gap: .35rem;
  height: 34px; padding: 0 .85rem;
  border-radius: 10px;
  font-size: .78rem; font-weight: 800;
  cursor: pointer;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.12);
  background: rgba(255,255,255,.04);
  color: var(--th-secondary);
  transition: .15s ease;
}
.fab-tab-btn:hover { background: rgba(255,255,255,.07); color: var(--th-primary); }
.fab-tab-btn.is-active {
  color: #071016;
  background: linear-gradient(180deg, #E8D96F 0%, #C8B84B 100%);
  border-color: transparent;
}

/* ─── SEARCH TAB ─────────────────────────────────────────────────────────────── */
.fab-main-stack { display: flex; flex-direction: column; gap: .65rem; }

/* ─── QUICK SEARCH ───────────────────────────────────────────────────────────── */
.fab-quicksearch { position: relative; }
.fab-quicksearch-drop {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 100;
  max-height: 320px; overflow-y: auto;
  border-radius: 12px;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.22);
  background: rgba(10,18,30,.99);
  box-shadow: 0 16px 40px rgba(0,0,0,.55);
  overscroll-behavior: contain;
}
.fab-quicksearch-drop__status {
  padding: .85rem 1rem;
  font-size: .84rem;
  color: var(--th-secondary);
}
.fab-quicksearch-row {
  display: flex; align-items: center; gap: .65rem;
  padding: .65rem .9rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,.04);
  transition: background .1s ease; user-select: none;
}
.fab-quicksearch-row:last-child { border-bottom: none; }
.fab-quicksearch-row:hover { background: rgba(var(--accent-rgb, 110 210 255) / 0.06); }
.fab-quicksearch-row__name { flex: 1; font-size: .87rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fab-quicksearch-row__cat { font-size: .74rem; color: var(--th-tertiary); white-space: nowrap; flex-shrink: 0; }

.fab-selectors {
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  border-radius: 14px;
  background: var(--bg-surface, rgba(10,18,30,.88));
  overflow: visible;
}

.fab-selectors-toggle {
  display: flex; align-items: center; justify-content: space-between; gap: .75rem;
  width: 100%; padding: .7rem .85rem;
  border: none; background: transparent; cursor: pointer;
  color: var(--th-primary); text-align: left;
  border-radius: 14px 14px 0 0;
  transition: background .15s ease;
}
.fab-selectors.is-collapsed .fab-selectors-toggle { border-radius: 14px; }
.fab-selectors-toggle:hover { background: rgba(255,255,255,.04); }
.fab-selectors-toggle__summary {
  font-size: .85rem; font-weight: 700;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 1;
}
.fab-selectors-toggle__caret {
  font-size: .7rem; color: var(--th-tertiary); flex-shrink: 0;
  transition: transform .2s ease;
}
.fab-selectors.is-collapsed .fab-selectors-toggle { border-bottom: none; }
.fab-selectors-toggle:not(:only-child) { border-bottom: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.08); }

.fab-selectors-body {
  display: flex;
  flex-direction: column;
  gap: .5rem;
  padding: .75rem .85rem .85rem;
  border-radius: 0 0 14px 14px;
}

.fab-select-col { position: relative; display: flex; flex-direction: column; gap: .3rem; z-index: 1; }
.fab-select-col.is-open { z-index: 80; }

.fab-label {
  display: flex; align-items: center; justify-content: space-between;
  font-size: .64rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
  color: var(--th-tertiary); padding-left: .1rem;
}
.fab-label__ctx { color: var(--accent, #55D9FF); letter-spacing: 0; text-transform: none; font-size: .78rem; font-weight: 700; }

.fab-inline-clear {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.4rem; height: 1.4rem;
  border-radius: 7px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.04);
  color: var(--th-tertiary);
  cursor: pointer; font-size: .72rem; flex-shrink: 0;
  transition: .15s ease;
}
.fab-inline-clear:hover { background: rgba(255,123,123,.08); color: #FF7B7B; border-color: rgba(255,123,123,.18); }

.fab-trigger {
  display: flex; align-items: center; gap: .6rem;
  height: 44px; width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.12);
  background: rgba(255,255,255,.03);
  padding: 0 .85rem;
  color: var(--th-primary);
  cursor: pointer; text-align: left;
  transition: border-color .15s ease;
}
.fab-trigger:hover { border-color: rgba(var(--accent-rgb, 110 210 255) / 0.22); }
.fab-trigger.is-open { border-color: rgba(var(--accent-rgb, 110 210 255) / 0.42); box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 110 210 255) / 0.07); }
.fab-trigger.is-disabled { opacity: .45; cursor: not-allowed; }

.fab-trigger__value { flex: 1; font-size: .88rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fab-trigger__value.is-placeholder { color: rgba(234,247,255,.38); font-weight: 500; }
.fab-trigger__caret { color: var(--th-tertiary); font-size: .75rem; flex-shrink: 0; }

.fab-reset-btn {
  height: 34px; padding: 0 .85rem;
  border-radius: 9px;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  background: rgba(255,255,255,.03);
  color: var(--th-tertiary);
  cursor: pointer; font-size: .76rem; font-weight: 700;
  align-self: flex-start;
  transition: .15s ease;
}
.fab-reset-btn:hover { background: rgba(255,255,255,.06); color: var(--th-primary); }

/* ─── DROPDOWNS ──────────────────────────────────────────────────────────────── */
.fab-drop {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 90;
  display: none; max-height: 280px; overflow-y: auto;
  border-radius: 12px;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.20);
  background: rgba(10,18,30,.99);
  box-shadow: 0 16px 40px rgba(0,0,0,.5);
  overscroll-behavior: contain;
}
.fab-drop--open { display: block; }

.fab-drop__search {
  position: sticky; top: 0; z-index: 2;
  padding: .6rem;
  border-bottom: 1px solid rgba(255,255,255,.05);
  background: rgba(12,20,32,.99);
}
.fab-drop__search-input {
  width: 100%; background: rgba(255,255,255,.05);
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.14);
  border-radius: 8px; padding: .5rem .75rem;
  color: var(--th-primary); font-size: .84rem; outline: none;
}
.fab-drop__search-input:focus { border-color: rgba(var(--accent-rgb, 110 210 255) / 0.40); }

.fab-drop__row {
  display: flex; align-items: center; justify-content: space-between; gap: .75rem;
  padding: .75rem .9rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,.04);
  transition: background .1s ease; user-select: none;
}
.fab-drop__row:last-child { border-bottom: none; }
.fab-drop__row:hover { background: rgba(var(--accent-rgb, 110 210 255) / 0.06); }
.fab-drop__row.is-active { background: rgba(var(--accent-rgb, 110 210 255) / 0.09); }
.fab-drop__name { font-size: .88rem; font-weight: 700; }
.fab-drop__empty { padding: .85rem .9rem; color: var(--th-tertiary); font-size: .84rem; }

.fab-drop__pill {
  display: inline-flex; align-items: center;
  padding: .25rem .55rem; border-radius: 999px;
  font-size: .68rem; font-weight: 800; white-space: nowrap; border: 1px solid transparent;
}
.fab-drop__pill--yes { color: #45E09A; background: rgba(69,224,154,.08); border-color: rgba(69,224,154,.16); }
.fab-drop__pill--no  { color: #FFBD59; background: rgba(255,189,89,.08); border-color: rgba(255,189,89,.14); }

/* ─── CARD ───────────────────────────────────────────────────────────────────── */
.fab-card {
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  border-radius: 14px;
  background: var(--bg-surface, rgba(10,18,30,.88));
  overflow: hidden;
}

/* ─── DETAIL HEAD ────────────────────────────────────────────────────────────── */
.fab-detail-head {
  padding: .9rem 1rem;
  border-bottom: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.09);
  background: linear-gradient(135deg, rgba(var(--accent-rgb, 110 210 255) / 0.07), transparent 40%);
}
.fab-modal-kicker {
  display: inline-flex; align-items: center; gap: .38rem;
  font-size: .6rem; font-weight: 800; text-transform: uppercase; letter-spacing: .16em;
  color: var(--accent, #55D9FF); margin-bottom: .35rem;
}
.fab-modal-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--accent, #55D9FF); }
.fab-modal-name { font-size: 1.05rem; font-weight: 900; line-height: 1.15; letter-spacing: -.02em; word-break: break-word; }
.fab-modal-uuid {
  margin-top: .25rem;
  font-family: ui-monospace, monospace; font-size: .68rem;
  color: rgba(var(--accent-rgb, 110 210 255) / 0.40); word-break: break-all;
}

/* ─── INGREDIENTS ────────────────────────────────────────────────────────────── */
.fab-ings { padding: .75rem; display: flex; flex-direction: column; gap: .55rem; }

.fab-ing {
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  border-radius: 12px;
  background: rgba(255,255,255,.015);
  overflow: hidden;
}

.fab-ing-top {
  display: grid; grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center; gap: .65rem;
  padding: .65rem .75rem;
  border-bottom: 1px solid rgba(255,255,255,.04);
}
.fab-ing-num {
  width: 1.85rem; height: 1.85rem; border-radius: 9px;
  display: grid; place-items: center;
  font-size: .78rem; font-weight: 900;
  color: var(--accent, #55D9FF);
  background: rgba(var(--accent-rgb, 110 210 255) / 0.08);
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.14);
}
.fab-ing-label { font-size: .88rem; font-weight: 800; }
.fab-ing-qty {
  display: inline-flex; align-items: center;
  padding: .28rem .58rem; border-radius: 999px;
  font-size: .7rem; font-weight: 800;
  color: var(--accent, #55D9FF);
  background: rgba(var(--accent-rgb, 110 210 255) / 0.08);
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.14);
  white-space: nowrap;
}

.fab-ing-bot { padding: .6rem .75rem .7rem; }
.fab-ing-bot-label {
  font-size: .62rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase;
  color: var(--th-tertiary); margin-bottom: .55rem;
}
.fab-alts { display: flex; flex-wrap: wrap; gap: .45rem; }

.fab-chip {
  display: inline-flex; align-items: stretch; overflow: hidden;
  border-radius: 10px; border: 1px solid rgba(69,224,154,.16);
  text-decoration: none; transition: transform .15s ease, border-color .15s ease;
}
.fab-chip--link:hover { transform: translateY(-1px); border-color: rgba(69,224,154,.34); }
.fab-chip--dead { border-color: rgba(255,255,255,.08); }
.fab-chip__name, .fab-chip__code, .fab-chip__mult, .fab-chip__arrow { display: flex; align-items: center; }
.fab-chip__name  { padding: .45rem .75rem; background: rgba(69,224,154,.05); font-size: .8rem; font-weight: 700; }
.fab-chip__div   { width: 1px; background: rgba(69,224,154,.14); flex-shrink: 0; }
.fab-chip__code  { padding: .45rem .6rem; background: rgba(69,224,154,.09); color: #45E09A; font-family: ui-monospace,monospace; font-size: .7rem; font-weight: 800; }
.fab-chip__mult  { padding: .45rem .5rem; background: rgba(69,224,154,.05); color: rgba(69,224,154,.78); font-size: .68rem; font-weight: 700; }
.fab-chip__arrow { padding: .45rem .5rem; background: rgba(69,224,154,.05); color: rgba(69,224,154,.68); font-size: .68rem; }
.fab-chip--dead .fab-chip__name, .fab-chip--dead .fab-chip__code { background: rgba(255,255,255,.03); color: var(--th-tertiary); }
.fab-chip--dead .fab-chip__div { background: rgba(255,255,255,.06); }

/* ─── NO RECIPE ──────────────────────────────────────────────────────────────── */
.fab-no-recipe {
  margin: .75rem .75rem 0;
  padding: .65rem .85rem;
  border-radius: 10px;
  border: 1px solid rgba(255,189,89,.14);
  background: rgba(255,189,89,.05);
  color: #FFBD59; font-size: .82rem; font-style: italic;
}

/* ─── NOTES ──────────────────────────────────────────────────────────────────── */
.fab-notes {
  margin: 0 .75rem .65rem;
  padding: .65rem .75rem;
  border-radius: 10px;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  background: rgba(255,255,255,.02);
  display: grid; grid-template-columns: auto 1fr; gap: .6rem; align-items: start;
}
.fab-notes__icon {
  width: 1.65rem; height: 1.65rem; display: grid; place-items: center;
  border-radius: 8px;
  background: rgba(var(--accent-rgb, 110 210 255) / 0.08);
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.14);
  font-size: .8rem;
}
.fab-notes__text { font-size: .84rem; line-height: 1.6; color: var(--th-secondary); }

/* ─── BLUEPRINT BAR ──────────────────────────────────────────────────────────── */
.fab-bp-bar {
  display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap;
  padding: .7rem .85rem .8rem;
  border-top: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.08);
}
.fab-owners__head {
  font-size: .62rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase;
  color: var(--th-tertiary); margin-bottom: .45rem;
}
.fab-owners__list { display: flex; align-items: center; gap: .45rem; flex-wrap: wrap; }
.fab-owner {
  display: inline-flex; align-items: center; gap: .38rem;
  height: 28px; padding: 0 .6rem 0 .32rem;
  border-radius: 999px;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  background: rgba(255,255,255,.04);
  font-size: .76rem; font-weight: 700; white-space: nowrap;
}
.fab-owner img { width: 1.25rem; height: 1.25rem; border-radius: 50%; object-fit: cover; }
.fab-owner__date { color: var(--th-tertiary); font-size: .64rem; }
.fab-owners__none { font-size: .8rem; color: var(--th-tertiary); font-style: italic; }

.fab-bp-btn {
  height: 36px; padding: 0 .85rem;
  display: inline-flex; align-items: center; gap: .4rem;
  border-radius: 10px; border: 1px solid transparent; cursor: pointer;
  font-size: .78rem; font-weight: 800; white-space: nowrap;
  transition: all .15s ease;
}
.fab-bp-btn--off { color: #45E09A; background: rgba(69,224,154,.08); border-color: rgba(69,224,154,.16); }
.fab-bp-btn--off:hover { background: rgba(69,224,154,.12); }
.fab-bp-btn--on { color: var(--accent,#55D9FF); background: rgba(var(--accent-rgb,110 210 255)/.08); border-color: rgba(var(--accent-rgb,110 210 255)/.18); }
.fab-bp-btn--on:hover { color: #FF7B7B; background: rgba(255,123,123,.07); border-color: rgba(255,123,123,.18); }
@keyframes fab-spin { to { transform: rotate(360deg); } }
.fab-bp-btn--loading { pointer-events: none; color: transparent !important; position: relative; }
.fab-bp-btn--loading::after {
  content: ''; position: absolute; inset: 0; margin: auto;
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.2); border-top-color: rgba(255,255,255,.8);
  animation: fab-spin .6s linear infinite;
}

/* ─── PLACEHOLDER / LOADING / EMPTY ─────────────────────────────────────────── */
.fab-placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: .5rem; padding: 2.5rem 1rem;
  border: 1px dashed rgba(var(--accent-rgb, 110 210 255) / 0.12);
  border-radius: 14px; text-align: center;
}
.fab-placeholder__icon { font-size: 2rem; opacity: .55; }
.fab-placeholder__title { font-size: .9rem; font-weight: 800; color: var(--th-secondary); }

.fab-loading {
  display: flex; flex-direction: column; align-items: center; gap: .75rem;
  padding: 2.5rem 1rem; color: var(--th-tertiary); font-size: .88rem;
}
.fab-spin {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid rgba(var(--accent-rgb, 110 210 255) / 0.14);
  border-top-color: var(--accent, #55D9FF);
  animation: fabSpin .8s linear infinite;
}
@keyframes fabSpin { to { transform: rotate(360deg); } }

.fab-empty { display: flex; flex-direction: column; align-items: center; gap: .55rem; padding: 2rem 1rem; text-align: center; }
.fab-empty__icon { font-size: 2rem; opacity: .55; }
.fab-empty__title { font-size: .9rem; font-weight: 800; color: var(--th-secondary); }

/* ─── CATALOG TOOLS ──────────────────────────────────────────────────────────── */
.fab-catalog-layout { display: flex; flex-direction: column; gap: .65rem; }

.fab-catalog-tools {
  display: flex; flex-direction: column; gap: .55rem;
  padding: .85rem;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  border-radius: 14px;
  background: var(--bg-surface, rgba(10,18,30,.88));
}

.fab-filterbar { display: flex; flex-wrap: wrap; gap: .4rem; }

.fab-filterbtn {
  display: inline-flex; align-items: center; gap: .35rem;
  height: 30px; padding: 0 .75rem;
  border-radius: 999px;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  background: rgba(255,255,255,.04);
  color: var(--th-secondary); font-size: .74rem; font-weight: 800;
  cursor: pointer; transition: .15s ease;
}
.fab-filterbtn:hover { background: rgba(255,255,255,.07); color: var(--th-primary); }
.fab-filterbtn.is-active {
  color: #04111A;
  background: linear-gradient(180deg, #63E0FF 0%, #23C4FF 100%);
  border-color: transparent;
}
.fab-filterbtn--mine.is-active {
  background: linear-gradient(180deg, #7EF0B2 0%, #45E09A 100%);
}

.fab-catalog-search-row {
  display: flex;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  border-radius: 10px;
  background: rgba(255,255,255,.03);
  overflow: hidden;
}
.fab-compact-select {
  flex: 1; border: none; outline: none;
  background: transparent; color: var(--th-primary);
  font-size: .85rem; font-weight: 600;
  padding: .55rem .75rem;
  appearance: none; cursor: pointer;
}
.fab-compact-select option { background: #0E1420; }

.fab-search-row {
  display: flex; align-items: center; gap: .55rem;
  height: 38px; padding: 0 .75rem;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  border-radius: 10px;
  background: rgba(255,255,255,.03);
  transition: border-color .15s ease;
}
.fab-search-row:focus-within { border-color: rgba(var(--accent-rgb, 110 210 255) / 0.38); }
.fab-search-row__icon { font-size: .82rem; flex-shrink: 0; color: var(--th-tertiary); }
.fab-search-input {
  flex: 1; border: none; outline: none;
  background: transparent; color: var(--th-primary);
  font-size: .84rem; font-weight: 600;
}
.fab-search-input::placeholder { color: rgba(234,247,255,.35); font-weight: 500; }
.fab-clear {
  width: 1.6rem; height: 1.6rem; display: grid; place-items: center;
  border-radius: 7px; border: none; background: transparent;
  color: var(--th-tertiary); cursor: pointer; flex-shrink: 0; transition: .15s ease;
}
.fab-clear:hover { color: var(--th-primary); background: rgba(255,255,255,.06); }

/* ─── CATALOG SECTIONS ───────────────────────────────────────────────────────── */
.fab-catalog-sections { display: flex; flex-direction: column; gap: .6rem; }

.fab-section-card {
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  border-radius: 14px;
  background: var(--bg-surface, rgba(10,18,30,.88));
  overflow: hidden;
}
.fab-section-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: .6rem .85rem;
  border-bottom: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.08);
  background: linear-gradient(135deg, rgba(var(--accent-rgb, 110 210 255) / 0.06), transparent 40%);
}
.fab-section-title { font-size: .88rem; font-weight: 800; }
.fab-section-meta { font-size: .72rem; color: var(--th-tertiary); }

/* ─── ITEM LIST (replaces table) ─────────────────────────────────────────────── */
.fab-item-list { display: flex; flex-direction: column; }

.fab-item-row {
  display: flex; align-items: center; justify-content: space-between; gap: .65rem;
  padding: .55rem .85rem;
  border-bottom: 1px solid rgba(255,255,255,.04);
  transition: background .1s ease;
}
.fab-item-row:last-child { border-bottom: none; }
.fab-item-row:hover { background: rgba(var(--accent-rgb, 110 210 255) / 0.04); }

.fab-item-row--clickable { cursor: pointer; }

.fab-item-row__main { display: flex; flex-direction: column; gap: .2rem; min-width: 0; flex: 1; }

.fab-item-row__name-line { display: flex; align-items: center; gap: .5rem; min-width: 0; }
.fab-item-row__name { font-size: .86rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fab-item-row__owned-badge {
  flex-shrink: 0;
  display: inline-flex; align-items: center;
  padding: .18rem .5rem; border-radius: 999px;
  font-size: .65rem; font-weight: 800; white-space: nowrap;
  color: #45E09A; background: rgba(69,224,154,.10); border: 1px solid rgba(69,224,154,.22);
}

.fab-item-row__meta-line { display: flex; align-items: center; gap: .5rem; min-width: 0; }
.fab-item-row__cat { font-size: .72rem; color: var(--th-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.fab-status--inline { flex-shrink: 0; }

.fab-item-row__actions { display: flex; align-items: center; gap: .35rem; flex-shrink: 0; }

.fab-status {
  display: inline-flex; align-items: center;
  padding: .22rem .55rem; border-radius: 999px;
  font-size: .68rem; font-weight: 800; white-space: nowrap; border: 1px solid transparent;
}
.fab-status--yes { color: #45E09A; background: rgba(69,224,154,.08); border-color: rgba(69,224,154,.16); }
.fab-status--no  { color: #FFBD59; background: rgba(255,189,89,.08); border-color: rgba(255,189,89,.14); }

.fab-action-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.10);
  background: rgba(255,255,255,.04);
  color: var(--th-secondary);
  cursor: pointer; font-size: .8rem; font-weight: 800;
  transition: .15s ease;
}
.fab-action-btn:hover { background: rgba(255,255,255,.08); color: var(--th-primary); }
.fab-action-btn--view { color: var(--accent, #55D9FF); border-color: rgba(var(--accent-rgb, 110 210 255) / 0.16); background: rgba(var(--accent-rgb, 110 210 255) / 0.07); }
.fab-action-btn--view:hover { background: rgba(var(--accent-rgb, 110 210 255) / 0.12); }
.fab-action-btn--owned { color: #45E09A; background: rgba(69,224,154,.08); border-color: rgba(69,224,154,.18); }
.fab-action-btn.is-loading { pointer-events: none; color: transparent !important; position: relative; }
.fab-action-btn.is-loading::after {
  content: ''; position: absolute; inset: 0; margin: auto;
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.2); border-top-color: rgba(255,255,255,.8);
  animation: fab-spin .6s linear infinite;
}

/* ─── MODAL ──────────────────────────────────────────────────────────────────── */
#fabModalOverlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center; padding: 1rem;
  background: rgba(4,8,15,.72); backdrop-filter: blur(8px);
  opacity: 0; pointer-events: none; transition: opacity .24s ease;
}
#fabModalOverlay.is-open { opacity: 1; pointer-events: all; }

#fabModal {
  position: relative; width: 100%; max-width: 600px; max-height: 88vh;
  display: flex; flex-direction: column;
  border-radius: 18px;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.20);
  background: var(--bg-primary, rgba(8,15,26,.99));
  box-shadow: 0 40px 100px rgba(0,0,0,.8);
  overflow: hidden;
  transform: translateY(20px) scale(.97); opacity: 0;
  transition: opacity .28s cubic-bezier(.2,.8,.2,1), transform .28s cubic-bezier(.2,.8,.2,1);
}
#fabModal.is-open { opacity: 1; transform: none; }

#fabModalHead {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.09);
  background: linear-gradient(135deg, rgba(var(--accent-rgb, 110 210 255) / 0.09), transparent 42%);
  flex-shrink: 0;
}
#fabModalClose {
  width: 2rem; height: 2rem; border-radius: 9px; flex-shrink: 0;
  border: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.16);
  background: rgba(var(--accent-rgb, 110 210 255) / 0.07);
  color: var(--text-secondary, rgba(234,247,255,.55)); cursor: pointer; font-size: .9rem;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s ease;
}
#fabModalClose:hover { background: rgba(255,123,123,.10); border-color: rgba(255,123,123,.26); color: #FF7B7B; }

#fabModalBody { overflow-y: auto; flex: 1; overscroll-behavior: contain; }

/* ─── MODAL FOOT ─────────────────────────────────────────────────────────────── */
#fabModalFoot {
  display: flex; align-items: center; justify-content: flex-end;
  padding: .7rem 1.1rem;
  border-top: 1px solid rgba(var(--accent-rgb, 110 210 255) / 0.09);
  background: rgba(var(--accent-rgb, 110 210 255) / 0.03);
  flex-shrink: 0;
}
#fabModalBtns { display: flex; align-items: center; gap: .5rem; }

.fab-modal-btn {
  display: inline-flex; align-items: center; gap: .35rem;
  height: 32px; padding: 0 .85rem;
  border-radius: 9px; border: 1px solid transparent;
  font-size: .78rem; font-weight: 800; white-space: nowrap;
  cursor: pointer; text-decoration: none;
  transition: all .15s ease;
}
.fab-modal-btn--cyan {
  color: var(--accent, #55D9FF);
  background: rgba(var(--accent-rgb, 110 210 255) / 0.08);
  border-color: rgba(var(--accent-rgb, 110 210 255) / 0.18);
}
.fab-modal-btn--cyan:hover {
  background: rgba(var(--accent-rgb, 110 210 255) / 0.14);
}
.fab-modal-btn--red {
  color: #FF7B7B;
  background: rgba(255, 123, 123, .07);
  border-color: rgba(255, 123, 123, .18);
}
.fab-modal-btn--red:hover {
  background: rgba(255, 123, 123, .14);
}
.fab-modal-btn.is-loading { opacity: .5; pointer-events: none; }
</style>
