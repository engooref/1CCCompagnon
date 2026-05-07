<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MiningSessionDetail } from '@shared/general'
import { useMiningStore } from '../../../stores/mining'

const props = defineProps<{
  session: MiningSessionDetail | null
  preview?: boolean
  interactive?: boolean
}>()

const mining = useMiningStore()

const isCreator = computed(() =>
  !!props.session?.createdById && props.session.createdById === mining._currentUserId,
)
const canEdit = computed(() => props.interactive && isCreator.value)

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch { return '—' }
}
function statusLabel(s: string | null | undefined): string {
  return ({ active: 'Active', closed: 'Fermée', finished: 'Terminée', Mining: 'En minage' } as Record<string, string>)[s ?? ''] ?? (s ?? '—')
}
function statusClass(s: string | null | undefined): string {
  if (s === 'active' || s === 'Mining') return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
  if (s === 'finished') return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
  return 'border-white/10 bg-white/5 text-white/50'
}

// ── Raffinerie picker ─────────────────────────────────────────────────────────
const showRefineryPicker = ref(false)
const refineryQuery      = ref('')
const filteredRefineries = computed(() => {
  const q = refineryQuery.value.toLowerCase().trim()
  return q ? mining.refineries.filter((r) => r.name.toLowerCase().includes(q)) : mining.refineries.slice(0, 12)
})
async function selectRefinery(id: number | string | null) {
  if (!props.session) return
  await mining.updateSessionDefaultRefinery(props.session.id, id ? Number(id) : null)
  showRefineryPicker.value = false
  refineryQuery.value = ''
}

// ── Zone picker ───────────────────────────────────────────────────────────────
const showZonePicker = ref(false)
const zoneQuery      = ref('')
const zoneResults    = ref<{ id: number; name: string }[]>([])
const zoneSearching  = ref(false)
let zoneDebounce: ReturnType<typeof setTimeout> | null = null
function onZoneInput() {
  if (zoneDebounce) clearTimeout(zoneDebounce)
  if (!zoneQuery.value.trim()) { zoneResults.value = []; return }
  zoneSearching.value = true
  zoneDebounce = setTimeout(async () => {
    try {
      const res = await mining.searchWhereBodies(zoneQuery.value.trim())
      zoneResults.value = (res ?? []).slice(0, 10).map((b: any) => ({ id: b.id, name: b.name ?? b.bodyName ?? String(b.id) }))
    } catch { zoneResults.value = [] }
    finally { zoneSearching.value = false }
  }, 300)
}
async function selectZone(body: { id: number; name: string }) {
  if (!props.session) return
  mining.changeZone.selectedBody = body
  await mining.updateSessionDefaultBody(props.session.id, body.id)
  showZonePicker.value = false
  zoneQuery.value = ''
  zoneResults.value = []
}

// ── Quitter ───────────────────────────────────────────────────────────────────
const confirmLeave = ref(false)
async function doLeave() {
  await mining.leaveSession()
  confirmLeave.value = false
}
</script>

<template>
  <div
    v-if="props.session"
    class="flex h-full min-h-0 flex-col gap-1.5 overflow-y-auto pr-0.5 session-scrollbar"
    :class="{ 'pointer-events-none select-none opacity-60': preview }"
  >
    <!-- ── Infos générales ── -->
    <div class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 space-y-1">
      <div class="flex items-center justify-between gap-2">
        <p class="truncate text-[11px] font-bold text-th-primary">{{ props.session.name }}</p>
        <span class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" :class="statusClass(props.session.status)">
          {{ statusLabel(props.session.status) }}
        </span>
      </div>
      <div class="flex items-center justify-between gap-1">
        <span class="text-[9px] text-white/45">Créateur</span>
        <span class="text-[10px] font-semibold text-th-primary">{{ props.session.createdBy ?? '—' }}</span>
      </div>
      <div class="flex items-center justify-between gap-1">
        <span class="text-[9px] text-white/45">Créée le</span>
        <span class="text-[10px] tabular-nums text-white/70">{{ fmt(props.session.createdAt) }}</span>
      </div>
    </div>

    <!-- ── Zone & Raffinerie ── -->
    <div class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 space-y-1">
      <!-- Zone -->
      <div class="flex items-center justify-between gap-1">
        <span class="text-[9px] text-white/45">Zone</span>
        <div class="flex items-center gap-1">
          <span class="max-w-[140px] truncate text-[10px] font-semibold text-th-primary">{{ props.session.defaultBodyName ?? '—' }}</span>
          <button
            v-if="canEdit && isCreator"
            class="rounded border border-sky-500/30 bg-sky-500/10 px-1 py-0.5 text-[8px] font-bold text-sky-300 hover:bg-sky-500/20"
            @click="showZonePicker = !showZonePicker; showRefineryPicker = false; zoneQuery = ''; zoneResults = []"
          >✎</button>
        </div>
      </div>
      <!-- Zone picker -->
      <template v-if="canEdit && isCreator && showZonePicker">
        <input
          v-model="zoneQuery"
          class="w-full rounded border border-white/[0.08] bg-white/[0.08] px-2 py-1 text-[10px] text-white outline-none placeholder:text-white/40 focus:border-sky-400/40"
          placeholder="Rechercher…"
          autofocus
          @input="onZoneInput"
        />
        <div v-if="zoneSearching" class="animate-pulse text-center text-[9px] text-white/60">Recherche…</div>
        <div v-else class="max-h-[80px] space-y-0.5 overflow-y-auto session-scrollbar">
          <button
            v-for="b in zoneResults"
            :key="b.id"
            class="flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-[10px] text-th-primary hover:bg-sky-400/10"
            :class="{ 'font-bold text-sky-300': b.id === props.session.defaultBodyId }"
            @click="selectZone(b)"
          >
            <span class="truncate">{{ b.name }}</span>
            <span v-if="b.id === props.session.defaultBodyId" class="text-sky-300/70">✓</span>
          </button>
          <p v-if="!zoneResults.length && zoneQuery" class="px-1.5 py-0.5 text-[10px] text-white/45">Aucun résultat</p>
        </div>
        <div v-if="mining.loading.updateSessionBody" class="animate-pulse text-center text-[9px] text-white/60">Sauvegarde…</div>
      </template>

      <!-- Raffinerie -->
      <div class="flex items-center justify-between gap-1">
        <span class="text-[9px] text-white/45">Raffinerie</span>
        <div class="flex items-center gap-1">
          <span class="max-w-[140px] truncate text-[10px] font-semibold text-th-primary">{{ props.session.defaultRefineryName ?? '—' }}</span>
          <button
            v-if="canEdit"
            class="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 text-[8px] font-bold text-amber-300 hover:bg-amber-500/20"
            @click="showRefineryPicker = !showRefineryPicker; showZonePicker = false; refineryQuery = ''"
          >✎</button>
        </div>
      </div>
      <!-- Raffinerie picker -->
      <template v-if="canEdit && showRefineryPicker">
        <input
          v-model="refineryQuery"
          class="w-full rounded border border-white/[0.08] bg-white/[0.08] px-2 py-1 text-[10px] text-white outline-none placeholder:text-white/40 focus:border-amber-400/40"
          placeholder="Rechercher…"
          autofocus
        />
        <div class="max-h-[80px] space-y-0.5 overflow-y-auto session-scrollbar">
          <button
            v-for="r in filteredRefineries"
            :key="r.id"
            class="flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-[10px] text-th-primary hover:bg-accent/10"
            :class="{ 'font-bold text-accent': Number(r.id) === Number(props.session.defaultRefineryId) }"
            @click="selectRefinery(r.id)"
          >
            <span class="truncate">{{ r.name }}</span>
            <span v-if="Number(r.id) === Number(props.session.defaultRefineryId)" class="text-accent/70">✓</span>
          </button>
          <p v-if="!filteredRefineries.length" class="px-1.5 py-0.5 text-[10px] text-white/45">Aucun résultat</p>
        </div>
        <div v-if="mining.loading.updateSessionRefinery" class="animate-pulse text-center text-[9px] text-white/60">Sauvegarde…</div>
      </template>
    </div>

    <!-- ── Stats rapides ── -->
    <div class="grid grid-cols-2 gap-1">
      <div class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 text-center">
        <p class="text-[18px] font-black tabular-nums text-th-primary leading-none">
          {{ props.session.participantsCount ?? props.session.participantCount ?? props.session.participants?.length ?? 0 }}
        </p>
        <p class="text-[8px] uppercase tracking-widest text-white/45 mt-0.5">Participants</p>
      </div>
      <div class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 text-center">
        <p class="text-[18px] font-black tabular-nums text-th-primary leading-none">
          {{ props.session.rockCount ?? props.session.rocks?.length ?? 0 }}
        </p>
        <p class="text-[8px] uppercase tracking-widest text-white/45 mt-0.5">Rochers</p>
      </div>
    </div>

  </div>

  <div v-else class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 text-[10px] uppercase tracking-widest text-white/45">
    Aucune session active
  </div>
</template>

<style scoped>
.session-scrollbar::-webkit-scrollbar { width: 3px; }
.session-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb), 0.25); border-radius: 999px; }
.session-scrollbar::-webkit-scrollbar-track { background: transparent; }
</style>
