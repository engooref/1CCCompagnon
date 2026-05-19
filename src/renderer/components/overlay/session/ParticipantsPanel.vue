<script setup lang="ts">
import { computed } from 'vue'
import { useMiningStore } from '../../../stores/mining'
import OverlaySelect from './OverlaySelect.vue'

interface Participant {
  id: number
  userId: string
  userLabel: string
  role: string
  status: string
  duty: string | null
  isCaptain: boolean
  isSubCaptain: boolean
  shipName: string | null
  crewKey: string | null
}

const props = defineProps<{
  participants: Participant[]
  sessionId: number | null
  preview?: boolean
}>()

const mining = useMiningStore()

const me = computed(() => mining.myParticipant)
const canManage = computed(() =>
  props.preview || (!!me.value && (me.value.isCaptain || me.value.isSubCaptain))
)
const amICaptain = computed(() => props.preview || !!me.value?.isCaptain)

// ── Groupes par crewKey ──────────────────────────────────────────────────────
interface CrewGroup {
  key: string
  crewId: number | null
  shipName: string | null
  status: string | null
  suggested: string
  effectiveStatus: string
  members: Participant[]
}

function suggestCrewStatus(members: Participant[]): string {
  const userIds = new Set(members.map((m) => m.userId).filter(Boolean))
  const rocks = (mining.sessionActive?.rocks ?? []).filter((r: any) => userIds.has(r.claimedByUserId))
  if (rocks.some((r: any) => r.status === 'incident'))   return 'incident'
  if (rocks.some((r: any) => r.status === 'extraction')) return 'extraction'
  if (rocks.some((r: any) => ['fracturing', 'mining'].includes(r.status))) return 'fracturing'
  if (rocks.some((r: any) => r.status === 'claimed'))    return 'positioning'
  if (rocks.some((r: any) => r.status === 'en_route'))   return 'transit'
  return 'standby'
}

const crews = computed<CrewGroup[]>(() => {
  const apiCrews = ((mining.sessionActive as any)?.crews ?? []) as any[]
  const map = new Map<string, CrewGroup>()
  for (const p of props.participants) {
    const key = p.crewKey ?? `__solo_${p.id}`
    if (!map.has(key)) {
      const apiCrew = apiCrews.find((c: any) => c.crewKey === key)
      map.set(key, { key, crewId: apiCrew?.id ?? null, shipName: p.shipName ?? null, status: apiCrew?.status ?? null, suggested: 'standby', effectiveStatus: 'standby', members: [] })
    }
    map.get(key)!.members.push(p)
  }
  for (const crew of map.values()) {
    crew.members.sort((a, b) => {
      if (a.isCaptain)    return -1
      if (b.isCaptain)    return 1
      if (a.isSubCaptain) return -1
      if (b.isSubCaptain) return 1
      return 0
    })
    crew.suggested      = suggestCrewStatus(crew.members)
    crew.effectiveStatus = crew.status ?? crew.suggested
  }
  return Array.from(map.values())
})

// ── Statut équipage ──────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  transit: 'En transit', scouting: 'Scan zone', positioning: 'En position',
  fracturing: 'Fracturation', extraction: 'Extraction',
  refining: 'Raffinage', standby: 'Stand-by',
  incident: 'Incident',
}

const STATUS_OPTIONS_BASE = [
  { value: 'transit',      label: 'En transit' },
  { value: 'scouting',     label: 'Scan de zone' },
  { value: 'positioning',  label: 'En position' },
  { value: 'fracturing',   label: 'Fracturation' },
  { value: 'extraction',   label: 'Extraction' },
  { value: 'refining',     label: 'Raffinage' },
  { value: 'standby',      label: 'Stand-by' },
  { value: 'incident',     label: 'Incident' },
]

function statusOptions(crew: CrewGroup): { value: string; label: string }[] {
  return [{ value: '', label: `Auto : ${crewStatusLabel(crew.suggested)}` }, ...STATUS_OPTIONS_BASE]
}

function crewStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}
function crewStatusClass(status: string): string {
  const map: Record<string, string> = {
    transit:     'border-sky-400/30 bg-sky-950/40 text-sky-300/80',
    positioning: 'border-sky-400/30 bg-sky-950/40 text-sky-300/80',
    scouting:    'border-violet-400/30 bg-violet-950/40 text-violet-300/80',
    fracturing:  'border-orange-400/30 bg-orange-950/40 text-orange-300/80',
    extraction:  'border-cyan-400/30 bg-cyan-950/40 text-cyan-300/80',
    refining:    'border-emerald-400/25 bg-emerald-950/40 text-emerald-300/80',
    incident:    'border-rose-400/30 bg-rose-950/40 text-rose-300/80',
    standby:     'border-white/[0.08] bg-th-card/40 text-white/60',
  }
  return map[status] ?? 'border-white/[0.08] bg-th-card/40 text-white/45'
}

function onCrewStatusChange(key: string, val: string) {
  mining.setCrewStatusOverride(key, val || null)
}

// ── Duty par membre ──────────────────────────────────────────────────────────
const DUTY_LABELS: Record<string, string> = {
  pilot: 'Pilote', laser_operator: 'Laser', collector: 'Collecte',
  scout: 'Scout', support: 'Support', refinery_runner: 'Raffinerie',
}
function dutyOptions(p: Participant): { value: string; label: string }[] {
  const base = [{ value: 'pilot', label: 'Pilote' }, { value: 'laser_operator', label: 'Laser' }]
  if (p.role === 'prospector') return [...base, { value: 'scout', label: 'Scout' }]
  if (p.role === 'support')    return [...base, { value: 'support', label: 'Support' }]
  return [...base, { value: 'collector', label: 'Collecte' }]
}
function effectiveDuty(p: Participant): string {
  return p.duty ?? ''
}
function displayDuty(p: Participant): string {
  if (p.duty) return p.duty
  if (p.role === 'prospector') return 'scout'
  if (p.role === 'support')    return 'support'
  if (p.isCaptain)             return 'pilot'
  if (p.isSubCaptain)          return 'laser_operator'
  return 'collector'
}
function dutyClass(d: string): string {
  const map: Record<string, string> = {
    pilot:           'border-sky-400/30 bg-sky-950/40 text-sky-300/80',
    laser_operator:  'border-orange-400/30 bg-orange-950/40 text-orange-300/80',
    collector:       'border-amber-400/30 bg-amber-950/40 text-amber-300/80',
    scout:           'border-violet-400/30 bg-violet-950/40 text-violet-300/80',
    support:         'border-cyan-400/30 bg-cyan-950/40 text-cyan-300/80',
    refinery_runner: 'border-emerald-400/25 bg-emerald-950/40 text-emerald-300/80',
  }
  return map[d] ?? 'border-white/[0.08] bg-th-card/40 text-white/60'
}
function onDutyChange(p: Participant, val: string) {
  if (!props.sessionId) return
  mining.updateParticipantDuty(props.sessionId, p.id, val)
}

// ── Rang ─────────────────────────────────────────────────────────────────────
function rankLabel(p: Participant): string {
  if (p.isCaptain)    return 'CAP'
  if (p.isSubCaptain) return 'S-CAP'
  return ''
}
function rankClass(p: Participant): string {
  if (p.isCaptain)    return 'border-accent/40 bg-accent/10 text-accent/90'
  if (p.isSubCaptain) return 'border-sky-400/30 bg-sky-950/40 text-sky-300/80'
  return ''
}

function onAssignSubCaptain(p: Participant) {
  if (!props.sessionId) return
  mining.assignSubCaptain(props.sessionId, p.id)
}
</script>

<template>
  <div v-if="props.participants.length" class="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1 session-scrollbar">
    <div
      v-for="crew in crews"
      :key="crew.key"
      class="rounded-md border border-white/[0.08] bg-th-card/40 overflow-hidden"
    >
      <!-- En-tête : vaisseau + statut équipage -->
      <div class="flex items-center justify-between gap-2 border-b border-white/[0.06] px-2 py-1">
        <span class="truncate text-[10px] font-bold text-th-primary">
          {{ crew.shipName ?? 'Vaisseau inconnu' }}
        </span>
        <OverlaySelect
          v-if="canManage"
          :model-value="crew.status ?? ''"
          :options="statusOptions(crew)"
          max-width="110px"
          @update:model-value="onCrewStatusChange(crew.key, $event)"
        />
        <span
          v-else
          class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          :class="crewStatusClass(crew.effectiveStatus)"
        >{{ crewStatusLabel(crew.effectiveStatus) }}</span>
      </div>

      <!-- Membres -->
      <div class="flex flex-col divide-y divide-white/[0.04]">
        <div
          v-for="p in crew.members"
          :key="p.id"
          class="flex items-center gap-1.5 px-2 py-1"
        >
          <span
            v-if="rankLabel(p)"
            class="shrink-0 rounded border px-1 py-0.5 text-[8px] font-black uppercase tracking-wider"
            :class="rankClass(p)"
          >{{ rankLabel(p) }}</span>

          <span class="min-w-0 flex-1 truncate text-[10px] font-semibold text-th-primary">{{ p.userLabel }}</span>

          <OverlaySelect
            v-if="canManage"
            :model-value="effectiveDuty(p)"
            :options="dutyOptions(p)"
            max-width="80px"
            @update:model-value="onDutyChange(p, $event)"
          />
          <span
            v-else
            class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold"
            :class="dutyClass(displayDuty(p))"
          >{{ DUTY_LABELS[displayDuty(p)] ?? displayDuty(p) }}</span>

          <button
            v-if="amICaptain && !p.isCaptain"
            class="shrink-0 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px] hover:bg-white/10 transition"
            :class="p.isSubCaptain ? 'text-sky-300/70' : 'text-white/45'"
            :title="p.isSubCaptain ? 'Retirer sous-cap.' : 'Nommer sous-cap.'"
            type="button"
            @click="onAssignSubCaptain(p)"
          >⚓</button>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 text-[10px] uppercase tracking-widest text-white/45">
    Aucun participant
  </div>
</template>

<style scoped>
.session-scrollbar::-webkit-scrollbar { width: 3px; }
.session-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb), 0.25); border-radius: 999px; }
.session-scrollbar::-webkit-scrollbar-track { background: transparent; }
select { color-scheme: dark; }
</style>
