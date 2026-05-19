<script setup lang="ts">
import { nextTick, onMounted } from 'vue'
import { useMiningStore } from '@renderer/stores/mining'
import { useMineralDropdown } from '@renderer/composables/useMineralDropdown'
import { useRockOcr } from '@renderer/composables/useRockOcr'

const emit = defineEmits<{
  cancel: []
  saved: []
}>()

const mining = useMiningStore()
const {
  mineralDisplayName, mineralSearch, setMineralSearch, filteredMineralsForRow,
  openMineralDropdown, clearMineral, selectMineral, mineralDropdownKeydown,
  searchBodies, selectBody,
} = useMineralDropdown()
const { applyOcrToForm, hasOcrData, scDetected } = useRockOcr()

onMounted(() => {
  console.log('[RockFormPanel] mounted — scDetected:', scDetected.value, '| hasOcrData:', hasOcrData())
})

// ── Rock form helpers ─────────────────────────────────────────────────────────
function emptyRockFormMineral() {
  return { commodityId: null, percentage: '', quality: 500, _name: '', _query: '', _search: '', _open: false, _hi: -1 }
}
function rockFormAddMineral() { mining.rockForm.minerals.push(emptyRockFormMineral()) }
function rockFormRemoveMineral(i: number) {
  mining.rockForm.minerals.splice(i, 1)
  if (!mining.rockForm.minerals.length) mining.rockForm.minerals.push(emptyRockFormMineral())
}

function rockFormZoneDisplayName(): string {
  return String(mining.rockForm.zoneQuery || '')
}
function rockFormZoneSearch(): string {
  return String((mining.rockForm as any).zoneQuerySearch ?? '')
}
function setRockFormZoneSearch(event: Event) {
  ;(mining.rockForm as any).zoneQuerySearch = (event.target as HTMLInputElement).value
  ;(mining.rockForm as any).zoneQueryHi = -1
}
function filteredRockFormZoneMinerals() {
  return filteredMineralsForRow({ _search: rockFormZoneSearch() })
}
function openRockFormZoneDropdown(event?: Event) {
  mining.rockForm.zoneQueryOpen = true
  ;(mining.rockForm as any).zoneQuerySearch = ''
  ;(mining.rockForm as any).zoneQueryHi = -1
  const root = (event?.currentTarget as HTMLElement | null)?.closest('.relative')
  nextTick(() => {
    const input = root?.querySelector<HTMLInputElement>('.mineral-dropdown-search')
    input?.focus()
  })
}
function clearRockFormZoneMineral() {
  mining.rockForm.zoneQueryId = null
  mining.rockForm.zoneQuery = ''
  mining.rockForm.zoneQueryOpen = false
  mining.rockForm.zoneSearchState = 'idle'
  mining.rockForm.zoneLocationName = null
  mining.rockForm.zoneCreate.show = false
}
function rockFormSelectZoneMineral(min: any) {
  mining.rockForm.zoneQueryId = min.id
  mining.rockForm.zoneQuery = min.name
  mining.rockForm.zoneQueryOpen = false
  ;(mining.rockForm as any).zoneQuerySearch = ''
  mining.rockFormLookupZone()
}
function rockFormZoneMineralKeydown(event: KeyboardEvent) {
  const list = filteredRockFormZoneMinerals()
  const form = mining.rockForm as any
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    form.zoneQueryHi = Math.min(Number(form.zoneQueryHi ?? -1) + 1, list.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    form.zoneQueryHi = Math.max(Number(form.zoneQueryHi ?? 0) - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = list[Number(form.zoneQueryHi ?? -1)] ?? list[0]
    if (item) rockFormSelectZoneMineral(item)
  } else if (event.key === 'Escape') {
    mining.rockForm.zoneQueryOpen = false
  }
  nextTick(() => {
    const root = (event.currentTarget as HTMLElement | null)?.closest('.relative')
    const item = root?.querySelectorAll<HTMLElement>('.mineral-dropdown-item')?.[Number(form.zoneQueryHi ?? -1)]
    item?.scrollIntoView({ block: 'nearest' })
  })
}

// ── Blur guards ───────────────────────────────────────────────────────────────
function blurRockBodySearch()  { setTimeout(() => { mining.rockForm.bodyResults = [] }, 200) }
function blurZoneQuery()       { setTimeout(() => { mining.rockForm.zoneQueryOpen = false }, 150) }
function blurZoneSecondary()   { setTimeout(() => { mining.rockForm.zoneCreate.secondary._open = false }, 150) }
function blurZoneTertiary()    { setTimeout(() => { mining.rockForm.zoneCreate.tertiary._open = false }, 150) }
function blurMineralRow(m: any){ setTimeout(() => { m._open = false }, 150) }

// ── Submit / cancel ───────────────────────────────────────────────────────────
async function saveRockForm() {
  await mining.addRock()
  if (!mining.rockForm.show) emit('saved')
}
function cancel() {
  mining.rockForm.show = false
  mining.rockForm.editRockId = null
  emit('cancel')
}
</script>

<template>
  <div class="rounded-2xl border border-accent/15 bg-accent/[0.03] p-4 space-y-4 md:p-5">
    <!-- Position -->
    <div class="rounded-xl border border-white/8 bg-white/[0.02] p-3 space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-[10px] font-semibold text-th-muted uppercase tracking-wider">Position</p>
        <button
          type="button"
          :disabled="!scDetected"
          :title="scDetected ? 'Remplir via OCR (rocher)' : 'Star Citizen non détecté'"
          class="rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition"
          :class="scDetected
            ? 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/20'
            : 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'"
          @click="applyOcrToForm()"
        >⬆ OCR</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div v-for="[axis, lbl] in [['posX','X'],['posY','Y']]" :key="axis">
          <label class="mb-1 block text-[10px] text-th-muted">Coordonnée {{ lbl }}</label>
          <input v-model="(mining.rockForm as any)[axis]" type="text" inputmode="decimal" :placeholder="lbl"
            class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-1.5 text-xs text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none" />
        </div>
      </div>
      <!-- Body search -->
      <div class="relative">
        <label class="mb-1 block text-[10px] text-th-muted">Corps céleste</label>
        <input v-model="mining.rockForm.bodySearch"
          class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-xs text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
          placeholder="Rechercher un système, une planète, une lune…"
          @input="searchBodies(mining.rockForm.bodySearch, mining.rockForm)"
          @blur.capture="blurRockBodySearch()" />
        <button v-if="mining.rockForm.selectedBody" type="button"
          @click="mining.rockForm.selectedBody = null; mining.rockForm.bodySearch = ''; mining.rockForm.bodyResults = []"
          class="absolute right-2.5 top-[26px] text-white/40 hover:text-white/60 text-xs">✕</button>
        <div v-if="mining.rockForm.bodyResults.length > 0" class="absolute top-full left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg">
          <template v-for="sys in mining.rockForm.bodyResults" :key="sys.id ?? sys.name">
            <div class="px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">{{ sys.name }}</div>
            <template v-for="planet in sys.children" :key="planet.id ?? planet.name">
              <button type="button"
                @click="planet.id && (selectBody(planet, mining.rockForm), mining.rockForm.zoneQueryId && mining.rockFormLookupZone())"
                class="w-full text-left px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 pl-5 flex justify-between" :disabled="!planet.id">
                <span>{{ planet.name }}</span><span class="text-white/30 text-[10px]">{{ planet.type }}</span>
              </button>
              <template v-if="planet.children?.length" v-for="moon in planet.children" :key="moon.id ?? moon.name">
                <button type="button"
                  @click="selectBody(moon, mining.rockForm); mining.rockForm.zoneQueryId && mining.rockFormLookupZone()"
                  class="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 pl-8 flex justify-between">
                  <span>{{ moon.name }}</span><span class="text-white/30 text-[10px]">{{ moon.type }}</span>
                </button>
              </template>
            </template>
          </template>
        </div>
        <p v-if="mining.sessionActive?.defaultBodyName && !mining.rockForm.selectedBody" class="mt-1 text-[10px] text-th-muted/60">
          Zone par défaut : {{ mining.sessionActive.defaultBodyName }}
        </p>
      </div>
    </div>

    <!-- Caractéristiques -->
    <div class="rounded-xl border border-white/8 bg-white/[0.02] p-3 space-y-2">
      <p class="text-[10px] font-semibold text-th-muted uppercase tracking-wider">Caractéristiques</p>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div v-for="[field, lbl, ph] in [['sizeScuEstimate','Taille (SCU)','0.0'],['mass','Masse','1250'],['instability','Instabilité %','0–100'],['resistance','Résistance %','0–100']]" :key="field">
          <label class="mb-1 block text-[10px] text-th-muted">{{ lbl }}</label>
          <input v-model="(mining.rockForm as any)[field]" type="text" inputmode="decimal" :placeholder="ph"
            class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-1.5 text-xs text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none" />
        </div>
      </div>
    </div>

    <!-- Zone assist -->
    <div class="rounded-xl border border-white/8 bg-white/[0.02] p-3 space-y-2">
      <p class="text-[10px] font-semibold text-th-muted uppercase tracking-wider">Données de zone <span class="font-normal normal-case text-white/30">(optionnel)</span></p>
      <p class="text-[10px] text-th-muted/60">Sélectionne le minerai principal pour charger la composition connue de la zone.</p>
      <div class="relative">
        <input :value="rockFormZoneDisplayName()" readonly autocomplete="off"
          class="w-full cursor-pointer rounded-xl border border-th-subtle bg-black/30 px-3 py-2 pr-8 text-xs text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
          placeholder="Sélectionner le minerai principal…"
          @click="openRockFormZoneDropdown($event)"
          @focus="openRockFormZoneDropdown($event)"
          @keydown="rockFormZoneMineralKeydown($event)" />
        <button v-if="mining.rockForm.zoneQueryId" type="button" @click="clearRockFormZoneMineral()"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 text-xs">✕</button>
        <div v-if="mining.rockForm.zoneQueryOpen"
          class="absolute top-full left-0 right-0 z-50 mt-1 h-56 overflow-hidden rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg backdrop-blur-sm mineral-dropdown-list">
          <div class="p-2">
            <input :value="rockFormZoneSearch()" type="text" autocomplete="off" placeholder="Rechercher un minerai..."
              class="mineral-dropdown-search sticky top-0 z-10 w-full rounded-t-xl border-b border-white/10 bg-[#0b1422]/95 px-3 py-2 text-xs text-white placeholder:text-white/60 focus:outline-none"
              @input="setRockFormZoneSearch($event)"
              @focus="mining.rockForm.zoneQueryOpen = true"
              @blur="blurZoneQuery()"
              @keydown="rockFormZoneMineralKeydown($event)" />
          </div>
          <div v-if="filteredRockFormZoneMinerals().length" class="max-h-40 overflow-y-auto p-1.5 space-y-0.5">
            <button v-for="(min, mi) in filteredRockFormZoneMinerals()" :key="min.id" type="button"
              @mousedown.prevent="rockFormSelectZoneMineral(min)"
              class="mineral-dropdown-item flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs transition"
              :class="mi === ((mining.rockForm as any).zoneQueryHi ?? -1) ? 'border-accent/25 bg-accent/10 text-accent' : 'border-transparent text-white/80 hover:bg-white/5 hover:border-white/10'">
              <span>{{ min.name }}</span><span class="text-white/30">{{ (min as any).code }}</span>
            </button>
          </div>
          <div v-else class="p-3 text-xs text-th-muted">Aucun minerai trouvé.</div>
        </div>
      </div>
      <div v-if="mining.rockForm.zoneSearchState === 'loading'" class="text-[10px] text-th-muted/60">⏳ Recherche de la composition…</div>
      <div v-if="mining.rockForm.zoneSearchState === 'found'" class="flex items-center gap-2 text-[10px] text-emerald-300">
        <span>✓ Composition chargée depuis <strong>{{ mining.rockForm.zoneLocationName }}</strong></span>
        <button type="button" @click="clearRockFormZoneMineral()" class="text-white/40 hover:text-white/60 underline">Réinitialiser</button>
      </div>
      <div v-if="mining.rockForm.zoneSearchState === 'not_found'" class="space-y-2">
        <div class="flex items-center gap-2 text-[10px] text-amber-300">
          <span>⚠ Aucune donnée pour ce minerai à cet endroit.</span>
          <button type="button" @click="mining.rockForm.zoneCreate.show = !mining.rockForm.zoneCreate.show" class="text-white/40 hover:text-white/60 underline">
            <span v-if="!mining.rockForm.zoneCreate.show">+ Créer une entrée</span>
            <span v-else>Annuler</span>
          </button>
        </div>
        <!-- Zone create sub-form -->
        <div v-if="mining.rockForm.zoneCreate.show" class="rounded-xl border border-white/8 bg-white/[0.02] p-3 space-y-2">
          <p class="text-[10px] font-semibold text-th-muted uppercase tracking-wider">Nouvelle entrée de zone</p>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="mb-1 block text-[10px] text-th-muted">Principal — {{ mining.rockForm.zoneQuery }} (qualité max)</label>
              <input type="number" min="0" max="1000" v-model.number="mining.rockForm.zoneCreate.primaryQualityMax"
                placeholder="0–1000" class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-1.5 text-xs text-th-primary focus:border-accent/40 focus:outline-none" />
            </div>
            <div></div>
            <!-- Secondaire -->
            <div class="relative">
              <label class="mb-1 block text-[10px] text-th-muted">Secondaire (optionnel)</label>
              <input :value="mineralDisplayName(mining.rockForm.zoneCreate.secondary)" readonly autocomplete="off"
                placeholder="Sélectionner un minerai secondaire…"
                class="w-full cursor-pointer rounded-xl border border-th-subtle bg-black/30 px-3 py-1.5 pr-8 text-xs text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                @click="openMineralDropdown(mining.rockForm.zoneCreate.secondary, $event)"
                @focus="openMineralDropdown(mining.rockForm.zoneCreate.secondary, $event)"
                @keydown="mineralDropdownKeydown($event, mining.rockForm.zoneCreate.secondary)" />
              <button v-if="mining.rockForm.zoneCreate.secondary.commodityId" type="button"
                class="absolute right-2.5 top-[25px] text-white/40 hover:text-white/60 text-xs"
                @click="clearMineral(mining.rockForm.zoneCreate.secondary)">✕</button>
              <div v-if="mining.rockForm.zoneCreate.secondary._open"
                class="absolute top-full left-0 right-0 z-50 mt-1 h-52 overflow-hidden rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg backdrop-blur-sm mineral-dropdown-list">
                <div class="p-2">
                  <input :value="mineralSearch(mining.rockForm.zoneCreate.secondary)" type="text" autocomplete="off" placeholder="Rechercher un minerai..."
                    class="mineral-dropdown-search sticky top-0 z-10 w-full rounded-t-xl border-b border-white/10 bg-[#0b1422]/95 px-3 py-2 text-xs text-white placeholder:text-white/60 focus:outline-none"
                    @input="setMineralSearch(mining.rockForm.zoneCreate.secondary, $event)"
                    @blur="blurZoneSecondary()"
                    @keydown="mineralDropdownKeydown($event, mining.rockForm.zoneCreate.secondary)" />
                </div>
                <div v-if="filteredMineralsForRow(mining.rockForm.zoneCreate.secondary).length" class="max-h-36 overflow-y-auto p-1.5 space-y-0.5">
                  <button v-for="(min, mi) in filteredMineralsForRow(mining.rockForm.zoneCreate.secondary)" :key="min.id" type="button"
                    @mousedown.prevent="selectMineral(mining.rockForm.zoneCreate.secondary, min)"
                    class="mineral-dropdown-item flex w-full justify-between rounded-lg border px-3 py-1.5 text-left text-xs transition"
                    :class="mi === ((mining.rockForm.zoneCreate.secondary as any)._hi ?? -1) ? 'border-accent/25 bg-accent/10 text-accent' : 'border-transparent text-white/80 hover:bg-white/5 hover:border-white/10'">
                    <span>{{ min.name }}</span><span class="text-white/30">{{ (min as any).code }}</span>
                  </button>
                </div>
                <div v-else class="p-3 text-xs text-th-muted">Aucun minerai trouvé.</div>
              </div>
            </div>
            <div>
              <label class="mb-1 block text-[10px] text-th-muted">Qualité max secondaire</label>
              <input type="number" min="0" max="1000" v-model.number="mining.rockForm.zoneCreate.secondary.qualityMax"
                :disabled="!mining.rockForm.zoneCreate.secondary.commodityId"
                class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-1.5 text-xs text-th-primary focus:border-accent/40 focus:outline-none disabled:opacity-40" />
            </div>
            <!-- Tertiaire -->
            <div class="relative">
              <label class="mb-1 block text-[10px] text-th-muted">Tertiaire (optionnel)</label>
              <input :value="mineralDisplayName(mining.rockForm.zoneCreate.tertiary)" readonly autocomplete="off"
                placeholder="Sélectionner un minerai tertiaire…"
                class="w-full cursor-pointer rounded-xl border border-th-subtle bg-black/30 px-3 py-1.5 pr-8 text-xs text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                @click="openMineralDropdown(mining.rockForm.zoneCreate.tertiary, $event)"
                @focus="openMineralDropdown(mining.rockForm.zoneCreate.tertiary, $event)"
                @keydown="mineralDropdownKeydown($event, mining.rockForm.zoneCreate.tertiary)" />
              <button v-if="mining.rockForm.zoneCreate.tertiary.commodityId" type="button"
                class="absolute right-2.5 top-[25px] text-white/40 hover:text-white/60 text-xs"
                @click="clearMineral(mining.rockForm.zoneCreate.tertiary)">✕</button>
              <div v-if="mining.rockForm.zoneCreate.tertiary._open"
                class="absolute top-full left-0 right-0 z-50 mt-1 h-52 overflow-hidden rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg backdrop-blur-sm mineral-dropdown-list">
                <div class="p-2">
                  <input :value="mineralSearch(mining.rockForm.zoneCreate.tertiary)" type="text" autocomplete="off" placeholder="Rechercher un minerai..."
                    class="mineral-dropdown-search sticky top-0 z-10 w-full rounded-t-xl border-b border-white/10 bg-[#0b1422]/95 px-3 py-2 text-xs text-white placeholder:text-white/60 focus:outline-none"
                    @input="setMineralSearch(mining.rockForm.zoneCreate.tertiary, $event)"
                    @blur="blurZoneTertiary()"
                    @keydown="mineralDropdownKeydown($event, mining.rockForm.zoneCreate.tertiary)" />
                </div>
                <div v-if="filteredMineralsForRow(mining.rockForm.zoneCreate.tertiary).length" class="max-h-36 overflow-y-auto p-1.5 space-y-0.5">
                  <button v-for="(min, mi) in filteredMineralsForRow(mining.rockForm.zoneCreate.tertiary)" :key="min.id" type="button"
                    @mousedown.prevent="selectMineral(mining.rockForm.zoneCreate.tertiary, min)"
                    class="mineral-dropdown-item flex w-full justify-between rounded-lg border px-3 py-1.5 text-left text-xs transition"
                    :class="mi === ((mining.rockForm.zoneCreate.tertiary as any)._hi ?? -1) ? 'border-accent/25 bg-accent/10 text-accent' : 'border-transparent text-white/80 hover:bg-white/5 hover:border-white/10'">
                    <span>{{ min.name }}</span><span class="text-white/30">{{ (min as any).code }}</span>
                  </button>
                </div>
                <div v-else class="p-3 text-xs text-th-muted">Aucun minerai trouvé.</div>
              </div>
            </div>
            <div>
              <label class="mb-1 block text-[10px] text-th-muted">Qualité max tertiaire</label>
              <input type="number" min="0" max="1000" v-model.number="mining.rockForm.zoneCreate.tertiary.qualityMax"
                :disabled="!mining.rockForm.zoneCreate.tertiary.commodityId"
                class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-1.5 text-xs text-th-primary focus:border-accent/40 focus:outline-none disabled:opacity-40" />
            </div>
          </div>
          <p v-if="mining.rockForm.zoneCreate.error" class="text-xs text-rose-300">{{ mining.rockForm.zoneCreate.error }}</p>
          <button @click="mining.rockFormSuggestZone()" :disabled="mining.rockForm.zoneCreate.saving"
            class="rounded-xl border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 disabled:opacity-50">
            {{ mining.rockForm.zoneCreate.saving ? 'Enregistrement…' : 'Enregistrer la zone et pré-remplir' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Minéraux détectés -->
    <div class="rounded-xl border border-white/8 bg-white/[0.02] p-3 space-y-2">
      <div class="flex items-center justify-between">
        <p class="text-[10px] font-semibold text-th-muted uppercase tracking-wider">Minéraux détectés</p>
        <button @click="rockFormAddMineral()" class="text-[10px] text-accent hover:underline">+ Ajouter</button>
      </div>
      <div class="grid grid-cols-[1fr_5rem_5rem_1.5rem] gap-2 text-[10px] text-th-muted/60 px-1">
        <span>Nom</span><span>% SCU</span><span>Qualité</span><span></span>
      </div>
      <div v-for="(m, i) in mining.rockForm.minerals" :key="i" class="grid grid-cols-[1fr_5rem_5rem_1.5rem] gap-2 items-center">
        <div class="relative">
          <input :value="mineralDisplayName(m)" readonly autocomplete="off"
            :placeholder="m.commodityId ? '' : 'Sélectionner un minerai…'"
            class="w-full cursor-pointer rounded-xl border border-th-subtle bg-black/30 px-3 py-1.5 pr-8 text-xs text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
            @click="openMineralDropdown(m, $event)"
            @focus="openMineralDropdown(m, $event)"
            @keydown="mineralDropdownKeydown($event, m)" />
          <button v-if="m.commodityId" type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 text-xs"
            @click="clearMineral(m)">✕</button>
          <div v-if="m._open"
            class="absolute top-full left-0 right-0 z-50 mt-1 h-52 overflow-hidden rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg backdrop-blur-sm mineral-dropdown-list">
            <div class="p-2">
              <input :value="mineralSearch(m)" type="text" autocomplete="off" placeholder="Rechercher un minerai..."
                class="mineral-dropdown-search sticky top-0 z-10 w-full rounded-t-xl border-b border-white/10 bg-[#0b1422]/95 px-3 py-2 text-xs text-white placeholder:text-white/60 focus:outline-none"
                @input="setMineralSearch(m, $event)"
                @blur="blurMineralRow(m)"
                @keydown="mineralDropdownKeydown($event, m)" />
            </div>
            <div v-if="filteredMineralsForRow(m).length" class="max-h-36 overflow-y-auto p-1.5 space-y-0.5">
              <button v-for="(min, mi) in filteredMineralsForRow(m)" :key="min.id" type="button"
                @mousedown.prevent="selectMineral(m, min)"
                class="mineral-dropdown-item flex w-full justify-between rounded-lg border px-3 py-1.5 text-left text-xs transition"
                :class="mi === ((m as any)._hi ?? -1) ? 'border-accent/25 bg-accent/10 text-accent' : 'border-transparent text-white/80 hover:bg-white/5 hover:border-white/10'">
                <span>{{ min.name }}</span><span class="text-white/30">{{ (min as any).code }}</span>
              </button>
            </div>
            <div v-else class="p-3 text-xs text-th-muted">Aucun minerai trouvé.</div>
          </div>
        </div>
        <input v-model="m.percentage" type="text" inputmode="decimal" placeholder="%"
          class="w-full rounded-xl border border-th-subtle bg-black/30 px-2 py-1.5 text-xs text-th-primary focus:border-accent/40 focus:outline-none" />
        <input v-model.number="m.quality" type="number" min="0" max="1000" placeholder="500"
          class="w-full rounded-xl border border-th-subtle bg-black/30 px-2 py-1.5 text-xs text-th-primary focus:border-accent/40 focus:outline-none" />
        <button @click="rockFormRemoveMineral(i)" class="text-th-muted hover:text-rose-300 text-sm text-center">×</button>
      </div>
    </div>

    <!-- Notes -->
    <div class="rounded-xl border border-white/8 bg-white/[0.02] p-3 space-y-1">
      <p class="text-[10px] font-semibold text-th-muted uppercase tracking-wider">Notes</p>
      <textarea v-model="mining.rockForm.notes" rows="2" placeholder="Observations, danger, contexte du scan…"
        class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-xs text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none resize-none"></textarea>
    </div>

    <p v-if="mining.rockForm.error" class="text-xs text-rose-300">{{ mining.rockForm.error }}</p>
    <div class="flex justify-end gap-2">
      <button class="rounded-xl border border-th-subtle bg-white/5 px-3 py-1.5 text-xs text-th-muted hover:bg-white/10"
        @click="cancel()">Annuler</button>
      <button class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
        :disabled="mining.rockForm.saving" @click="saveRockForm()">
        {{ mining.rockForm.saving ? 'Envoi...' : (mining.rockForm.editRockId ? 'Enregistrer les modifications' : 'Signaler le rocher') }}
      </button>
    </div>
  </div>
</template>
