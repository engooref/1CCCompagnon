<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MiningRock, MiningRockMineral } from '@shared/general'
import { useMiningStore } from '../../../stores/mining'
import OverlaySelect from './OverlaySelect.vue'

const props = defineProps<{
  rocks: MiningRock[]
  preview?: boolean
  interactive?: boolean
}>()

type RockTabFilter = 'all' | 'available' | 'help'
const activeTab = ref<RockTabFilter>('all')

const mining = useMiningStore()

const collectRockId  = ref<number | null>(null)
const claimPendingId = ref<number | null>(null)

// ── Helpers rôle ─────────────────────────────────────────────────────────────
function isParticipant() { return mining.myParticipant != null }
function isMiner()       { return mining.myParticipant?.role === 'miner' }
function isMineRock(rock: MiningRock) { return (rock as any).claimedByUserId === mining._currentUserId }

function canClaimRock(rock: MiningRock) {
  return rock.status === 'available' && isMiner() &&
    (mining.myParticipant?.isCaptain || mining.myParticipant?.isSubCaptain)
}
function canDeclarePartial(rock: MiningRock) {
  return rock.status === 'extraction' && isParticipant() && !isMineRock(rock)
}
function canFinalize(rock: MiningRock) {
  if (!rock || !mining._currentUserId) return false
  if (isMineRock(rock)) return true
  const me = mining.myParticipant
  if (!me || (!me.isCaptain && !me.isSubCaptain)) return false
  const claimer = (mining.sessionActive?.participants ?? []).find((p: any) => p.userId === (rock as any).claimedByUserId)
  return claimer?.crewKey && me.crewKey && claimer.crewKey === me.crewKey
}

// ── Filtres onglets ───────────────────────────────────────────────────────────
const filteredRocks = computed(() => {
  if (activeTab.value === 'available') return props.rocks.filter(r => r.status === 'available')
  if (activeTab.value === 'help')      return props.rocks.filter(r => canClaimRock(r) || canDeclarePartial(r))
  return props.rocks
})
function tabCount(tab: RockTabFilter): number {
  if (tab === 'available') return props.rocks.filter(r => r.status === 'available').length
  if (tab === 'help')      return props.rocks.filter(r => canClaimRock(r) || canDeclarePartial(r)).length
  return props.rocks.length
}

// ── Statut ───────────────────────────────────────────────────────────────────
function rockStatus(rock: MiningRock): string {
  return String(rock.status ?? '').toLowerCase()
}
function statusLabel(s: string): string {
  return ({ available: 'Disponible', en_route: 'En route', fracturing: 'Fracturation',
            extraction: 'Extraction', completed: 'Collecté', depleted: 'Épuisé' } as Record<string,string>)[s] ?? s
}
function statusClass(s: string): string {
  return ({ available:  'border-emerald-500/30 bg-emerald-500/20 text-emerald-300',
            en_route:   'border-sky-500/30 bg-sky-500/20 text-sky-300',
            fracturing: 'border-orange-500/30 bg-orange-500/20 text-orange-300',
            extraction: 'border-violet-500/30 bg-violet-500/20 text-violet-300',
            completed:  'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
            depleted:   'border-red-500/20 bg-red-500/10 text-red-400/60' } as Record<string,string>)[s]
    ?? 'border-white/[0.08] bg-th-card/40 text-white/60'
}

// ── Helpers collectForm ──────────────────────────────────────────────────────
function addCollectLine() {
  mining.collectForm.lines.push({
    commodityId: null, commodityName: '', quantityScuActual: '',
    scanEstimateScu: 0, alreadyCollectedScu: 0,
    _name: '', _query: '', _search: '', _open: false, _hi: -1,
  } as any)
}
function removeCollectLine(i: number) {
  if (mining.collectForm.lines.length > 1) mining.collectForm.lines.splice(i, 1)
}
function availableMinerals(line: any): any[] {
  const allowed = (mining.collectForm.rockMineralIds ?? []).map(Number)
  return allowed.length
    ? mining.minerals.filter((m: any) => allowed.includes(Number(m.id)))
    : mining.minerals
}
function onSelectMineral(line: any, e: Event) {
  const id = Number((e.target as HTMLSelectElement).value)
  const min = mining.minerals.find((m: any) => Number(m.id) === id)
  if (min) { line.commodityId = min.id; line.commodityName = min.name }
  else      { line.commodityId = null;   line.commodityName = '' }
}

function lineQuality(line: any): number | null {
  const rock = mining.sessionActive?.rocks.find((r) => r.id === mining.collectForm.rockId)
  if (!rock) return null
  const m = rock.minerals.find((m) => m.phase === 'scan' && Number(m.commodityId) === Number(line.commodityId))
  return m?.quality ?? null
}
function qualityColor(q: number | null): string {
  if (q == null) return 'text-white/40'
  if (q >= 700)  return 'text-emerald-300'
  if (q >= 400)  return 'text-amber-300'
  return 'text-rose-300'
}
function qualityLabel(q: number | null): string {
  return q == null ? '' : 'Q' + q
}

// ── Minéraux scan ─────────────────────────────────────────────────────────────
function scanMinerals(rock: MiningRock): MiningRockMineral[] {
  return (rock.minerals ?? []).filter((m) => m.phase === 'scan' && m.commodityId)
}
const MINERAL_COLORS = [
  'border-cyan-400/30 bg-cyan-950/30 text-cyan-300',
  'border-violet-400/30 bg-violet-950/30 text-violet-300',
  'border-amber-400/30 bg-amber-950/30 text-amber-300',
  'border-rose-400/30 bg-rose-950/30 text-rose-300',
  'border-emerald-400/30 bg-emerald-950/30 text-emerald-300',
]
function fmt(val: number | null | undefined, dec = 0): string {
  return val == null ? '—' : Number(val).toFixed(dec)
}

// ── Actions ──────────────────────────────────────────────────────────────────
async function claimRock(rock: MiningRock) {
  if (props.preview) return
  claimPendingId.value = null
  await mining.claimRock(Number(rock.id))
}
async function unclaim(rock: MiningRock) {
  if (props.preview) return
  await mining.unclaimRock(Number(rock.id))
}
async function setStatus(rock: MiningRock, status: string) {
  if (props.preview) return
  await mining.updateRockStatus(Number(rock.id), status)
}
function openCollect(rock: MiningRock, mode: 'partial' | 'complete') {
  if (props.preview) return
  if (collectRockId.value === rock.id) { collectRockId.value = null; return }
  collectRockId.value = rock.id
  mining.openCollectForm(Number(rock.id), mode)
}
async function submitCollect() {
  await mining.collectRock()
  collectRockId.value = null
}
function cancelCollect() {
  mining.collectForm.show = false
  collectRockId.value = null
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-1.5">
    <!-- Onglets filtre -->
    <div class="flex shrink-0 gap-1">
      <button
        v-for="tab in (['all', 'available', 'help'] as RockTabFilter[])"
        :key="tab"
        class="rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors"
        :class="activeTab === tab
          ? 'border-accent/50 bg-accent/15 text-accent'
          : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/10 hover:text-white/70'"
        @click="activeTab = tab"
      >
        {{ tab === 'all' ? 'Tous' : tab === 'available' ? 'Libres' : 'Aide' }}
        <span class="ml-0.5 opacity-70">{{ tabCount(tab) }}</span>
      </button>
    </div>

    <div v-if="filteredRocks.length" class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1 session-scrollbar">
      <div
        v-for="rock in filteredRocks"
      :key="rock.id"
      class="rounded-md border bg-th-card/40"
      :class="['fracturing','extraction'].includes(rockStatus(rock)) ? 'border-orange-500/15' : 'border-white/[0.08]'"
    >
      <!-- En-tête -->
      <div class="flex items-center justify-between gap-2 px-2 pt-1.5 pb-0.5">
        <p class="truncate text-[11px] font-bold text-th-primary">{{ rock.bodyName || '—' }}</p>
        <span class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" :class="statusClass(rockStatus(rock))">
          {{ statusLabel(rockStatus(rock)) }}
        </span>
      </div>

      <!-- Stats -->
      <div class="flex flex-wrap items-center gap-x-2 px-2 pb-1">
        <span class="text-[10px] font-semibold text-th-primary">{{ fmt(rock.sizeScuEstimate) }} SCU</span>
        <span class="text-[9px] text-white/60">Masse {{ fmt(rock.mass) }}</span>
        <span v-if="rock.instability != null" class="text-[9px] text-white/60">Instab. {{ fmt(rock.instability) }}%</span>
        <span v-if="rock.resistance  != null" class="text-[9px] text-white/60">Résist. {{ fmt(rock.resistance) }}%</span>
      </div>

      <!-- Minéraux scan -->
      <div v-if="scanMinerals(rock).length" class="flex flex-wrap gap-1 px-2 pb-1.5">
        <span
          v-for="(min, i) in scanMinerals(rock)"
          :key="min.commodityId"
          class="rounded border px-1.5 py-0.5 text-[9px] font-semibold"
          :class="MINERAL_COLORS[i % MINERAL_COLORS.length]"
        >
          {{ min.commodityName }} {{ fmt(min.percentage) }}%
        </span>
      </div>

      <!-- Signalé / réclamé -->
      <div class="flex items-center gap-2 border-t border-white/[0.04] px-2 py-1 text-[9px] text-white/60">
        <span v-if="rock.reportedBy">Signalé par <span class="text-th-primary">{{ rock.reportedBy }}</span></span>
        <span v-if="rock.claimedBy">↪ <span class="text-th-primary">{{ rock.claimedBy }}</span></span>
      </div>

      <!-- Boutons d'action -->
      <div v-if="interactive && !preview" class="flex flex-wrap gap-1 border-t border-white/[0.04] px-2 py-1.5">

        <!-- Réclamer -->
        <template v-if="canClaimRock(rock)">
          <template v-if="claimPendingId === rock.id">
            <button class="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300 hover:bg-emerald-500/20" :disabled="mining.loading.claimRock" @click="claimRock(rock)">Confirmer</button>
            <button class="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-white/60 hover:bg-white/10" @click="claimPendingId = null">Annuler</button>
          </template>
          <button v-else class="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300 hover:bg-emerald-500/20" @click="claimPendingId = rock.id">Réclamer</button>
        </template>

        <!-- Laser actif : en_route → fracturing -->
        <button
          v-if="rockStatus(rock) === 'en_route' && isMineRock(rock)"
          class="rounded border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[9px] font-bold text-orange-300 hover:bg-orange-500/20"
          :disabled="mining.loading.updateRockStatus"
          @click="setStatus(rock, 'fracturing')"
        >⚡ Laser actif</button>

        <!-- Extraction : fracturing → extraction -->
        <button
          v-if="rockStatus(rock) === 'fracturing' && isMineRock(rock)"
          class="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold text-violet-300 hover:bg-violet-500/20"
          :disabled="mining.loading.updateRockStatus"
          @click="setStatus(rock, 'extraction')"
        >↓ Extraction</button>

        <!-- Se désister -->
        <button
          v-if="['en_route','fracturing'].includes(rockStatus(rock)) && isMineRock(rock)"
          class="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-white/60 hover:bg-white/10"
          :disabled="mining.loading.claimRock"
          @click="unclaim(rock)"
        >↩ Se désister</button>

        <!-- Déclarer partiel -->
        <button
          v-if="canDeclarePartial(rock)"
          class="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold text-sky-300 hover:bg-sky-500/20"
          @click="openCollect(rock, 'partial')"
        >+ Partiel</button>

        <!-- Finaliser -->
        <button
          v-if="canFinalize(rock)"
          class="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300 hover:bg-emerald-500/20"
          @click="openCollect(rock, 'complete')"
        >✓ Finaliser</button>
      </div>

      <!-- Mini-form collecte -->
      <div
        v-if="interactive && collectRockId === rock.id && mining.collectForm.show && mining.collectForm.rockId === rock.id"
        class="border-t border-emerald-500/15 bg-emerald-950/20 px-2 pb-2 pt-1.5 space-y-1.5"
      >
        <p class="text-[9px] uppercase tracking-widest text-emerald-400/70">Quantités collectées (SCU)</p>

        <div v-for="(line, i) in mining.collectForm.lines" :key="i" class="flex items-center gap-1 mt-1">
          <template v-if="!line.commodityId">
            <OverlaySelect
              class="min-w-0 flex-1"
              :model-value="''"
              :options="[{ value: '', label: '— Minéral —' }, ...availableMinerals(line).map((m: any) => ({ value: String(m.id), label: m.name }))]"
              @update:model-value="(val) => { if (val) { const m = mining.minerals.find((x: any) => String(x.id) === val); if (m) { line.commodityId = m.id; line.commodityName = m.name } } }"
            />
          </template>
          <template v-else>
            <span class="min-w-0 flex-1 truncate text-[10px] text-th-primary">
              {{ line.commodityName }}
              <span v-if="line.scanEstimateScu" class="text-white/50">~{{ line.scanEstimateScu.toFixed(1) }} SCU</span>
              <span v-if="lineQuality(line) != null" :class="qualityColor(lineQuality(line))" class="ml-1">{{ qualityLabel(lineQuality(line)) }}</span>
            </span>
          </template>

          <input
            v-model="line.quantityScuActual"
            type="number" min="0" step="0.1" placeholder="0"
            class="w-14 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-right text-[10px] text-th-primary outline-none focus:border-emerald-500/50"
          />
          <span class="text-[9px] text-white/60">SCU</span>
          <button
            class="shrink-0 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] text-white/60 hover:bg-white/10 hover:text-rose-300"
            @click="removeCollectLine(i)"
          >✕</button>
        </div>

        <button
          class="mt-1 w-full rounded border border-white/10 bg-white/[0.03] py-0.5 text-[9px] text-white/60 hover:bg-white/10"
          @click="addCollectLine"
        >+ Ajouter un minéral</button>

        <p v-if="mining.collectForm.error" class="text-[9px] text-rose-400">{{ mining.collectForm.error }}</p>

        <div class="flex gap-1.5 pt-0.5">
          <button class="flex-1 rounded border border-white/10 bg-white/5 py-1 text-[9px] font-semibold text-white/60 hover:bg-white/10" @click="cancelCollect">Annuler</button>
          <button class="flex-1 rounded border border-emerald-500/30 bg-emerald-500/10 py-1 text-[9px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40" :disabled="mining.collectForm.saving" @click="submitCollect">
            {{ mining.collectForm.saving ? '…' : 'Confirmer' }}
          </button>
        </div>
      </div>
    </div>
    </div>

    <div v-else class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 text-[10px] uppercase tracking-widest text-white/45">
      {{ activeTab === 'help' ? 'Aucun rocher où vous pouvez aider' : activeTab === 'available' ? 'Aucun rocher disponible' : 'Aucun rocher actif' }}
    </div>
  </div>
</template>

<style scoped>
.session-scrollbar::-webkit-scrollbar { width: 3px; }
.session-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb), 0.25); border-radius: 999px; }
.session-scrollbar::-webkit-scrollbar-track { background: transparent; }
select { color-scheme: dark; }
</style>
