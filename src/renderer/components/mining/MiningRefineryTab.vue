<script setup lang="ts">
import { ref, computed, onUnmounted, nextTick, watch } from 'vue'
import { useMiningStore } from '../../stores/mining'
import {
  formatRemaining,
  formatDuration,
  progressPct,
  isNearReady,
  workOrderNotified,
  formatDateTime,
  woDisplayDuration,
} from '../../lib/miningHelpers'

const mining = useMiningStore()

type FormLine = {
  uid: number
  commodityId: string
  scuInput: string
  qualityInput: string
  query: string
  search: string
  open: boolean
  hi: number
}

import { useNow } from '../../composables/useNow'
const { now } = useNow(30_000)

const showForm = ref(false)
const formSaving = ref(false)
const formError = ref<string | null>(null)
const confirmDeleteId = ref<number | null>(null)
const completingId = ref<number | null>(null)

const refineryQuery = ref('')
const refinerySearch = ref('')
const showRefineryList = ref(false)
const methodQuery = ref('')
const methodSearch = ref('')
const showMethodList = ref(false)

let formLineUid = 0

function createEmptyLine(): FormLine {
  return { uid: formLineUid++, commodityId: '', scuInput: '', qualityInput: '', query: '', search: '', open: false, hi: -1 }
}

const form = ref({
  refineryPoiId: '' as string,
  method: '' as string,
  notes: '',
  notifyOnComplete: true,
  lines: [] as FormLine[],
})

const durationOverride = ref(0)
const durStr = ref('')
const previewSeconds = ref<number | null>(null)
const previewHasConfig = ref<boolean | null>(null)
const previewLoading = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | null = null

const refineryActive = ref<number>(-1)
const methodActive = ref<number>(-1)
const refineryItems = ref<Array<HTMLElement | null>>([])
const methodItems = ref<Array<HTMLElement | null>>([])
const refinerySearchInput = ref<HTMLInputElement | null>(null)
const methodSearchInput = ref<HTMLInputElement | null>(null)

function setRefineryItem(index: number, el: Element | null) {
  refineryItems.value[index] = el instanceof HTMLElement ? el : null
}

function setMethodItem(index: number, el: Element | null) {
  methodItems.value[index] = el instanceof HTMLElement ? el : null
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return -1
  if (index < 0) return 0
  if (index >= length) return length - 1
  return index
}

function scrollRefineryActive() {
  nextTick(() => {
    const el = refineryItems.value[refineryActive.value]
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  })
}

function scrollMethodActive() {
  nextTick(() => {
    const el = methodItems.value[methodActive.value]
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  })
}

function selectRefineryByIndex(idx: number) {
  const item = filteredRefineries.value[idx]
  if (item) selectRefinery(item)
}

function selectMethodByIndex(idx: number) {
  const item = filteredMethods.value[idx]
  if (item) selectMethod(item)
}

function moveRefineryActive(offset: number) {
  const len = filteredRefineries.value.length
  if (!len) return
  let idx = refineryActive.value
  if (idx < 0) idx = offset > 0 ? 0 : len - 1
  else idx = idx + offset
  refineryActive.value = clampIndex(idx, len)
  scrollRefineryActive()
}

function moveMethodActive(offset: number) {
  const len = filteredMethods.value.length
  if (!len) return
  let idx = methodActive.value
  if (idx < 0) idx = offset > 0 ? 0 : len - 1
  else idx = idx + offset
  methodActive.value = clampIndex(idx, len)
  scrollMethodActive()
}

function handleRefineryKeydown(e: KeyboardEvent) {
  if (!showRefineryList.value) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      showRefineryList.value = true
      nextTick(() => refinerySearchInput.value?.focus())
      e.preventDefault()
    }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault(); moveRefineryActive(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); moveRefineryActive(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault(); if (refineryActive.value >= 0) selectRefineryByIndex(refineryActive.value)
  } else if (e.key === 'Escape') {
    showRefineryList.value = false
  }
}

function handleMethodKeydown(e: KeyboardEvent) {
  if (!showMethodList.value) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      showMethodList.value = true
      nextTick(() => methodSearchInput.value?.focus())
      e.preventDefault()
    }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault(); moveMethodActive(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); moveMethodActive(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault(); if (methodActive.value >= 0) selectMethodByIndex(methodActive.value)
  } else if (e.key === 'Escape') {
    showMethodList.value = false
  }
}

function getMethodYieldFactor(methodKey: string): number {
  const method = mining.methodByKey(methodKey) as Record<string, unknown> | null
  if (!method) return 1
  if (typeof method.yieldMultiplier === 'number') return method.yieldMultiplier
  if (typeof method.yieldPercent === 'number') return method.yieldPercent / 100
  return 1
}

function getMethodYieldPct(methodKey: string): number | null {
  const method = mining.methodByKey(methodKey) as Record<string, unknown> | null
  if (!method) return null
  if (typeof method.yieldPercent === 'number') return Math.round(method.yieldPercent * 10) / 10
  if (typeof method.yieldMultiplier === 'number') return Math.round(method.yieldMultiplier * 1000) / 10
  return null
}

function getMethodDurationMultiplier(methodKey: string): number {
  const method = mining.methodByKey(methodKey) as Record<string, unknown> | null
  if (!method) return 1
  if (typeof method.durationMultiplier === 'number') return method.durationMultiplier
  if (typeof method.durationFactor === 'number') return method.durationFactor
  return 1
}

function getMethodCostPerScu(methodKey: string): number | null {
  const method = mining.methodByKey(methodKey) as Record<string, unknown> | null
  if (!method) return null
  return typeof method.costPerScuInput === 'number' ? method.costPerScuInput : null
}

function getLineInput(line: { scuInput?: number | string; quantityScuInput?: number | string }): number {
  return Number(line.scuInput ?? line.quantityScuInput ?? 0)
}

function getQualityInput(line: { qualityInput?: number | string; }): number {
  return Number(line.qualityInput ?? 0)
}

function getLineOutput(
  line: { scuInput?: number | string; quantityScuInput?: number | string; scuOutput?: number | string; quantityScuOutput?: number | string; yieldPercent?: number | string | null },
  methodKey: string,
): number {
  if (line.scuOutput != null) return Number(line.scuOutput)
  if (line.quantityScuOutput != null) return Number(line.quantityScuOutput)
  const input = getLineInput(line)
  if (!input) return 0
  if (line.yieldPercent != null) {
    return Math.round(input * (Number(line.yieldPercent) / 100) * 10) / 10
  }
  return Math.round(input * getMethodYieldFactor(methodKey) * 10) / 10
}

const selectedMethod = computed(() => mining.methodByKey(form.value.method))

const filteredRefineries = computed(() => {
  const query = refinerySearch.value.trim().toLowerCase()
  if (!query) return mining.refineries.slice(0, 20)
  return mining.refineries
    .filter((refinery) => {
      return [refinery.name, refinery.systemName, refinery.locationName]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
    .slice(0, 20)
})

const filteredMethods = computed(() => {
  const query = methodSearch.value.trim().toLowerCase()
  if (!query) return mining.refineryMethods.slice(0, 20)
  return mining.refineryMethods
    .filter((method) => {
      return [method.label, method.method]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
    .slice(0, 20)
})

watch(filteredRefineries, (list) => {
  if (!showRefineryList.value) return
  refineryActive.value = list.length ? clampIndex(refineryActive.value, list.length) : -1
})
watch(filteredMethods, (list) => {
  if (!showMethodList.value) return
  methodActive.value = list.length ? clampIndex(methodActive.value, list.length) : -1
})

function currentYieldPct(): number | null {
  return getMethodYieldPct(form.value.method)
}

function previewLinesForTime() {
  return form.value.lines
    .filter((line) => line.commodityId && getLineInput(line) > 0 && getQualityInput(line) > 0)
    .map((line) => ({
      commodityId: Number(line.commodityId),
      scuInput: Math.max(1, Math.trunc(Number(line.scuInput) || 0)) / 100,
    }))
}

function hasDurationPreviewInputs(): boolean {
  return Boolean(form.value.method && previewLinesForTime().length > 0)
}

function totalValidScuInput(): number {
  return form.value.lines.reduce((total, line) => {
    return line.commodityId && getLineInput(line) > 0 ? total + getLineInput(line) : total
  }, 0)
}

function effectiveDurationSeconds(): number | null {
  if (durationOverride.value > 0) return Math.trunc(durationOverride.value)
  if (previewSeconds.value != null && previewSeconds.value > 0) return Math.trunc(previewSeconds.value)
  return null
}

function canShowDurationBlock(): boolean {
  return durationOverride.value > 0 || hasDurationPreviewInputs()
}

function durationBadgeLabel(): string {
  if (durationOverride.value > 0) return 'manuel'
  if (previewLoading.value) return 'calcul…'
  if (!hasDurationPreviewInputs()) return 'en attente'
  if (previewHasConfig.value === false) return 'imprécis'
  if (previewSeconds.value != null) return 'calculé'
  return 'en attente'
}

function durationBadgeClass(): string {
  if (durationOverride.value > 0) return 'border-accent/25 bg-accent/8 text-accent'
  if (previewHasConfig.value === false) return 'border-amber-400/25 bg-amber-400/10 text-amber-300'
  if (previewSeconds.value != null) return 'border-sky-400/25 bg-sky-400/8 text-sky-300'
  return 'border-white/8 bg-white/3 text-th-muted'
}

function durationDisplayLabel(): string {
  if (previewLoading.value && durationOverride.value <= 0) return 'calcul…'
  const seconds = effectiveDurationSeconds()
  return seconds != null ? woDisplayDuration(seconds) : '—'
}

function schedulePreviewTime() {
  if (previewTimer) clearTimeout(previewTimer)

  if (durationOverride.value > 0) {
    previewLoading.value = false
    return
  }

  const method = form.value.method
  const lines = previewLinesForTime()

  if (!method || lines.length === 0) {
    previewSeconds.value = null
    previewHasConfig.value = null
    previewLoading.value = false
    return
  }

  previewLoading.value = true
  previewTimer = setTimeout(async () => {
    try {
      const data = await mining.previewRefineryTime(method, lines)
      const hasConfig = Boolean(data?.hasConfig)
      const seconds = Number(data?.durationSeconds ?? 0)
      previewHasConfig.value = hasConfig
      previewSeconds.value = hasConfig && Number.isFinite(seconds) && seconds > 0 ? Math.trunc(seconds) : null
    } catch {
      previewHasConfig.value = false
      previewSeconds.value = null
    } finally {
      previewLoading.value = false
    }
  }, 300)
}

function parseDurationStr(str: string): number {
  const parts = str.split(':').map(Number)
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2 && parts.every((n) => !isNaN(n))) return parts[0] * 3600 + parts[1] * 60
  const n = Number(str)
  return !isNaN(n) && n > 0 ? n * 60 : 0
}

function enterDurationEdit() {
  const s = effectiveDurationSeconds()
  const next = s && s > 0 ? s : 60
  durationOverride.value = next
  durStr.value = woDisplayDuration(next)
}

function handleDurationInput(e: Event) {
  durStr.value = (e.target as HTMLInputElement).value
  const parsed = parseDurationStr(durStr.value)
  if (parsed > 0) durationOverride.value = parsed
}

function normalizeDurationInput() {
  const parsed = parseDurationStr(durStr.value)
  if (parsed > 0) {
    durationOverride.value = parsed
    durStr.value = woDisplayDuration(parsed)
  } else if (!durStr.value.trim()) {
    durationOverride.value = 0
  }
}

function resetDuration() {
  durationOverride.value = 0
  durStr.value = ''
}

function confidenceBadgeClass(confidence: string | null | undefined): string {
  if (confidence === 'high')   return 'text-emerald-400'
  if (confidence === 'medium') return 'text-amber-300'
  if (confidence === 'low')    return 'text-orange-400'
  return 'text-white/30'
}

function confidenceBadgeTitle(confidence: string | null | undefined): string {
  if (confidence === 'high')   return 'Durée calculée — haute confiance'
  if (confidence === 'medium') return 'Durée estimée — confiance moyenne'
  if (confidence === 'low')    return 'Durée estimée — faible confiance'
  return 'Confiance inconnue'
}

function previewCscuOutput(scuInputCscu: string | number): string {
  const cScu = Math.trunc(Number(scuInputCscu) || 0)
  if (!cScu || !form.value.method) return '—'
  return String(Math.round(cScu * getMethodYieldFactor(form.value.method)))
}

function woIsValid(): boolean {
  if (!form.value.refineryPoiId) return false
  if (!form.value.method) return false
  return form.value.lines.some((line) => line.commodityId && getLineInput(line) > 0 && getQualityInput(line) > 0)
}

function refineryDisplayNameById(id: string | number): string {
  const refinery = mining.refineryById(id ?? '')
  if (!refinery) return ''
  return refinery.systemName ? `${refinery.name} (${refinery.systemName})` : refinery.name
}

function refineryLocationLabel(refinery: { systemName?: string | null; locationName?: string | null }): string {
  return [refinery.systemName, refinery.locationName].filter(Boolean).join(' — ')
}

function mineralMetaLabel(mineral: Record<string, unknown>): string {
  return String(mineral.code ?? mineral.signal ?? '')
}

function filteredMinerals(query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  const minerals = !normalizedQuery
    ? mining.minerals
    : mining.minerals.filter((mineral) => {
      const candidate = mineral as Record<string, unknown>
      return [candidate.name, candidate.code]
        .some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))
    })
  return minerals.slice(0, 20)
}

function setRefinerySearch(event: Event) {
  refinerySearch.value = (event.target as HTMLInputElement).value
  refineryActive.value = filteredRefineries.value.length ? 0 : -1
  showRefineryList.value = true
}

function openRefineryList() {
  refinerySearch.value = ''
  showRefineryList.value = true
  addRefineryOutsideListener()
  nextTick(() => {
    const idx = filteredRefineries.value.findIndex((r) => String(r.id) === String(form.value.refineryPoiId))
    refineryActive.value = idx >= 0 ? idx : (filteredRefineries.value.length ? 0 : -1)
    refinerySearchInput.value?.focus()
    scrollRefineryActive()
  })
}

function setMethodSearch(event: Event) {
  methodSearch.value = (event.target as HTMLInputElement).value
  methodActive.value = filteredMethods.value.length ? 0 : -1
  showMethodList.value = true
}

function openMethodList() {
  methodSearch.value = ''
  showMethodList.value = true
  addMethodOutsideListener()
  nextTick(() => {
    const idx = filteredMethods.value.findIndex((m) => (m.method ?? '') === (form.value.method ?? ''))
    methodActive.value = idx >= 0 ? idx : (filteredMethods.value.length ? 0 : -1)
    methodSearchInput.value?.focus()
    scrollMethodActive()
  })
}

function clearMethod() {
  form.value.method = ''
  methodQuery.value = ''
  methodSearch.value = ''
  showMethodList.value = false
  removeMethodOutsideListener()
}

function mineralNameById(id: string | number | null | undefined): string {
  if (id === null || id === undefined || id === '') return ''
  return String(mining.minerals.find((mineral: any) => String(mineral.id) === String(id))?.name ?? '')
}

function mineralDisplayName(line: FormLine): string {
  return String(line.query || mineralNameById(line.commodityId) || '').trim()
}

function filteredMineralsForLine(line: FormLine) {
  return filteredMinerals(line.search ?? '')
}

function setMineralSearch(line: FormLine, event: Event) {
  line.search = (event.target as HTMLInputElement).value
  line.hi = filteredMineralsForLine(line).length ? 0 : -1
}

function openMineralList(line: FormLine, event?: Event) {
  line.open = true
  line.search = ''
  const selectedIndex = filteredMineralsForLine(line).findIndex((mineral: any) => String(mineral.id) === String(line.commodityId))
  line.hi = selectedIndex >= 0 ? selectedIndex : (filteredMineralsForLine(line).length ? 0 : -1)
  const root = (event?.currentTarget as HTMLElement | null)?.closest('.relative')
  nextTick(() => root?.querySelector<HTMLInputElement>('.mineral-dropdown-search')?.focus())
}

function clearMineral(line: FormLine) {
  line.commodityId = ''
  line.query = ''
  line.search = ''
  line.open = false
  line.hi = -1
}

function handleMineralKeydown(event: KeyboardEvent, line: FormLine) {
  const list = filteredMineralsForLine(line)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    line.hi = Math.min(Number(line.hi ?? -1) + 1, list.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    line.hi = Math.max(Number(line.hi ?? 0) - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = list[Number(line.hi ?? -1)] ?? list[0]
    if (item) selectMineral(line, item)
  } else if (event.key === 'Escape') {
    line.open = false
  }

  nextTick(() => {
    const root = (event.currentTarget as HTMLElement | null)?.closest('.relative')
    root?.querySelectorAll<HTMLElement>('.mineral-dropdown-item')?.[Number(line.hi ?? -1)]?.scrollIntoView({ block: 'nearest' })
  })
}

const refineryContainer = ref<HTMLElement | null>(null)
const methodContainer = ref<HTMLElement | null>(null)

let onDocPointerDownRefinery: ((e: PointerEvent) => void) | null = null
let onDocPointerDownMethod: ((e: PointerEvent) => void) | null = null

function addRefineryOutsideListener() {
  removeRefineryOutsideListener()
  onDocPointerDownRefinery = (e: PointerEvent) => {
    const target = e.target as Node | null
    if (!refineryContainer.value || !target) return
    if (!refineryContainer.value.contains(target)) {
      showRefineryList.value = false
      removeRefineryOutsideListener()
    }
  }
  document.addEventListener('pointerdown', onDocPointerDownRefinery)
}

function removeRefineryOutsideListener() {
  if (!onDocPointerDownRefinery) return
  document.removeEventListener('pointerdown', onDocPointerDownRefinery)
  onDocPointerDownRefinery = null
}

function addMethodOutsideListener() {
  removeMethodOutsideListener()
  onDocPointerDownMethod = (e: PointerEvent) => {
    const target = e.target as Node | null
    if (!methodContainer.value || !target) return
    if (!methodContainer.value.contains(target)) {
      showMethodList.value = false
      removeMethodOutsideListener()
    }
  }
  document.addEventListener('pointerdown', onDocPointerDownMethod)
}

function removeMethodOutsideListener() {
  if (!onDocPointerDownMethod) return
  document.removeEventListener('pointerdown', onDocPointerDownMethod)
  onDocPointerDownMethod = null
}

function blockNonInteger(e: KeyboardEvent) {
  if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) e.preventDefault()
}

function clampCscuInput(e: Event, line: FormLine) {
  const val = (e.target as HTMLInputElement).value
  line.scuInput = val === '' ? '' : String(Math.max(1, Math.trunc(Number(val) || 0)))
}

function clampQualityInput(e: Event, line: FormLine) {
  const val = (e.target as HTMLInputElement).value
  line.qualityInput = val === '' ? '' : String(Math.max(0, Math.min(1000, Math.trunc(Number(val) || 0))))
}

function closeMineralListSoon(line: FormLine) {
  window.setTimeout(() => { line.open = false }, 140)
}

function selectRefinery(refinery: { id: string | number; name: string; systemName?: string | null }) {
  form.value.refineryPoiId = String(refinery.id)
  refineryQuery.value = refinery.systemName ? `${refinery.name} (${refinery.systemName})` : refinery.name
  refinerySearch.value = ''
  showRefineryList.value = false
  removeRefineryOutsideListener()
}

function clearRefinery() {
  form.value.refineryPoiId = ''
  refineryQuery.value = ''
  refinerySearch.value = ''
  showRefineryList.value = false
  removeRefineryOutsideListener()
}

function selectMethod(method: { method: string; label: string }) {
  form.value.method = method.method
  methodQuery.value = method.label ?? method.method
  methodSearch.value = ''
  showMethodList.value = false
  removeMethodOutsideListener()
}

function selectMineral(line: FormLine, mineral: { id: string | number; name: string }) {
  line.commodityId = String(mineral.id)
  line.query = mineral.name
  line.search = ''
  line.open = false
  line.hi = -1
}

function resetForm() {
  form.value = {
    refineryPoiId: '',
    method: '',
    notes: '',
    notifyOnComplete: true,
    lines: [createEmptyLine()],
  }
  refineryQuery.value = ''
  refinerySearch.value = ''
  methodQuery.value = ''
  methodSearch.value = ''
  showRefineryList.value = false
  showMethodList.value = false
  durationOverride.value = 0
  durStr.value = ''
  previewSeconds.value = null
  previewHasConfig.value = null
  previewLoading.value = false
  if (previewTimer) clearTimeout(previewTimer)
  formError.value = null
}

function openForm() {
  resetForm()
  showForm.value = true
}

function addLine() {
  form.value.lines.push(createEmptyLine())
}

function removeLine(index: number) {
  form.value.lines.splice(index, 1)
}

async function submitForm() {
  formError.value = null
  const lines = form.value.lines
    .filter((line) => line.commodityId && getLineInput(line) > 0 && getQualityInput(line) > 0)
    .map((line) => ({
      commodityId: Number(line.commodityId),
      scuInput: Math.max(1, Math.trunc(Number(line.scuInput) || 0)) / 100,
      quality: Math.max(0, Math.min(1000, Math.trunc(Number(line.qualityInput) || 0))),
    }))

  if (!lines.length) {
    formError.value = 'Ajoutez au moins un minerai avec une quantité supérieure à 0.'
    return
  }
  if (!form.value.refineryPoiId) {
    formError.value = 'Sélectionnez une raffinerie.'
    return
  }
  if (!form.value.method) {
    formError.value = 'Sélectionnez une méthode de raffinage.'
    return
  }

  formSaving.value = true
  try {
    await mining.createWorkOrder({
      refineryPoiId: form.value.refineryPoiId || null,
      method: form.value.method,
      startedAt: null,
      notes: form.value.notes || null,
      notifyOnComplete: form.value.notifyOnComplete,
      durationSeconds: effectiveDurationSeconds(),
      lines,
    })
    showForm.value = false
  } catch (err: unknown) {
    formError.value = err instanceof Error ? err.message : 'Erreur de création du work order.'
  } finally {
    formSaving.value = false
  }
}

async function deleteWO(id: number) {
  await mining.deleteWorkOrder(id)
  confirmDeleteId.value = null
}

async function completeWO(id: number) {
  if (completingId.value != null) return
  completingId.value = id
  try {
    await mining.completeWorkOrder(id)
  } finally {
    completingId.value = null
  }
}

function refineryLocation(wo: { refineryPoiId?: number | null }) {
  const refinery = mining.refineryById(wo.refineryPoiId ?? '')
  if (!refinery) return ''
  return refineryLocationLabel(refinery)
}

const refineryYieldsOpen = ref(false)

const refineryYieldsPivot = computed(() => {
  const yields = mining.refineryYieldsAll
  if (!yields.length) return { commodities: [] as string[], systems: [] as any[] }
  const commodities = [...new Set(yields.map((y) => y.commodityName).filter(Boolean))].sort() as string[]
  const bySystem: Record<string, Record<string, Record<string, number>>> = {}
  for (const y of yields) {
    const sys = y.systemName || '—'
    const ref = y.poiName || y.terminalName || '—'
    if (!bySystem[sys]) bySystem[sys] = {}
    if (!bySystem[sys][ref]) bySystem[sys][ref] = {}
    if (y.commodityName) bySystem[sys][ref][y.commodityName] = y.bonusPercent
  }
  const systems = Object.keys(bySystem).sort().map((s) => ({
    name: s,
    rows: Object.keys(bySystem[s]).sort().map((r) => ({ refinery: r, values: bySystem[s][r] })),
  }))
  return { commodities, systems }
})

watch(
  () => `${form.value.method}|${form.value.lines.map((line) => `${line.commodityId}:${line.scuInput}`).join('|')}|${durationOverride.value}`,
  () => schedulePreviewTime(),
)

onUnmounted(() => {
  if (previewTimer) clearTimeout(previewTimer)
  removeRefineryOutsideListener()
  removeMethodOutsideListener()
})
</script>

<template>
  <div v-if="mining.errors.global" class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
    {{ mining.errors.global }}
  </div>

  <section class="rounded-2xl border border-th-subtle bg-black/20 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-sm">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div class="flex items-start gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/[0.08] text-accent">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M12 3v4m-3 0h6M8 11h8M6 15h12M4 19h16" />
          </svg>
        </div>
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.26em] text-accent/70">Opérations minières</p>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold text-th-primary">Work Orders de raffinage</h2>
            <span v-if="mining.workOrders.length" class="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              {{ mining.workOrders.length }} actifs
            </span>
          </div>
          <p class="mt-1 text-xs text-th-muted">Création rapide et suivi en temps réel des raffineries en cours.</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="mining.workOrders.some(w => w.isReady)"
          class="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
          :disabled="mining.loading.collectAll"
          @click="mining.collectAllReady()"
        >
          {{ mining.loading.collectAll ? 'Récupération...' : 'Tout Collecter' }}
        </button>
        <!-- Actualiser button removed -->
        <button
          class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition"
          :class="showForm
            ? 'border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15'
            : 'border-accent/25 bg-accent/[0.08] text-accent hover:bg-accent/15'"
          :disabled="mining.loading.bootstrap"
          @click="showForm ? (showForm = false) : openForm()"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path v-if="!showForm" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          {{ showForm ? 'Annuler' : 'Nouveau WO' }}
        </button>
      </div>
    </div>

    <div v-if="showForm" class="mt-5 rounded-2xl border border-accent/15 bg-accent/[0.04] p-4 md:p-5">
      <div class="grid gap-5 md:grid-cols-2">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-th-muted">Raffinerie</label>
          <div class="relative" ref="refineryContainer">
            <input
              :value="form.refineryPoiId ? refineryDisplayNameById(form.refineryPoiId) : ''"
              autocomplete="off"
              readonly
              class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2.5 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none cursor-pointer"
              placeholder="Sélectionnez une raffinerie..."
              @click="openRefineryList"
              @keydown="handleRefineryKeydown"
            />
            <button
              v-if="form.refineryPoiId"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-xs text-th-muted transition hover:bg-white/5 hover:text-th-primary"
              type="button"
              @click="clearRefinery"
            >✕</button>

            <div v-if="showRefineryList" class="absolute inset-x-0 top-full z-20 mt-2 max-h-56 overflow-hidden rounded-xl border border-th-subtle bg-[#05080d]/95 shadow-2xl backdrop-blur-md">
              <div class="p-2">
                <input
                  ref="refinerySearchInput"
                  :value="refinerySearch"
                  autocomplete="off"
                  class="w-full rounded-md border border-th-subtle bg-black/20 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                  placeholder="Rechercher une raffinerie..."
                  @input="setRefinerySearch($event)"
                  @keydown="handleRefineryKeydown"
                />
              </div>

              <div v-if="filteredRefineries.length" class="max-h-48 overflow-y-auto p-1.5">
                <button
                  v-for="(refinery, idx) in filteredRefineries"
                  :key="refinery.id"
                  :ref="(el) => setRefineryItem(idx, el as Element | null)"
                  :class="['block w-full rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-white/10 hover:bg-white/5', refineryActive === idx ? 'border-white/10 bg-white/5' : '']"
                  type="button"
                  @mousedown.prevent="selectRefinery(refinery)"
                >
                  <div class="text-sm font-medium text-th-primary">{{ refinery.name }}</div>
                  <div v-if="refineryLocationLabel(refinery)" class="mt-0.5 text-[11px] text-th-muted">{{ refineryLocationLabel(refinery) }}</div>
                </button>
              </div>

              <div v-else class="p-3 text-xs text-th-muted">Aucune raffinerie trouvée.</div>
            </div>
          </div>
        </div>

        <div>
          <label class="mb-1.5 block text-xs font-medium text-th-muted">Méthode de raffinage</label>
          <div class="relative" ref="methodContainer">
            <input
              :value="form.method ? (mining.methodByKey(form.method)?.label ?? form.method) : ''"
              autocomplete="off"
              readonly
              class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2.5 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none cursor-pointer"
              placeholder="Sélectionnez une méthode..."
              @click="openMethodList"
              @keydown="handleMethodKeydown"
            />
            <button
              v-if="form.method"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-xs text-th-muted transition hover:bg-white/5 hover:text-th-primary"
              type="button"
              @click="clearMethod"
            >✕</button>

            <div v-if="showMethodList" class="absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-hidden rounded-xl border border-th-subtle bg-[#05080d]/95 shadow-2xl backdrop-blur-md">
              <div class="p-2">
                <input
                  ref="methodSearchInput"
                  :value="methodSearch"
                  autocomplete="off"
                  class="w-full rounded-md border border-th-subtle bg-black/20 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                  placeholder="Rechercher une méthode..."
                  @input="setMethodSearch($event)"
                  @keydown="handleMethodKeydown"
                />
              </div>

              <div v-if="filteredMethods.length" class="max-h-48 overflow-y-auto p-1.5">
                <button
                  v-for="(method, idx) in filteredMethods"
                  :key="method.method"
                  :ref="(el) => setMethodItem(idx, el as Element | null)"
                  :class="['block w-full rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-white/10 hover:bg-white/5', methodActive === idx ? 'border-white/10 bg-white/5' : '']"
                  type="button"
                  @mousedown.prevent="selectMethod(method)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium text-th-primary">{{ method.label }}</span>
                    <span v-if="getMethodYieldPct(method.method) != null" class="rounded-full bg-accent/[0.1] px-2 py-0.5 text-[11px] font-semibold text-accent">
                      {{ getMethodYieldPct(method.method) }}%
                    </span>
                  </div>
                  <div class="mt-1 flex flex-wrap gap-3 text-[11px] text-th-muted">
                    <span>Durée ×{{ getMethodDurationMultiplier(method.method) }}</span>
                    <span v-if="getMethodCostPerScu(method.method) != null">{{ getMethodCostPerScu(method.method) }} aUEC/SCU</span>
                  </div>
                </button>
              </div>

              <div v-else class="p-3 text-xs text-th-muted">Aucune méthode trouvée.</div>
            </div>
          </div>

          <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-th-muted">
            <span v-if="currentYieldPct() != null" class="rounded-full border border-accent/20 bg-accent/[0.08] px-2 py-1 text-accent">Rendement {{ currentYieldPct() }}%</span>
            <span v-if="selectedMethod" class="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">Durée ×{{ getMethodDurationMultiplier(form.method) }}</span>
          </div>
        </div>
      </div>

      <div class="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-th-muted">Notes <span class="font-normal">(optionnel)</span></label>
          <input
            v-model="form.notes"
            class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2.5 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
            placeholder="Ex : Quantanium run Pyro"
            type="text"
          />
        </div>

        <div>
          <label class="mb-1.5 block text-xs font-medium text-th-muted">Notification</label>
          <label
            class="flex cursor-pointer items-start gap-3.5 rounded-xl border px-4 py-3 transition select-none"
            :class="form.notifyOnComplete ? 'border-accent/35 bg-accent/[0.04]' : 'border-th-subtle hover:border-white/20'"
          >
            <input v-model="form.notifyOnComplete" class="sr-only" type="checkbox">
            <div
              class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition"
              :class="form.notifyOnComplete ? 'border-accent/60 bg-accent/25' : 'border-white/20 bg-white/5'"
            >
              <svg v-if="form.notifyOnComplete" class="h-3 w-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div>
              <div class="text-sm text-th-primary">MP à la fin du WO</div>
              <div class="mt-1 text-xs text-th-muted">Reçois un message privé quand le raffinage est prêt</div>
            </div>
          </label>
        </div>
      </div>

      <div class="mt-5">
        <div class="mb-2 flex items-center justify-between gap-3">
          <label class="text-xs font-medium text-th-muted">Minerais récupérés</label>
          <button
            class="rounded-lg border border-accent/20 bg-accent/[0.08] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent transition hover:bg-accent/15"
            type="button"
            @click="addLine"
          >
            + Minerai
          </button>
        </div>

        <div v-if="form.lines.length" class="hidden grid-cols-[minmax(0,1.5fr)_6.5rem_6.5rem_5.5rem_2rem] gap-2 px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-th-muted md:grid">
          <span>Minerai</span>
          <span class="text-center">Qualité</span>
          <span class="text-center">cSCU brut</span>
          <span class="text-center">Yields ↗</span>
          <span></span>
        </div>

        <div class="space-y-2">
          <div
            v-for="(line, index) in form.lines"
            :key="line.uid"
            class="grid gap-2 rounded-xl border border-th-subtle bg-black/20 p-2 md:grid-cols-[minmax(0,1.5fr)_6.5rem_6.5rem_5.5rem_2rem] md:items-center"
          >
            <div class="relative">
              <input
                :value="mineralDisplayName(line)"
                readonly
                autocomplete="off"
                class="w-full cursor-pointer rounded-lg border border-th-subtle bg-black/30 px-3 py-2 pr-8 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                :placeholder="`Minerai ${index + 1}`"
                @click="openMineralList(line, $event)"
                @focus="openMineralList(line, $event)"
                @keydown="handleMineralKeydown($event, line)"
              />
              <button
                v-if="line.commodityId"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-th-muted transition hover:text-rose-300"
                type="button"
                @click="clearMineral(line)"
              >×</button>

              <div v-if="line.open" class="absolute inset-x-0 top-full z-20 mt-2 h-60 overflow-hidden rounded-xl border border-th-subtle bg-[#05080d]/95 shadow-2xl backdrop-blur-md">
                <div class="p-2">
                  <input
                    :value="line.search"
                    autocomplete="off"
                    class="mineral-dropdown-search sticky top-0 z-10 w-full rounded-lg border border-th-subtle bg-black/25 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                    placeholder="Rechercher un minerai..."
                    @input="setMineralSearch(line, $event)"
                    @blur="closeMineralListSoon(line)"
                    @keydown="handleMineralKeydown($event, line)"
                  />
                </div>

                <div v-if="filteredMineralsForLine(line).length" class="max-h-44 overflow-y-auto p-1.5 space-y-0.5">
                  <button
                    v-for="(mineral, mi) in filteredMineralsForLine(line)"
                    :key="mineral.id"
                    class="mineral-dropdown-item flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition"
                    :class="mi === line.hi ? 'border-accent/25 bg-accent/10 text-accent' : 'border-transparent hover:border-white/10 hover:bg-white/5'"
                    type="button"
                    @mouseenter="line.hi = mi"
                    @mousedown.prevent="selectMineral(line, mineral)"
                  >
                    <span class="text-sm text-th-primary">{{ mineral.name }}</span>
                    <span v-if="mineralMetaLabel(mineral as unknown as Record<string, unknown>)" class="text-[11px] text-th-muted">
                      {{ mineralMetaLabel(mineral as unknown as Record<string, unknown>) }}
                    </span>
                  </button>
                </div>

                <div v-else class="p-3 text-xs text-th-muted">
                  Aucun minerai trouvé.
                </div>
              </div>
            </div>

            <input
              v-model="line.qualityInput"
              class="w-full rounded-lg border border-th-subtle bg-black/30 px-3 py-2 text-center text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
              inputmode="numeric"
              min="0"
              max="1000"
              pattern="[0-9]*"
              placeholder="Qualité"
              step="1"
              type="number"
              @keydown="blockNonInteger($event)"
              @input="clampQualityInput($event, line)"
            />

            <input
              v-model="line.scuInput"
              class="w-full rounded-lg border border-th-subtle bg-black/30 px-3 py-2 text-center text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
              inputmode="numeric"
              min="1"
              pattern="[0-9]*"
              placeholder="cSCU"
              step="1"
              type="number"
              @keydown="blockNonInteger($event)"
              @input="clampCscuInput($event, line)"
            />

            <div class="text-center text-sm font-mono" :class="line.scuInput && Number(line.scuInput) > 0 && line.commodityId ? 'text-accent' : 'text-th-muted/40'">
              {{ previewCscuOutput(line.scuInput) }}
            </div>

            <button
              class="justify-self-end rounded-lg px-2 py-1 text-lg leading-none text-th-muted transition hover:bg-rose-500/10 hover:text-rose-300"
              type="button"
              @click="removeLine(index)"
            >×</button>
          </div>
        </div>

        <p v-if="!form.lines.length" class="mt-2 text-xs italic text-th-muted">Ajoutez au moins un minerai pour créer le work order.</p>
      </div>

      <div
        v-if="canShowDurationBlock()"
        class="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-black/20 px-4 py-2.5"
        :class="durationOverride > 0 ? 'border-accent/25' : (previewHasConfig === false ? 'border-amber-400/20' : 'border-th-subtle')"
      >
        <div class="flex shrink-0 items-center gap-2">
          <span class="text-xs font-medium text-th-muted">Durée</span>
          <span
            class="rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-widest"
            :class="durationBadgeClass()"
          >{{ durationBadgeLabel() }}</span>
        </div>

        <div v-if="previewHasConfig === false && durationOverride === 0" class="w-full text-xs text-amber-300 md:order-last" style="font-family:'Share Tech Mono',monospace;letter-spacing:0.03em">
          ⚠ Calcul incomplet — coefficient ou base temps manquante. Saisis une durée manuelle si besoin.
        </div>

        <div class="flex flex-1 items-center justify-end gap-2">
          <template v-if="durationOverride === 0">
            <button
              type="button"
              class="font-bold tabular-nums text-accent transition hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-45"
              style="font-family:'Share Tech Mono',monospace;font-size:1.1rem;letter-spacing:.05em"
              :title="hasDurationPreviewInputs() ? 'Cliquer pour saisie manuelle' : 'Ajoutez une méthode et au moins un minerai'"
              :disabled="!hasDurationPreviewInputs()"
              @click="enterDurationEdit()"
            >{{ durationDisplayLabel() }}</button>
          </template>
          <template v-else>
            <input
              v-model="durStr"
              type="text"
              inputmode="numeric"
              placeholder="0:00:00"
              maxlength="9"
              class="w-28 bg-transparent border-0 border-b border-accent/30 text-right text-accent font-bold focus:outline-none tabular-nums"
              style="font-family:'Share Tech Mono',monospace;font-size:1.1rem;letter-spacing:.05em"
              @input="handleDurationInput($event)"
              @blur="normalizeDurationInput()"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
            <button
              type="button"
              class="rounded border border-white/10 px-2 py-1 text-[0.65rem] text-th-muted transition hover:border-accent/30 hover:text-accent"
              @click="resetDuration()"
            >↺ auto</button>
          </template>
        </div>
      </div>

      <div v-if="!woIsValid() && (form.lines.length > 0 || refineryQuery || methodQuery)" class="mt-4 flex flex-wrap gap-2 text-xs">
        <span v-if="!form.refineryPoiId" class="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-rose-300">⚠ Raffinerie requise</span>
        <span v-if="!form.method" class="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-rose-300">⚠ Méthode requise</span>
        <span v-if="totalValidScuInput() === 0" class="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-rose-300">⚠ Au moins un minerai avec une quantité est requis</span>
      </div>

      <p v-if="formError" class="mt-4 text-xs text-rose-300">{{ formError }}</p>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <button
          class="inline-flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
          :disabled="formSaving || !woIsValid()"
          @click="submitForm"
        >
          <svg v-if="formSaving" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span>{{ formSaving ? 'Enregistrement...' : 'Enregistrer WO' }}</span>
        </button>

        <div v-if="woIsValid() && totalValidScuInput() > 0" class="flex flex-wrap items-center gap-2 text-xs">
          <span v-if="effectiveDurationSeconds() !== null" class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-th-primary">⏱ {{ woDisplayDuration(effectiveDurationSeconds()!) }}</span>
          <span v-else-if="previewLoading" class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-th-muted">⏱ calcul…</span>
          <span v-else-if="previewHasConfig === false" class="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-amber-300">⚠ temps imprécis</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Tableau bonus/malus rendement par raffinerie -->
  <div class="mt-2">
    <button
      class="flex items-center gap-2 text-xs text-th-muted/45 transition hover:text-th-muted/70 mb-3 group"
      @click="refineryYieldsOpen = !refineryYieldsOpen; if (refineryYieldsOpen) mining.loadAllRefineryYields()"
    >
      <svg class="w-3.5 h-3.5 transition-transform" :class="refineryYieldsOpen ? 'rotate-90' : ''" fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="2">
        <path d="M6 4l4 4-4 4"/>
      </svg>
      <span>Bonus / malus de rendement par raffinerie</span>
    </button>

    <div v-if="refineryYieldsOpen">
      <div v-if="!mining.refineryYieldsLoaded" class="py-4 text-center text-xs text-th-muted">Chargement…</div>
      <div v-else-if="!mining.refineryYieldsAll.length" class="py-4 text-center text-xs italic text-th-muted">
        Aucun bonus de rendement disponible.
      </div>
      <div v-else class="overflow-x-auto rounded-xl border border-white/10">
        <table class="min-w-full text-xs border-collapse">
          <thead>
            <tr>
              <th class="sticky left-0 z-10 bg-[#08111b] px-3 py-2 text-left text-th-muted font-medium border-b border-r border-white/10 min-w-[14rem] whitespace-nowrap">
                Raffinerie
              </th>
              <th
                v-for="com in refineryYieldsPivot.commodities"
                :key="com"
                class="px-3 py-2 text-center text-th-muted font-medium border-b border-white/10 whitespace-nowrap"
              >{{ com }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="sys in refineryYieldsPivot.systems" :key="sys.name">
              <tr
                v-for="(row, ri) in sys.rows"
                :key="sys.name + '-' + row.refinery"
                class="hover:bg-white/[0.02] transition"
                :class="ri === 0 ? 'border-t-2 border-white/10' : 'border-t border-white/5'"
              >
                <td class="sticky left-0 z-10 bg-[#08111b] px-3 py-2 border-r border-white/10">
                  <div v-if="ri === 0" class="text-[10px] uppercase tracking-widest text-white/25 mb-0.5">{{ sys.name }}</div>
                  <div class="text-th-muted font-medium truncate max-w-[13rem]">{{ row.refinery }}</div>
                </td>
                <td v-for="com in refineryYieldsPivot.commodities" :key="com" class="px-3 py-2 text-center">
                  <span
                    v-if="row.values[com] !== undefined"
                    class="font-semibold tabular-nums"
                    :class="{
                      'text-emerald-300': row.values[com] > 0,
                      'text-red-400':     row.values[com] < 0,
                      'text-white/25':    row.values[com] === 0,
                    }"
                  >{{ (row.values[com] > 0 ? '+' : '') + row.values[com].toFixed(1) + '%' }}</span>
                  <span v-else class="text-white/15">—</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div v-if="mining.loading.workOrders && !mining.workOrders.length" class="rounded-2xl border border-th-subtle bg-black/20 p-6 text-center text-xs text-th-muted">
    Chargement des work orders...
  </div>

  <div v-else-if="mining.errors.workOrders" class="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
    {{ mining.errors.workOrders }}
  </div>

  <div v-else-if="!mining.workOrders.length" class="rounded-2xl border border-dashed border-th-subtle bg-black/20 p-10 text-center">
    <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-2xl text-th-muted">⬡</div>
    <p class="mt-4 text-sm font-semibold text-th-primary">Aucun work order actif</p>
    <p class="mt-1 text-xs text-th-muted">Créez un nouveau WO pour lancer le suivi du raffinage.</p>
  </div>

  <div v-else class="space-y-3">
    <article
      v-for="wo in mining.sortedWorkOrders"
      :key="wo.id"
      class="rounded-2xl border p-4 transition-colors md:p-5"
      :class="wo.isReady
        ? 'border-emerald-500/30 bg-emerald-500/[0.05]'
        : isNearReady(wo.startedAt, wo.endAt, now)
          ? 'border-amber-400/30 bg-amber-400/[0.04]'
          : 'border-th-subtle bg-black/20'"
    >
      <div class="min-w-0 flex-1">
        <div class="flex justify-between">
          <div class="flex items-start gap-3">
            <div
              class="mt-1 h-3.5 w-3.5 rounded-full ring-4 ring-offset-0"
              :class="wo.isReady
                ? 'bg-emerald-300 ring-emerald-400/15'
                : isNearReady(wo.startedAt, wo.endAt, now)
                  ? 'bg-amber-300 ring-amber-300/15'
                  : 'bg-accent ring-accent/15'"
            />

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate text-sm font-semibold text-th-primary">{{ wo.refineryName ?? `Raffinerie #${wo.refineryPoiId}` }}</span>
                <span class="rounded-full border border-accent/20 bg-accent/[0.08] px-2 py-0.5 text-[11px] font-semibold text-accent">
                  {{ wo.methodLabel ?? mining.methodByKey(wo.method)?.label ?? wo.method }}
                </span>
                <span v-if="wo.durationSeconds ?? wo.endAt" class="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-th-muted">
                  ⏱ {{ wo.durationSeconds ? woDisplayDuration(wo.durationSeconds) : formatDuration(wo.startedAt, wo.endAt) }}
                  <span
                    v-if="wo.confidence"
                    class="text-xs cursor-help"
                    :class="confidenceBadgeClass(wo.confidence)"
                    :title="confidenceBadgeTitle(wo.confidence)"
                  >●</span>
                </span>
                <span v-if="wo.isReady" class="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Prêt
                </span>
                <span v-if="wo.notifyOnComplete && workOrderNotified(wo)" class="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[11px] font-semibold text-sky-200">
                  Notifié
                </span>
                <span v-else-if="wo.notifyOnComplete && wo.isReady" class="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                  Notification en attente
                </span>
              </div>

              <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-th-muted">
                <span>Démarré : {{ formatDateTime(wo.startedAt) }}</span>
                <span>Fin : {{ formatDateTime(wo.endAt) }}</span>
                <span v-if="refineryLocation(wo)">{{ refineryLocation(wo) }}</span>
                <span v-if="workOrderNotified(wo)">Notifié : {{ formatDateTime(wo.notifiedAt) }}</span>
              </div>
            </div>
          </div>

          <div class="flex shrink-0 items-start gap-2 self-start">
            <button
              v-if="wo.isReady"
              class="rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
              :disabled="completingId === wo.id"
              @click="completeWO(wo.id)"
            >
              {{ completingId === wo.id ? 'Récupération...' : 'Récupérer' }}
            </button>

            <template v-if="confirmDeleteId === wo.id">
              <button
                class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                @click="deleteWO(wo.id)"
              >Confirmer</button>
              <button
                class="rounded-xl border border-th-subtle bg-white/[0.04] px-3 py-2 text-xs text-th-muted transition hover:bg-white/[0.08] hover:text-th-primary"
                @click="confirmDeleteId = null"
              >Annuler</button>
            </template>

            <button
              v-else
              class="rounded-xl border border-th-subtle bg-white/[0.04] px-3 py-2 text-xs text-th-muted transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300"
              @click="confirmDeleteId = wo.id"
            >Supprimer</button>
          </div>
        </div>

        <div class="mt-4">
          <div class="mb-1.5 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-th-muted">
            <span>Progression</span>
            <span class="font-semibold normal-case tracking-normal"
              :class="wo.isReady
                ? 'text-emerald-300'
                : isNearReady(wo.startedAt, wo.endAt, now)
                  ? 'text-amber-300'
                  : 'text-th-primary'"
            >
              {{ wo.isReady ? 'Prêt à récupérer' : formatRemaining(wo.endAt, now) }}
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              class="h-full rounded-full transition-all duration-1000"
              :class="wo.isReady
                ? 'bg-emerald-400'
                : isNearReady(wo.startedAt, wo.endAt, now)
                  ? 'bg-amber-300'
                  : 'bg-accent'"
              :style="{ width: `${progressPct(wo.startedAt, wo.endAt, now)}%` }"
            />
          </div>
        </div>

        <div v-if="wo.lines?.length" class="mt-4 overflow-hidden rounded-xl border border-white/8 bg-black/15">
          <div class="grid grid-cols-[minmax(0,1.5fr)_5.5rem_5.5rem_4rem_6rem] gap-2 border-b border-white/8 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-th-muted">
            <span>Minerai</span>
            <span class="text-center">Qualité</span>
            <span class="text-center">cSCU brut</span>
            <span class="text-center">Yield</span>
            <span class="text-center">cSCU raff.</span>
          </div>

          <div
            v-for="line in wo.lines"
            :key="line.id"
            class="grid grid-cols-[minmax(0,1.5fr)_5.5rem_5.5rem_4rem_6rem] gap-2 border-b border-white/5 px-3 py-2 text-sm last:border-b-0"
          >
            <span class="truncate text-th-primary">{{ line.commodityName }}</span>
            <span class="text-center text-th-primary">{{ line.quality }}</span>
            <span class="text-center text-th-primary">{{ Math.round(getLineInput(line) * 100) }} cSCU</span>
            <span class="text-center text-th-muted">{{ line.yieldPercent }}%</span>
            <span class="text-center text-accent">{{ Math.round(getLineOutput(line, wo.method) * 100) }} cSCU</span>
          </div>
        </div>

        <p v-if="wo.notes" class="mt-3 text-xs italic text-th-muted">{{ wo.notes }}</p>
      </div>
    </article>
  </div>

  
</template>
