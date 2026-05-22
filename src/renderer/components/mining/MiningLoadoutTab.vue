<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMiningStore } from '../../stores/mining'
import { useAppStore } from '../../stores/app'
import type { MiningShip, MiningLaser, MiningModule, MiningLoadout, LoadoutBuilderTurret } from '@shared/general'

function tryParseDate(v: any): Date | null {
  if (v == null) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  if (!s) return null
  // numeric timestamp (seconds or ms)
  if (/^\d+$/.test(s)) {
    try {
      const n = Number(s)
      const ms = n < 1e12 ? n * 1000 : n
      const d = new Date(ms)
      return isNaN(d.getTime()) ? null : d
    } catch { /* fallthrough */ }
  }
  // try ISO/other parse
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function formatDateShort(d: Date): string {
  try {
    return d.toLocaleString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return d.toISOString()
  }
}

function prettyLabelFromKey(k: string): string {
  // CamelCase / snake_case -> human readable (capitalized)
  const s = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getLoadoutDates(lo: MiningLoadout | any) {
  const out: Array<{ key: string; label: string; date: Date; text: string }> = []
  // first: known keys in preferred order
  const preferred = ['createdAt', 'created_at', 'created', 'updatedAt', 'updated_at', 'modifiedAt', 'modified_at', 'publishedAt', 'published_at', 'sharedAt', 'shared_at']
  for (const k of preferred) {
    const v = (lo as any)[k]
    const d = tryParseDate(v)
    if (d) out.push({ key: k, label: DATE_LABELS[k] ?? prettyLabelFromKey(k), date: d, text: formatDateShort(d) })
  }
  // then scan all other props that look like dates
  for (const k of Object.keys(lo || {})) {
    if (preferred.includes(k)) continue
    if (!/date|at|time|timestamp|published|created|updated|modified|shared|deleted/i.test(k)) continue
    const v = (lo as any)[k]
    const d = tryParseDate(v)
    if (d) out.push({ key: k, label: DATE_LABELS[k] ?? prettyLabelFromKey(k), date: d, text: formatDateShort(d) })
  }
  // remove duplicates by key
  const seen = new Set<string>()
  const uniq = out.filter((i) => { if (seen.has(i.key)) return false; seen.add(i.key); return true })
  // sort: preferred order first, then by date desc
  uniq.sort((a, b) => {
    const ai = preferred.indexOf(a.key)
    const bi = preferred.indexOf(b.key)
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    return b.date.getTime() - a.date.getTime()
  })
  return uniq
}

const mining = useMiningStore()
const _app   = useAppStore()

const loadoutStyle = {}

const DATE_LABELS: Record<string, string> = {
  createdAt:    'Créé le',
  created_at:   'Créé le',
  created:      'Créé le',
  updatedAt:    'Modifié le',
  updated_at:   'Modifié le',
  modifiedAt:   'Modifié le',
  modified_at:  'Modifié le',
  publishedAt:  'Publié le',
  published_at: 'Publié le',
  sharedAt:     'Partagé le',
  shared_at:    'Partagé le',
}

// ── Sub-tab ───────────────────────────────────────────────────────────────────
type LoadoutTab = 'builder' | 'saved' | 'public'
const activeSubTab = ref<LoadoutTab>('builder')

// ── Builder state ─────────────────────────────────────────────────────────────
const editId          = ref<number | null>(null)
const loadoutName     = ref('')
const loadoutIsPublic = ref(false)
const turrets         = ref<LoadoutBuilderTurret[]>([])
const selectedShipId  = ref<number | null>(null)
const showShopping    = ref(false)
const saveError       = ref<string | null>(null)
const confirmDeleteId = ref<number | null>(null)

const laserQuery  = ref<string[]>([])
const laserOpen   = ref<boolean[]>([])
const moduleQuery = ref<string[][]>([])
const moduleOpen  = ref<Record<number, boolean>[]>([])
const moduleSearch = ref<string[][]>([])
const moduleActive = ref<Record<number, number>>([])

// ── Ship filtering ────────────────────────────────────────────────────────────

const filteredShips = computed(() => mining.loadout.ships)

const SALVAGE_SLOT_COUNT = 2

function normalizeText(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const cleaned = String(v).trim().replace(',', '.').replace(/[^0-9.+-]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isNaN(n) ? null : n
}

function normalizeStatKey(key: string): string {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findStatValue(source: any, aliases: string[], depth = 0): unknown {
  if (source == null || depth > 4) return null
  const wanted = aliases.map((k) => normalizeStatKey(k))

  if (Array.isArray(source)) {
    for (const entry of source) {
      const found = findStatValue(entry, aliases, depth + 1)
      if (found != null && found !== '') return found
    }
    return null
  }

  if (typeof source !== 'object') return null

  for (const key of Object.keys(source)) {
    if (wanted.includes(normalizeStatKey(key))) {
      const val = source[key]
      if (val != null && val !== '') return val
    }
  }

  for (const key of Object.keys(source)) {
    const nested = source[key]
    if (nested && typeof nested === 'object') {
      const found = findStatValue(nested, aliases, depth + 1)
      if (found != null && found !== '') return found
    }
  }

  return null
}

function formatSalvageMetric(value: number | null, unit = '', percent = false): string {
  if (value == null || Number.isNaN(value)) return '—'
  const shown = percent && Math.abs(value) <= 1 ? value * 100 : value
  return `${shown.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${percent ? ' %' : (unit ? ` ${unit}` : '')}`
}

function getSelectedShipSalvageBuff(): Record<string, unknown> {
  return ((selectedShip.value as any)?.salvageBuff ?? {}) as Record<string, unknown>
}

function salvageModuleFinalStats(module: MiningModule | null) {
  const source = module as any
  const buff = getSelectedShipSalvageBuff()

  const moduleRadius = toNumberOrNull(findStatValue(source, ['radius', 'radiusMultiplier', 'extractionRadius', 'extractionArea', 'areaOfEffect', 'aoe', 'salvageRadius', 'salvageRadiusMultiplier', 'salvageArea', 'scrapeRadius', 'scraperRadius', 'beamRadius']))
  const moduleSpeed = toNumberOrNull(findStatValue(source, ['extractionSpeed', 'extractionSpeedMultiplier', 'extractionRate', 'extractionRateMultiplier', 'speed', 'speedMultiplier', 'salvageSpeed', 'salvageSpeedMultiplier', 'scrapeSpeed', 'scraperSpeed']))
  const moduleEfficiency = toNumberOrNull(findStatValue(source, ['extractionEfficiency', 'extractionEfficiencyMultiplier', 'efficiency', 'efficiencyMultiplier', 'salvageEfficiency', 'salvageEfficiencyMultiplier', 'scrapeEfficiency', 'scraperEfficiency']))

  const shipRadiusMul = toNumberOrNull((buff as any).radiusMultiplier) ?? 1
  const shipSpeedMul = toNumberOrNull((buff as any).salvageSpeedMultiplier) ?? 1
  const shipEfficiencyMul = toNumberOrNull((buff as any).extractionEfficiency) ?? 1

  const radius = moduleRadius != null ? moduleRadius * shipRadiusMul : null
  const speed = moduleSpeed != null ? moduleSpeed * shipSpeedMul : null
  const efficiency = moduleEfficiency != null ? moduleEfficiency * shipEfficiencyMul : null

  return {
    radius,
    speed,
    efficiency,
    radiusDisplay: formatSalvageMetric(radius, 'm'),
    speedDisplay: formatSalvageMetric(speed),
    efficiencyDisplay: formatSalvageMetric(efficiency, '', true),
  }
}

function isSalvageShip(ship: MiningShip | null | undefined): boolean {
  if (!ship) return false
  if ((ship as any).isSalvage === true) return true
  const raw = [
    (ship as any).role,
    (ship as any).type,
    (ship as any).category,
    (ship as any).kind,
    (ship as any).duty,
    (ship as any).gameplay,
    (ship as any).allowedDuties,
    (ship as any).tags,
  ].map((v) => normalizeText(v)).join(' ')
  return raw.includes('salvage')
}

function isSalvageLoadout(lo: MiningLoadout): boolean {
  if ((lo as any).isSalvage === true) return true
  if ((lo as any).isMining === true) return false
  const ship = mining.loadout.ships.find((s) => s.id === lo.shipId)
  if (ship) return isSalvageShip(ship)
  const raw = [
    (lo as any).shipRole,
    (lo as any).shipType,
    (lo as any).shipCategory,
    (lo as any).role,
    (lo as any).type,
    (lo as any).category,
    (lo as any).gameplay,
    (lo as any).allowedDuties,
  ].map((v) => normalizeText(v)).join(' ')
  return raw.includes('salvage')
}

function resolveModuleRef(ref: unknown, salvage = false): MiningModule | null {
  if (ref == null) return null
  const catalog = salvage
    ? mining.loadout.scraperModules
    : mining.loadout.modules
  const id = typeof ref === 'number'
    ? ref
    : Number((ref as any)?.id ?? (ref as any)?.moduleId ?? (ref as any)?.componentId)
  if (Number.isFinite(id)) {
    const byId = catalog.find((m) => Number(m.id) === Number(id))
    if (byId) return byId
  }
  const name = normalizeText((ref as any)?.name ?? (ref as any)?.moduleName ?? (ref as any)?.componentName ?? (ref as any)?.shortName)
  if (!name) return null
  return catalog.find((m) => normalizeText(m.name ?? m.shortName) === name) ?? null
}

const selectedShip = computed(() =>
  mining.loadout.ships.find((s) => s.id === selectedShipId.value) ?? null,
)

const selectedShipIsSalvage = computed(() => isSalvageShip(selectedShip.value))

function quickShips(tokens: string[]): MiningShip[] {
  const seen = new Set<number>()
  const out: MiningShip[] = []
  const ships = mining.loadout.ships || []
  for (const token of tokens) {
    const t = normalizeText(token)
    if (!t) continue
    const match = ships.find((s) => normalizeText((s.name ?? '') + ' ' + (s.nameFull ?? '')).includes(t))
    if (match && !seen.has(match.id)) { seen.add(match.id); out.push(match) }
  }
  return out
}
const airShips    = computed(() => quickShips(['mole', 'prospector', 'golem']))
const groundShips = computed(() => quickShips(['roc ds', 'roc']))
const salvageShips = computed(() => quickShips(['reclaimer', 'vulture', 'fortune', 'moth', 'salvation']))

// ── Ship selection ────────────────────────────────────────────────────────────

function syncDropdownArrays() {
  laserQuery.value  = turrets.value.map((t) => t.laser?.name ?? '')
  laserOpen.value   = turrets.value.map(() => false)
  moduleQuery.value = turrets.value.map((t) => t.modules.map((m) => m?.name ?? ''))
  moduleOpen.value  = turrets.value.map(() => ({}))
  moduleSearch.value = turrets.value.map(() => [])
  moduleActive.value = turrets.value.map(() => ({}))
}

function ensureModuleSlotState(ti: number, mi: number) {
  if (!moduleOpen.value[ti]) moduleOpen.value[ti] = {}
  if (!moduleSearch.value[ti]) moduleSearch.value[ti] = []
  if (!moduleActive.value[ti]) moduleActive.value[ti] = {}
  if (moduleSearch.value[ti][mi] == null) moduleSearch.value[ti][mi] = ''
  if (moduleActive.value[ti][mi] == null) moduleActive.value[ti][mi] = -1
}

function clampListIndex(index: number, length: number): number {
  if (length <= 0) return -1
  if (index < 0) return 0
  if (index >= length) return length - 1
  return index
}

function openModuleDropdown(ti: number, mi: number) {
  ensureModuleSlotState(ti, mi)
  moduleOpen.value[ti] = { ...(moduleOpen.value[ti] ?? {}), [mi]: true }
  moduleSearch.value[ti][mi] = ''
  const len = filteredModules(ti, mi).length
  moduleActive.value[ti][mi] = len > 0 ? 0 : -1
}

function closeModuleDropdown(ti: number, mi: number) {
  ensureModuleSlotState(ti, mi)
  moduleOpen.value[ti] = { ...(moduleOpen.value[ti] ?? {}), [mi]: false }
}

function moveModuleActive(ti: number, mi: number, offset: number) {
  ensureModuleSlotState(ti, mi)
  const len = filteredModules(ti, mi).length
  if (!len) {
    moduleActive.value[ti][mi] = -1
    return
  }
  const current = Number(moduleActive.value[ti][mi] ?? -1)
  const next = current < 0 ? (offset > 0 ? 0 : len - 1) : current + offset
  moduleActive.value[ti][mi] = clampListIndex(next, len)
}

function selectActiveModule(ti: number, mi: number) {
  ensureModuleSlotState(ti, mi)
  const list = filteredModules(ti, mi)
  const idx = Number(moduleActive.value[ti][mi] ?? -1)
  if (idx >= 0 && idx < list.length) {
    selectModule(ti, mi, list[idx])
  }
}

function handleModuleKeydown(e: KeyboardEvent, ti: number, mi: number) {
  ensureModuleSlotState(ti, mi)
  const isOpen = !!moduleOpen.value[ti]?.[mi]
  if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault()
    openModuleDropdown(ti, mi)
    return
  }
  if (!isOpen) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveModuleActive(ti, mi, 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveModuleActive(ti, mi, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    selectActiveModule(ti, mi)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeModuleDropdown(ti, mi)
  }
}

function selectShip(ship: MiningShip) {
  selectedShipId.value = ship.id
  editId.value = null
  const salvage = isSalvageShip(ship)

  turrets.value = (ship.turrets ?? []).map((t) => {
    const laserRef = salvage ? null : t.defaultLaser
    const laser = laserRef
      ? (typeof laserRef === 'number'
          ? mining.loadout.lasers.find((l) => l.id === laserRef) ?? null
          : mining.loadout.lasers.find((l) => l.id === (laserRef as any)?.id) ?? null)
      : null
    const slots = salvage ? SALVAGE_SLOT_COUNT : Math.max(0, laser?.moduleSlots ?? 0)
    const defaults = salvage
      ? [
          ...(Array.isArray((t as any).defaultModules) ? (t as any).defaultModules : []),
          ...(Array.isArray((t as any).scraperModules) ? (t as any).scraperModules : []),
          ...(Array.isArray((t as any).defaultScraperModules) ? (t as any).defaultScraperModules : []),
          ...(Array.isArray((t as any).defaultComponents) ? (t as any).defaultComponents : []),
        ]
      : []
    const baseModules = salvage
      ? Array.from({ length: slots }, (_, idx) => resolveModuleRef(defaults[idx] ?? null, true))
      : Array.from({ length: slots }, () => null)
    return {
      portName: t.portName,
      label:    t.label ?? null,
      maxSize:  t.maxSize ?? null,
      minSize:  t.minSize ?? null,
      laser,
      modules:  baseModules,
      _modified: false,
      _saved:    false,
    }
  })
  syncDropdownArrays()
}

// ── Laser / module dropdowns ──────────────────────────────────────────────────

function filteredLasers(ti: number): MiningLaser[] {
  if (selectedShipIsSalvage.value) return []
  const turret = turrets.value[ti]
  const maxSize = turret?.maxSize
  const q = (laserQuery.value[ti] ?? '').toLowerCase().trim()
  return mining.loadout.lasers
    .filter((l) => {
      if (maxSize != null && Number(l.size) > Number(maxSize)) return false
      if (q && !(l.name + ' ' + (l.manufacturer ?? '')).toLowerCase().includes(q)) return false
      return true
    })
    .sort((a, b) => Number(b.size) - Number(a.size))
}

function filteredModules(ti: number, mi: number): MiningModule[] {
  const laser = turrets.value[ti]?.laser
  const laserSize = Number(laser?.size ?? 0)
  const q = (moduleSearch.value[ti]?.[mi] ?? '').toLowerCase().trim()
  const catalog = selectedShipIsSalvage.value
    ? mining.loadout.scraperModules
    : mining.loadout.modules
  return catalog.filter((m) => {
    const modSize = Number(m.size ?? 0)
    if (!selectedShipIsSalvage.value && laserSize > 0 && modSize > 0 && modSize > laserSize) return false
    if (q && !(m.name + ' ' + (m.manufacturer ?? '')).toLowerCase().includes(q)) return false
    return true
  })
}

function selectLaser(ti: number, laser: MiningLaser | null) {
  if (selectedShipIsSalvage.value) return
  // Prevent changing lasers if the selected ship locks laser editing
  if (selectedShip && selectedShip.value && (selectedShip.value as any).laserEditable === false) return
  const turret = turrets.value[ti]
  if (!turret) return
  turret.laser = laser ? { ...laser } : null
  turret._modified = true
  turret._saved = false
  const slots = Math.max(0, laser?.moduleSlots ?? 0)
  turret.modules = Array.from({ length: slots }, (_, i) => turret.modules[i] ?? null)
  laserQuery.value[ti] = laser?.name ?? ''
  laserOpen.value[ti] = false
  moduleQuery.value[ti] = turret.modules.map((m) => m?.name ?? '')
  moduleOpen.value[ti] = {}
}

function selectModule(ti: number, mi: number, mod: MiningModule | null) {
  const turret = turrets.value[ti]
  if (!turret) return
  turret.modules[mi] = mod ? { ...mod } : null
  turret._modified = true
  turret._saved = false
  if (!moduleQuery.value[ti]) moduleQuery.value[ti] = []
  moduleQuery.value[ti][mi] = mod?.name ?? ''
  if (!moduleSearch.value[ti]) moduleSearch.value[ti] = []
  moduleSearch.value[ti][mi] = ''
  moduleOpen.value[ti] = { ...(moduleOpen.value[ti] ?? {}), [mi]: false }
}

// ── Stat computation (Regolith model) ─────────────────────────────────────────

const STAT_DEFS = [
  { key: 'instability',         label: 'Instabilité',          alt: ['laserInstability'] },
  { key: 'resistance',          label: 'Résistance',           alt: ['resistanceModifier'] },
  { key: 'optimalChargeRate',   label: 'Taux charge opt.',     alt: ['optimalChargeWindowRateModifier'] },
  { key: 'optimalChargeWindow', label: 'Fenêtre de charge',    alt: ['optimalChargeWindowSizeModifier'] },
  { key: 'shatterDamage',       label: 'Dégâts shatter',       alt: ['shatterDamageModifier'] },
  { key: 'inertMaterials',      label: 'Matériaux inertes',    alt: ['filterModifier'] },
] as const

const INVERTED_KEYS = new Set(['instability', 'resistance', 'overchargeRate', 'inertMaterials'])

function normalizeDelta(v: any): number {
  if (v == null) return 0
  const n = Number(v)
  if (Number.isNaN(n)) return 0
  if (Math.abs(n) > 1.5) return n / 100
  if (n > 0.5 || n < -0.5) return n - 1
  return n
}

function getStatFactor(obj: any, key: string, altKeys: string[] = []): number {
  if (!obj) return 1
  let raw = obj[key]
  if (raw == null) for (const k of altKeys) { if (obj[k] != null) { raw = obj[k]; break } }
  if (raw == null) return 1
  return 1 + normalizeDelta(raw)
}

function getInertFactor(obj: any): number {
  if (!obj) return 1
  const direct = obj.inertMaterials ?? obj.inertMaterialsModifier
  if (direct != null) return 1 + normalizeDelta(direct)
  const filter = obj.filterModifier ?? obj.filterPercentage
  if (filter != null) return Math.max(0, 1 - Math.abs(normalizeDelta(filter)))
  return 1
}

function regolithModuleFactor(modules: (MiningModule | null)[], key: string, altKeys: string[] = []): number {
  return modules
    .filter(Boolean)
    .reduce((acc, m) => {
      const f = key === 'inertMaterials' ? getInertFactor(m) : getStatFactor(m, key, altKeys)
      return acc + (f - 1)
    }, 1)
}

function fmtPct(v: number | null): string {
  if (v == null || Number.isNaN(v)) return '—'
  const p = Math.round(v * 100)
  return p === 0 ? '0%' : (p > 0 ? '+' : '') + p + '%'
}

function modifierColorClass(key: string, final: number): string {
  if (Math.abs(final) < 0.001) return 'text-white/40'
  return INVERTED_KEYS.has(key)
    ? (final > 0 ? 'text-rose-300' : 'text-emerald-300')
    : (final > 0 ? 'text-emerald-300' : 'text-rose-300')
}

interface TurretStats {
  effectiveMin: number | null
  effectiveMax: number | null
  powerMod: number
  optimumRange: number | null
  maxRange: number | null
  rows: Array<{ key: string; label: string; delta: number; final: number }>
}

function computeTurretStats(turret: LoadoutBuilderTurret): TurretStats {
  const laser = turret.laser
  const mods  = turret.modules.filter(Boolean) as MiningModule[]
  if (!laser) return { effectiveMin: null, effectiveMax: null, powerMod: 1, optimumRange: null, maxRange: null, rows: [] }

  const powerMod = regolithModuleFactor(mods, 'powerMod', ['laserDamageMultiplier'])
  const baseMin  = laser.powerMin  != null ? Number(laser.powerMin)  : null
  const baseMax  = laser.powerMax  != null ? Number(laser.powerMax)  : null

  const rows = STAT_DEFS.map((def) => {
    const baseFactor    = def.key === 'inertMaterials' ? getInertFactor(laser) : getStatFactor(laser, def.key, [...def.alt])
    const modulesFactor = regolithModuleFactor(mods, def.key, [...def.alt])
    const finalFactor   = baseFactor * modulesFactor
    return { key: def.key, label: def.label, delta: modulesFactor - 1, final: finalFactor - 1 }
  }).filter((r) => Math.abs(r.final) > 0.001 || Math.abs(r.delta) > 0.001)

  return {
    effectiveMin: baseMin != null ? Math.round(baseMin * powerMod) : null,
    effectiveMax: baseMax != null ? Math.round(baseMax * powerMod) : null,
    powerMod,
    optimumRange: laser.fullDamageRange ?? laser.optimumRange ?? null,
    maxRange:     laser.zeroDamageRange ?? laser.maxRange ?? null,
    rows,
  }
}

const turretStats = computed<TurretStats[]>(() =>
  turrets.value.map((t) => computeTurretStats(t)),
)

const globalPower = computed(() => {
  const active = turretStats.value.filter((s) => s.effectiveMax != null)
  if (!active.length) return { min: null, max: null }
  return {
    min: active.reduce((a, s) => a + (s.effectiveMin ?? 0), 0),
    max: active.reduce((a, s) => a + (s.effectiveMax ?? 0), 0),
  }
})

const globalRange = computed(() => {
  const active = turretStats.value.filter((s) => s.optimumRange != null)
  if (!active.length) return { optimal: null, max: null }
  return {
    optimal: +(active.reduce((a, s) => a + (s.optimumRange ?? 0), 0) / active.length).toFixed(0),
    max:     +(active.reduce((a, s) => a + (s.maxRange ?? 0), 0)     / active.length).toFixed(0),
  }
})

const globalStats = computed(() => {
  const active = turretStats.value.filter((s) => s.effectiveMax != null)
  if (active.length < 2) return []
  return STAT_DEFS.map((def) => {
    const vals = active.map((s) => s.rows.find((r) => r.key === def.key)?.final ?? 0)
    const avg  = vals.reduce((a, v) => a + v, 0) / vals.length
    return { key: def.key, label: def.label, final: avg }
  }).filter((r) => Math.abs(r.final) > 0.005)
})

// ── Quick stats for saved/public cards ────────────────────────────────────────

interface LoadoutQuickStats {
  isSalvage?: boolean
  laserCount: number
  moduleCount?: number
  totalModuleSlots?: number
  filledModules?: number

  totalEffMinPwr?: number | null
  totalEffMaxPwr?: number | null

  optimalRange?: number | null
  zeroDamageRange?: number | null

  resistance?: number | null
  resistanceFmt?: string | null
  resistanceColor?: string

  instability?: number | null
  instabilityFmt?: string | null
  instabilityColor?: string

  optChgRate?: number | null
  optChgRateFmt?: string | null
  optChgRateColor?: string

  optChgWnd?: number | null
  optChgWndFmt?: string | null
  optChgWndColor?: string

  shatter?: number | null
  shatterFmt?: string | null
  shatterColor?: string

  filter?: number | null
  filterFmt?: string | null
  filterColor?: string

  overcharge?: number | null
  overchargeFmt?: string | null
  overchargeColor?: string

  turretBadges: Array<{ laser: string | null; modules: string[] }>

  equipmentPrice?: number | null
  equipmentPriceDisplay?: string | null
  shipPrice?: number | null
  shipPriceDisplay?: string | null
  totalPrice?: number | null
  totalPriceDisplay?: string | null
  priceMissingItems?: number | null
  hasPartialPricing?: boolean

  powerMod?: number
  powerModFmt?: string | null
  minPowerMod?: number

  // fallback short rows
  modRows?: Array<{ key: string; label: string; final: number }>

  salvageInstalledCount?: number
  salvageModuleCount?: number
  salvageTractorCount?: number
}

function computeLoadoutQuickStats(lo: MiningLoadout): LoadoutQuickStats {
  const salvage = isSalvageLoadout(lo)
  const laserSlots  = Array.isArray(lo.slots) ? lo.slots.filter((s) => s.slotType === 'laser').sort((a, b) => Number(a.slotIndex) - Number(b.slotIndex)) : []
  const moduleSlots = Array.isArray(lo.slots) ? lo.slots.filter((s) => s.slotType === 'module' || s.slotType === 'scraperModule') : []

  if (salvage) {
    const equippedModules = moduleSlots
      .map((ms) => ms.componentId ? resolveModuleRef({ id: ms.componentId }, true) : null)
      .filter((m): m is MiningModule => m !== null)

    const allItems = equippedModules as any[]
    const equipmentPrice = allItems.some((i) => i?.priceBuy != null)
      ? allItems.filter((i) => i?.priceBuy != null).reduce((a, i) => a + Number(i.priceBuy), 0)
      : null
    const equipmentPriceDisplay = equipmentPrice != null ? Math.round(equipmentPrice).toLocaleString('fr-FR') + ' aUEC' : null
    const priceMissingItems = allItems.length - allItems.filter((i) => i?.priceBuy != null).length

    const tractorCount = equippedModules.filter((m) => {
      const text = normalizeText([
        (m as any).name,
        (m as any).shortName,
        (m as any).type,
        (m as any).category,
        (m as any).kind,
        (m as any).role,
        (m as any).gameplay,
        (m as any).tags,
      ].join(' '))
      return text.includes('tractor')
    }).length

    return {
      isSalvage: true,
      laserCount: 0,
      moduleCount: equippedModules.length,
      totalModuleSlots: Math.max(SALVAGE_SLOT_COUNT, equippedModules.length),
      filledModules: equippedModules.length,
      turretBadges: [],
      equipmentPrice,
      equipmentPriceDisplay,
      totalPrice: equipmentPrice,
      totalPriceDisplay: equipmentPriceDisplay,
      priceMissingItems,
      hasPartialPricing: priceMissingItems > 0,
      powerMod: 1,
      powerModFmt: null,
      minPowerMod: 1,
      salvageInstalledCount: equippedModules.length,
      salvageTractorCount: tractorCount,
      salvageModuleCount: Math.max(0, equippedModules.length - tractorCount),
    }
  }

  const turretCalcs = laserSlots.map((ls) => {
    const laser = ls.laserId ? mining.loadout.lasers.find((l) => l.id === ls.laserId) ?? null : null
    const mods = moduleSlots
      .filter((ms) => Number(ms.laserSlotIndex ?? -1) === Number(ls.slotIndex ?? -999))
      .map((ms) => ms.componentId ? mining.loadout.modules.find((m) => m.id === ms.componentId) ?? null : null)
      .filter((m): m is MiningModule => m !== null)
    const fakeTurret = { portName: ls.portName ?? '', laser, modules: mods, _modified: false, _saved: false }
    return { stats: computeTurretStats(fakeTurret), laser, mods }
  }).filter((t) => t.laser !== null)

  const totalEffMinPwr = turretCalcs.length ? turretCalcs.reduce((a, t) => a + (t.stats.effectiveMin ?? 0), 0) : null
  const totalEffMaxPwr = turretCalcs.length ? turretCalcs.reduce((a, t) => a + (t.stats.effectiveMax ?? 0), 0) : null

  const optimalRange = turretCalcs.length && turretCalcs.some((t) => t.stats.optimumRange != null)
    ? turretCalcs.reduce((a, t) => a + (t.stats.optimumRange ?? 0), 0) / turretCalcs.length
    : null

  const zeroDamageRange = turretCalcs.length && turretCalcs.some((t) => t.stats.maxRange != null)
    ? turretCalcs.reduce((a, t) => a + (t.stats.maxRange ?? 0), 0) / turretCalcs.length
    : null

  const globalRow = (key: string) => {
    const rows = turretCalcs
      .map((t) => t.stats.rows.find((r) => r.key === key))
      .filter(Boolean) as Array<{ key: string; label: string; delta: number; final: number }>
    if (!rows.length) return null
    const finalFactor = rows.reduce((acc, r) => acc * (1 + (r.final ?? 0)), 1)
    return finalFactor - 1
  }

  const resistance = globalRow('resistance')
  const instability = globalRow('instability')
  const optChgRate = globalRow('optimalChargeRate')
  const optChgWnd = globalRow('optimalChargeWindow')
  const shatter = globalRow('shatterDamage')
  const inertMaterials = globalRow('inertMaterials')
  const overcharge = globalRow('overchargeRate')

  const turretBadges = turretCalcs.map((t) => ({
    laser: t.laser ? (t.laser.name || t.laser.shortName || '—') : null,
    modules: t.mods.map((m) => m.name || m.shortName || '—'),
  }))

  const allItems = [
    ...turretCalcs.map((t) => t.laser).filter(Boolean),
    ...turretCalcs.flatMap((t) => t.mods),
  ] as any[]

  const equipmentPrice = allItems.some((i) => i?.priceBuy != null)
    ? allItems.filter((i) => i?.priceBuy != null).reduce((a, i) => a + Number(i.priceBuy), 0)
    : null

  const equipmentPriceDisplay = equipmentPrice != null ? Math.round(equipmentPrice).toLocaleString('fr-FR') + ' aUEC' : null

  const priceMissingItems = allItems.length - allItems.filter((i) => i?.priceBuy != null).length

  const fmtPctLocal = (v: number | null) => {
    if (v == null || Number.isNaN(Number(v))) return null
    const pct = Math.round(Number(v) * 100)
    if (pct === 0) return '0%'
    return (pct > 0 ? '+' : '') + pct + '%'
  }

  const resistanceColor = modifierColorClass('resistance', (resistance ?? 0))
  const instabilityColor = modifierColorClass('instability', (instability ?? 0))
  const optChgRateColor = modifierColorClass('optimalChargeRate', (optChgRate ?? 0))
  const optChgWndColor = modifierColorClass('optimalChargeWindow', (optChgWnd ?? 0))
  const shatterColor = modifierColorClass('shatterDamage', (shatter ?? 0))
  const filterColor = modifierColorClass('inertMaterials', (inertMaterials ?? 0))
  const overchargeColor = modifierColorClass('overchargeRate', (overcharge ?? 0))

  // also provide a compact modRows fallback for other parts of UI
  const modRows = STAT_DEFS.map((def) => {
    const rows = turretCalcs.map((t) => t.stats.rows.find((r) => r.key === def.key)).filter((r): r is { key: string; label: string; delta: number; final: number } => r != null)
    if (!rows.length) return null
    const finalFactor = rows.reduce((acc, r) => acc * (1 + (r.final ?? 0)), 1)
    return { key: def.key, label: def.label, final: finalFactor - 1 }
  }).filter((r): r is { key: string; label: string; final: number } => r !== null && Math.abs(r.final) > 0.001)

  return {
    laserCount: turretCalcs.length,
    moduleCount: turretCalcs.reduce((acc, t) => acc + t.mods.length, 0),
    totalModuleSlots: turretCalcs.reduce((acc, t) => acc + (Number(t.laser?.moduleSlots) || 0), 0),
    filledModules: turretCalcs.reduce((acc, t) => acc + t.mods.length, 0),

    totalEffMinPwr,
    totalEffMaxPwr,

    optimalRange,
    zeroDamageRange,

    resistance,
    resistanceFmt: fmtPctLocal(resistance),
    resistanceColor,

    instability,
    instabilityFmt: fmtPctLocal(instability),
    instabilityColor,

    optChgRate,
    optChgRateFmt: fmtPctLocal(optChgRate),
    optChgRateColor,

    optChgWnd,
    optChgWndFmt: fmtPctLocal(optChgWnd),
    optChgWndColor,

    shatter,
    shatterFmt: fmtPctLocal(shatter),
    shatterColor,

    filter: inertMaterials,
    filterFmt: fmtPctLocal(inertMaterials),
    filterColor,

    overcharge,
    overchargeFmt: fmtPctLocal(overcharge),
    overchargeColor,

    turretBadges,

    equipmentPrice,
    equipmentPriceDisplay,
    totalPrice: equipmentPrice,
    totalPriceDisplay: equipmentPriceDisplay,
    priceMissingItems,
    hasPartialPricing: priceMissingItems > 0,

    powerMod: 1,
    powerModFmt: null,
    minPowerMod: 1,

    modRows,
  }
}

// ── Shopping list ─────────────────────────────────────────────────────────────

type ShoppingPriceOption = {
  terminalId: number
  terminalName: string
  priceBuy: number
}

type ShoppingLine = {
  key: string
  type: 'ship' | 'laser' | 'module'
  label: string
  size: number | null
  manufacturer: string | null
  quantity: number
  currency: string
  options: ShoppingPriceOption[]
  selectedTerminalId: number | null
  selectedTerminalName: string | null
  unitPrice: number | null
  totalPrice: number | null
}

const shoppingTerminals = ref<Record<string, number | null>>({})
const shoppingIncludeShip = ref(false)
const shoppingSortKey = ref<'type' | 'label' | 'quantity' | 'terminal' | 'unitPrice' | 'totalPrice'>('type')
const shoppingSortDir = ref<'asc' | 'desc'>('asc')

function shoppingSetSort(key: 'type' | 'label' | 'quantity' | 'terminal' | 'unitPrice' | 'totalPrice') {
  if (shoppingSortKey.value === key) {
    shoppingSortDir.value = shoppingSortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  shoppingSortKey.value = key
  shoppingSortDir.value = 'asc'
}

function shoppingSortIndicator(key: 'type' | 'label' | 'quantity' | 'terminal' | 'unitPrice' | 'totalPrice'): string {
  if (shoppingSortKey.value !== key) return ''
  return shoppingSortDir.value === 'asc' ? ' ▲' : ' ▼'
}

function shoppingPriceOptions(item: any): ShoppingPriceOption[] {
  const explicit = Array.isArray(item?.priceOptions)
    ? item.priceOptions
      .map((p: any) => ({
        terminalId: Number(p?.terminalId),
        terminalName: String(p?.terminalName ?? '').trim(),
        priceBuy: Number(p?.priceBuy),
      }))
      .filter((p: ShoppingPriceOption) => Number.isFinite(p.terminalId) && !!p.terminalName && Number.isFinite(p.priceBuy))
    : []

  if (explicit.length) return explicit

  const fallbackPrice = toNumberOrNull(item?.priceBuy)
  if (fallbackPrice == null) return []
  return [{ terminalId: 0, terminalName: 'Terminal non defini', priceBuy: fallbackPrice }]
}

function shoppingSetTerminal(lineKey: string, terminalId: string | number | null) {
  if (!lineKey) return
  const n = terminalId == null || terminalId === '' ? null : Number(terminalId)
  shoppingTerminals.value[lineKey] = Number.isFinite(n as number) ? (n as number) : null
}

function cheapestOption(options: ShoppingPriceOption[]): ShoppingPriceOption | null {
  if (!options.length) return null
  return options.reduce((best, cur) => {
    if (!best) return cur
    return cur.priceBuy < best.priceBuy ? cur : best
  }, null as ShoppingPriceOption | null)
}

const shoppingLines = computed(() => {
  const aggregate = new Map<string, {
    key: string
    type: 'ship' | 'laser' | 'module'
    label: string
    size: number | null
    manufacturer: string | null
    quantity: number
    currency: string
    source: any
  }>()

  for (const t of turrets.value) {
    if (t.laser) {
      const key = `laser:${t.laser.id}`
      const ex = aggregate.get(key)
      if (ex) ex.quantity++
      else aggregate.set(key, {
        key,
        type: 'laser',
        label: t.laser.name,
        size: t.laser.size,
        manufacturer: t.laser.manufacturer ?? null,
        quantity: 1,
        currency: String(t.laser.priceCurrency ?? 'AUEC').toUpperCase(),
        source: t.laser,
      })
    }

    for (const m of t.modules.filter(Boolean) as MiningModule[]) {
      const key = `module:${m.id}`
      const ex = aggregate.get(key)
      if (ex) ex.quantity++
      else aggregate.set(key, {
        key,
        type: 'module',
        label: m.name,
        size: m.size ?? null,
        manufacturer: m.manufacturer ?? null,
        quantity: 1,
        currency: String(m.priceCurrency ?? 'AUEC').toUpperCase(),
        source: m,
      })
    }
  }

  if (selectedShip.value) {
    const ship = selectedShip.value as any
    const key = `ship:${ship.id}`
    const shipSource = {
      ...ship,
      name: ship.nameFull ?? ship.name,
      priceBuy: ship.price ?? null,
      priceCurrency: ship.priceCurrency ?? 'AUEC',
      priceOptions: Array.isArray(ship.priceOptions) ? ship.priceOptions : [],
    }
    aggregate.set(key, {
      key,
      type: 'ship',
      label: shipSource.name,
      size: null,
      manufacturer: ship.companyName ?? ship.manufacturer ?? null,
      quantity: 1,
      currency: String(shipSource.priceCurrency ?? 'AUEC').toUpperCase(),
      source: shipSource,
    })
  }

  const lines: ShoppingLine[] = Array.from(aggregate.values()).map((entry) => {
    const options = shoppingPriceOptions(entry.source)
    const preferred = shoppingTerminals.value[entry.key]
    const selected = options.find((o) => Number(o.terminalId) === Number(preferred)) ?? options[0] ?? null

    return {
      key: entry.key,
      type: entry.type,
      label: entry.label,
      size: entry.size,
      manufacturer: entry.manufacturer,
      quantity: entry.quantity,
      currency: entry.currency,
      options,
      selectedTerminalId: selected?.terminalId ?? null,
      selectedTerminalName: selected?.terminalName ?? null,
      unitPrice: selected?.priceBuy ?? null,
      totalPrice: selected?.priceBuy != null ? selected.priceBuy * entry.quantity : null,
    }
  })

  const typeOrder: Record<string, number> = { ship: 0, laser: 1, module: 2 }
  const sortDir = shoppingSortDir.value === 'desc' ? -1 : 1

  const compare = (va: unknown, vb: unknown) => {
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'number' || typeof vb === 'number') return Number(va) - Number(vb)
    return String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' })
  }

  return lines.sort((a, b) => {
    const av = (() => {
      if (shoppingSortKey.value === 'type') return typeOrder[a.type] ?? 99
      if (shoppingSortKey.value === 'label') return a.label
      if (shoppingSortKey.value === 'quantity') return Number(a.quantity || 0)
      if (shoppingSortKey.value === 'terminal') return a.selectedTerminalName || ''
      if (shoppingSortKey.value === 'unitPrice') return a.unitPrice != null ? Number(a.unitPrice) : Number.MAX_SAFE_INTEGER
      if (shoppingSortKey.value === 'totalPrice') return a.totalPrice != null ? Number(a.totalPrice) : Number.MAX_SAFE_INTEGER
      return a.label
    })()

    const bv = (() => {
      if (shoppingSortKey.value === 'type') return typeOrder[b.type] ?? 99
      if (shoppingSortKey.value === 'label') return b.label
      if (shoppingSortKey.value === 'quantity') return Number(b.quantity || 0)
      if (shoppingSortKey.value === 'terminal') return b.selectedTerminalName || ''
      if (shoppingSortKey.value === 'unitPrice') return b.unitPrice != null ? Number(b.unitPrice) : Number.MAX_SAFE_INTEGER
      if (shoppingSortKey.value === 'totalPrice') return b.totalPrice != null ? Number(b.totalPrice) : Number.MAX_SAFE_INTEGER
      return b.label
    })()

    const primary = compare(av, bv)
    if (primary !== 0) return primary * sortDir

    const t = compare(typeOrder[a.type] ?? 99, typeOrder[b.type] ?? 99)
    if (t !== 0) return t
    return compare(a.label, b.label)
  })
})

const shoppingVisibleLines = computed(() =>
  shoppingLines.value.filter((line) => shoppingIncludeShip.value || line.type !== 'ship'),
)

const shoppingSelectedTerminalCount = computed(() => {
  const ids = new Set<number>()
  for (const line of shoppingVisibleLines.value) {
    const tid = line.selectedTerminalId
    if (tid != null && tid > 0) ids.add(tid)
  }
  return ids.size
})

const shoppingSummary = computed(() => {
  const totals = new Map<string, number>()
  for (const line of shoppingVisibleLines.value) {
    if (line.totalPrice == null) continue
    const c = String(line.currency || 'AUEC').toUpperCase()
    totals.set(c, (totals.get(c) ?? 0) + Number(line.totalPrice))
  }
  return Array.from(totals.entries())
    .map(([currency, total]) => ({
      currency,
      display: `${Math.round(total).toLocaleString('fr-FR')} ${currency}`,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency, 'fr'))
})

function shoppingOptimizeTerminals() {
  const lines = shoppingVisibleLines.value
  if (!lines.length) return

  const byCurrency = new Map<string, ShoppingLine[]>()
  for (const line of lines) {
    const currency = String(line.currency || 'AUEC').toUpperCase()
    if (!byCurrency.has(currency)) byCurrency.set(currency, [])
    byCurrency.get(currency)?.push(line)
  }

  const assignments: Record<string, number | null> = { ...shoppingTerminals.value }

  for (const groupLines of byCurrency.values()) {
    const candidatesByLine: Record<string, ShoppingPriceOption[]> = {}
    const uncovered = new Set<string>()

    for (const line of groupLines) {
      const opts = line.options.filter((o) => Number(o.terminalId) > 0 && Number(o.priceBuy) > 0)
      candidatesByLine[line.key] = opts
      if (opts.length) uncovered.add(line.key)
    }

    const chosenTerminals = new Set<number>()

    while (uncovered.size > 0) {
      const terminalIds = new Set<number>()
      for (const key of uncovered) {
        for (const opt of candidatesByLine[key] ?? []) {
          terminalIds.add(Number(opt.terminalId))
        }
      }

      let bestTerminal: number | null = null
      let bestCoverage = -1
      let bestCost = Number.MAX_SAFE_INTEGER

      for (const tid of terminalIds) {
        let coverage = 0
        let cost = 0
        for (const key of uncovered) {
          const match = (candidatesByLine[key] ?? []).find((o) => Number(o.terminalId) === Number(tid))
          if (!match) continue
          coverage += 1
          cost += Number(match.priceBuy || 0)
        }

        if (coverage <= 0) continue
        const betterCoverage = coverage > bestCoverage
        const sameCoverageBetterCost = coverage === bestCoverage && cost < bestCost
        if (betterCoverage || sameCoverageBetterCost) {
          bestTerminal = tid
          bestCoverage = coverage
          bestCost = cost
        }
      }

      if (bestTerminal == null) break
      chosenTerminals.add(bestTerminal)

      for (const key of Array.from(uncovered)) {
        const hasBest = (candidatesByLine[key] ?? []).some((o) => Number(o.terminalId) === Number(bestTerminal))
        if (hasBest) uncovered.delete(key)
      }
    }

    for (const line of groupLines) {
      if (!line.options.length) continue
      const grouped = line.options.filter((o) => chosenTerminals.has(Number(o.terminalId)))
      const selected = cheapestOption(grouped.length ? grouped : line.options)
      assignments[line.key] = selected?.terminalId ?? null
    }
  }

  shoppingTerminals.value = assignments
}

// ── Save / load / delete ──────────────────────────────────────────────────────

async function saveLoadout() {
  if (!loadoutName.value.trim() || !selectedShipId.value) return
  saveError.value = null
  const slots: MiningLoadout['slots'] = []
  const salvage = selectedShipIsSalvage.value
  turrets.value.forEach((t, ti) => {
    if (!salvage) {
      slots.push({ slotType: 'laser', slotIndex: ti, portName: t.portName, laserId: t.laser?.id ?? null })
    }
    t.modules.forEach((m, mi) => {
      if (m) slots.push({ slotType: salvage ? 'scraperModule' : 'module', slotIndex: mi, laserSlotIndex: ti, componentId: m.id })
    })
  })
  try {
    const saved = await mining.saveLoadout({
      id:       editId.value ?? undefined as any,
      name:     loadoutName.value.trim(),
      shipId:   selectedShipId.value,
      isPublic: loadoutIsPublic.value,
      isSalvage: salvage,
      slots,
    })
    if (saved?.id) editId.value = saved.id
  } catch (e: any) {
    saveError.value = e.message
  }
}

function hydrateFromLoadout(lo: MiningLoadout) {
  const ship = mining.loadout.ships.find((s) => s.id === lo.shipId)
  if (!ship) return
  selectShip(ship)
  const salvage = isSalvageLoadout(lo)
  editId.value          = lo.id
  loadoutName.value     = lo.name
  loadoutIsPublic.value = lo.isPublic ?? false

  const laserSlots  = lo.slots.filter((s) => s.slotType === 'laser')
  const moduleSlots = lo.slots.filter((s) => s.slotType === 'module' || s.slotType === 'scraperModule')

  if (!salvage) {
    for (const ls of laserSlots) {
      const ti = ls.slotIndex
      if (!turrets.value[ti]) continue
      const laser = ls.laserId ? mining.loadout.lasers.find((l) => l.id === ls.laserId) ?? null : null
      turrets.value[ti].laser = laser
      const slots = Math.max(0, laser?.moduleSlots ?? 0)
      turrets.value[ti].modules = Array.from({ length: slots }, () => null)
      turrets.value[ti]._modified = true
      turrets.value[ti]._saved    = true
    }
  } else {
    for (let ti = 0; ti < turrets.value.length; ti++) {
      turrets.value[ti].laser = null
      turrets.value[ti].modules = Array.from({ length: SALVAGE_SLOT_COUNT }, () => null)
      turrets.value[ti]._modified = true
      turrets.value[ti]._saved = true
    }
  }

  for (const ms of moduleSlots) {
    const ti = ms.laserSlotIndex ?? -1
    if (ti < 0 || !turrets.value[ti]) continue
    const mod = ms.componentId ? resolveModuleRef({ id: ms.componentId }, salvage) : null
    if (!mod) continue
    const slotIndex = Number(ms.slotIndex)
    if (salvage && Number.isFinite(slotIndex) && slotIndex >= 0 && slotIndex < turrets.value[ti].modules.length) {
      turrets.value[ti].modules[slotIndex] = mod
    } else {
      const emptySlot = turrets.value[ti].modules.findIndex((m) => !m)
      if (emptySlot >= 0) turrets.value[ti].modules[emptySlot] = mod
    }
  }

  if (salvage) {
    // Compat loadouts legacy: modules salvage parfois sauvegardés en slotType laser.
    for (const ls of laserSlots) {
      const ti = ls.slotIndex
      if (ti < 0 || !turrets.value[ti]) continue
      if (!ls.laserId) continue
      const mod = resolveModuleRef({ id: ls.laserId }, true)
      if (!mod) continue
      const emptySlot = turrets.value[ti].modules.findIndex((m) => !m)
      if (emptySlot >= 0) turrets.value[ti].modules[emptySlot] = mod
    }
  }
  syncDropdownArrays()
  activeSubTab.value = 'builder'
}

function resetBuilder() {
  editId.value          = null
  loadoutName.value     = ''
  loadoutIsPublic.value = false
  selectedShipId.value  = null
  turrets.value         = []
  saveError.value       = null
  syncDropdownArrays()
}

function shipNameFor(lo: MiningLoadout): string {
  const s = mining.loadout.ships.find((s) => s.id === lo.shipId)
  return s?.nameFull ?? s?.name ?? `Vaisseau #${lo.shipId}`
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  shoppingIncludeShip.value = localStorage.getItem('ml_includeShipPrice') === '1'
  await mining.loadLoadoutCatalog()
  await Promise.all([mining.loadUserLoadouts(), mining.loadPublicLoadouts()])
})
</script>

<template>
  <div class="space-y-3" :style="loadoutStyle">

    <!-- Sub-tab bar -->
    <div class="flex gap-1 p-0.5 rounded-xl bg-black/20 border border-white/[0.05]">
      <button
        v-for="sub in [
          { id: 'builder', label: '🔧 Configurateur' },
          { id: 'saved',   label: '📋 Mes Loadouts' },
          { id: 'public',  label: '🌐 Publics' },
        ]"
        :key="sub.id"
        class="flex-1 py-2 text-sm font-medium rounded-lg transition-all"
        :class="activeSubTab === sub.id
          ? 'bg-[#0d1f35] border border-accent/30 text-accent'
          : 'border border-transparent text-th-muted hover:text-th-primary hover:bg-white/[0.04]'"
        @click="activeSubTab = sub.id as LoadoutTab"
      >
        {{ sub.label }}
      </button>
    </div>

    <!-- ══ BUILDER ══════════════════════════════════════════════════════════════ -->
    <template v-if="activeSubTab === 'builder'">

      <div v-if="mining.loadout.loadingCatalog" class="text-center text-th-muted py-8 text-sm">
        Chargement du catalogue…
      </div>

      <div v-else-if="mining.loadout.error" class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
        {{ mining.loadout.error }}
      </div>

      <template v-else>

        <!-- Ship selector -->
        <div class="rounded-xl border border-white/[0.07] bg-black/20 p-4 space-y-3">
          <p class="text-xs font-semibold text-th-muted uppercase tracking-wider">Vaisseau</p>

          <div class="flex flex-wrap gap-2 items-center">
            <span class="text-xs text-th-muted">Air :</span>
            <button
              v-for="s in airShips" :key="s.id"
              class="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
              :class="selectedShipId === s.id
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-white/10 text-th-muted hover:border-accent/30 hover:text-th-primary'"
              @click="selectShip(s)"
            >{{ s.name }}</button>
            <span class="text-white/20">|</span>
            <span class="text-xs text-th-muted">Sol :</span>
            <button
              v-for="s in groundShips" :key="s.id"
              class="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
              :class="selectedShipId === s.id
                ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
                : 'border-white/10 text-th-muted hover:border-amber-400/30 hover:text-th-primary'"
              @click="selectShip(s)"
            >{{ s.name }}</button>
            <span class="text-white/20">|</span>
            <span class="text-xs text-th-muted">Salvage :</span>
            <button
              v-for="s in salvageShips" :key="s.id"
              class="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
              :class="selectedShipId === s.id
                ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                : 'border-white/10 text-th-muted hover:border-emerald-400/30 hover:text-th-primary'"
              @click="selectShip(s)"
            >{{ s.name }}</button>
          </div>

          <!-- search input removed per request -->

          <div v-if="selectedShip" class="text-sm text-th-muted">
            {{ selectedShip.nameFull ?? selectedShip.name }}
            <span class="text-th-primary font-medium">— {{ turrets.length }} tourelle(s)</span>
            <span
              class="ml-2 text-xs font-semibold uppercase tracking-wider"
              :class="selectedShipIsSalvage ? 'text-amber-300/80' : 'text-cyan-300/80'"
            >{{ selectedShipIsSalvage ? 'Salvage' : 'Minage' }}</span>
          </div>
        </div>

        <!-- Turret list -->
        <div v-if="turrets.length" class="space-y-3">
          <div
            v-for="(turret, ti) in turrets" :key="ti"
            class="rounded-xl border border-white/[0.07] bg-black/20 p-4 space-y-3"
          >
            <!-- Turret header -->
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold text-th-primary">
                {{ turret.label ?? turret.portName ?? `Tourelle ${ti + 1}` }}
              </span>
              <span v-if="turret.maxSize" class="text-xs text-th-muted border border-white/10 rounded px-1.5 py-0.5">
                S{{ turret.maxSize }} max
              </span>
            </div>

            <!-- Laser dropdown -->
            <div v-if="!selectedShipIsSalvage" class="relative">
              <label class="text-xs text-th-muted mb-1.5 block font-medium">Laser</label>
              <div class="relative">
                <input
                  v-model="laserQuery[ti]"
                  :readonly="selectedShip?.laserEditable === false"
                  :class="selectedShip?.laserEditable === false ? 'opacity-60 cursor-not-allowed' : ''"
                  type="text"
                  placeholder="Choisir un laser…"
                  class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-8 text-sm text-th-primary placeholder:text-th-muted outline-none"
                  @focus="(selectedShip?.laserEditable !== false) && (laserOpen[ti] = true)"
                  @blur="setTimeout(() => { laserOpen[ti] = false }, 150)"
                />
                <button
                  v-if="turret.laser && (selectedShip?.laserEditable ?? true)"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-th-muted hover:text-th-primary text-xs"
                  @mousedown.prevent="selectLaser(ti, null)"
                >✕</button>
                <div v-if="laserOpen[ti] && filteredLasers(ti).length && (selectedShip?.laserEditable ?? true)"
                     class="absolute z-20 top-full mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg overflow-y-auto max-h-52 shadow-xl">
                  <button
                    v-for="l in filteredLasers(ti)" :key="l.id"
                    class="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center justify-between"
                    @mousedown.prevent="selectLaser(ti, l)"
                  >
                    <span class="text-sm text-th-primary">{{ l.name }}</span>
                    <span class="text-xs text-th-muted">S{{ l.size }}</span>
                  </button>
                </div>
                <div v-if="selectedShip?.laserEditable === false && !turret.laser" class="text-sm text-white/60 mt-2">Laser verrouillé</div>
              </div>
            </div>

            <div v-else class="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
              Hardpoint salvage: modules scraper uniquement.
            </div>

            <!-- Module dropdowns -->
            <div v-if="(selectedShipIsSalvage || turret.laser) && turret.modules.length" class="space-y-3">
              <label class="text-xs text-th-muted font-medium">
                {{ selectedShipIsSalvage ? 'Modules salvage' : 'Modules' }}
                <span class="text-th-primary">{{ turret.modules.filter(Boolean).length }}/{{ turret.modules.length }}</span>
              </label>
              <div v-for="(mod, mi) in turret.modules" :key="mi" class="relative pb-2 last:pb-0">
                <div class="relative">
                  <input
                    v-model="moduleQuery[ti][mi]"
                    readonly
                    type="text"
                    :placeholder="`Module ${mi + 1}`"
                    class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-8 text-sm text-th-primary placeholder:text-th-muted outline-none focus:border-accent/40"
                    @focus="openModuleDropdown(ti, mi)"
                    @click="openModuleDropdown(ti, mi)"
                    @keydown="handleModuleKeydown($event, ti, mi)"
                    @blur="setTimeout(() => { closeModuleDropdown(ti, mi) }, 150)"
                  />
                  <button
                    v-if="mod"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-th-muted hover:text-th-primary text-xs"
                    @mousedown.prevent="selectModule(ti, mi, null)"
                  >✕</button>
                  <div v-if="moduleOpen[ti]?.[mi]"
                       class="absolute z-20 top-full mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg overflow-y-auto max-h-44 shadow-xl">
                    <div class="sticky top-0 z-10 bg-[#0d1117] border-b border-white/10 p-2">
                      <input
                        v-model="moduleSearch[ti][mi]"
                        ref="moduleSearchInput"
                        type="text"
                        placeholder="Rechercher un module…"
                        class="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-th-primary placeholder:text-th-muted outline-none focus:border-accent/40"
                        @keydown="handleModuleKeydown($event, ti, mi)"
                      />
                    </div>
                    <template v-if="filteredModules(ti, mi).length">
                    <button
                      v-for="(m, idx) in filteredModules(ti, mi)" :key="m.id"
                      class="w-full px-3 py-2 text-left flex items-center justify-between"
                      :class="(moduleActive[ti]?.[mi] ?? -1) === idx ? 'bg-white/10' : 'hover:bg-white/5'"
                      @mouseenter="moduleActive[ti] = { ...(moduleActive[ti] ?? {}), [mi]: idx }"
                      @mousedown.prevent="selectModule(ti, mi, m)"
                    >
                      <span class="text-sm text-th-primary">{{ m.name }}</span>
                      <span class="text-xs" :class="m.isActive ? 'text-accent' : 'text-th-muted'">
                        {{ m.isActive ? 'Actif' : (selectedShipIsSalvage ? 'Salvage' : 'Passif') }}
                      </span>
                    </button>
                    </template>
                    <div v-else class="px-3 py-2.5 text-xs text-th-muted">
                      Aucun module trouvé.
                    </div>
                  </div>
                </div>

                <div v-if="selectedShipIsSalvage && mod" class="mt-1 grid grid-cols-3 gap-2">
                  <div class="rounded-md border border-white/10 bg-black/20 px-2.5 py-2">
                    <div class="text-[10px] uppercase tracking-wider text-th-muted">Radius</div>
                    <div class="text-xs font-semibold text-th-primary">{{ salvageModuleFinalStats(mod).radiusDisplay }}</div>
                  </div>
                  <div class="rounded-md border border-white/10 bg-black/20 px-2.5 py-2">
                    <div class="text-[10px] uppercase tracking-wider text-th-muted">Extraction Speed</div>
                    <div class="text-xs font-semibold text-th-primary">{{ salvageModuleFinalStats(mod).speedDisplay }}</div>
                  </div>
                  <div class="rounded-md border border-white/10 bg-black/20 px-2.5 py-2">
                    <div class="text-[10px] uppercase tracking-wider text-th-muted">Efficiency</div>
                    <div class="text-xs font-semibold text-th-primary">{{ salvageModuleFinalStats(mod).efficiencyDisplay }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Per-turret stats -->
            <div v-if="!selectedShipIsSalvage && turret.laser" class="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3 border-t border-white/[0.05]">
              <div class="text-xs">
                <span class="text-th-muted">Puissance : </span>
                <span class="text-th-primary font-semibold">
                  {{ turretStats[ti].effectiveMin ?? '—' }} – {{ turretStats[ti].effectiveMax ?? '—' }} MW
                </span>
              </div>
              <div class="text-xs">
                <span class="text-th-muted">Portée opt. : </span>
                <span class="text-th-primary">{{ turretStats[ti].optimumRange != null ? turretStats[ti].optimumRange + ' m' : '—' }}</span>
              </div>
              <template v-for="row in turretStats[ti].rows" :key="row.key">
                <div class="text-xs">
                  <span class="text-th-muted">{{ row.label }} : </span>
                  <span :class="modifierColorClass(row.key, row.final)">{{ fmtPct(row.final) }}</span>
                </div>
              </template>
            </div>

            <div v-else-if="selectedShipIsSalvage" class="pt-3 border-t border-white/[0.05] text-xs text-th-muted">
              Modules équipés: <span class="text-th-primary font-semibold">{{ turret.modules.filter(Boolean).length }}/{{ turret.modules.length }}</span>
            </div>
          </div>
        </div>

        <!-- Global stats (multi-turret) -->
        <div v-if="!selectedShipIsSalvage && globalPower.max != null"
             class="rounded-xl border border-accent/20 bg-accent/[0.04] p-4 space-y-3">
          <p class="text-xs font-semibold text-accent/70 uppercase tracking-wider">Statistiques globales</p>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div class="text-sm">
              <span class="text-th-muted text-xs">Puissance totale : </span>
              <span class="text-accent font-semibold">{{ globalPower.min }} – {{ globalPower.max }} MW</span>
            </div>
            <div class="text-sm">
              <span class="text-th-muted text-xs">Portée opt. moy. : </span>
              <span class="text-th-primary">{{ globalRange.optimal != null ? globalRange.optimal + ' m' : '—' }}</span>
            </div>
            <template v-for="row in globalStats" :key="row.key">
              <div class="text-sm">
                <span class="text-th-muted text-xs">{{ row.label }} moy. : </span>
                <span :class="modifierColorClass(row.key, row.final)">{{ fmtPct(row.final) }}</span>
              </div>
            </template>
          </div>
        </div>

        <!-- Shopping list -->
        <div v-if="shoppingLines.length">
          <button
            class="text-sm text-accent hover:text-accent/80 flex items-center gap-1.5 transition"
            @click="showShopping = !showShopping"
          >
            <span>{{ showShopping ? '▼' : '▶' }}</span>
            Liste de course ({{ shoppingVisibleLines.length }} article(s))
          </button>
          <div v-if="showShopping" class="mt-2 rounded-xl border border-white/[0.07] bg-black/20 p-3 space-y-2">
            <div class="flex items-center justify-between gap-2 text-xs text-th-muted">
              <span>{{ shoppingSelectedTerminalCount }} terminal(s) utilisé(s)</span>
              <button
                type="button"
                class="px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 text-emerald-200 text-xs font-mono hover:bg-emerald-500/25 transition"
                @click="shoppingOptimizeTerminals"
                v-if="shoppingVisibleLines.length > 1"
              >
                Regrouper au max
              </button>
            </div>

            <label class="flex items-center gap-2 text-xs text-th-muted">
              <input
                type="checkbox"
                class="form-checkbox rounded"
                v-model="shoppingIncludeShip"
                @change="localStorage.setItem('ml_includeShipPrice', shoppingIncludeShip ? '1' : '0')"
              />
              Inclure vaisseau
            </label>

            <div class="flex flex-wrap gap-1.5 text-[11px]">
              <button type="button" class="px-2 py-1 rounded border border-white/10 text-th-muted hover:text-th-primary hover:border-white/20"
                @click="shoppingSetSort('type')">Type{{ shoppingSortIndicator('type') }}</button>
              <button type="button" class="px-2 py-1 rounded border border-white/10 text-th-muted hover:text-th-primary hover:border-white/20"
                @click="shoppingSetSort('label')">Composant{{ shoppingSortIndicator('label') }}</button>
              <button type="button" class="px-2 py-1 rounded border border-white/10 text-th-muted hover:text-th-primary hover:border-white/20"
                @click="shoppingSetSort('quantity')">Qté{{ shoppingSortIndicator('quantity') }}</button>
              <button type="button" class="px-2 py-1 rounded border border-white/10 text-th-muted hover:text-th-primary hover:border-white/20"
                @click="shoppingSetSort('terminal')">Terminal{{ shoppingSortIndicator('terminal') }}</button>
              <button type="button" class="px-2 py-1 rounded border border-white/10 text-th-muted hover:text-th-primary hover:border-white/20"
                @click="shoppingSetSort('unitPrice')">Prix unit.{{ shoppingSortIndicator('unitPrice') }}</button>
              <button type="button" class="px-2 py-1 rounded border border-white/10 text-th-muted hover:text-th-primary hover:border-white/20"
                @click="shoppingSetSort('totalPrice')">Total{{ shoppingSortIndicator('totalPrice') }}</button>
            </div>

            <div v-for="line in shoppingVisibleLines" :key="line.key" class="rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-2">
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="shrink-0 text-xs uppercase tracking-wider font-bold"
                    :class="line.type === 'ship' ? 'text-emerald-300' : (line.type === 'laser' ? 'text-accent' : 'text-violet-400')">
                    {{ line.type === 'ship' ? 'Ship' : (line.type === 'laser' ? 'Laser' : 'Mod.') }}
                  </span>
                  <span class="text-th-primary truncate">{{ line.label }}</span>
                  <span v-if="line.size" class="text-th-muted shrink-0">S{{ line.size }}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0 text-th-muted ml-2">
                  <span v-if="line.quantity > 1" class="font-medium">×{{ line.quantity }}</span>
                  <span v-if="line.totalPrice != null" class="text-th-primary font-medium">
                    {{ Math.round(line.totalPrice).toLocaleString('fr-FR') }} {{ line.currency }}
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center text-xs">
                <select
                  class="w-full rounded-lg bg-[#070c14]/70 border border-white/10 px-2 py-1 text-th-primary"
                  :value="line.selectedTerminalId ?? ''"
                  @change="shoppingSetTerminal(line.key, ($event.target as HTMLSelectElement).value)"
                  :disabled="!line.options.length"
                >
                  <option v-if="!line.options.length" value="">Aucun terminal</option>
                  <option v-for="opt in line.options" :key="`${line.key}-${opt.terminalId}`" :value="opt.terminalId">
                    {{ opt.terminalName }}
                  </option>
                </select>
                <span class="text-th-muted">Unit:</span>
                <span class="text-th-primary font-medium text-right min-w-[80px]">
                  {{ line.unitPrice != null ? `${Math.round(line.unitPrice).toLocaleString('fr-FR')} ${line.currency}` : '—' }}
                </span>
              </div>
            </div>

            <div class="pt-1 flex flex-wrap gap-2">
              <span
                v-for="sum in shoppingSummary"
                :key="sum.currency"
                class="px-2.5 py-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 text-xs font-mono"
              >
                <span class="opacity-70">{{ sum.currency }}</span>
                <span class="ml-2 font-semibold">{{ sum.display }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Save form -->
        <div v-if="selectedShipId" class="rounded-xl border border-white/[0.07] bg-black/20 p-4 space-y-3">
          <p class="text-xs font-semibold text-th-muted uppercase tracking-wider">
            {{ editId ? 'Mettre à jour le loadout' : 'Sauvegarder ce loadout' }}
          </p>
          <input
            v-model="loadoutName"
            type="text"
            placeholder="Nom du loadout…"
            class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-th-primary placeholder:text-th-muted outline-none focus:border-accent/40"
          />
          <label
            class="flex items-center gap-3 cursor-pointer rounded-lg border px-3 py-2.5 select-none transition"
            :class="loadoutIsPublic ? 'border-accent/30 bg-accent/[0.04]' : 'border-white/10 hover:border-white/20'"
          >
            <input v-model="loadoutIsPublic" type="checkbox" class="sr-only" />
            <div
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition"
              :class="loadoutIsPublic ? 'border-accent/60 bg-accent/25' : 'border-white/20 bg-white/5'"
            >
              <svg v-if="loadoutIsPublic" class="h-3 w-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div>
              <span class="text-sm text-th-primary">Rendre public</span>
              <span class="block text-xs text-th-muted">Visible par tous les membres</span>
            </div>
          </label>
          <p v-if="saveError" class="text-rose-400 text-xs">{{ saveError }}</p>
          <div class="flex gap-2">
            <button
              class="flex-1 py-2 rounded-lg text-sm font-semibold border transition-all disabled:opacity-40"
              :class="!loadoutName.trim() || mining.loadout.savingLoadout
                ? 'bg-accent/10 border-accent/20 text-accent/50'
                : 'bg-accent/20 border-accent/30 text-accent hover:bg-accent/30'"
              :disabled="!loadoutName.trim() || mining.loadout.savingLoadout"
              @click="saveLoadout()"
            >
              {{ mining.loadout.savingLoadout ? 'Sauvegarde…' : editId ? 'Mettre à jour' : 'Sauvegarder' }}
            </button>
            <button
              class="px-4 py-2 rounded-lg text-sm text-th-muted hover:text-th-primary border border-white/10 hover:border-white/20 transition-all"
              @click="resetBuilder()"
            >
              Réinitialiser
            </button>
          </div>
        </div>

      </template>
    </template>

    <!-- ══ SAVED LOADOUTS ═══════════════════════════════════════════════════════ -->
    <template v-else-if="activeSubTab === 'saved'">

      <div v-if="mining.loadout.loadingSaved" class="text-center text-th-muted py-8 text-sm">
        Chargement…
      </div>

      <div v-else-if="!mining.loadout.savedList.length" class="text-center text-th-muted py-8 text-sm italic">
        Aucun loadout sauvegardé.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="lo in mining.loadout.savedList" :key="lo.id"
          class="rounded-xl border border-white/[0.07] bg-black/20 overflow-hidden"
        >
          <!-- Header -->
          <div class="px-4 py-3 flex items-start justify-between gap-3 border-b border-white/[0.05]">
              <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="text-lg font-semibold text-th-primary truncate">{{ lo.name }}</p>
                <span v-if="lo.isPublic" class="shrink-0 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs text-accent font-medium uppercase tracking-wider">
                  Public
                </span>
              </div>
              <p class="text-sm text-th-muted mt-0.5">{{ shipNameFor(lo) }}</p>
              <div v-if="getLoadoutDates(lo).length" class="mt-1 flex flex-wrap gap-2">
                <span
                  v-for="d in getLoadoutDates(lo)" :key="'date-' + lo.id + '-' + d.key"
                  class="text-[10px] text-th-muted bg-white/[0.02] border border-white/[0.03] px-2 py-0.5 rounded"
                >
                  <strong class="opacity-70 mr-1">{{ d.label }}:</strong>
                  <span class="font-medium text-th-primary">{{ d.text }}</span>
                </span>
              </div>
            </div>
            <div class="flex gap-1.5 shrink-0">
              <button
                class="px-3 py-1.5 text-xs font-medium rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-all"
                @click="hydrateFromLoadout(lo)"
              >
                Charger
              </button>
              <button
                v-if="confirmDeleteId !== lo.id"
                class="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-th-muted hover:border-rose-400/30 hover:text-rose-400 transition-all"
                @click="confirmDeleteId = lo.id"
              >✕</button>
              <button
                v-else
                class="px-3 py-1.5 text-xs rounded-lg border border-rose-400/30 text-rose-400 hover:bg-rose-400/10 transition-all disabled:opacity-50"
                :disabled="mining.loadout.deletingId === lo.id"
                @click="mining.deleteLoadout(lo.id).then(() => { confirmDeleteId = null })"
              >
                {{ mining.loadout.deletingId === lo.id ? '…' : 'Confirmer' }}
              </button>
            </div>
          </div>

          <template v-if="mining.loadout.catalogLoaded">

            <!-- Stats (site-like 6-col grid) -->
            <div class="px-4 py-3 border-t border-white/[0.02]">
              <template v-for="qs in [computeLoadoutQuickStats(lo)]" :key="`qs-` + lo.id">
                <div v-if="qs.isSalvage" class="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div class="text-sm font-semibold text-th-primary">{{ qs.salvageInstalledCount ?? 0 }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">INSTALLÉS</div>
                  </div>
                  <div>
                    <div class="text-sm text-th-primary">{{ qs.salvageModuleCount ?? 0 }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">SALVAGE</div>
                  </div>
                  <div>
                    <div class="text-sm text-th-primary">{{ qs.salvageTractorCount ?? 0 }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">TRACTOR</div>
                  </div>
                  <div>
                    <div class="text-sm font-medium text-th-primary">{{ qs.equipmentPriceDisplay ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">PRIX ÉQUIP.</div>
                  </div>
                </div>

                <template v-else>
                <div class="grid grid-cols-6 gap-2 text-center">
                  <div>
                    <div class="text-sm font-semibold text-th-primary">{{ qs.totalEffMinPwr != null ? Math.round(qs.totalEffMinPwr).toLocaleString('fr-FR') : '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">MIN PWR</div>
                  </div>
                  <div>
                    <div class="text-sm text-th-primary">{{ qs.optimalRange != null ? Math.round(qs.optimalRange) : '—' }} m</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">OPT RNG</div>
                  </div>
                  <div>
                    <div :class="qs.resistanceColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.resistanceFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">RÉSISTANCE</div>
                  </div>
                  <div>
                    <div :class="qs.optChgRateColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.optChgRateFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">OPT CHG RT</div>
                  </div>
                  <div>
                    <div :class="qs.overchargeColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.overchargeFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">OVERCHARGE</div>
                  </div>
                  <div>
                    <div :class="qs.filterColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.filterFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">FILTRE</div>
                  </div>
                </div>

                <div class="grid grid-cols-6 gap-2 text-center mt-2">
                  <div>
                    <div class="text-sm font-semibold text-th-primary">{{ qs.totalEffMaxPwr != null ? Math.round(qs.totalEffMaxPwr).toLocaleString('fr-FR') : '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">MAX PWR</div>
                  </div>
                  <div>
                    <div class="text-sm text-th-primary">{{ qs.zeroDamageRange != null ? Math.round(qs.zeroDamageRange) : '—' }} m</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">MAX RNG</div>
                  </div>
                  <div>
                    <div :class="qs.instabilityColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.instabilityFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">INSTABILITÉ</div>
                  </div>
                  <div>
                    <div :class="qs.optChgWndColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.optChgWndFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">OPT CHG WND</div>
                  </div>
                  <div>
                    <div :class="qs.shatterColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.shatterFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">SHATTER</div>
                  </div>
                  <div>
                    <div class="text-sm font-medium text-th-primary">{{ qs.equipmentPriceDisplay ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">PRIX ÉQUIP.</div>
                  </div>
                </div>
                </template>
              </template>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- ══ PUBLIC LOADOUTS ════════════════════════════════════════════════════ -->
    <template v-else-if="activeSubTab === 'public'">

      <div v-if="mining.loadout.loadingPublic" class="text-center text-th-muted py-8 text-sm">
        Chargement…
      </div>

      <div v-else-if="!mining.loadout.publicList.length" class="text-center text-th-muted py-8 text-sm italic">
        Aucun loadout public disponible.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="lo in mining.loadout.publicList" :key="lo.id"
          class="rounded-xl border border-white/[0.07] bg-black/20 overflow-hidden"
        >
          <!-- Header -->
          <div class="px-4 py-3 flex items-start justify-between gap-3 border-b border-white/[0.05]">
            <div class="min-w-0">
              <p class="text-lg font-semibold text-th-primary truncate">{{ lo.name }}</p>
              <p class="text-base text-th-muted mt-0.5">
                {{ shipNameFor(lo) }}
                <span v-if="(lo as any).username" class="opacity-60"> · par {{ (lo as any).username }}</span>
              </p>
              <div v-if="getLoadoutDates(lo).length" class="mt-1 flex flex-wrap gap-2">
                <span
                  v-for="d in getLoadoutDates(lo)" :key="'date-pub-' + lo.id + '-' + d.key"
                  class="text-[10px] text-th-muted bg-white/[0.02] border border-white/[0.03] px-2 py-0.5 rounded"
                >
                  <strong class="opacity-70 mr-1">{{ d.label }}:</strong>
                  <span class="font-medium text-th-primary">{{ d.text }}</span>
                </span>
              </div>
            </div>
            <button
              class="shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-all"
              @click="hydrateFromLoadout(lo)"
            >
              Importer
            </button>
          </div>

          <template v-if="mining.loadout.catalogLoaded">

            <!-- Stats (site-like 6-col grid) -->
            <div class="px-4 py-3 border-t border-white/[0.02]">
              <template v-for="qs in [computeLoadoutQuickStats(lo)]" :key="`qs-pub-` + lo.id">
                <div v-if="qs.isSalvage" class="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div class="text-sm font-semibold text-th-primary">{{ qs.salvageInstalledCount ?? 0 }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">INSTALLÉS</div>
                  </div>
                  <div>
                    <div class="text-sm text-th-primary">{{ qs.salvageModuleCount ?? 0 }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">SALVAGE</div>
                  </div>
                  <div>
                    <div class="text-sm text-th-primary">{{ qs.salvageTractorCount ?? 0 }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">TRACTOR</div>
                  </div>
                  <div>
                    <div class="text-sm font-medium text-th-primary">{{ qs.equipmentPriceDisplay ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">PRIX ÉQUIP.</div>
                  </div>
                </div>

                <template v-else>
                <div class="grid grid-cols-6 gap-2 text-center">
                  <div>
                    <div class="text-sm font-semibold text-th-primary">{{ qs.totalEffMinPwr != null ? Math.round(qs.totalEffMinPwr).toLocaleString('fr-FR') : '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">MIN PWR</div>
                  </div>
                  <div>
                    <div class="text-sm text-th-primary">{{ qs.optimalRange != null ? Math.round(qs.optimalRange) : '—' }} m</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">OPT RNG</div>
                  </div>
                  <div>
                    <div :class="qs.resistanceColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.resistanceFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">RÉSISTANCE</div>
                  </div>
                  <div>
                    <div :class="qs.optChgRateColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.optChgRateFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">OPT CHG RT</div>
                  </div>
                  <div>
                    <div :class="qs.overchargeColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.overchargeFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">OVERCHARGE</div>
                  </div>
                  <div>
                    <div :class="qs.filterColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.filterFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">FILTRE</div>
                  </div>
                </div>

                <div class="grid grid-cols-6 gap-2 text-center mt-2">
                  <div>
                    <div class="text-sm font-semibold text-th-primary">{{ qs.totalEffMaxPwr != null ? Math.round(qs.totalEffMaxPwr).toLocaleString('fr-FR') : '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">MAX PWR</div>
                  </div>
                  <div>
                    <div class="text-sm text-th-primary">{{ qs.zeroDamageRange != null ? Math.round(qs.zeroDamageRange) : '—' }} m</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">MAX RNG</div>
                  </div>
                  <div>
                    <div :class="qs.instabilityColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.instabilityFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">INSTABILITÉ</div>
                  </div>
                  <div>
                    <div :class="qs.optChgWndColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.optChgWndFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">OPT CHG WND</div>
                  </div>
                  <div>
                    <div :class="qs.shatterColor ?? 'text-white/40'" class="text-sm font-semibold">{{ qs.shatterFmt ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">SHATTER</div>
                  </div>
                  <div>
                    <div class="text-sm font-medium text-th-primary">{{ qs.equipmentPriceDisplay ?? '—' }}</div>
                    <div class="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">PRIX ÉQUIP.</div>
                  </div>
                </div>
                </template>
              </template>
            </div>
          </template>
        </div>
      </div>

      <button
        class="mt-1 text-xs text-th-muted hover:text-th-primary flex items-center gap-1.5 transition"
        @click="mining.loadPublicLoadouts(true)"
      >
        <svg class="w-3.5 h-3.5" :class="mining.loadout.loadingPublic ? 'animate-spin' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582M20 20v-5h-.581M4.582 9A8 8 0 0120 15M19.418 15A8 8 0 014 9"/>
        </svg>
        Actualiser
      </button>
    </template>

  </div>
</template>
