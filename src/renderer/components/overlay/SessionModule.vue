<script setup lang="ts">
import { computed } from 'vue'
import type { OverlayModuleConfig, MiningSessionDetail, MiningRock } from '@shared/general'
import { useMiningStore } from '../../stores/mining'
import { useCurrentSession } from '../../composables/useCurrentSession'
import { usePinnedSession } from '../../composables/usePinnedSession'
import RocksPanel from './session/RocksPanel.vue'
import CargoPanel from './session/CargoPanel.vue'
import ParticipantsPanel from './session/ParticipantsPanel.vue'
import ActionsPanel from './session/ActionsPanel.vue'

const props = defineProps<{
  config: OverlayModuleConfig
  preview?: boolean
}>()

const mining = useMiningStore()
const { pinnedSessionId } = usePinnedSession()
const { sessionDetail, activeRocks, cargoSummary, participants, loadingSession } = useCurrentSession()

// ── Preview data mode éditeur ────────────────────────────────────────────────
const PREVIEW_SESSION: MiningSessionDetail = {
  id: 0,
  hostName: 'Engooref',
  status: 'Mining',
  createdAt: new Date(Date.now() - 5_025_000).toISOString(),
  rocks: [],
  participants: [],
  logs: [],
} as unknown as MiningSessionDetail

const PREVIEW_ROCKS: MiningRock[] = [
  { id: 1, commodityId: '1', commodityName: 'Hadanite', scuInput: 28, status: 'mining', assignedTo: 'pilot01', minerals: [] } as unknown as MiningRock,
  { id: 2, commodityId: '2', commodityName: 'Bexalite', scuInput: 32, status: 'ready',  assignedTo: null,      minerals: [] } as unknown as MiningRock,
]

const PREVIEW_CARGO = [
  { mineralId: '1', mineralName: 'Hadanite', totalScu: 156 },
  { mineralId: '2', mineralName: 'Bexalite', totalScu: 89 },
  { mineralId: '3', mineralName: 'Taranite', totalScu: 12 },
]

const PREVIEW_PARTICIPANTS = [
  { userId: '1', userLabel: 'Engooref', role: 'captain',    status: 'ready',  isReady: true,  isMining: false },
  { userId: '2', userLabel: 'Pilot01',  role: 'subcaptain', status: 'mining', isReady: false, isMining: true  },
  { userId: '3', userLabel: 'Crew01',   role: 'crew',       status: 'ready',  isReady: true,  isMining: false },
]

const panelType = computed(() => props.config.miningPanelType ?? 'info')
const hasSession = computed(() => props.preview || !!mining.sessionActive || !!pinnedSessionId.value)

const displaySession = computed(() => props.preview ? PREVIEW_SESSION : sessionDetail.value)
const displayRocks = computed(() => props.preview ? PREVIEW_ROCKS : (activeRocks.value ?? []))
const displayCargo = computed(() => props.preview ? PREVIEW_CARGO : (cargoSummary.value ?? []))
const displayParticipants = computed(() => props.preview ? PREVIEW_PARTICIPANTS : (participants.value ?? []))

const cargoTotalScu = computed(() =>
  displayCargo.value.reduce((sum, item) => sum + (Number(item.totalScu) || 0), 0)
)

const rocksTotalScu = computed(() =>
  displayRocks.value.reduce((sum, rock) => sum + (Number(rock.scuInput) || 0), 0)
)

const panelMeta = computed(() => {
  switch (panelType.value) {
    case 'rocks':
      return {
        title: 'Session · Rochers',
        subtitle: `${displayRocks.value.length} actif(s)`,
        metric: `${rocksTotalScu.value} SCU`,
      }
    case 'cargo':
      return {
        title: 'Session · Cargaison',
        subtitle: `${displayCargo.value.length} minerai(s)`,
        metric: `${cargoTotalScu.value} SCU`,
      }
    case 'participants':
      return {
        title: 'Session · Équipe',
        subtitle: `${displayParticipants.value.filter(p => p.isReady).length}/${displayParticipants.value.length} prêt(s)`,
        metric: `${displayParticipants.value.length}`,
      }
    case 'actions':
      return {
        title: 'Session · Actions',
        subtitle: 'Commandes rapides',
        metric: displaySession.value?.status ?? 'Active',
      }
    case 'info':
    default:
      return {
        title: 'Session · Infos',
        subtitle: displaySession.value?.hostName ? `Cap. ${displaySession.value.hostName}` : 'Session active',
        metric: displaySession.value?.status ?? 'Active',
      }
  }
})
</script>

<template>
  <!-- ── Session active ─────────────────────────────────────────── -->
  <div
    v-if="hasSession"
    class="session-overlay-panel relative w-full h-full overflow-hidden rounded-xl border border-white/[0.08] shadow-2xl backdrop-blur-md"
    style="background-color: rgb(from var(--bg-color, #000000) r g b / var(--bg-alpha, 0.65))"
  >
    <!-- Liseré accent en haut -->
    <div class="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent/70 to-transparent pointer-events-none" />

    <div class="flex h-full min-h-0 flex-col px-3 pb-2.5 pt-2.5">
      <!-- ── En-tête ── -->
      <div class="mb-2 flex items-center gap-2">
        <span class="shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-accent/50">
          {{ panelMeta.title }}
        </span>
        <div class="h-px flex-1 bg-white/[0.05]" />
        <span class="shrink-0 text-[10px] font-semibold tabular-nums text-th-muted">
          {{ panelMeta.metric }}
        </span>
      </div>

      <!-- Sous-titre / contexte -->
      <p class="mb-2.5 truncate text-[11px] font-bold leading-tight text-th-primary">
        {{ panelMeta.subtitle }}
      </p>

      <!-- Contenu du module -->
      <div class="min-h-0 flex-1 overflow-hidden">
        <!-- Chargement session épinglée -->
        <div v-if="loadingSession && !displaySession" class="flex h-full items-center justify-center">
          <svg class="h-4 w-4 animate-spin text-accent/40" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
        <template v-else>
        <RocksPanel
          v-if="panelType === 'rocks'"
          :rocks="displayRocks"
        />
        <CargoPanel
          v-else-if="panelType === 'cargo'"
          :cargo="displayCargo"
        />
        <ParticipantsPanel
          v-else-if="panelType === 'participants'"
          :participants="displayParticipants"
        />
       
        <ActionsPanel
          v-else-if="panelType === 'actions'"
          :session="displaySession"
        />
        <div v-else class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 text-[11px] text-th-muted">
          Module inconnu · {{ panelType }}
        </div>
        </template>
      </div>
    </div>
  </div>

  <!-- ── Aucune session ─────────────────────────────────────────── -->
  <div
    v-else
    class="w-full rounded-xl border border-white/10 px-3 py-2.5 shadow-xl backdrop-blur-sm"
    style="background-color: rgb(from var(--bg-color, #000000) r g b / var(--bg-alpha, 0.65))"
  >
    <div class="flex items-center gap-2">
      <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-th-muted bg-th-card">
        <svg class="h-2.5 w-2.5 text-th-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2m4-2a8 8 0 11-16 0 8 8 0 0116 0z" />
        </svg>
      </div>
      <span class="text-[11px] font-semibold uppercase tracking-wider text-th-muted">Aucune session active</span>
    </div>
  </div>
</template>

<style scoped>
.session-overlay-panel {
  display: flex;
  flex-direction: column;
}
</style>
