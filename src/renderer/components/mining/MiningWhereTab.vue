<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useMiningStore } from '../../stores/mining'
import { useDropdownKeyboard } from '../../composables/useDropdownKeyboard'
import { suggestZone } from '../../services/miningService'

const mining = useMiningStore()

// ── Mineral search ─────────────────────────────────────────────────────────
const whereQuery = ref('')
const whereCommodityId = ref('')
const whereOpen = ref(false)
const { activeIndex: whereHiIndex, move: whereMove } = useDropdownKeyboard()

// ── Body search ────────────────────────────────────────────────────────────
const whereBodySearch = ref('')
const whereBodyResults = ref<any[]>([])
const whereSelectedBody = ref<any>(null)
let whereBodyDebounce: ReturnType<typeof setTimeout> | null = null

// ── Filters ────────────────────────────────────────────────────────────────
const whereFilters = reactive({ slotPrimary: true, slotSecondary: true, slotTertiary: true, minQuality: 0 })

// ── Zone detail modal ──────────────────────────────────────────────────────
const modalOpen = ref(false)
const modalZone = ref<any>(null)

// ── Suggest zone modal ─────────────────────────────────────────────────────
const suggestOpen = ref(false)
const suggestForm = reactive({
  locationQuery: '',
  locationId: '',
  locationType: '',
  locationResults: [] as any[],
  locationOpen: false,
  locationHi: -1,
  locationLoading: false,
  minerals: [
    { slot: 'primary',   commodityId: '', _query: '', _open: false, _hi: -1, qualityMax: null as number | null },
    { slot: 'secondary', commodityId: '', _query: '', _open: false, _hi: -1, qualityMax: null as number | null },
    { slot: 'tertiary',  commodityId: '', _query: '', _open: false, _hi: -1, qualityMax: null as number | null },
  ],
  submitting: false,
  success: false,
  error: '',
})
let suggestLocationDebounce: ReturnType<typeof setTimeout> | null = null

// ── Computed ───────────────────────────────────────────────────────────────
const whereMinerals = computed(() => {
  const q = whereQuery.value.trim().toLowerCase()
  if (!q) return mining.minerals.slice(0, 20)
  return mining.minerals.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 20)
})

// Minéraux triés par index (0=primaire, 1=secondaire, 2=tertiaire) — pas de champ slot dans l'API
const SLOT_NAMES = ['primary', 'secondary', 'tertiary'] as const
const SLOT_LABELS = ['Principal', 'Secondaire', 'Tertiaire']

const modalMinerals = computed(() => modalZone.value?.minerals ?? [])
const modalPrimary = computed(() => {
  const minerals: any[] = modalZone.value?.minerals ?? []
  if (whereCommodityId.value) {
    return minerals.find((m) => String(m.commodityId) === whereCommodityId.value)
      ?? minerals[0]
      ?? null
  }
  return minerals[0] ?? null
})
const modalPrimaryCommodity = computed(() =>
  modalPrimary.value
    ? mining.minerals.find((m) => String(m.id) === String(modalPrimary.value.commodityId)) ?? null
    : null,
)

// ── Helpers ────────────────────────────────────────────────────────────────
function getCommodityName(commodityId: number | null | undefined): string {
  if (!commodityId) return '—'
  return mining.minerals.find((m) => m.id === commodityId)?.name ?? `#${commodityId}`
}

function filteredMinerals(q: string) {
  const lq = (q ?? '').trim().toLowerCase()
  if (!lq) return mining.minerals.slice(0, 20)
  return mining.minerals.filter((m) => m.name.toLowerCase().includes(lq)).slice(0, 20)
}

function getFilteredZones() {
  return mining.where.results.filter((z) => {
    if (!whereFilters.slotPrimary && !whereFilters.slotSecondary && !whereFilters.slotTertiary) return false
    if (whereFilters.minQuality > 0) {
      const enabledIdxs = [
        whereFilters.slotPrimary   ? 0 : -1,
        whereFilters.slotSecondary ? 1 : -1,
        whereFilters.slotTertiary  ? 2 : -1,
      ].filter((i) => i >= 0)
      const minerals: any[] = z.minerals ?? []
      const relevant = minerals.filter((_, i) => enabledIdxs.includes(i))
      if (!relevant.some((m) => (m.qualityMax ?? 0) >= whereFilters.minQuality)) return false
    }
    return true
  })
}

// Accès par index (0=primaire, 1=secondaire, 2=tertiaire)
function whereGetSlotMineral(z: any, slotName: string) {
  const idx = SLOT_NAMES.indexOf(slotName as any)
  return (z.minerals ?? [])[idx] ?? null
}

function getQualityColorClass(q: number | null | undefined) {
  const v = q ?? 0
  if (v >= 600) return 'bg-emerald-500/20 text-emerald-300'
  if (v >= 300) return 'bg-amber-500/20 text-amber-300'
  return 'bg-white/[0.04] text-white/70'
}

function whereSlotLabel(idx: number) {
  return SLOT_LABELS[idx] ?? `Slot ${idx}`
}

function locationTypeLabel(type: string) {
  if (type === 'system') return 'Système'
  if (type === 'planet') return 'Planète'
  if (type === 'moon')   return 'Lune'
  return type
}

// ── Mineral search handlers ────────────────────────────────────────────────
function selectWhere(m: { id: number; name: string }) {
  whereCommodityId.value = String(m.id)
  whereQuery.value = m.name
  whereOpen.value = false
  whereHiIndex.value = -1
  triggerLoadZones()
}

function clearWhereCommodity() {
  whereCommodityId.value = ''
  whereQuery.value = ''
  if (whereSelectedBody.value) triggerLoadZones()
  else mining.where.results = []
}

function whereKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const offset = e.key === 'ArrowDown' ? 1 : -1
    whereHiIndex.value = whereMove(whereHiIndex.value, offset, whereMinerals.value.length)
  } else if (e.key === 'Enter' && whereHiIndex.value >= 0) {
    const m = whereMinerals.value[whereHiIndex.value]
    if (m) selectWhere(m)
  } else if (e.key === 'Escape') {
    whereOpen.value = false
  }
}

function onWhereMineralInput() {
  whereOpen.value = true
  whereHiIndex.value = -1
  if (!whereQuery.value) clearWhereCommodity()
}

function onWhereMineralBlur() {
  window.setTimeout(() => { whereOpen.value = false }, 150)
}

// ── Body search handlers ───────────────────────────────────────────────────
function whereSelectBody(item: any) {
  if (!item.id) return
  whereSelectedBody.value = item
  whereBodySearch.value = item.name
  whereBodyResults.value = []
  triggerLoadZones()
}

function clearWhereBody() {
  whereSelectedBody.value = null
  whereBodySearch.value = ''
  whereBodyResults.value = []
  if (whereCommodityId.value) triggerLoadZones()
  else mining.where.results = []
}

function onWhereBodyFocus() {
  if (whereBodySearch.value.length >= 2) onWhereBodyInput()
}

function onWhereBodyBlur() {
  window.setTimeout(() => { whereBodyResults.value = [] }, 200)
}

function onWhereBodyInput() {
  if (whereBodyDebounce) clearTimeout(whereBodyDebounce)
  whereBodyDebounce = setTimeout(async () => {
    if (whereBodySearch.value.length >= 2) {
      whereBodyResults.value = await mining.searchWhereBodies(whereBodySearch.value)
    } else {
      whereBodyResults.value = []
    }
  }, 300)
}

function triggerLoadZones() {
  const sel = whereSelectedBody.value
  const bodyId = (sel && sel.type && sel.type !== 'system') ? (sel.id ?? null) : null
  if (!whereCommodityId.value && !bodyId) return
  mining.loadZones(whereCommodityId.value, bodyId)
}

// ── Zone modal ─────────────────────────────────────────────────────────────
function openZoneModal(z: any) {
  modalZone.value = z
  modalOpen.value = true
}

function closeZoneModal() {
  modalOpen.value = false
  modalZone.value = null
}

// ── Suggest zone ───────────────────────────────────────────────────────────
function openSuggestZone() {
  suggestOpen.value = true
  suggestForm.locationQuery = ''
  suggestForm.locationId = ''
  suggestForm.locationType = ''
  suggestForm.locationResults = []
  suggestForm.locationOpen = false
  suggestForm.locationHi = -1
  suggestForm.locationLoading = false
  suggestForm.minerals.forEach((m) => {
    m.commodityId = ''; m._query = ''; m._open = false; m._hi = -1; m.qualityMax = null
  })
  suggestForm.submitting = false
  suggestForm.success = false
  suggestForm.error = ''
}

async function suggestLocationInput(q: string) {
  suggestForm.locationOpen = true
  suggestForm.locationHi = -1
  if (suggestLocationDebounce) clearTimeout(suggestLocationDebounce)
  if (q.length < 2) { suggestForm.locationResults = []; return }
  suggestForm.locationLoading = true
  suggestLocationDebounce = setTimeout(async () => {
    const raw = await mining.searchWhereBodies(q)
    const flat: any[] = []
    for (const sys of raw) {
      flat.push({ ...sys, type: 'system' })
      for (const planet of sys.children ?? []) {
        if (planet.id) flat.push({ ...planet, systemName: sys.name })
        for (const moon of planet.children ?? []) {
          flat.push({ ...moon, systemName: sys.name, bodyName: planet.name })
        }
      }
    }
    suggestForm.locationResults = flat
    suggestForm.locationLoading = false
  }, 300)
}

function suggestSelectLocation(loc: any) {
  suggestForm.locationId = loc.id ? String(loc.id) : ''
  suggestForm.locationType = loc.type ?? ''
  suggestForm.locationQuery = loc.name
  suggestForm.locationOpen = false
  suggestForm.locationResults = []
}

function suggestLocationKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    suggestForm.locationHi = Math.min(suggestForm.locationHi + 1, suggestForm.locationResults.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    suggestForm.locationHi = Math.max(suggestForm.locationHi - 1, 0)
  } else if (e.key === 'Enter' && suggestForm.locationHi >= 0) {
    suggestSelectLocation(suggestForm.locationResults[suggestForm.locationHi])
  } else if (e.key === 'Escape') {
    suggestForm.locationOpen = false
  }
}

function adminSelectLineCommodity(line: any, m: { id: number; name: string }) {
  line.commodityId = String(m.id)
  line._query = m.name
  line._open = false
  line._hi = -1
}

function adminLineKeydown(e: KeyboardEvent, line: any) {
  const list = filteredMinerals(line._query)
  if (e.key === 'ArrowDown') { e.preventDefault(); line._hi = Math.min(line._hi + 1, list.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); line._hi = Math.max(line._hi - 1, 0) }
  else if (e.key === 'Enter' && line._hi >= 0) adminSelectLineCommodity(line, list[line._hi])
  else if (e.key === 'Escape') line._open = false
}

function suggestLineIsDuplicate(line: any) {
  if (!line.commodityId) return false
  return suggestForm.minerals.filter((m) => m.commodityId === line.commodityId).length > 1
}

function suggestHasDuplicateMinerals() {
  const ids = suggestForm.minerals.filter((m) => m.commodityId).map((m) => m.commodityId)
  return ids.length !== new Set(ids).size
}

async function submitSuggestZone() {
  suggestForm.error = ''
  if (!suggestForm.locationId) { suggestForm.error = 'Sélectionnez un corps céleste.'; return }
  if (!suggestForm.minerals.some((m) => m.commodityId)) { suggestForm.error = 'Renseignez au moins le minerai principal.'; return }
  if (suggestHasDuplicateMinerals()) { suggestForm.error = 'Minéraux dupliqués détectés.'; return }
  suggestForm.submitting = true
  try {
    await suggestZone({
      locationId: suggestForm.locationId,
      locationType: suggestForm.locationType,
      minerals: suggestForm.minerals
        .filter((m) => m.commodityId)
        .map((m) => ({ slot: m.slot, commodityId: m.commodityId, qualityMax: m.qualityMax ?? 0 })),
    })
    suggestForm.success = true
  } catch (err: any) {
    suggestForm.error = err?.response?.data?.message ?? err?.message ?? 'Erreur envoi suggestion.'
  } finally {
    suggestForm.submitting = false
  }
}
</script>

<template>
  <div>
    <!-- En-tête -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/20 flex items-center justify-center">
          <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5" class="text-sky-400">
            <circle cx="7" cy="7" r="3"/><path d="M7 1v2M7 12v2M1 7h2M12 7h2M3.1 3.1l1.4 1.4M10.5 10.5l1.4 1.4M3.1 10.9l1.4-1.4M10.5 5.5l1.4-1.4"/>
          </svg>
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-widest text-white/40">Prospection</div>
          <h2 class="text-sm font-semibold text-white">Scanner de zones</h2>
        </div>
      </div>
      <button type="button" @click="openSuggestZone()"
              class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 hover:border-sky-400/50 transition text-xs font-medium">
        <svg width="12" height="12" fill="none" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.8"><path d="M6 1v10M1 6h10"/></svg>
        Suggérer une zone
      </button>
    </div>

    <!-- Barre de recherche -->
    <div class="grid grid-cols-2 gap-3 mb-4">

      <!-- Minerai -->
      <div class="relative flex items-center gap-2 rounded-xl bg-black/40 border border-white/10 px-3 py-2.5">
        <svg class="w-4 h-4 text-white/30 shrink-0" fill="none" viewBox="0 0 15 15" stroke="currentColor" stroke-width="1.5">
          <circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/>
          <circle cx="6.5" cy="6.5" r="2" stroke-dasharray="2 1.5"/>
        </svg>
        <div class="relative flex-1">
          <input
            type="text"
            v-model="whereQuery"
            @input="onWhereMineralInput()"
            @focus="whereOpen = true"
            @blur="onWhereMineralBlur()"
            @keydown="whereKeydown($event)"
            placeholder="Minerai… (ex: Quantanium)"
            class="w-full bg-transparent text-white placeholder:text-white/35 focus:outline-none text-sm"
            autocomplete="off"
          />
          <!-- Dropdown minéral -->
          <div v-if="whereOpen && whereMinerals.length"
               class="absolute inset-x-0 top-full mt-1 z-20 rounded-xl border border-white/10 bg-[#0d1117] shadow-xl overflow-y-auto max-h-52">
            <div class="p-1.5 space-y-0.5">
              <button
                v-for="(m, i) in whereMinerals"
                :key="m.id"
                class="w-full px-3 py-2 text-left text-sm rounded-lg border transition flex items-center justify-between"
                :class="whereHiIndex === i ? 'bg-sky-400/15 border-sky-400/20 text-white' : 'border-transparent text-white/80 hover:bg-white/5'"
                @mousedown.prevent="selectWhere(m)"
              >
                <span>{{ m.name }}</span>
                <div class="flex items-center gap-2">
                  <span v-if="(m as any).priceSell > 0" class="text-xs text-amber-300/70">{{ ((m as any).priceSell as number).toLocaleString('fr-FR') }} aUEC/SCU</span>
                  <span v-if="(m as any).code" class="text-xs text-white/40">{{ (m as any).code }}</span>
                </div>
              </button>
            </div>
            <div v-if="whereOpen && whereQuery && !whereMinerals.length"
                 class="px-3 py-3 text-sm text-white/50">
              Aucun minerai trouvé.
            </div>
          </div>
        </div>
        <button v-if="whereCommodityId" @click="clearWhereCommodity()" class="shrink-0 text-white/30 hover:text-white/70 text-xs">✕</button>
      </div>

      <!-- Corps céleste -->
      <div class="relative">
        <!-- Corps sélectionné -->
        <div v-if="whereSelectedBody"
             class="flex items-center justify-between gap-2 h-full px-3 py-2.5 rounded-xl bg-black/40 border border-sky-400/30 text-sm">
          <div class="flex items-center gap-2 min-w-0">
            <svg class="w-4 h-4 text-sky-400/70 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="2"/>
            </svg>
            <span class="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 uppercase tracking-wider shrink-0">
              {{ !whereSelectedBody.type || whereSelectedBody.type === 'system' ? 'Système' : whereSelectedBody.type }}
            </span>
            <span class="text-white/90 truncate text-sm">{{ whereSelectedBody.name }}</span>
          </div>
          <button type="button" @click="clearWhereBody()" class="text-white/40 hover:text-white shrink-0 transition text-xs">✕</button>
        </div>

        <!-- Recherche corps -->
        <div v-else class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="2"/>
          </svg>
          <input
            type="text"
            v-model="whereBodySearch"
            @input="onWhereBodyInput()"
            @focus="onWhereBodyFocus()"
            @blur="onWhereBodyBlur()"
            @keydown.escape="whereBodyResults = []"
            placeholder="Localisation… (système, planète, lune)"
            class="w-full rounded-xl bg-black/40 border border-white/10 pl-10 pr-4 py-2.5 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-sky-400/30 focus:border-sky-400/30 text-sm"
            autocomplete="off"
          />
        </div>

        <!-- Dropdown corps hiérarchique -->
        <div v-if="whereBodyResults.length"
             class="absolute inset-x-0 top-full mt-1 z-20 rounded-xl border border-white/10 bg-[#0d1117] shadow-xl overflow-y-auto max-h-64">
          <div v-for="system in whereBodyResults" :key="system.id ?? system.name" class="border-b border-white/5 last:border-0">
            <!-- Système -->
            <button type="button" @mousedown.prevent="whereSelectBody(system)"
                    class="w-full text-left flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition cursor-pointer">
              <span class="text-sm text-white/80">{{ system.name }}</span>
              <span class="text-xs text-white/35 italic">Tout le système</span>
            </button>
            <!-- Planètes -->
            <div v-for="planet in system.children" :key="planet.id ?? planet.name">
              <button type="button" @mousedown.prevent="planet.id && whereSelectBody(planet)"
                      :disabled="!planet.id"
                      class="w-full text-left flex items-center justify-between px-5 py-1.5 hover:bg-white/5 transition text-sm"
                      :class="!planet.id ? 'opacity-40 cursor-default' : 'cursor-pointer'">
                <span class="text-white/70">{{ planet.name }}</span>
                <span class="text-xs text-white/40">{{ planet.type }}</span>
              </button>
              <!-- Lunes -->
              <button v-for="moon in planet.children" :key="moon.id ?? moon.name"
                      type="button" @mousedown.prevent="whereSelectBody(moon)"
                      class="w-full text-left flex items-center justify-between px-8 py-1.5 hover:bg-white/5 transition text-xs cursor-pointer">
                <span class="text-white/60">{{ moon.name }}</span>
                <span class="text-white/35">{{ moon.type }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Filtres avancés -->
    <div v-if="whereCommodityId || whereSelectedBody"
         class="mb-4 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] flex flex-wrap items-center gap-x-6 gap-y-3">
      <div class="flex items-center gap-2">
        <span class="text-xs uppercase tracking-widest text-white/40 mr-1">Slot</span>
        <button type="button" @click="whereFilters.slotPrimary = !whereFilters.slotPrimary"
                :class="whereFilters.slotPrimary ? 'bg-sky-500/25 border-sky-400/50 text-sky-300' : 'bg-transparent border-white/15 text-white/35 hover:border-white/30 hover:text-white/55'"
                class="px-3 py-1 rounded-lg border text-xs font-semibold uppercase tracking-wider transition">Primaire</button>
        <button type="button" @click="whereFilters.slotSecondary = !whereFilters.slotSecondary"
                :class="whereFilters.slotSecondary ? 'bg-sky-500/25 border-sky-400/50 text-sky-300' : 'bg-transparent border-white/15 text-white/35 hover:border-white/30 hover:text-white/55'"
                class="px-3 py-1 rounded-lg border text-xs font-semibold uppercase tracking-wider transition">Secondaire</button>
        <button type="button" @click="whereFilters.slotTertiary = !whereFilters.slotTertiary"
                :class="whereFilters.slotTertiary ? 'bg-sky-500/25 border-sky-400/50 text-sky-300' : 'bg-transparent border-white/15 text-white/35 hover:border-white/30 hover:text-white/55'"
                class="px-3 py-1 rounded-lg border text-xs font-semibold uppercase tracking-wider transition">Tertiaire</button>
      </div>
      <div class="w-px h-5 bg-white/10"></div>
      <div class="flex items-center gap-2">
        <span class="text-xs uppercase tracking-widest text-white/40">Qualité min</span>
        <div class="relative">
          <input type="number" v-model.number="whereFilters.minQuality" min="0" max="1000" placeholder="0"
                 class="w-24 rounded-lg bg-white/5 border border-white/15 px-3 py-1 text-white text-sm text-center placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-sky-400/40 focus:border-sky-400/30" />
          <span v-if="whereFilters.minQuality > 0" class="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-sky-400"></span>
        </div>
      </div>
    </div>

    <!-- Chargement -->
    <div v-if="mining.where.loading" class="text-center text-xs text-th-muted py-8">Chargement…</div>

    <!-- Erreur -->
    <div v-if="mining.where.error" class="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 mb-4">{{ mining.where.error }}</div>

    <!-- Résultats -->
    <template v-if="!mining.where.loading && mining.where.results.length > 0">
      <!-- Bannière -->
      <div class="flex items-center justify-between mb-3 px-1">
        <div class="flex items-center gap-3">
          <span v-if="whereCommodityId" class="text-sm font-semibold text-white">{{ whereQuery }}</span>
          <span v-else-if="whereSelectedBody" class="text-sm font-semibold text-white flex items-center gap-2">
            <span class="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 uppercase tracking-wider">
              {{ !whereSelectedBody.type || whereSelectedBody.type === 'system' ? 'Système' : whereSelectedBody.type }}
            </span>
            {{ whereSelectedBody.name }}
          </span>
          <span v-if="(mining.where.results[0] as any)?.priceSell > 0" class="text-xs text-amber-300/70">
            {{ ((mining.where.results[0] as any).priceSell as number).toLocaleString('fr-FR') }} aUEC/SCU
          </span>
        </div>
        <span class="text-xs text-white/40">{{ getFilteredZones().length }} / {{ mining.where.results.length }} zone(s)</span>
      </div>

      <!-- Tableau -->
      <div class="rounded-xl border border-white/[0.08] bg-black/20 overflow-hidden">
        <div class="grid text-[10px] uppercase tracking-widest text-white/40 px-3 py-2 border-b border-white/[0.06] text-center"
             style="grid-template-columns: 7rem 1fr 1fr 7rem 7rem 7rem">
          <span>Système</span>
          <span>Planète</span>
          <span>Lune</span>
          <span>Principal</span>
          <span>Secondaire</span>
          <span>Tertiaire</span>
        </div>
        <div v-for="z in getFilteredZones()" :key="z.id"
             class="grid px-3 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] transition cursor-pointer text-center"
             style="grid-template-columns: 7rem 1fr 1fr 7rem 7rem 7rem"
             @click="openZoneModal(z)">
          <div class="text-xs text-white/70 self-center">{{ (z as any).systemName || '—' }}</div>
          <div class="text-xs text-white/80 self-center truncate">{{ (z as any).bodyName || (z as any).locationName || '—' }}</div>
          <div class="text-xs text-white/40 self-center truncate">{{ (z as any).bodyName ? ((z as any).locationName || '—') : '—' }}</div>
          <div v-for="slot in ['primary','secondary','tertiary']" :key="slot" class="flex flex-col items-center justify-center gap-0.5">
            <template v-if="whereGetSlotMineral(z, slot)">
              <span class="text-[10px] text-center leading-tight"
                    :class="whereCommodityId && String(whereGetSlotMineral(z, slot)?.commodityId) === whereCommodityId ? 'text-white font-medium' : 'text-white/65'">
                {{ getCommodityName(whereGetSlotMineral(z, slot)?.commodityId) }}
              </span>
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded block"
                    :class="getQualityColorClass(whereGetSlotMineral(z, slot)?.qualityMax ?? whereGetSlotMineral(z, slot)?.quality)">
                {{ Math.floor(whereGetSlotMineral(z, slot)?.qualityMax ?? whereGetSlotMineral(z, slot)?.quality ?? 0) }}
              </span>
            </template>
            <span v-else class="text-white/40 text-xs">—</span>
          </div>
        </div>
      </div>

      <div v-if="getFilteredZones().length === 0 && mining.where.results.length > 0"
           class="text-center py-10 text-sm text-white/60">
        <div>Aucune zone ne correspond aux critères.</div>
        <div class="text-xs mt-1 text-white/40">Ajustez les filtres de slot ou la qualité minimale</div>
      </div>
    </template>

    <!-- Aucune zone -->
    <div v-else-if="(whereCommodityId || whereSelectedBody) && !mining.where.loading && !mining.where.error"
         class="text-center py-12">
      <div class="text-2xl mb-2 text-white/30">◉</div>
      <div class="text-xs uppercase tracking-widest text-white/55">Aucune zone répertoriée</div>
      <div class="text-xs mt-1 text-white/45">Vous avez observé une zone ici ? Proposez-la !</div>
      <button type="button" @click="openSuggestZone()"
              class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-sky-400/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition text-xs font-medium">
        <svg width="12" height="12" fill="none" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.8"><path d="M6 1v10M1 6h10"/></svg>
        Suggérer une zone
      </button>
    </div>

    <!-- État initial -->
    <div v-else-if="!whereCommodityId && !whereSelectedBody && !mining.where.loading"
         class="text-center py-12">
      <div class="flex flex-col items-center gap-1 mb-4">
        <div class="w-12 h-12 rounded-full border border-sky-400/20 flex items-center justify-center">
          <div class="w-8 h-8 rounded-full border border-sky-400/30 flex items-center justify-center">
            <div class="w-3 h-3 rounded-full border border-sky-400/50"></div>
          </div>
        </div>
      </div>
      <div class="text-xs uppercase tracking-widest text-sky-400/65">Scanner en attente</div>
      <div class="text-xs mt-1 text-white/45">Recherchez un minerai ou une localisation</div>
    </div>

    <!-- ── Modal détail zone ── -->
    <Teleport to="body">
      <div v-if="modalOpen"
           class="fixed inset-0 z-[200] flex items-center justify-center p-4"
           @keydown.escape.window="closeZoneModal()"
           @mousedown.self="closeZoneModal()">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="closeZoneModal()"></div>
        <div class="relative z-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl overflow-hidden" @mousedown.stop>

          <!-- Head -->
          <div class="flex items-start justify-between px-5 py-4 border-b border-white/[0.07]">
            <div>
              <div class="text-[10px] uppercase tracking-widest text-sky-400/70 mb-0.5">Prospection</div>
              <h3 class="text-base font-semibold text-white">Détails de la zone</h3>
              <p class="text-xs text-white/45 mt-0.5">Signal primaire, composition minérale et localisation.</p>
            </div>
            <button type="button" @click="closeZoneModal()" class="text-white/40 hover:text-white transition text-lg leading-none ml-4">✕</button>
          </div>

          <!-- Body -->
          <div class="p-5 space-y-5 overflow-y-auto max-h-[70vh]">

            <!-- Localisation -->
            <div class="grid grid-cols-3 gap-3">
              <div class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <div class="text-[10px] uppercase tracking-widest text-white/45">Système</div>
                <div class="text-sm text-white/95 mt-1">{{ modalZone?.systemName || '—' }}</div>
              </div>
              <div class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <div class="text-[10px] uppercase tracking-widest text-white/45">Planète</div>
                <div class="text-sm text-white/95 mt-1">{{ modalZone?.bodyName || modalZone?.locationName || '—' }}</div>
              </div>
              <div class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <div class="text-[10px] uppercase tracking-widest text-white/45">Lune</div>
                <div class="text-sm text-white/85 mt-1">{{ modalZone?.bodyName ? (modalZone?.locationName || '—') : '—' }}</div>
              </div>
            </div>

            <!-- Minéraux + Signal -->
            <div class="grid grid-cols-3 gap-4">
              <div class="col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div class="text-xs uppercase tracking-widest text-white/45 mb-2">Minéraux de la zone</div>
                <div v-if="modalMinerals.length === 0" class="text-sm text-white/55">Aucun minéral renseigné.</div>
                <div v-for="m in modalMinerals" :key="(m.slot || 'x') + '-' + (m.commodityId || 0)"
                     class="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
                  <div class="min-w-0">
                    <div class="text-sm text-white truncate">{{ getCommodityName(m.commodityId) }}</div>
                    <div class="text-[11px] uppercase tracking-widest text-white/45">{{ whereSlotLabel(modalMinerals.indexOf(m)) }}</div>
                  </div>
                  <div class="text-xs font-bold px-2 py-1 rounded" :class="getQualityColorClass(m.qualityMax ?? m.quality)">
                    {{ Math.floor(m.qualityMax ?? m.quality ?? 0) }}
                  </div>
                </div>
              </div>

              <div class="rounded-xl border border-sky-400/25 bg-sky-500/10 p-3">
                <div class="text-xs uppercase tracking-widest text-sky-200/70">Rocher recherché</div>
                <div class="text-base font-semibold text-white mt-1">
                  {{ modalPrimaryCommodity?.name || getCommodityName(modalPrimary?.commodityId) }}
                </div>
                <div class="mt-3 text-xs uppercase tracking-widest text-sky-200/70">Signal primaire</div>
                <div class="text-sm text-white/80">
                  {{ (modalPrimaryCommodity as any)?.signal != null ? Math.round(Number((modalPrimaryCommodity as any).signal)).toLocaleString('fr-FR') : '—' }}
                </div>
                <div class="mt-3 text-xs uppercase tracking-widest text-sky-200/70">Multiples x1 à x6</div>
                <div class="grid grid-cols-3 gap-2 mt-2">
                  <div v-for="n in [1,2,3,4,5,6]" :key="n" class="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-center">
                    <div class="text-[10px] text-white/45">x{{ n }}</div>
                    <div class="text-xs text-white">
                      {{ (modalPrimaryCommodity as any)?.signal != null ? Math.round(Number((modalPrimaryCommodity as any).signal) * n).toLocaleString('fr-FR') : '—' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-2 px-5 py-3 border-t border-white/[0.07]">
            <button type="button" @click="closeZoneModal()"
                    class="px-4 py-2 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition text-sm">Fermer</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Modal suggérer une zone ── -->
    <Teleport to="body">
      <div v-if="suggestOpen"
           class="fixed inset-0 z-[200] flex items-center justify-center p-4"
           @keydown.escape.window="suggestOpen = false"
           @mousedown.self="suggestOpen = false">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="suggestOpen = false"></div>
        <div class="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl overflow-visible" @mousedown.stop>

          <!-- Head -->
          <div class="flex items-start justify-between px-5 py-4 border-b border-white/[0.07]">
            <div>
              <div class="text-[10px] uppercase tracking-widest text-sky-400/70 mb-0.5">Contribution</div>
              <h3 class="text-base font-semibold text-white">Suggérer une zone de minage</h3>
              <p class="text-xs text-white/45 mt-0.5">Votre suggestion sera appliquée directement au référentiel.</p>
            </div>
            <button type="button" @click="suggestOpen = false" class="text-white/40 hover:text-white transition text-lg leading-none ml-4">✕</button>
          </div>

          <!-- Body -->
          <div class="p-5 space-y-4 overflow-visible">

            <!-- Localisation -->
            <div>
              <label class="block text-xs text-white/50 mb-1.5">
                Corps céleste <span class="text-red-400">*</span>
                <span class="text-white/35 ml-1">(planète, lune, astéroïde…)</span>
              </label>
              <div class="relative">
                <input
                  type="text"
                  v-model="suggestForm.locationQuery"
                  @input="suggestLocationInput(suggestForm.locationQuery)"
                  @focus="suggestForm.locationOpen = true"
                  @blur="window.setTimeout(() => { suggestForm.locationOpen = false }, 150)"
                  @keydown="suggestLocationKeydown($event)"
                  placeholder="Rechercher (min. 2 caractères)…"
                  class="w-full rounded-xl bg-[#070c14]/70 border border-white/10 px-3 py-2 text-white text-sm placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-sky-400/30 focus:border-sky-400/30"
                  :class="suggestForm.locationId ? 'border-sky-500/40' : ''"
                  autocomplete="off"
                />
                <div v-if="suggestForm.locationLoading" class="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 text-xs animate-pulse">…</div>
                <span v-if="suggestForm.locationId" class="absolute right-8 top-1/2 -translate-y-1/2 text-sky-400 text-xs">✓</span>
                <button v-if="suggestForm.locationId"
                        @click="suggestForm.locationId = ''; suggestForm.locationType = ''; suggestForm.locationQuery = ''"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/60 transition text-xs">✕</button>

                <div v-if="suggestForm.locationOpen && suggestForm.locationResults.length > 0"
                     class="absolute top-full left-0 right-0 mt-1 rounded-xl border border-white/10 bg-[#0b1422]/95 backdrop-blur-sm shadow-xl max-h-60 overflow-y-auto z-[212000]">
                  <div class="p-1.5 space-y-0.5">
                    <button v-for="(loc, li) in suggestForm.locationResults" :key="loc.type + loc.id"
                            type="button"
                            @mousedown.prevent="suggestSelectLocation(loc)"
                            :class="li === suggestForm.locationHi ? 'bg-sky-400/15 border-sky-400/20' : 'border-transparent hover:bg-white/5'"
                            class="w-full text-left px-3 py-2 rounded-lg border text-sm transition">
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-white/90">{{ loc.name }}</span>
                        <span class="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/60">{{ locationTypeLabel(loc.type) }}</span>
                        <span v-if="loc.systemName" class="text-white/55 text-xs">{{ loc.systemName }}</span>
                      </div>
                      <div v-if="loc.bodyName" class="text-xs text-white/45 mt-0.5">↳ {{ loc.bodyName }}</div>
                    </button>
                  </div>
                </div>
                <div v-if="suggestForm.locationOpen && suggestForm.locationQuery.length >= 2 && !suggestForm.locationLoading && suggestForm.locationResults.length === 0"
                     class="absolute top-full left-0 right-0 mt-1 rounded-xl border border-white/10 bg-[#0b1422]/95 p-3 text-xs text-white/60 z-[212000]">
                  Aucun résultat.
                </div>
              </div>
            </div>

            <!-- Minéraux -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs text-white/50">Minerai(s) observé(s)</label>
                <div class="text-xs text-white/40">Principal → Secondaire → Tertiaire</div>
              </div>

              <div class="grid gap-x-2 text-xs text-white/50 font-medium pb-1 mb-1 border-b border-white/5"
                   style="grid-template-columns: 5rem 1fr 6rem">
                <span class="pl-1">Slot</span>
                <span>Minerai</span>
                <span class="text-center">Qualité (0–1000)</span>
              </div>

              <div v-for="(m, idx) in suggestForm.minerals" :key="m.slot"
                   class="grid gap-x-2 items-center mb-1.5" style="grid-template-columns: 5rem 1fr 6rem">
                <div class="text-xs font-semibold text-white/70 pl-1">
                  {{ m.slot === 'primary' ? 'Principal' : (m.slot === 'secondary' ? 'Secondaire' : 'Tertiaire') }}
                </div>

                <div class="relative">
                  <input
                    type="text"
                    v-model="m._query"
                    @input="m._open = true; m._hi = -1; if (!m._query) m.commodityId = ''"
                    @focus="m._open = true"
                    @blur="window.setTimeout(() => m._open = false, 150)"
                    @keydown="adminLineKeydown($event, m)"
                    :placeholder="m.slot === 'primary' ? 'Minerai principal' : (m.slot === 'secondary' ? 'Minerai secondaire' : 'Minerai tertiaire')"
                    class="w-full rounded-lg bg-[#070c14]/70 border border-white/10 text-sm text-white px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-400/30 focus:border-sky-400/30 placeholder:text-white/45"
                    :class="[m.commodityId ? 'border-sky-500/40' : '', suggestLineIsDuplicate(m) ? 'border-red-500/60 ring-1 ring-red-500/20' : '']"
                    autocomplete="off"
                  />
                  <div v-if="m._open && filteredMinerals(m._query).length > 0"
                       class="absolute top-full left-0 right-0 mt-0.5 rounded-xl border border-white/10 bg-[#0b1422]/95 backdrop-blur-sm shadow-xl max-h-48 overflow-y-auto z-[212000]">
                    <div class="p-1.5 space-y-0.5">
                      <button v-for="(mm, mi) in filteredMinerals(m._query)" :key="mm.id"
                              type="button"
                              @mousedown.prevent="adminSelectLineCommodity(m, mm)"
                              :class="mi === m._hi ? 'bg-sky-400/15 border-sky-400/20' : 'border-transparent hover:bg-white/5'"
                              class="w-full text-left px-3 py-1.5 rounded-lg border text-sm transition text-white/80">
                        {{ mm.name }}
                      </button>
                    </div>
                  </div>
                </div>

                <input type="number" v-model.number="m.qualityMax" min="0" max="1000" step="1"
                       class="w-full rounded-lg bg-[#070c14]/70 border border-white/10 text-sm text-white px-2 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-sky-400/30"
                       :class="suggestLineIsDuplicate(m) ? 'border-red-500/60 ring-1 ring-red-500/20' : ''" />
              </div>

              <p v-if="suggestHasDuplicateMinerals()" class="text-xs text-red-300 italic mt-1">
                Minéraux dupliqués détectés — corrigez les lignes en rouge.
              </p>
              <p v-if="!suggestForm.minerals.some(m => m.commodityId)" class="text-xs text-white/50 italic mt-1">
                Renseignez au moins le minerai principal.
              </p>
            </div>

            <!-- Erreur / succès -->
            <div v-if="suggestForm.error" class="text-xs text-red-300 px-1">{{ suggestForm.error }}</div>
            <div v-if="suggestForm.success" class="flex items-center gap-2 text-xs text-emerald-300 px-1">
              <svg width="14" height="14" fill="none" viewBox="0 0 14 14" stroke="currentColor" stroke-width="2"><path d="M2 7l3.5 3.5L12 3"/></svg>
              Suggestion envoyée — elle sera examinée par le staff. Merci !
            </div>
          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-2 px-5 py-3 border-t border-white/[0.07]">
            <button type="button" @click="suggestOpen = false"
                    class="px-4 py-2 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition text-sm">Annuler</button>
            <button type="button" @click="submitSuggestZone()"
                    :disabled="suggestForm.submitting || suggestForm.success || suggestHasDuplicateMinerals()"
                    class="px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 hover:bg-sky-500/30 transition text-sm disabled:opacity-50 flex items-center gap-2">
              <span v-if="!suggestForm.submitting">Envoyer la suggestion</span>
              <span v-else>Envoi en cours…</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
