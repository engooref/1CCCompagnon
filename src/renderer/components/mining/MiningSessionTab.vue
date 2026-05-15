<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useMiningStore } from '../../stores/mining'
import { useAppStore } from '@renderer/stores/app'
import { usePinnedSession } from '../../composables/usePinnedSession'
import { useMineralDropdown } from '@renderer/composables/useMineralDropdown'
import RockFormPanel from './session/RockFormPanel.vue'
import SessionJoinModal from './session/SessionJoinModal.vue'
import SessionWoShipModal from './session/SessionWoShipModal.vue'
import SessionLeaveConfirmModal from './session/SessionLeaveConfirmModal.vue'

const mining = useMiningStore()
const { pinnedSessionId, pin: pinSession, unpin: unpinSession, isPinned } = usePinnedSession()

const sessionLogOpen = ref(false)
const changeRefineryDropOpen = ref(false)

// ── Shared mineral/body helpers (composable) ──────────────────────────────────
const {
  mineralNameById, mineralDisplayName, mineralSearch, setMineralSearch,
  filteredMineralsForRow, openMineralDropdown, closeMineralDropdown,
  clearMineral, selectMineral, mineralDropdownKeydown,
  searchBodies, selectBody,
} = useMineralDropdown()

// Needed by rock-form zone helpers still inline below
function filteredMinerals(q: string) {
  const lq = String(q ?? '').trim().toLowerCase()
  return !lq
    ? mining.minerals.slice(0, 30)
    : mining.minerals.filter((m) => String(m.name ?? '').toLowerCase().includes(lq) || String((m as any).code ?? '').toLowerCase().includes(lq)).slice(0, 30)
}
function focusDropdownSearch(event?: Event | null) {
  const root = (event?.currentTarget as HTMLElement | null)?.closest('.relative')
  nextTick(() => { root?.querySelector<HTMLInputElement>('.mineral-dropdown-search')?.focus() })
}

// ── WoShipModal ref ────────────────────────────────────────────────────────────
const woShipModalRef = ref<InstanceType<typeof SessionWoShipModal> | null>(null)
function openWoShipForm(group: any) { woShipModalRef.value?.openForGroup(group) }
function openWoSupportForm()        { woShipModalRef.value?.openForSupport() }

function filteredCollectMineralsForRow(row: any) {
  const allowed = (mining.collectForm.rockMineralIds ?? []).map((id: any) => Number(id))
  const q = mineralSearch(row).toLowerCase().trim()
  let list = allowed.length
    ? mining.minerals.filter((m: any) => allowed.includes(Number(m.id)))
    : mining.minerals

  if (q) {
    list = list.filter((m: any) =>
      String(m.name ?? '').toLowerCase().includes(q) ||
      String((m as any).code ?? '').toLowerCase().includes(q) ||
      String((m as any).slug ?? '').toLowerCase().includes(q),
    )
  }

  return list.slice(0, 30)
}

function selectCollectMineral(row: any, min: any) {
  selectMineral(row, min)
}

function collectMineralDropdownKeydown(event: KeyboardEvent, row: any) {
  const list = filteredCollectMineralsForRow(row)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    row._hi = Math.min(Number(row._hi ?? -1) + 1, list.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    row._hi = Math.max(Number(row._hi ?? 0) - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = list[Number(row._hi ?? -1)] ?? list[0]
    if (item) selectCollectMineral(row, item)
  } else if (event.key === 'Escape') {
    row._open = false
  }

  nextTick(() => {
    const root = (event.currentTarget as HTMLElement | null)?.closest('.relative')
    const item = root?.querySelectorAll<HTMLElement>('.mineral-dropdown-item')?.[Number(row._hi ?? -1)]
    item?.scrollIntoView({ block: 'nearest' })
  })
}

function addCollectLine() {
  mining.collectForm.lines.push({
    commodityId: null,
    commodityName: '',
    quantityScuActual: '',
    scanEstimateScu: 0,
    alreadyCollectedScu: 0,
    _name: '',
    _query: '',
    _search: '',
    _open: false,
    _hi: -1,
  } as any)
}

function removeCollectLine(i: number) {
  mining.collectForm.lines.splice(i, 1)
}

function emptyRockFormMineral() {
  return { commodityId: null, percentage: '', quality: 500, _name: '', _query: '', _search: '', _open: false, _hi: -1 }
}
function rockFormAddMineral() { mining.rockForm.minerals.push(emptyRockFormMineral()) }
function rockFormRemoveMineral(i: number) {
  mining.rockForm.minerals.splice(i, 1)
  if (!mining.rockForm.minerals.length) mining.rockForm.minerals.push(emptyRockFormMineral())
}

function rockFormZoneDisplayName(): string {
  return String(mining.rockForm.zoneQuery || mineralNameById(mining.rockForm.zoneQueryId) || '')
}

function rockFormZoneSearch(): string {
  return String((mining.rockForm as any).zoneQuerySearch ?? '')
}

function setRockFormZoneSearch(event: Event) {
  ;(mining.rockForm as any).zoneQuerySearch = (event.target as HTMLInputElement).value
  ;(mining.rockForm as any).zoneQueryHi = -1
}

function filteredRockFormZoneMinerals() {
  return filteredMinerals(rockFormZoneSearch())
}

function openRockFormZoneDropdown(event?: Event) {
  mining.rockForm.zoneQueryOpen = true
  ;(mining.rockForm as any).zoneQuerySearch = ''
  ;(mining.rockForm as any).zoneQueryHi = -1
  focusDropdownSearch(event)
}

function clearRockFormZoneMineral() {
  mining.rockForm.zoneQueryId = null
  mining.rockForm.zoneQuery = ''
  mining.rockForm.zoneQueryOpen = false
  mining.rockForm.zoneSearchState = 'idle'
  mining.rockForm.zoneLocationName = null
  mining.rockForm.zoneCreate.show = false
  mining.rockForm.zoneCreate.error = null
  ;(mining.rockForm as any).zoneQuerySearch = ''
  ;(mining.rockForm as any).zoneQueryHi = -1
  mining.rockForm.minerals = [emptyRockFormMineral()]
}

function rockFormSelectZoneMineral(min: any) {
  mining.rockForm.zoneQueryId = min.id
  mining.rockForm.zoneQuery = min.name
  mining.rockForm.zoneQueryOpen = false
  ;(mining.rockForm as any).zoneQuerySearch = ''
  ;(mining.rockForm as any).zoneQueryHi = -1
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

// ── Crew grouping ────────────────────────────────────────────────────────────
const crewRoleSections = computed(() => {
  const active = mining.sessionActive
  if (!active) return []
  const myId = mining._currentUserId
  const crewsList: any[] = (active as any).crews ?? []
  const participants: any[] = active.participants ?? []

  const buildGroups = (role: string) =>
    crewsList
      .filter((c: any) => c.role === role)
      .map((c: any) => {
        const key = c.crewKey ?? `crew:${c.id}`
        const members = participants.filter((p: any) => p.crewId === c.id || p.crewKey === c.crewKey)
        if (members.length === 0) return null
        const suggested = suggestCrewStatus(members)
        return {
          key,
          crewId: c.id,
          shipId: c.shipId ?? null,
          shipName: c.shipName ?? null,
          members,
          isMyGroup: members.some((m: any) => m.userId === myId),
          amICaptain: members.some((m: any) => m.userId === myId && (m.isCaptain || m.rank === 'captain')),
          amISubCaptain: members.some((m: any) => m.userId === myId && (m.isSubCaptain || m.rank === 'sub_captain')),
          crew: {
            used: c.crewUsed ?? members.length,
            total: c.crewTotal ?? 1,
            status: c.status ?? null,
            suggested,
            effectiveStatus: c.status ?? suggested ?? 'standby',
          },
        }
      })
      .filter(Boolean)

  return [
    { role: 'miner',      label: 'Équipages miniers', icon: '⛏️', groups: buildGroups('miner') },
    { role: 'prospector', label: 'Prospecteurs',       icon: '🔭', groups: buildGroups('prospector') },
    { role: 'support',    label: 'Support',             icon: '🚚', groups: buildGroups('support') },
  ].filter((s) => s.groups.length > 0)
})

function suggestCrewStatus(members: any[]): string {
  const userIds = new Set(members.map((m) => m.userId).filter(Boolean))
  const rocks = (mining.sessionActive?.rocks ?? []).filter((r) => userIds.has(r.claimedByUserId))
  if (rocks.some((r) => r.status === 'extraction')) return 'extraction'
  if (rocks.some((r) => ['fracturing', 'mining'].includes(r.status))) return 'fracturing'
  if (rocks.some((r) => r.status === 'completed')) return 'return_trip'
  if (rocks.some((r) => r.status === 'en_route')) return 'transit'
  return 'standby'
}

const sessionSummary = computed(() => {
  const active = mining.sessionActive
  if (!active) return { miners: 0, prospectors: 0, support: 0, active: 0, done: 0 }
  const p = active.participants ?? []
  const r = active.rocks ?? []
  return {
    miners:      p.filter((x: any) => x.role === 'miner').length,
    prospectors: p.filter((x: any) => x.role === 'prospector').length,
    support:     p.filter((x: any) => x.role === 'support').length,
    active:      r.filter((x: any) => ['available','en_route','fracturing','extraction'].includes(x.status)).length,
    done:        r.filter((x: any) => ['completed','depleted'].includes(x.status)).length,
  }
})

const openCargos = computed(() =>
  (mining.sessionActive?.cargos ?? []).filter((c: any) => !['delivered', 'refined'].includes(c.status ?? ''))
)

const createRefinerySearch = ref('')
const createRefineryActive = ref(-1)
const changeRefinerySearch = ref('')
const changeRefineryActive = ref(-1)

function refineryListFilter(query: string) {
  const q = String(query ?? '').trim().toLowerCase()
  const list = !q
    ? mining.refineries
    : mining.refineries.filter((r: any) =>
        [r.name, r.systemName, r.locationName]
          .some((value) => String(value ?? '').toLowerCase().includes(q)),
      )
  return list.slice(0, 20)
}

const filteredRefineries = computed(() => refineryListFilter(createRefinerySearch.value))
const filteredChangeRefineries = computed(() => refineryListFilter(changeRefinerySearch.value))

function refineryDisplayName(refinery: any): string {
  if (!refinery) return ''
  return refinery.systemName ? `${refinery.name} (${refinery.systemName})` : String(refinery.name ?? '')
}

function refineryDisplayNameById(id: string | number | null | undefined): string {
  if (id === null || id === undefined || id === '') return ''
  const refinery = mining.refineryById?.(id as any) ?? mining.refineries.find((r: any) => String(r.id) === String(id))
  return refineryDisplayName(refinery)
}

function refineryLocationLabel(refinery: any): string {
  return [refinery?.systemName, refinery?.locationName].filter(Boolean).join(' — ')
}

function focusSearchInDropdown(event: Event | null | undefined, selector: string) {
  const root = (event?.currentTarget as HTMLElement | null)?.closest('.relative')
  nextTick(() => root?.querySelector<HTMLInputElement>(selector)?.focus())
}

function openCreateRefineryDropdown(event?: Event) {
  mining.sessionCreateForm.refineryOpen = true
  createRefinerySearch.value = ''
  const idx = filteredRefineries.value.findIndex((r: any) => String(r.id) === String(mining.sessionCreateForm.selectedRefineryId))
  createRefineryActive.value = idx >= 0 ? idx : (filteredRefineries.value.length ? 0 : -1)
  focusSearchInDropdown(event, '.create-refinery-dropdown-search')
}

function setCreateRefinerySearch(event: Event) {
  createRefinerySearch.value = (event.target as HTMLInputElement).value
  createRefineryActive.value = filteredRefineries.value.length ? 0 : -1
}

function selectCreateRefinery(refinery: any) {
  mining.sessionCreateForm.selectedRefineryId = Number(refinery.id)
  mining.sessionCreateForm.refineryQuery = refineryDisplayName(refinery)
  mining.sessionCreateForm.refineryOpen = false
  createRefinerySearch.value = ''
  createRefineryActive.value = -1
}

function clearCreateRefinery() {
  mining.sessionCreateForm.selectedRefineryId = null
  mining.sessionCreateForm.refineryQuery = ''
  mining.sessionCreateForm.refineryOpen = false
  createRefinerySearch.value = ''
  createRefineryActive.value = -1
}

function createRefineryKeydown(event: KeyboardEvent) {
  const list = filteredRefineries.value
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    createRefineryActive.value = Math.min(createRefineryActive.value + 1, list.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    createRefineryActive.value = Math.max(createRefineryActive.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = list[createRefineryActive.value] ?? list[0]
    if (item) selectCreateRefinery(item)
  } else if (event.key === 'Escape') {
    mining.sessionCreateForm.refineryOpen = false
  }
  nextTick(() => {
    const root = (event.currentTarget as HTMLElement | null)?.closest('.relative')
    root?.querySelectorAll<HTMLElement>('.refinery-dropdown-item')?.[createRefineryActive.value]?.scrollIntoView({ block: 'nearest' })
  })
}

function openChangeRefineryDropdown(event?: Event) {
  changeRefineryDropOpen.value = true
  changeRefinerySearch.value = ''
  const idx = filteredChangeRefineries.value.findIndex((r: any) => String(r.id) === String(mining.changeRefinery.selectedRefineryId))
  changeRefineryActive.value = idx >= 0 ? idx : (filteredChangeRefineries.value.length ? 0 : -1)
  focusSearchInDropdown(event, '.change-refinery-dropdown-search')
}

function setChangeRefinerySearch(event: Event) {
  changeRefinerySearch.value = (event.target as HTMLInputElement).value
  changeRefineryActive.value = filteredChangeRefineries.value.length ? 0 : -1
}

function selectChangeRefinery(refinery: any) {
  mining.changeRefinery.selectedRefineryId = Number(refinery.id)
  mining.changeRefinery.refineryQuery = refineryDisplayName(refinery)
  changeRefineryDropOpen.value = false
  changeRefinerySearch.value = ''
  changeRefineryActive.value = -1
}

function clearChangeRefinery() {
  mining.changeRefinery.selectedRefineryId = null
  mining.changeRefinery.refineryQuery = ''
  changeRefineryDropOpen.value = false
  changeRefinerySearch.value = ''
  changeRefineryActive.value = -1
}

function changeRefineryKeydown(event: KeyboardEvent) {
  const list = filteredChangeRefineries.value
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    changeRefineryActive.value = Math.min(changeRefineryActive.value + 1, list.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    changeRefineryActive.value = Math.max(changeRefineryActive.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = list[changeRefineryActive.value] ?? list[0]
    if (item) selectChangeRefinery(item)
  } else if (event.key === 'Escape') {
    changeRefineryDropOpen.value = false
  }
  nextTick(() => {
    const root = (event.currentTarget as HTMLElement | null)?.closest('.relative')
    root?.querySelectorAll<HTMLElement>('.refinery-dropdown-item')?.[changeRefineryActive.value]?.scrollIntoView({ block: 'nearest' })
  })
}

// ── Participant helpers ───────────────────────────────────────────────────────
function participantRank(p: any): string {
  if (p.rank === 'captain'     || p.isCaptain)    return 'captain'
  if (p.rank === 'sub_captain' || p.isSubCaptain) return 'sub_captain'
  return 'member'
}
function participantDuty(p: any): string {
  if (p.duty) return p.duty
  if (p.role === 'prospector') return 'scout'
  if (p.role === 'support')    return 'support'
  if (p.isCaptain)             return 'pilot'
  if (p.isSubCaptain)          return 'laser_operator'
  return 'collector'
}
function dutyLabel(d: string): string {
  return ({ pilot: 'Pilote', laser_operator: 'Laser', collector: 'Collecte', tractor: 'Tracteur', scout: 'Scout', escort: 'Escorte', support: 'Support', refinery_runner: 'Raffinerie' } as Record<string,string>)[d] ?? d
}
function dutyClass(d: string): string {
  return ({ pilot: 'bg-sky-500/15 text-sky-300 border-sky-500/25', laser_operator: 'bg-orange-500/15 text-orange-300 border-orange-500/25', collector: 'bg-amber-500/15 text-amber-300 border-amber-500/25', tractor: 'bg-violet-500/15 text-violet-300 border-violet-500/25', scout: 'bg-violet-500/15 text-violet-300 border-violet-500/25', escort: 'bg-red-500/15 text-red-300 border-red-500/25', support: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25', refinery_runner: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' } as Record<string,string>)[d] ?? 'bg-white/10 text-white/55 border-white/15'
}
function dutyOptions(p: any): Array<{value:string;label:string}> {
  const base = [{ value: 'pilot', label: 'Pilote' }, { value: 'laser_operator', label: 'Laser' }]
  if (p.role === 'miner')      return [...base, { value: 'collector', label: 'Collecte' }]
  if (p.role === 'prospector') return [...base, { value: 'scout', label: 'Scout' }]
  if (p.role === 'support')    return [...base, { value: 'support', label: 'Support' }]
  return base
}

// ── Crew status helpers ───────────────────────────────────────────────────────
function crewStatusLabel(s: string): string {
  return ({ transit: 'En transit', scouting: 'Scan zone', positioning: 'En position', fracturing: 'Fracturation', extraction: 'Extraction', full_cargo: 'Soute pleine', return_trip: 'Retour', refining: 'Raffinage', standby: 'Stand-by', incident: 'Incident', done: 'Terminé' } as Record<string,string>)[s] ?? s
}
function crewStatusClass(s: string): string {
  return ({ transit: 'bg-sky-500/20 text-sky-300 border-sky-500/30', positioning: 'bg-sky-500/20 text-sky-300 border-sky-500/30', scouting: 'bg-violet-500/20 text-violet-300 border-violet-500/30', fracturing: 'bg-orange-500/20 text-orange-300 border-orange-500/30', extraction: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', full_cargo: 'bg-amber-500/20 text-amber-300 border-amber-500/30', return_trip: 'bg-amber-500/20 text-amber-300 border-amber-500/30', refining: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', incident: 'bg-red-500/20 text-red-300 border-red-500/30', standby: 'bg-white/10 text-white/55 border-white/15', done: 'bg-white/10 text-white/40 border-white/10' } as Record<string,string>)[s] ?? 'bg-white/10 text-white/40 border-white/10'
}
const crewStatusOptions = [
  { value: 'transit', label: 'En transit' }, { value: 'scouting', label: 'Scan de zone' },
  { value: 'positioning', label: 'Mise en position' }, { value: 'fracturing', label: 'Fracturation' },
  { value: 'extraction', label: 'Extraction' }, { value: 'full_cargo', label: 'Soute pleine' },
  { value: 'return_trip', label: 'Retour raffinerie' }, { value: 'refining', label: 'Raffinage' },
  { value: 'standby', label: 'Stand-by' }, { value: 'incident', label: 'Incident' }, { value: 'done', label: 'Terminé' },
]

// ── Rock helpers ─────────────────────────────────────────────────────────────
function rockStatusLabel(status: string): string {
  return ({ available: 'Disponible', en_route: 'En route', fracturing: 'Fracturation', extraction: 'Extraction', completed: 'Collecté', depleted: 'Épuisé', claimed: 'Réclamé', mining: 'En cours', collected: 'Collecté' } as Record<string,string>)[status] ?? status
}
function rockStatusClass(status: string): string {
  return ({ available: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', en_route: 'bg-sky-500/20 text-sky-300 border-sky-500/30', fracturing: 'bg-orange-500/20 text-orange-300 border-orange-500/30', extraction: 'bg-violet-500/20 text-violet-300 border-violet-500/30', completed: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', depleted: 'bg-red-500/10 text-red-400/60 border-red-500/20', claimed: 'bg-amber-500/20 text-amber-300 border-amber-500/30', mining: 'bg-orange-500/20 text-orange-300 border-orange-500/30', collected: 'bg-white/10 text-white/40 border-white/10' } as Record<string,string>)[status] ?? 'bg-white/10 text-white/40 border-white/10'
}
function rockRailClass(status: string): string {
  return ({ available: 'bg-emerald-400/70', en_route: 'bg-sky-400/70', fracturing: 'bg-orange-400/70', extraction: 'bg-violet-400/70', completed: 'bg-cyan-400/40', depleted: 'bg-red-400/20' } as Record<string,string>)[status] ?? 'bg-white/15'
}
function rockDisplayMinerals(rock: any) {
  const map = new Map<string, any>()
  for (const m of rock.minerals ?? []) {
    const key = String(m.commodityId ?? m.commodityName)
    const cur = map.get(key) ?? { commodityId: m.commodityId, commodityName: m.commodityName ?? '?', percentage: 0, quantityScuActual: 0, quality: m.quality ?? null, phase: 'scan' }
    if (m.phase === 'actual') { cur.phase = 'actual'; cur.quantityScuActual += Number(m.quantityScuActual ?? 0) }
    else if (cur.phase !== 'actual') { cur.percentage += Number(m.percentage ?? 0); if (cur.quality == null && m.quality != null) cur.quality = m.quality }
    map.set(key, cur)
  }
  return Array.from(map.values())
}
function qualityColor(q: number | null): string {
  if (q == null) return 'text-white/40'
  if (q >= 750) return 'text-emerald-400'
  if (q >= 500) return 'text-sky-400'
  if (q >= 250) return 'text-amber-400'
  return 'text-red-400'
}

// ── Rock action guards ────────────────────────────────────────────────────────
function isMineRock(rock: any) { return rock.claimedByUserId === mining._currentUserId }
function isParticipant() { return mining.myParticipant != null }
function isMiner() { return mining.myParticipant?.role === 'miner' }
function isSupport() { return mining.myParticipant?.role === 'support' }
function canClaimRock(rock: any) {
  return rock.status === 'available' && isMiner() && (mining.myParticipant?.isCaptain || mining.myParticipant?.isSubCaptain)
}
function canDeclarePartial(rock: any) {
  return rock.status === 'extraction' && isParticipant() && !isMineRock(rock)
}
function canFinalize(rock: any) {
  if (!rock || !mining._currentUserId) return false
  if (isMineRock(rock)) return true
  const me = mining.myParticipant
  if (!me || (!me.isCaptain && !me.isSubCaptain)) return false
  const claimer = (mining.sessionActive?.participants ?? []).find((p: any) => p.userId === rock.claimedByUserId)
  return claimer?.crewKey && me.crewKey && claimer.crewKey === me.crewKey
}
function canPickupCargo(cargo: any) {
  if (!cargo || mining.sessionActive?.status === 'closed') return false
  if (['delivered', 'refined'].includes(cargo.status ?? '')) return false
  const me = mining.myParticipant
  return me && (me.role === 'support' || me.isCaptain || me.isSubCaptain)
}
function canEditRock(rock: any) {
  if (!rock || !mining._currentUserId || mining.sessionActive?.status === 'closed') return false
  return rock.reportedByUserId === mining._currentUserId || rock.claimedByUserId === mining._currentUserId
}
function canDeleteRock(rock: any) {
  return !rock.claimedByUserId && rock.reportedByUserId === mining._currentUserId && mining.sessionActive?.status !== 'closed'
}
function isSessionCreator() {
  return mining.sessionActive?.createdById && mining._currentUserId && mining.sessionActive.createdById === mining._currentUserId
}

// ── Rock inline edit tracking ─────────────────────────────────────────────────
const editingRockId = ref<number | null>(null)
function openRockEdit(rock: any) {
  editingRockId.value = rock.id
  const scanMinerals = (rock.minerals ?? []).filter((m: any) => m.phase !== 'actual')
  const primaryScanMineral = scanMinerals.find((m: any) => m?.commodityId) ?? null
  const primaryCommodityId = primaryScanMineral?.commodityId != null ? Number(primaryScanMineral.commodityId) : null
  const primaryCommodityName = primaryCommodityId != null
    ? String(primaryScanMineral?.commodityName ?? mineralNameById(primaryCommodityId) ?? '')
    : ''

  mining.rockFilter = 'all'
  mining.rockForm = {
    show: true, saving: false, error: null, editRockId: rock.id,
    posX: String(rock.posX ?? ''), posY: String(rock.posY ?? ''), posZ: String(rock.posZ ?? ''),
    bodySearch: rock.bodyName ?? '', bodyResults: [], selectedBody: rock.bodyId ? { id: rock.bodyId, name: rock.bodyName ?? '' } : null,
    sizeScuEstimate: String(rock.sizeScuEstimate ?? ''), mass: String(rock.mass ?? ''),
    instability: String(rock.instability ?? ''), resistance: String(rock.resistance ?? ''),
    notes: rock.notes ?? '',
    minerals: (scanMinerals.length ? scanMinerals : [{ commodityId: null, percentage: '', quality: 500, commodityName: '' }]).map((m: any) => {
      const name = String(m.commodityName ?? mineralNameById(m.commodityId) ?? '')
      return {
        commodityId: m.commodityId ?? null,
        percentage: String(m.percentage ?? ''),
        quality: m.quality ?? 500,
        commodityName: name,
        _name: name,
        _query: name,
        _search: '',
        _open: false,
        _hi: -1,
      }
    }),
    // Même assist de zone que la création, mais préchargé sur le minerai principal actuel.
    zoneQuery: primaryCommodityName,
    zoneQueryId: primaryCommodityId,
    zoneQueryOpen: false,
    zoneQuerySearch: '',
    zoneQueryHi: -1,
    zoneSearchState: 'idle',
    zoneLocationName: null,
    zoneCreate: {
      show: false, primaryQualityMax: primaryScanMineral?.quality ?? 500, saving: false, error: null,
      secondary: { commodityId: null, _query: '', _search: '', _open: false, _hi: -1, qualityMax: 500 },
      tertiary:  { commodityId: null, _query: '', _search: '', _open: false, _hi: -1, qualityMax: 500 },
    },
  }
  nextTick(() => {
    document.getElementById('rock-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
function cancelRockEdit() {
  editingRockId.value = null
  mining.rockForm.show = false
  mining.rockForm.editRockId = null
}

async function saveRockForm() {
  await mining.addRock()
  if (!mining.rockForm.show) editingRockId.value = null
}

function openRockCreateFromHeader() {
  editingRockId.value = null
  mining.openRockForm()
}

// Role label
function roleLabel(r: string): string {
  return ({ miner: 'Mineur', prospector: 'Prospecteur', support: 'Support' } as Record<string,string>)[r] ?? r
}
function roleClass(r: string): string {
  return ({ miner: 'border-accent/25 bg-accent/10 text-accent', prospector: 'border-violet-400/25 bg-violet-400/10 text-violet-300', support: 'border-amber-400/25 bg-amber-400/10 text-amber-300' } as Record<string,string>)[r] ?? 'border-white/10 bg-white/5 text-th-muted'
}

// ── Créer l'opération ─────────────────────────────────────────────────────────
function canCreateOperation(): boolean {
  if (!mining.sessionActive) return false
  if (mining.sessionActive.status === 'closed') return false
  if (mining.sessionActive.operationCreated) return false
  return isSessionCreator()
}

// ── Leave avec transfert capitaine ───────────────────────────────────────────
function checkAndLeave(sessionId: number, participantId: number) {
  mining.leaveParticipantWithCheck(sessionId, participantId)
}

// ── Ship search : filtre client-side sur les vaisseaux des loadouts ──────────
function joinShipName(sh: any): string {
  return sh?.name ?? sh?.modelName ?? sh?.label ?? (sh?.id ? `Vaisseau #${sh.id}` : 'Vaisseau')
}

function joinShipCrewSize(sh: any): number {
  return Math.max(1, Number(sh?.crewSize ?? sh?.maxCrew ?? sh?.crew ?? 1) || 1)
}

async function searchJoinShips(q: string) {
  if (!q || q.length < 2) { mining.sessionJoinForm.shipResults = []; return }
  await mining.searchSessionShips(q.toLowerCase())
}

function onJoinShipSearchInput() {
  // Si l'utilisateur retape dans le champ après avoir choisi un équipage existant,
  // on repasse en mode "nouvel équipage" pour éviter un crewKey fantôme.
  if (mining.sessionJoinForm.crewKey) {
    mining.sessionJoinForm.crewKey = null
    mining.sessionJoinForm.shipId = null
    mining.sessionJoinForm.crewTotal = 1
  }
  mining.sessionJoinForm.selectedShip = null
  searchJoinShips(mining.sessionJoinForm.shipSearch)
}

// ── Blur helpers (setTimeout interdit dans les templates Vue) ─────────────────
function blurCreateBodySearch()    { setTimeout(() => { mining.sessionCreateForm.bodyResults = [] }, 200) }
function blurCreateRefineryDrop()  { setTimeout(() => { mining.sessionCreateForm.refineryOpen = false }, 200) }
function blurChangeZoneSearch()    { setTimeout(() => { mining.changeZone.bodyResults = [] }, 150) }
function blurChangeRefineryDrop()  { setTimeout(() => { changeRefineryDropOpen.value = false }, 150) }
function blurRockBodySearch()      { setTimeout(() => { mining.rockForm.bodyResults = [] }, 200) }
function blurZoneQuery()           { setTimeout(() => { mining.rockForm.zoneQueryOpen = false }, 150) }
function blurZoneSecondary()       { setTimeout(() => { mining.rockForm.zoneCreate.secondary._open = false }, 150) }
function blurZoneTertiary()        { setTimeout(() => { mining.rockForm.zoneCreate.tertiary._open = false }, 150) }
function blurMineralRow(m: any)    { setTimeout(() => { m._open = false }, 150) }
function blurJoinShipResults()     { setTimeout(() => { mining.sessionJoinForm.shipResults = [] }, 150) }

// ── Join modal helpers ────────────────────────────────────────────────────────
function joinSetRole(r: string) {
  mining.sessionJoinForm.role = r
  mining.sessionJoinForm.shipId = null
  mining.sessionJoinForm.selectedShip = null
  mining.sessionJoinForm.crewKey = null
  mining.sessionJoinForm.shipSearch = ''
  mining.sessionJoinForm.shipResults = []
}
function joinSelectCrew(crew: any) {
  mining.sessionJoinForm.shipId       = crew.shipId ?? null
  mining.sessionJoinForm.crewKey      = crew.crewKey ?? null
  mining.sessionJoinForm.crewTotal    = Math.max(1, Number(crew.crewTotal ?? crew.crewSize ?? 1) || 1)
  mining.sessionJoinForm.shipSearch   = crew.shipName ?? ''
  mining.sessionJoinForm.selectedShip = null
  mining.sessionJoinForm.shipResults  = []
}
function joinSelectSessionShip(sh: any) {
  mining.sessionJoinForm.selectedShip = sh
  mining.sessionJoinForm.shipId       = sh.id
  mining.sessionJoinForm.shipSearch   = joinShipName(sh)
  mining.sessionJoinForm.shipResults  = []
  mining.sessionJoinForm.crewKey      = null
  mining.sessionJoinForm.crewTotal    = joinShipCrewSize(sh)
}
function joinSelectSearchShip(sh: any) {
  mining.sessionJoinForm.selectedShip = sh
  mining.sessionJoinForm.shipId       = sh.id
  mining.sessionJoinForm.shipSearch   = joinShipName(sh)
  mining.sessionJoinForm.shipResults  = []
  mining.sessionJoinForm.crewKey      = null
  mining.sessionJoinForm.crewTotal    = joinShipCrewSize(sh)
}
function joinClearShip() {
  mining.sessionJoinForm.selectedShip = null
  mining.sessionJoinForm.shipId       = null
  mining.sessionJoinForm.shipSearch   = ''
  mining.sessionJoinForm.shipResults  = []
  mining.sessionJoinForm.crewKey      = null
  mining.sessionJoinForm.crewTotal    = 1
}
function showNewSessionForm() {
  if (mining.sessionCreateForm.show) {
    mining.sessionCreateForm.show = false
    return
  }
  mining.sessionCreateForm.show = true
  mining.sessionCreateForm.name = ''
  mining.sessionCreateForm.selectedBody = null
  mining.sessionCreateForm.selectedRefineryId = null
  mining.sessionCreateForm.bodySearch = ''
  mining.sessionCreateForm.refineryQuery = ''
}

</script>

<template>
  <div class="space-y-3">

    <!-- Error banner -->
    <div v-if="mining.errors.session" class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
      {{ mining.errors.session }}
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════
         VUE LISTE
         ══════════════════════════════════════════════════════════════════════ -->
    <template v-if="mining.sessionView === 'list'">

      <!-- Header -->
      <section class="rounded-2xl border border-th-subtle bg-black/20 p-4 backdrop-blur-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/[0.08] text-accent">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5">
                <circle cx="5.5" cy="4.5" r="2"/><circle cx="10.5" cy="4.5" r="2"/>
                <path d="M1.5 14c0-2.8 1.8-4 4-4M10.5 10c2.2 0 4 1.2 4 4"/>
              </svg>
            </div>
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[0.26em] text-accent/70">Mining coordination</p>
              <h2 class="mt-0.5 text-base font-semibold text-th-primary">Session collaborative</h2>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button class="inline-flex items-center gap-1.5 rounded-xl border border-th-subtle bg-white/5 px-3 py-1.5 text-xs text-th-muted transition hover:bg-white/10 disabled:opacity-50"
              :disabled="mining.loading.session" @click="mining.loadSessionList()">
              <svg class="h-3.5 w-3.5" :class="mining.loading.session ? 'animate-spin' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
              </svg>
              Actualiser
            </button>
            <button class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition"
              :class="mining.sessionCreateForm.show ? 'border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15' : 'border-accent/25 bg-accent/[0.08] text-accent hover:bg-accent/15'"
              @click="showNewSessionForm()">
              {{ mining.sessionCreateForm.show ? 'Annuler' : '+ Nouvelle session' }}
            </button>
          </div>
        </div>

        <!-- Create form -->
        <div v-if="mining.sessionCreateForm.show" class="mt-4 rounded-xl border border-accent/15 bg-accent/[0.03] p-4 space-y-3">
          <p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent/70">Nouvelle opération minière</p>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <!-- Name -->
            <div>
              <label class="mb-1 block text-xs text-th-muted">Nom de la session <span class="text-accent">*</span></label>
              <input v-model="mining.sessionCreateForm.name"
                class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                placeholder="Ex : Run Pyro — Samedi soir"
                @keydown.enter="mining.createSession(mining.sessionCreateForm.name)" />
            </div>
            <!-- Zone de départ -->
            <div class="relative">
              <label class="mb-1 block text-xs text-th-muted">Zone de départ <span class="text-th-muted/50 text-[10px]">optionnel</span></label>
              <input v-model="mining.sessionCreateForm.bodySearch"
                class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                placeholder="Système, planète, lune…"
                @input="searchBodies(mining.sessionCreateForm.bodySearch, mining.sessionCreateForm)"
                @blur.capture="blurCreateBodySearch()" />
              <button v-if="mining.sessionCreateForm.selectedBody" type="button" @click="mining.sessionCreateForm.selectedBody = null; mining.sessionCreateForm.bodySearch = ''; mining.sessionCreateForm.bodyResults = []"
                class="absolute right-2.5 top-[30px] text-white/40 hover:text-white/60 text-xs">✕</button>
              <div v-if="mining.sessionCreateForm.bodyResults.length > 0" class="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg">
                <template v-for="sys in mining.sessionCreateForm.bodyResults" :key="sys.id ?? sys.name">
                  <div class="px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">{{ sys.name }}</div>
                  <template v-for="planet in sys.children" :key="planet.id ?? planet.name">
                    <button type="button" @click="planet.id && selectBody(planet, mining.sessionCreateForm)"
                      class="w-full text-left px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 pl-5 flex items-center justify-between"
                      :disabled="!planet.id">
                      <span>{{ planet.name }}</span><span class="text-white/30 text-[10px]">{{ planet.type }}</span>
                    </button>
                    <template v-if="planet.children?.length" v-for="moon in planet.children" :key="moon.id ?? moon.name">
                      <button type="button" @click="selectBody(moon, mining.sessionCreateForm)"
                        class="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 pl-8 flex items-center justify-between">
                        <span>{{ moon.name }}</span><span class="text-white/30 text-[10px]">{{ moon.type }}</span>
                      </button>
                    </template>
                  </template>
                </template>
              </div>
            </div>
            <!-- Raffinerie -->
            <div class="relative">
              <label class="mb-1 block text-xs text-th-muted">Raffinerie <span class="text-th-muted/50 text-[10px]">optionnel</span></label>
              <input
                :value="mining.sessionCreateForm.selectedRefineryId ? refineryDisplayNameById(mining.sessionCreateForm.selectedRefineryId) : ''"
                readonly
                autocomplete="off"
                class="w-full cursor-pointer rounded-xl border border-th-subtle bg-black/30 px-3 py-2 pr-8 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                placeholder="Sélectionner une raffinerie…"
                @click="openCreateRefineryDropdown($event)"
                @focus="openCreateRefineryDropdown($event)"
                @keydown="createRefineryKeydown($event)"
              />
              <button v-if="mining.sessionCreateForm.selectedRefineryId" type="button"
                @click="clearCreateRefinery()"
                class="absolute right-2.5 top-[30px] text-white/40 hover:text-white/60 text-xs">✕</button>
              <div v-if="mining.sessionCreateForm.refineryOpen"
                class="absolute top-full left-0 right-0 z-50 mt-1 h-56 overflow-hidden rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg backdrop-blur-sm">
                <div class="p-2">
                  <input
                    :value="createRefinerySearch"
                    autocomplete="off"
                    class="create-refinery-dropdown-search sticky top-0 z-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white placeholder:text-white/50 focus:border-accent/30 focus:outline-none"
                    placeholder="Rechercher une raffinerie…"
                    @input="setCreateRefinerySearch($event)"
                    @blur="blurCreateRefineryDrop()"
                    @keydown="createRefineryKeydown($event)"
                  />
                </div>
                <div v-if="filteredRefineries.length > 0" class="max-h-40 overflow-y-auto p-1.5 space-y-0.5">
                  <button v-for="(r, ri) in filteredRefineries" :key="r.id" type="button"
                    @mouseenter="createRefineryActive = ri"
                    @mousedown.prevent="selectCreateRefinery(r)"
                    class="refinery-dropdown-item w-full text-left rounded-lg border px-3 py-1.5 text-xs transition flex items-center justify-between"
                    :class="ri === createRefineryActive ? 'border-accent/25 bg-accent/10 text-accent' : 'border-transparent text-white/80 hover:bg-white/5'">
                    <span class="font-medium">{{ r.name }}</span>
                    <span v-if="refineryLocationLabel(r)" class="text-white/35 text-[10px]">{{ refineryLocationLabel(r) }}</span>
                  </button>
                </div>
                <div v-else class="p-3 text-xs text-th-muted">Aucune raffinerie trouvée.</div>
              </div>
            </div>
          </div>
          <div class="flex justify-end">
            <button class="rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-2 text-xs font-semibold text-accent transition hover:bg-accent/15 disabled:opacity-50"
              :disabled="mining.sessionCreateForm.saving || !mining.sessionCreateForm.name.trim()"
              @click="mining.createSession(mining.sessionCreateForm.name)">
              {{ mining.sessionCreateForm.saving ? 'Création...' : 'Créer la session' }}
            </button>
          </div>
          <p v-if="mining.sessionCreateForm.error" class="text-xs text-rose-300">{{ mining.sessionCreateForm.error }}</p>
        </div>
      </section>

      <!-- Loading -->
      <div v-if="mining.loading.session && !mining.sessionList.length" class="rounded-2xl border border-th-subtle bg-black/20 p-8 text-center text-xs text-th-muted">
        Chargement des opérations…
      </div>

      <!-- Empty -->
      <div v-else-if="!mining.sessionList.length" class="rounded-2xl border border-dashed border-th-subtle bg-black/20 p-10 text-center">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-2xl">⛏️</div>
        <p class="mt-4 text-sm font-semibold text-th-primary">Aucune session active</p>
        <p class="mt-1 text-xs text-th-muted">Crée une session pour coordonner l'équipe.</p>
      </div>

      <!-- Session cards -->
      <div v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <article v-for="s in mining.sessionList" :key="s.id"
          class="cursor-pointer rounded-xl border border-th-subtle bg-black/20 p-3 transition hover:border-accent/20 hover:bg-black/30"
          :class="s.status === 'closed' ? 'opacity-50 pointer-events-none' : ''"
          @click="mining.openSession(s.id)">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="truncate text-sm font-semibold text-th-primary">{{ s.name }}</h3>
              <p class="mt-0.5 text-[11px] text-th-muted">
                <span v-if="s.systemName">Zone {{ s.systemName }} · </span>
                <span>Créée par {{ s.createdBy ?? '—' }}</span>
              </p>
            </div>
            <span class="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              :class="s.status === 'active' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/40'">
              {{ s.status === 'active' ? 'Actif' : 'Ouvert' }}
            </span>
          </div>
          <div class="mt-2 flex gap-3 text-[11px] text-th-muted">
            <span>{{ (s.participantCount ?? s.participantsCount ?? 0) }} participant(s)</span>
            <span>{{ s.rockCount ?? 0 }} rocher(s)</span>
          </div>
          <div class="mt-2 text-[11px] text-accent/70 flex items-center gap-1">
            <span>Ouvrir la coordination</span><span>→</span>
          </div>
        </article>
      </div>

    </template>

    <!-- ══════════════════════════════════════════════════════════════════════
         VUE ACTIVE
         ══════════════════════════════════════════════════════════════════════ -->
    <template v-else-if="mining.sessionView === 'active' && mining.sessionActive">

      <!-- Hero -->
      <section class="rounded-2xl border border-th-subtle bg-black/20 p-4 backdrop-blur-sm space-y-3">
        <!-- Title row -->
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <button class="inline-flex items-center gap-1.5 rounded-xl border border-th-subtle bg-white/5 px-3 py-1.5 text-xs text-th-muted transition hover:bg-white/10"
              @click="mining.closeSession()">← Retour</button>
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-widest text-accent/60">Coordination temps réel</p>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-semibold text-th-primary">{{ mining.sessionActive.name }}</h2>
                <span class="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  :class="mining.sessionActive.status === 'closed' ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'">
                  {{ mining.sessionActive.status === 'closed' ? 'Fermée' : 'Live' }}
                </span>
              </div>
              <p class="text-[11px] text-th-muted mt-0.5 flex flex-wrap gap-x-3">
                <span v-if="mining.sessionActive.createdBy">Chef <strong class="text-th-primary">{{ mining.sessionActive.createdBy }}</strong></span>
                <span v-if="mining.sessionActive.systemName">Système <strong class="text-th-primary">{{ mining.sessionActive.systemName }}</strong></span>
                <span v-if="mining.sessionActive.defaultBodyName">Zone <strong class="text-th-primary">{{ mining.sessionActive.defaultBodyName }}</strong></span>
                <span v-if="mining.sessionActive.defaultRefineryName">Raffinerie <strong class="text-th-primary">{{ mining.sessionActive.defaultRefineryName }}</strong></span>
              </p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button v-if="mining.sessionActive.status !== 'closed'"
              @click="mining.changeZone.show = !mining.changeZone.show; mining.changeRefinery.show = false"
              class="rounded-xl border border-th-subtle bg-white/5 px-3 py-1.5 text-xs text-th-muted transition hover:bg-white/10">
              Changer la zone
            </button>
            <button v-if="mining.sessionActive.status !== 'closed'"
              @click="mining.changeRefinery.show = !mining.changeRefinery.show; mining.changeZone.show = false"
              class="rounded-xl border border-th-subtle bg-white/5 px-3 py-1.5 text-xs text-th-muted transition hover:bg-white/10">
              Raffinerie par défaut
            </button>
            <button v-if="canCreateOperation()"
              @click="mining.createSessionOperation(mining.sessionActive!.id)"
              :disabled="mining.loading.createOp"
              class="rounded-xl border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/15 disabled:opacity-50">
              {{ mining.loading.createOp ? 'Envoi...' : 'Créer l\'opération' }}
            </button>
            <span v-if="mining.sessionActive.operationCreated" class="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Op envoyée</span>
            <button v-if="mining.sessionActive.status !== 'closed' && isSessionCreator()"
              @click="mining.closeSessionAction()"
              :disabled="mining.loading.closeSession"
              class="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-50">
              {{ mining.loading.closeSession ? '...' : 'Fermer la session' }}
            </button>
            <button
              @click="isPinned(mining.sessionActive.id) ? unpinSession() : pinSession(mining.sessionActive.id)"
              class="rounded-xl border px-3 py-1.5 text-xs font-semibold transition"
              :class="isPinned(mining.sessionActive.id)
                ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20'
                : 'border-th-subtle bg-white/5 text-th-muted hover:bg-white/10'"
              :title="isPinned(mining.sessionActive.id) ? 'Désépingler l\'overlay' : 'Épingler sur l\'overlay'">
              {{ isPinned(mining.sessionActive.id) ? '📌 Overlay actif' : '📌 Épingler overlay' }}
            </button>
          </div>
        </div>

        <!-- Stats -->
        <div class="flex flex-wrap gap-2">
          <div v-for="stat in [
            { label: 'Mineurs', value: sessionSummary.miners },
            { label: 'Prospecteurs', value: sessionSummary.prospectors },
            { label: 'Support', value: sessionSummary.support },
            { label: 'Rochets actifs', value: sessionSummary.active },
            { label: 'Terminés', value: sessionSummary.done },
          ]" :key="stat.label" class="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-1.5">
            <span class="text-[10px] text-th-muted">{{ stat.label }}</span>
            <strong class="text-sm font-semibold text-th-primary">{{ stat.value }}</strong>
          </div>
        </div>
      </section>

      <!-- Change zone inline panel -->
      <div v-if="mining.changeZone.show" class="rounded-xl border border-sky-500/15 bg-sky-500/[0.04] p-4 space-y-3">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-sky-400/70">Zone session</p>
        <h4 class="text-sm font-semibold text-th-primary">Modifier la zone par défaut</h4>
        <div class="relative">
          <input v-model="mining.changeZone.bodySearch"
            class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
            placeholder="Système, planète, lune…"
            @input="searchBodies(mining.changeZone.bodySearch, mining.changeZone)"
            @blur="blurChangeZoneSearch()" />
          <button v-if="mining.changeZone.selectedBody" type="button" @click="mining.changeZone.selectedBody = null; mining.changeZone.bodySearch = ''"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 text-xs">✕</button>
          <div v-if="mining.changeZone.bodyResults.length > 0" class="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg">
            <template v-for="sys in mining.changeZone.bodyResults" :key="sys.id ?? sys.name">
              <div class="px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">{{ sys.name }}</div>
              <template v-for="planet in sys.children" :key="planet.id ?? planet.name">
                <button type="button" @mousedown.prevent="planet.id && selectBody(planet, mining.changeZone)"
                  class="w-full text-left px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 pl-5 flex items-center justify-between" :disabled="!planet.id">
                  <span>{{ planet.name }}</span><span class="text-white/30 text-[10px]">{{ planet.type }}</span>
                </button>
                <template v-if="planet.children?.length" v-for="moon in planet.children" :key="moon.id ?? moon.name">
                  <button type="button" @mousedown.prevent="selectBody(moon, mining.changeZone)"
                    class="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 pl-8 flex items-center justify-between">
                    <span>{{ moon.name }}</span><span class="text-white/30 text-[10px]">{{ moon.type }}</span>
                  </button>
                </template>
              </template>
            </template>
          </div>
        </div>
        <div class="flex gap-2 justify-end">
          <button @click="mining.changeZone.show = false" class="rounded-xl border border-th-subtle bg-white/5 px-3 py-1.5 text-xs text-th-muted hover:bg-white/10">Annuler</button>
          <button @click="mining.updateSessionDefaultBody(mining.sessionActive.id, mining.changeZone.selectedBody?.id ?? null)"
            :disabled="!mining.changeZone.selectedBody || mining.loading.updateSessionBody"
            class="rounded-xl border border-accent/30 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 disabled:opacity-50">
            Confirmer la zone
          </button>
        </div>
      </div>

      <!-- Change refinery inline panel -->
      <div v-if="mining.changeRefinery.show" class="rounded-xl border border-sky-500/15 bg-sky-500/[0.04] p-4 space-y-3">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-sky-400/70">Raffinerie session</p>
        <h4 class="text-sm font-semibold text-th-primary">Modifier la raffinerie par défaut</h4>
        <div class="relative">
          <input
            :value="mining.changeRefinery.selectedRefineryId ? refineryDisplayNameById(mining.changeRefinery.selectedRefineryId) : ''"
            readonly
            autocomplete="off"
            class="w-full cursor-pointer rounded-xl border border-th-subtle bg-black/30 px-3 py-2 pr-8 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
            placeholder="Sélectionner une raffinerie…"
            @click="openChangeRefineryDropdown($event)"
            @focus="openChangeRefineryDropdown($event)"
            @keydown="changeRefineryKeydown($event)"
          />
          <button v-if="mining.changeRefinery.selectedRefineryId" type="button"
            @click="clearChangeRefinery()"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 text-xs">✕</button>
          <div v-if="changeRefineryDropOpen"
            class="absolute top-full left-0 right-0 z-50 mt-1 h-56 overflow-hidden rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg backdrop-blur-sm">
            <div class="p-2">
              <input
                :value="changeRefinerySearch"
                autocomplete="off"
                class="change-refinery-dropdown-search sticky top-0 z-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white placeholder:text-white/50 focus:border-accent/30 focus:outline-none"
                placeholder="Rechercher une raffinerie…"
                @input="setChangeRefinerySearch($event)"
                @blur="blurChangeRefineryDrop()"
                @keydown="changeRefineryKeydown($event)"
              />
            </div>
            <div v-if="filteredChangeRefineries.length > 0" class="max-h-40 overflow-y-auto p-1.5 space-y-0.5">
              <button v-for="(r, ri) in filteredChangeRefineries" :key="r.id" type="button"
                @mouseenter="changeRefineryActive = ri"
                @mousedown.prevent="selectChangeRefinery(r)"
                class="refinery-dropdown-item w-full text-left rounded-lg border px-3 py-1.5 text-xs transition flex items-center justify-between"
                :class="ri === changeRefineryActive ? 'border-accent/25 bg-accent/10 text-accent' : 'border-transparent text-white/80 hover:bg-white/5'">
                <span class="font-medium">{{ r.name }}</span>
                <span v-if="refineryLocationLabel(r)" class="text-white/35 text-[10px]">{{ refineryLocationLabel(r) }}</span>
              </button>
            </div>
            <div v-else class="p-3 text-xs text-th-muted">Aucune raffinerie trouvée.</div>
          </div>
        </div>
        <div class="flex gap-2 justify-end">
          <button @click="mining.changeRefinery.show = false" class="rounded-xl border border-th-subtle bg-white/5 px-3 py-1.5 text-xs text-th-muted hover:bg-white/10">Annuler</button>
          <button @click="mining.updateSessionDefaultRefinery(mining.sessionActive.id, mining.changeRefinery.selectedRefineryId)"
            :disabled="mining.loading.updateSessionRefinery"
            class="rounded-xl border border-accent/30 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 disabled:opacity-50">
            Confirmer la raffinerie
          </button>
        </div>
      </div>

      <!-- ── Two-column layout ───────────────────────────────────────────────── -->
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-[300px_1fr]">

        <!-- ══ COLONNE ÉQUIPE ══════════════════════════════════════════════════ -->
        <aside class="rounded-2xl border border-th-subtle bg-black/20 p-4">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-th-muted">Effectifs</p>
              <h3 class="mt-0.5 text-sm font-semibold text-th-primary">Équipe</h3>
            </div>
            <span class="text-[11px] text-th-muted">{{ (mining.sessionActive.participants ?? []).length }} membre(s)</span>
          </div>

          <!-- Join box -->
          <div v-if="!isParticipant() && mining.sessionActive.status !== 'closed'" class="mb-3 rounded-xl border border-accent/15 bg-accent/[0.04] p-3 space-y-2">
            <p class="text-xs font-semibold text-th-primary">Tu n'es pas encore dans la session</p>
            <p class="text-[11px] text-th-muted">Rejoins la coordination pour signaler et suivre les rochers.</p>
            <button class="w-full rounded-xl border border-accent/25 bg-accent/[0.08] py-2 text-xs font-semibold text-accent transition hover:bg-accent/15"
              @click="mining.showJoinForm(mining.sessionActive.id)">
              Rejoindre la session
            </button>
          </div>

          <!-- Crew sections -->
          <div class="space-y-4">
            <div v-for="section in crewRoleSections" :key="section.role">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm">{{ section.icon }}</span>
                <h4 class="text-xs font-semibold text-th-primary">{{ section.label }}</h4>
              </div>

              <!-- Support: transport raffinerie -->
              <div v-if="section.role === 'support' && isSupport() && mining.sessionActive.status !== 'closed'" class="mb-2">
                <button @click="openWoSupportForm()"
                  class="w-full rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/10">
                  🚚 Transport raffinerie
                </button>
              </div>

              <!-- Cargo panel for support -->
              <div v-if="section.role === 'support' && openCargos.length > 0" class="mb-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-3 space-y-2">
                <div class="flex items-center justify-between text-[10px]">
                  <span class="font-semibold text-amber-300/80 uppercase tracking-wider">Flux cargo</span>
                  <span class="text-th-muted">{{ openCargos.length }} en transit/attente</span>
                </div>
                <div class="space-y-1.5">
                  <article v-for="cargo in openCargos" :key="cargo.id" class="rounded-lg border border-white/8 bg-white/[0.02] p-2 flex items-center gap-2 text-xs">
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-th-primary truncate">{{ cargo.commodityName ?? 'Minerai inconnu' }} <span class="text-th-muted font-normal">#{{ cargo.id }}</span></div>
                      <div class="text-[10px] text-th-muted mt-0.5">{{ Number(cargo.quantityScu ?? 0).toFixed(1) }} SCU
                        <span v-if="cargo.collectedBy"> · par {{ cargo.collectedBy }}</span>
                      </div>
                    </div>
                    <span class="shrink-0 rounded-full border px-2 py-0.5 text-[10px]"
                      :class="cargo.status === 'in_transit' ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'">
                      {{ cargo.status === 'in_transit' ? 'En transit' : 'À récupérer' }}
                    </span>
                    <button v-if="canPickupCargo(cargo)"
                      @click="mining.pickupCargo(mining.sessionActive!.id, cargo.id)"
                      :disabled="mining.loading.pickupCargo"
                      class="shrink-0 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/15 disabled:opacity-50">
                      Prendre
                    </button>
                  </article>
                </div>
              </div>

              <!-- Crew cards -->
              <div class="space-y-2">
                <article v-for="group in section.groups" :key="group.key"
                  class="rounded-xl border p-3"
                  :class="group.isMyGroup ? 'border-accent/20 bg-accent/[0.04]' : 'border-white/8 bg-white/[0.02]'">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <h5 class="text-xs font-semibold text-th-primary truncate">{{ group.shipName ?? (section.role === 'miner' ? 'Équipage minier' : section.role === 'prospector' ? 'Équipage prospecteur' : 'Équipage support') }}</h5>
                      <p class="text-[10px] text-th-muted mt-0.5">{{ group.crew.used }} / {{ group.crew.total ?? '?' }} sièges</p>
                    </div>
                    <!-- Status + WO raffinerie (mineurs) -->
                    <div class="flex flex-col items-end gap-1.5">
                      <template v-if="(group.amICaptain || group.amISubCaptain) && mining.sessionActive.status !== 'closed'">
                        <select class="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-th-primary focus:outline-none"
                          :value="group.crew.status ?? ''"
                          @change="mining.setCrewStatusOverride(group.key, ($event.target as HTMLSelectElement).value || null)">
                          <option value="">Auto : {{ crewStatusLabel(group.crew.suggested) }}</option>
                          <option v-for="s in crewStatusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
                        </select>
                      </template>
                      <template v-else>
                        <span class="rounded-full border px-2 py-0.5 text-[10px]" :class="crewStatusClass(group.crew.effectiveStatus)">
                          {{ crewStatusLabel(group.crew.effectiveStatus) }}
                        </span>
                      </template>
                      <button v-if="section.role === 'miner' && (group.amICaptain || group.amISubCaptain) && mining.sessionActive.status !== 'closed'"
                        @click="openWoShipForm(group)"
                        class="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10">
                        ⛽ Raffinerie
                      </button>
                    </div>
                  </div>

                  <!-- Members -->
                  <div class="mt-2 space-y-1.5">
                    <div v-for="m in group.members" :key="m.id" class="flex items-center gap-2">
                      <!-- Avatar -->
                      <div class="h-7 w-7 shrink-0 rounded-full overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center text-xs font-semibold text-th-primary">
                        <img v-if="m.avatar" :src="m.avatar" class="w-full h-full object-cover" />
                        <span v-else>{{ (m.username ?? '?')[0].toUpperCase() }}</span>
                      </div>
                      <!-- Name + rank + duty -->
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="text-xs font-medium text-th-primary truncate">{{ m.username }}</span>
                          <span v-if="participantRank(m) === 'captain'" class="text-[10px]">👑</span>
                          <span v-else-if="participantRank(m) === 'sub_captain'" class="text-[10px]">⚓</span>
                          <span v-if="m.userId === mining._currentUserId && participantRank(m) === 'member'"
                            class="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/40">Moi</span>
                        </div>
                        <!-- Duty -->
                        <div class="mt-0.5">
                          <template v-if="(group.amICaptain || group.amISubCaptain) && mining.sessionActive.status !== 'closed'">
                            <select class="rounded-lg border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-th-primary focus:outline-none"
                              :value="participantDuty(m)"
                              @change="mining.updateParticipantDuty(mining.sessionActive!.id, m.id, ($event.target as HTMLSelectElement).value)">
                              <option v-for="opt in dutyOptions(m)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                            </select>
                          </template>
                          <template v-else>
                            <span class="rounded-full border px-2 py-0.5 text-[9px]" :class="dutyClass(participantDuty(m))">
                              {{ dutyLabel(participantDuty(m)) }}
                            </span>
                          </template>
                        </div>
                      </div>
                      <!-- Actions -->
                      <div class="flex shrink-0 gap-1">
                        <button v-if="group.amICaptain && participantRank(m) !== 'captain' && mining.sessionActive.status !== 'closed'"
                          @click="mining.assignSubCaptain(mining.sessionActive!.id, m.id)"
                          :title="participantRank(m) === 'sub_captain' ? 'Retirer sous-capitaine' : 'Nommer sous-capitaine'"
                          class="h-6 w-6 rounded-lg border border-white/10 bg-white/5 text-[10px] hover:bg-white/10">⚓</button>
                        <button v-if="m.userId === mining._currentUserId && mining.sessionActive.status !== 'closed'"
                          @click="checkAndLeave(mining.sessionActive!.id, m.id)"
                          class="rounded-lg border border-rose-500/20 bg-rose-500/5 px-1.5 py-0.5 text-[9px] text-rose-300/70 hover:bg-rose-500/10">Quitter</button>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>

            <div v-if="crewRoleSections.length === 0" class="text-xs italic text-th-muted">Aucun participant pour le moment.</div>
          </div>
        </aside>

        <!-- ══ COLONNE ROCHETS ═════════════════════════════════════════════════ -->
        <section class="rounded-2xl border border-th-subtle bg-black/20 p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-th-muted">Production</p>
              <h3 class="mt-0.5 text-sm font-semibold text-th-primary">
                Rochets
                <span class="ml-1.5 text-xs font-normal text-th-muted">{{ (mining.sessionActive.rocks ?? []).length }} signalé(s)</span>
              </h3>
            </div>
            <div class="flex gap-2">
              <button v-if="isParticipant() && mining.sessionActive.status !== 'closed'"
                @click="mining.rockForm.show && !mining.rockForm.editRockId ? (mining.rockForm.show = false) : openRockCreateFromHeader()"
                class="rounded-xl border px-3 py-1.5 text-xs font-semibold transition"
                :class="mining.rockForm.show && !mining.rockForm.editRockId ? 'border-rose-500/25 bg-rose-500/10 text-rose-300' : 'border-accent/25 bg-accent/[0.08] text-accent hover:bg-accent/15'">
                <span v-if="!mining.rockForm.show || mining.rockForm.editRockId">+ Signaler</span>
                <span v-else>Annuler</span>
              </button>
            </div>
          </div>

          <!-- Rock create/edit form -->
          <RockFormPanel v-if="mining.rockForm.show" id="rock-form-panel" @cancel="cancelRockEdit()" @saved="saveRockForm()" />

          <!-- Rock filters -->
          <div v-if="(mining.sessionActive.rocks ?? []).length > 0" class="flex gap-1 flex-wrap">
            <button v-for="[key, label] in [['all','Tous'],['available','Disponibles'],['inprogress','En cours'],['done','Terminés']]" :key="key"
              class="rounded-lg border px-3 py-1 text-xs transition flex items-center gap-1.5"
              :class="mining.rockFilter === key ? 'border-accent/30 bg-accent/10 text-accent' : 'border-th-subtle bg-white/5 text-th-muted hover:bg-white/10'"
              @click="mining.rockFilter = key as any">
              {{ label }}
              <span class="rounded-full border border-current/20 px-1.5 py-0.5 text-[9px]">{{ mining.rockFilterCount(key) }}</span>
            </button>
          </div>

          <p v-if="!(mining.sessionActive.rocks ?? []).length && !mining.rockForm.show" class="text-xs italic text-th-muted">Aucun rocher signalé.</p>
          <p v-else-if="(mining.sessionActive.rocks ?? []).length > 0 && mining.rockFilteredList.length === 0" class="text-xs italic text-th-muted">Aucun rocher dans cette catégorie.</p>

          <!-- Rock cards -->
          <div class="space-y-2">
            <article v-for="rock in mining.rockFilteredList" :key="rock.id"
              class="rounded-2xl border overflow-hidden"
              :class="['completed','depleted'].includes(rock.status) ? 'border-white/5 bg-black/10 opacity-60' : ['fracturing','extraction'].includes(rock.status) ? 'border-orange-500/20 bg-orange-500/[0.03]' : 'border-white/8 bg-black/15'">

              <div class="flex">
                <!-- Status rail -->
                <div class="w-1 shrink-0" :class="rockRailClass(rock.status)"></div>

                <div class="flex-1 min-h-[160px] p-4 md:p-5 space-y-3">
                  <!-- Rock head -->
                  <div class="flex items-start gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-sm font-semibold text-th-primary">{{ rock.bodyName ?? 'Corps inconnu' }}</span>
                        <span class="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold" :class="rockStatusClass(rock.status)">
                          {{ rockStatusLabel(rock.status) }}
                        </span>
                      </div>
                      <!-- Coords -->
                      <p v-if="rock.posX != null || rock.posY != null || rock.posZ != null" class="mt-1 font-mono text-[11px] font-semibold tracking-wide text-th-muted">
                        <span v-if="rock.posX != null">X {{ rock.posX }}</span>
                        <span v-if="rock.posY != null" class="ml-2">Y {{ rock.posY }}</span>
                        <span v-if="rock.posZ != null" class="ml-2">Z {{ rock.posZ }}</span>
                      </p>
                    </div>

                    <!-- Quick actions -->
                    <div class="flex shrink-0 flex-wrap gap-1 justify-end">
                      <!-- Claim -->
                      <button v-if="canClaimRock(rock)"
                        @click="mining.claimConfirm = { show: true, rockId: rock.id }"
                        :disabled="mining.loading.claimRock"
                        class="rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/15 disabled:opacity-50">
                        ⛏ Je prends
                      </button>
                      <!-- My rock flow -->
                      <template v-if="isMineRock(rock)">
                        <button v-if="rock.status === 'en_route'" @click="mining.updateRockStatus(rock.id, 'fracturing')"
                          :disabled="mining.loading.updateRockStatus"
                          class="rounded-lg border border-orange-500/25 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold text-orange-300 hover:bg-orange-500/15 disabled:opacity-50">⚡ Laser actif</button>
                        <button v-if="rock.status === 'fracturing'" @click="mining.updateRockStatus(rock.id, 'extraction')"
                          :disabled="mining.loading.updateRockStatus"
                          class="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-300 hover:bg-violet-500/15 disabled:opacity-50">🪨 Extraction</button>
                        <button v-if="['en_route','fracturing'].includes(rock.status)" @click="mining.unclaimRock(rock.id)"
                          :disabled="mining.loading.claimRock"
                          class="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-th-muted hover:bg-white/10 disabled:opacity-50">↩ Se désister</button>
                      </template>
                      <!-- Renfort / présence extraction (autre mineur) -->
                      <button v-if="!isMineRock(rock) && ['fracturing','extraction'].includes(rock.status) && isMiner() && mining.sessionActive.status !== 'closed'"
                        @click="mining.assignRock(rock.id)"
                        :disabled="mining.loading.assignRock"
                        class="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-th-muted hover:bg-white/10 disabled:opacity-50"
                        :class="rock.assignedToUserId === mining._currentUserId ? (rock.status === 'extraction' ? 'border-violet-500/25 bg-violet-500/10 text-violet-300' : 'border-orange-500/25 bg-orange-500/10 text-orange-300') : ''">
                        <span v-if="rock.assignedToUserId !== mining._currentUserId">{{ rock.status === 'extraction' ? '👋 Je viens' : '⚡ Renfort' }}</span>
                        <span v-else>✕ Me désister</span>
                      </button>
                      <!-- Collect actions -->
                      <template v-if="rock.status === 'extraction' && isParticipant() && mining.sessionActive.status !== 'closed'">
                        <button v-if="canDeclarePartial(rock)"
                          @click="mining.openCollectForm(rock.id, 'partial')"
                          class="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/15">📦 Ma collecte</button>
                        <button v-if="canFinalize(rock)"
                          @click="mining.openFinalizeRockCollection(rock.id)"
                          class="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/15">✓ Clôturer</button>
                      </template>
                      <!-- Edit -->
                      <button v-if="canEditRock(rock) && editingRockId !== rock.id"
                        @click="openRockEdit(rock)"
                        class="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-th-muted hover:bg-white/10">Modifier</button>
                      <button v-if="editingRockId === rock.id" @click="cancelRockEdit()"
                        class="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-th-muted hover:bg-white/10">Annuler</button>
                      <!-- Delete -->
                      <button v-if="canDeleteRock(rock)"
                        @click="mining.deleteRock(rock.id)"
                        :disabled="mining.loading.deleteRock"
                        class="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1 text-[10px] text-rose-400/60 hover:bg-rose-500/10 disabled:opacity-50">✕</button>
                    </div>
                  </div>

                  <!-- Details grid -->
                  <div v-if="rock.mass != null || rock.sizeScuEstimate != null || rock.instability != null || rock.resistance != null"
                    class="flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
                    <span v-if="rock.sizeScuEstimate != null" class="text-th-muted">Taille <strong class="text-th-primary">{{ rock.sizeScuEstimate }} SCU</strong></span>
                    <span v-if="rock.mass != null" class="text-th-muted">Masse <strong class="text-th-primary">{{ rock.mass }}</strong></span>
                    <span v-if="rock.instability != null" class="text-th-muted">Instab. <strong class="text-th-primary">{{ rock.instability }}%</strong></span>
                    <span v-if="rock.resistance != null" class="text-th-muted">Résist. <strong class="text-th-primary">{{ rock.resistance }}%</strong></span>
                  </div>

                  <!-- Minerals -->
                  <div v-if="rockDisplayMinerals(rock).length > 0" class="flex flex-wrap gap-1">
                    <span v-for="m in rockDisplayMinerals(rock)" :key="String(m.commodityId ?? m.commodityName)"
                      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
                      :class="m.phase === 'actual' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-accent/20 bg-accent/[0.08] text-accent'">
                      <span v-if="m.phase !== 'actual' && m.quality != null" class="h-1.5 w-1.5 rounded-full" :class="qualityColor(m.quality).replace('text-','bg-')"></span>
                      <span>{{ m.commodityName }}</span>
                      <strong v-if="m.phase === 'actual' && m.quantityScuActual > 0">{{ Math.round(m.quantityScuActual * 10) / 10 }} SCU</strong>
                      <span v-else-if="m.percentage > 0">{{ Math.round(m.percentage) }}%</span>
                    </span>
                  </div>

                  <!-- Notes -->
                  <p v-if="rock.notes" class="text-[11px] text-th-muted italic">{{ rock.notes }}</p>

                  <!-- Meta -->
                  <div class="flex flex-wrap gap-x-3 text-[10px] text-th-muted">
                    <span>Signalé par <strong class="text-th-primary">{{ rock.reportedBy }}</strong></span>
                    <span v-if="rock.claimedBy">⛏ <strong class="text-th-primary">{{ rock.claimedBy }}</strong></span>
                    <span v-if="rock.assignedTo">👋 <strong class="text-th-primary">{{ rock.assignedTo }}</strong></span>
                  </div>

                  <!-- Edition déplacée dans le formulaire complet au-dessus -->
                  <div v-if="editingRockId === rock.id && mining.rockForm.show && mining.rockForm.editRockId === rock.id"
                    class="rounded-xl border border-accent/15 bg-accent/[0.04] px-3 py-2 text-[11px] text-accent">
                    Formulaire de modification ouvert au-dessus de la liste.
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>

      <!-- Journal -->
      <section class="rounded-2xl border border-th-subtle bg-black/20">
        <button class="flex w-full items-center justify-between px-4 py-3" @click="sessionLogOpen = !sessionLogOpen">
          <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-th-muted">Journal</p>
          <svg class="h-4 w-4 text-th-muted/60 transition-transform" :class="sessionLogOpen ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div v-if="sessionLogOpen" class="max-h-52 overflow-y-auto border-t border-white/5 p-3 space-y-1">
          <div v-for="entry in mining.sessionActiveLogs" :key="entry.id" class="flex gap-2 text-xs">
            <span class="shrink-0 text-base leading-none">{{ entry.icon }}</span>
            <span class="text-th-muted">{{ entry.message }}</span>
          </div>
          <p v-if="!mining.sessionActiveLogs.length" class="text-xs italic text-th-muted">Aucun événement.</p>
        </div>
      </section>

    </template>

    <!-- ══════════════════════════════════════════════════════════════════════
         MODAL — REJOINDRE
         ══════════════════════════════════════════════════════════════════════ -->
    <SessionJoinModal />

    <!-- ══════════════════════════════════════════════════════════════════════
         MODAL — CONFIRMER CLAIM
         ══════════════════════════════════════════════════════════════════════ -->
    <div v-if="mining.claimConfirm.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="mining.claimConfirm.show = false">
      <div class="w-full max-w-sm rounded-2xl border border-th-subtle bg-[#0d1117] p-6 shadow-2xl text-center space-y-3">
        <div class="text-3xl">⛏️</div>
        <h3 class="text-sm font-semibold text-th-primary">Confirmer la prise en charge</h3>
        <p class="text-xs text-th-muted">Ce rocher sera marqué comme pris en charge par toi pour toute l'équipe.</p>
        <div class="flex gap-2 justify-center">
          <button class="rounded-xl border border-th-subtle bg-white/5 px-4 py-2 text-xs text-th-muted hover:bg-white/10" @click="mining.claimConfirm.show = false">Annuler</button>
          <button class="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/15 disabled:opacity-50"
            :disabled="mining.loading.claimRock"
            @click="mining.claimRock(mining.claimConfirm.rockId!); mining.claimConfirm.show = false">
            Confirmer
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════
         MODAL — COLLECTE
         ══════════════════════════════════════════════════════════════════════ -->
    <div v-if="mining.collectForm.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" @click.self="mining.collectForm.show = false">
      <div class="w-full max-w-2xl rounded-2xl border border-th-subtle bg-[#0d1117] p-5 shadow-2xl space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-widest text-accent/70">Collecte</p>
            <h3 class="text-base font-semibold text-th-primary">
              {{ mining.collectForm.mode === 'partial' ? 'Déclarer la collecte de votre équipe' : 'Clôturer l’extraction et enregistrer le total' }}
            </h3>
            <p v-if="mining.collectForm.mode === 'partial'" class="mt-0.5 text-xs text-th-muted">Cette saisie s’ajoute au total déjà déclaré par les autres équipes.</p>
            <p v-else class="mt-0.5 text-xs text-th-muted">Renseigne le total réellement récupéré avant de clôturer le rocher.</p>
          </div>
          <button type="button" @click="mining.collectForm.show = false" class="rounded-lg px-2 py-1 text-lg leading-none text-th-muted transition hover:bg-white/5 hover:text-th-primary">✕</button>
        </div>

        <div class="space-y-2">
          <div v-if="mining.collectForm.lines.length" class="hidden grid-cols-[minmax(0,1.2fr)_8rem_2rem] gap-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-th-muted md:grid">
            <span>Minéral détecté</span>
            <span>Collecté</span>
            <span></span>
          </div>

          <div v-for="(line, i) in mining.collectForm.lines" :key="i" class="grid gap-2 rounded-xl border border-th-subtle bg-black/20 p-2 md:grid-cols-[minmax(0,1.2fr)_8rem_2rem] md:items-start">
            <div class="min-w-0">
              <div class="relative">
                <input
                  :value="mineralDisplayName(line)"
                  readonly
                  autocomplete="off"
                  class="w-full cursor-pointer rounded-xl border border-th-subtle bg-black/30 px-3 py-2 pr-8 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                  placeholder="Sélectionner un minerai…"
                  @click="openMineralDropdown(line, $event)"
                  @focus="openMineralDropdown(line, $event)"
                  @keydown="collectMineralDropdownKeydown($event, line)"
                />
                <button v-if="line.commodityId" type="button"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 text-xs"
                  @click="clearMineral(line)">✕</button>

                <div v-if="line._open" class="absolute top-full left-0 right-0 z-50 mt-1 h-52 overflow-hidden rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg backdrop-blur-sm mineral-dropdown-list">
                  <div class="p-2">
                    <input
                      :value="mineralSearch(line)"
                      type="text"
                      autocomplete="off"
                      placeholder="Rechercher un minerai..."
                      class="mineral-dropdown-search sticky top-0 z-10 w-full rounded-t-xl border-b border-white/10 bg-[#0b1422]/95 px-3 py-2 text-xs text-white placeholder:text-white/60 focus:outline-none"
                      @input="setMineralSearch(line, $event)"
                      @blur="closeMineralDropdown(line)"
                      @keydown="collectMineralDropdownKeydown($event, line)"
                    />
                  </div>

                  <div v-if="filteredCollectMineralsForRow(line).length" class="max-h-36 overflow-y-auto p-1.5 space-y-0.5">
                    <button v-for="(min, mi) in filteredCollectMineralsForRow(line)" :key="min.id" type="button"
                      @mousedown.prevent="selectCollectMineral(line, min)"
                      class="mineral-dropdown-item flex w-full justify-between rounded-lg border px-3 py-1.5 text-left text-xs transition"
                      :class="mi === ((line as any)._hi ?? -1) ? 'border-accent/25 bg-accent/10 text-accent' : 'border-transparent text-white/80 hover:bg-white/5 hover:border-white/10'">
                      <span>{{ min.name }}</span><span class="text-white/30">{{ (min as any).code }}</span>
                    </button>
                  </div>
                  <div v-else class="p-3 text-xs text-th-muted">Aucun minerai disponible.</div>
                </div>
              </div>

              <p v-if="line.scanEstimateScu > 0" class="mt-1 text-[10px] text-white/40">📊 Maximum Scan : {{ Number(line.scanEstimateScu).toFixed(1) }} SCU</p>
              <p v-if="mining.collectForm.mode === 'complete' && line.alreadyCollectedScu > 0" class="mt-0.5 text-[10px] text-emerald-300/70">✓ Déjà déclaré : {{ Number(line.alreadyCollectedScu).toFixed(1) }} SCU</p>
            </div>

            <div>
              <input v-model="line.quantityScuActual" type="text" inputmode="decimal" placeholder="0.0"
                class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none" />
              <p class="mt-1 text-[10px] text-th-muted">SCU Collectés</p>
            </div>

            <button class="justify-self-end rounded-lg px-2 py-1 text-lg leading-none text-th-muted transition hover:bg-rose-500/10 hover:text-rose-300" @click="removeCollectLine(i)">×</button>
          </div>
        </div>

        <button @click="addCollectLine()"
          class="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-th-muted transition hover:bg-white/10">+ Ajouter un minerai</button>

        <p v-if="mining.collectForm.error" class="text-xs text-rose-300">⚠️ {{ mining.collectForm.error }}</p>
        <div class="flex gap-2">
          <button class="flex-1 rounded-xl border border-th-subtle bg-white/5 py-2 text-xs text-th-muted hover:bg-white/10" @click="mining.collectForm.show = false">Annuler</button>
          <button class="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
            :disabled="mining.collectForm.saving" @click="mining.collectRock()">
            {{ mining.collectForm.saving ? 'Envoi...' : (mining.collectForm.mode === 'partial' ? 'Ajouter au total' : 'Clôturer et enregistrer') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════
         MODAL — WO SHIP (Raffinerie groupe)
         ══════════════════════════════════════════════════════════════════════ -->
    <SessionWoShipModal ref="woShipModalRef" />

    <!-- ══════════════════════════════════════════════════════════════════════
         MODAL — TRANSFERT CAPITANAT (leave confirm)
         ══════════════════════════════════════════════════════════════════════ -->
    <SessionLeaveConfirmModal />

  </div>
</template>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              