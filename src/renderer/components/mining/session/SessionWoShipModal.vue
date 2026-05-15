<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useMiningStore } from '@renderer/stores/mining'
import { useMineralDropdown } from '@renderer/composables/useMineralDropdown'

const mining = useMiningStore()
const {
  mineralSearch, setMineralSearch, filteredMineralsForRow,
  openMineralDropdown, clearMineral,
} = useMineralDropdown()

// ── Types ─────────────────────────────────────────────────────────────────────
interface WoShipFormState {
  show: boolean; groupKey: string | null; shipName: string | null; members: any[]
  selectedOwnerId: number | null; method: string; methodQuery: string
  methodSearch: string; methodOpen: boolean; methodActive: number
  notes: string; notifyOnComplete: boolean
  durationOverrideSeconds: number; durationInput: string
  previewSeconds: number | null; previewHasConfig: boolean | null; previewLoading: boolean
  refineryPoiId: number | null; refineryQuery: string; refinerySearch: string
  refineryOpen: boolean; refineryActive: number
  minerals: Array<{ commodityId: number | null; commodityName: string; scuInput: string; _query?: string; _name?: string; _search?: string; _open?: boolean; _hi?: number }>
  saving: boolean; error: string | null
}

const woShipForm = ref<WoShipFormState | null>(null)
let woPreviewTimer: ReturnType<typeof setTimeout> | null = null

const woRefinerySearchInput = ref<HTMLInputElement | null>(null)
const woMethodSearchInput   = ref<HTMLInputElement | null>(null)
const woRefineryItems = ref<Array<HTMLElement | null>>([])
const woMethodItems   = ref<Array<HTMLElement | null>>([])

// ── Helpers ───────────────────────────────────────────────────────────────────
function woSetRefineryItem(i: number, el: Element | null) { woRefineryItems.value[i] = el instanceof HTMLElement ? el : null }
function woSetMethodItem  (i: number, el: Element | null) { woMethodItems.value[i]   = el instanceof HTMLElement ? el : null }
function woClampIndex(i: number, len: number) { if (len <= 0) return -1; if (i < 0) return 0; if (i >= len) return len - 1; return i }

function woScrollRefineryActive() { nextTick(() => { const el = woRefineryItems.value[woShipForm.value?.refineryActive ?? -1]; el?.scrollIntoView?.({ block: 'nearest' }) }) }
function woScrollMethodActive()   { nextTick(() => { const el = woMethodItems.value[woShipForm.value?.methodActive ?? -1];    el?.scrollIntoView?.({ block: 'nearest' }) }) }

function woScuToCscuInput(scu: number) { const cscu = Math.round((Number(scu) || 0) * 100); return cscu > 0 ? String(cscu) : '' }
function woDefaultMethod() { const m = mining.refineryMethods[0]; const key = m?.method ?? 'dinyx_solventation'; return { key, label: m?.label ?? key } }

const filteredWoRefineries = computed(() => {
  if (!woShipForm.value) return []
  const q = woShipForm.value.refinerySearch.trim().toLowerCase()
  if (!q) return mining.refineries.slice(0, 20)
  return mining.refineries.filter((r) => [r.name, r.systemName, r.locationName].some((v) => String(v ?? '').toLowerCase().includes(q))).slice(0, 20)
})
const filteredWoMethods = computed(() => {
  if (!woShipForm.value) return []
  const q = woShipForm.value.methodSearch.trim().toLowerCase()
  if (!q) return mining.refineryMethods.slice(0, 20)
  return mining.refineryMethods.filter((m) => [m.label, m.method].some((v) => String(v ?? '').toLowerCase().includes(q))).slice(0, 20)
})
watch(filteredWoRefineries, (list) => { const f = woShipForm.value; if (f?.refineryOpen) f.refineryActive = list.length ? woClampIndex(f.refineryActive, list.length) : -1 })
watch(filteredWoMethods,    (list) => { const f = woShipForm.value; if (f?.methodOpen)   f.methodActive   = list.length ? woClampIndex(f.methodActive,   list.length) : -1 })

function woGetLineInputCscu(line: { scuInput?: number | string }) { return Math.trunc(Number(line.scuInput ?? 0) || 0) }
function woGetMethodYieldFactor(k: string) { const m = mining.methodByKey(k) as any; if (!m) return 1; return typeof m.yieldMultiplier === 'number' ? m.yieldMultiplier : typeof m.yieldPercent === 'number' ? m.yieldPercent / 100 : 1 }
function woGetMethodYieldPct(k: string) { const m = mining.methodByKey(k) as any; if (!m) return null; if (typeof m.yieldPercent === 'number') return Math.round(m.yieldPercent * 10) / 10; if (typeof m.yieldMultiplier === 'number') return Math.round(m.yieldMultiplier * 1000) / 10; return null }
function woGetMethodDurationMultiplier(k: string) { const m = mining.methodByKey(k) as any; if (!m) return 1; return typeof m.durationMultiplier === 'number' ? m.durationMultiplier : typeof m.durationFactor === 'number' ? m.durationFactor : 1 }
function woGetMethodCostPerScu(k: string) { const m = mining.methodByKey(k) as any; return typeof m?.costPerScuInput === 'number' ? m.costPerScuInput : null }
function woCurrentYieldPct() { return woShipForm.value ? woGetMethodYieldPct(woShipForm.value.method) : null }

function woPreviewLinesForTime() {
  if (!woShipForm.value) return []
  return woShipForm.value.minerals.filter((l) => l.commodityId && woGetLineInputCscu(l) > 0).map((l) => ({ commodityId: Number(l.commodityId), scuInput: Math.max(1, woGetLineInputCscu(l)) / 100 }))
}
function woHasDurationPreviewInputs() { return Boolean(woShipForm.value?.method && woPreviewLinesForTime().length > 0) }
function woPreviewCostAuec() { if (!woShipForm.value) return null; const cost = woGetMethodCostPerScu(woShipForm.value.method); if (cost == null) return null; return woShipForm.value.minerals.reduce((t, l) => t + (woGetLineInputCscu(l) / 100) * cost, 0) }
function woTotalValidCscuInput() { if (!woShipForm.value) return 0; return woShipForm.value.minerals.reduce((t, l) => l.commodityId && woGetLineInputCscu(l) > 0 ? t + woGetLineInputCscu(l) : t, 0) }
function woEffectiveDurationSeconds() { if (!woShipForm.value) return null; if (woShipForm.value.durationOverrideSeconds > 0) return Math.trunc(woShipForm.value.durationOverrideSeconds); if (woShipForm.value.previewSeconds != null && woShipForm.value.previewSeconds > 0) return Math.trunc(woShipForm.value.previewSeconds); return null }
function woCanShowDurationBlock() { return Boolean((woShipForm.value?.durationOverrideSeconds ?? 0) > 0 || woHasDurationPreviewInputs()) }
function woDurationBadgeLabel() { const f = woShipForm.value; if (!f) return 'en attente'; if (f.durationOverrideSeconds > 0) return 'manuel'; if (f.previewLoading) return 'calcul…'; if (!woHasDurationPreviewInputs()) return 'en attente'; if (f.previewHasConfig === false) return 'imprécis'; if (f.previewSeconds != null) return 'calculé'; return 'en attente' }
function woDurationBadgeClass() { const f = woShipForm.value; if (!f) return 'border-white/8 bg-white/3 text-th-muted'; if (f.durationOverrideSeconds > 0) return 'border-accent/25 bg-accent/8 text-accent'; if (f.previewHasConfig === false) return 'border-amber-400/25 bg-amber-400/10 text-amber-300'; if (f.previewSeconds != null) return 'border-sky-400/25 bg-sky-400/8 text-sky-300'; return 'border-white/8 bg-white/3 text-th-muted' }
function woModalDisplayDuration(s: number) { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60); return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` }
function woDurationDisplayLabel() { if (woShipForm.value?.previewLoading && (woShipForm.value?.durationOverrideSeconds ?? 0) <= 0) return 'calcul…'; const s = woEffectiveDurationSeconds(); return s != null ? woModalDisplayDuration(s) : '—' }
function woParseDurationStr(str: string) { const parts = str.split(':').map(Number); if (parts.length === 3 && parts.every((n) => !isNaN(n))) return parts[0]*3600+parts[1]*60+parts[2]; if (parts.length === 2 && parts.every((n) => !isNaN(n))) return parts[0]*3600+parts[1]*60; const n = Number(str); return !isNaN(n) && n > 0 ? n * 60 : 0 }
function woEnterDurationEdit() { if (!woShipForm.value) return; const s = woEffectiveDurationSeconds(); const next = s && s > 0 ? s : 60; woShipForm.value.durationOverrideSeconds = next; woShipForm.value.durationInput = woModalDisplayDuration(next) }
function woHandleDurationInput(e: Event) { if (!woShipForm.value) return; woShipForm.value.durationInput = (e.target as HTMLInputElement).value; const p = woParseDurationStr(woShipForm.value.durationInput); if (p > 0) woShipForm.value.durationOverrideSeconds = p }
function woNormalizeDurationInput() { if (!woShipForm.value) return; const p = woParseDurationStr(woShipForm.value.durationInput); if (p > 0) { woShipForm.value.durationOverrideSeconds = p; woShipForm.value.durationInput = woModalDisplayDuration(p) } else if (!woShipForm.value.durationInput.trim()) { woShipForm.value.durationOverrideSeconds = 0 } }
function woResetDuration() { if (!woShipForm.value) return; woShipForm.value.durationOverrideSeconds = 0; woShipForm.value.durationInput = '' }
function woPreviewCscuOutput(v: string | number) { if (!woShipForm.value) return '—'; const cscu = woGetLineInputCscu({ scuInput: v }); if (!cscu || !woShipForm.value.method) return '—'; return String(Math.round(cscu * woGetMethodYieldFactor(woShipForm.value.method))) }
function woRefineryLocationLabel(r: any) { return [r.systemName, r.locationName].filter(Boolean).join(' — ') }
function woRefineryDisplayNameById(id: any) { if (id == null || id === '') return ''; const r = mining.refineryById?.(id) ?? mining.refineries.find((x: any) => String(x.id) === String(id)); if (!r) return ''; return r.systemName ? `${r.name} (${r.systemName})` : r.name }
function woMethodDisplayLabel(k: string | null | undefined) { if (!k) return ''; const m = mining.methodByKey(k); return m?.label ?? k }
function woMineralDisplayName(line: any) { return String(line?.commodityName ?? '').trim() }
function woMineralMetaLabel(m: any) { return String(m.code ?? m.signal ?? '') }
function woBlockNonInteger(e: KeyboardEvent) { if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) e.preventDefault() }
function woClampCscuInput(e: Event, line: any) { const v = (e.target as HTMLInputElement).value; line.scuInput = v === '' ? '' : String(Math.max(1, Math.trunc(Number(v) || 0))) }

function woSchedulePreviewTime() {
  if (woPreviewTimer) clearTimeout(woPreviewTimer)
  const f = woShipForm.value
  if (!f || f.durationOverrideSeconds > 0) { if (f) f.previewLoading = false; return }
  const method = f.method; const lines = woPreviewLinesForTime()
  if (!method || lines.length === 0) { f.previewSeconds = null; f.previewHasConfig = null; f.previewLoading = false; return }
  f.previewLoading = true
  woPreviewTimer = setTimeout(async () => {
    const cur = woShipForm.value; if (!cur) return
    try { const d = await mining.previewRefineryTime(method, lines); cur.previewHasConfig = Boolean(d?.hasConfig); const s = Number(d?.durationSeconds ?? 0); cur.previewSeconds = cur.previewHasConfig && isFinite(s) && s > 0 ? Math.trunc(s) : null } catch { cur.previewHasConfig = false; cur.previewSeconds = null } finally { cur.previewLoading = false }
  }, 300)
}

function woOpenRefineryList() {
  const f = woShipForm.value; if (!f) return
  f.refineryOpen = true; f.refinerySearch = ''
  nextTick(() => { const idx = filteredWoRefineries.value.findIndex((r) => String(r.id) === String(f.refineryPoiId)); f.refineryActive = idx >= 0 ? idx : (filteredWoRefineries.value.length ? 0 : -1); woRefinerySearchInput.value?.focus(); woScrollRefineryActive() })
}
function woOpenMethodList() {
  const f = woShipForm.value; if (!f) return
  f.methodOpen = true; f.methodSearch = ''
  nextTick(() => { const idx = filteredWoMethods.value.findIndex((m) => String(m.method) === String(f.method)); f.methodActive = idx >= 0 ? idx : (filteredWoMethods.value.length ? 0 : -1); woMethodSearchInput.value?.focus(); woScrollMethodActive() })
}
function woMoveRefineryActive(offset: number) { const f = woShipForm.value; if (!f) return; const len = filteredWoRefineries.value.length; if (!len) return; f.refineryActive = woClampIndex((f.refineryActive < 0 ? (offset > 0 ? -1 : len) : f.refineryActive) + offset, len); woScrollRefineryActive() }
function woMoveMethodActive  (offset: number) { const f = woShipForm.value; if (!f) return; const len = filteredWoMethods.value.length;    if (!len) return; f.methodActive   = woClampIndex((f.methodActive   < 0 ? (offset > 0 ? -1 : len) : f.methodActive)   + offset, len); woScrollMethodActive()   }
function woRefineryKeydown(e: KeyboardEvent) { const f = woShipForm.value; if (!f) return; if (!f.refineryOpen && ['ArrowDown','ArrowUp','Enter'].includes(e.key)) { e.preventDefault(); woOpenRefineryList(); return } if (e.key==='ArrowDown'){e.preventDefault();woMoveRefineryActive(1)}else if(e.key==='ArrowUp'){e.preventDefault();woMoveRefineryActive(-1)}else if(e.key==='Enter'){e.preventDefault();const item=filteredWoRefineries.value[f.refineryActive];if(item)woShipSelectRefinery(item)}else if(e.key==='Escape'){f.refineryOpen=false} }
function woMethodKeydown   (e: KeyboardEvent) { const f = woShipForm.value; if (!f) return; if (!f.methodOpen   && ['ArrowDown','ArrowUp','Enter'].includes(e.key)) { e.preventDefault(); woOpenMethodList();    return } if (e.key==='ArrowDown'){e.preventDefault();woMoveMethodActive(1)}  else if(e.key==='ArrowUp'){e.preventDefault();woMoveMethodActive(-1)}  else if(e.key==='Enter'){e.preventDefault();const item=filteredWoMethods.value[f.methodActive];if(item)woSelectMethod(item)}     else if(e.key==='Escape'){f.methodOpen=false}   }
function woHandleRefinerySearchInput() { const f = woShipForm.value; if (!f) return; f.refineryOpen = true; f.refineryActive = filteredWoRefineries.value.length ? 0 : -1 }
function woHandleMethodSearchInput()   { const f = woShipForm.value; if (!f) return; f.methodOpen   = true; f.methodActive   = filteredWoMethods.value.length    ? 0 : -1 }
function woShipSelectRefinery(r: any) { if (!woShipForm.value) return; woShipForm.value.refineryPoiId=r.id; woShipForm.value.refineryQuery=r.systemName?`${r.name} (${r.systemName})`:r.name; woShipForm.value.refinerySearch=''; woShipForm.value.refineryOpen=false; woShipForm.value.refineryActive=-1 }
function woShipClearRefinery() { if (!woShipForm.value) return; woShipForm.value.refineryPoiId=null; woShipForm.value.refineryQuery=''; woShipForm.value.refinerySearch=''; woShipForm.value.refineryOpen=false; woShipForm.value.refineryActive=-1 }
function woSelectMethod(m: any) { if (!woShipForm.value) return; woShipForm.value.method=m.method; woShipForm.value.methodQuery=m.label??m.method; woShipForm.value.methodSearch=''; woShipForm.value.methodOpen=false; woShipForm.value.methodActive=-1 }
function woClearMethod() { if (!woShipForm.value) return; woShipForm.value.method=''; woShipForm.value.methodQuery=''; woShipForm.value.methodSearch=''; woShipForm.value.methodOpen=false; woShipForm.value.methodActive=-1 }
function addWoShipMineralLine() { woShipForm.value?.minerals.push({ commodityId:null, commodityName:'', scuInput:'', _query:'', _search:'', _open:false, _hi:-1 } as any) }
function removeWoShipMineralLine(i: number) { woShipForm.value?.minerals.splice(i, 1); woSchedulePreviewTime() }
function woClearMineral(line: any) { clearMineral(line); woSchedulePreviewTime() }
function woShipSelectMineral(m: any, min: any) { m.commodityId=min.id; m.commodityName=min.name; m._query=min.name; m._name=min.name; m._search=''; m._open=false; m._hi=-1; woSchedulePreviewTime() }
function woMineralDropdownKeydown(e: KeyboardEvent, row: any) { const list=filteredMineralsForRow(row); if(e.key==='ArrowDown'){e.preventDefault();row._hi=Math.min(Number(row._hi??-1)+1,list.length-1)}else if(e.key==='ArrowUp'){e.preventDefault();row._hi=Math.max(Number(row._hi??0)-1,0)}else if(e.key==='Enter'){e.preventDefault();const item=list[Number(row._hi??-1)]??list[0];if(item)woShipSelectMineral(row,item)}else if(e.key==='Escape'){row._open=false}; nextTick(()=>{const root=(e.currentTarget as HTMLElement|null)?.closest('.relative');const item=root?.querySelectorAll<HTMLElement>('.mineral-dropdown-item')?.[Number(row._hi??-1)];item?.scrollIntoView({block:'nearest'})}) }
function blurWoRefineryDrop() { setTimeout(() => { if (woShipForm.value) woShipForm.value.refineryOpen = false }, 150) }
function blurWoMethodDrop()   { setTimeout(() => { if (woShipForm.value) woShipForm.value.methodOpen   = false }, 150) }
function blurWoMineralDrop(m: any) { setTimeout(() => { m._open = false }, 150) }

function woFormValid() { if (!woShipForm.value) return false; return Boolean(woShipForm.value.refineryPoiId && woShipForm.value.method && woShipForm.value.minerals.some((m) => m.commodityId && woGetLineInputCscu(m) > 0)) }

async function submitWoShipForm() {
  if (!woShipForm.value) return
  const f = woShipForm.value
  if (!woFormValid()) { f.error = 'Raffinerie, méthode et au moins un minerai requis.'; return }
  f.saving = true; f.error = null
  try {
    await mining.createWorkOrder({ refineryPoiId: String(f.refineryPoiId), method: f.method, startedAt: null, notes: f.notes || null, notifyOnComplete: f.notifyOnComplete, durationSeconds: woEffectiveDurationSeconds(), ownerId: f.selectedOwnerId ?? undefined, lines: f.minerals.filter((m) => m.commodityId && woGetLineInputCscu(m) > 0).map((m) => ({ commodityId: m.commodityId!, scuInput: Math.max(1, woGetLineInputCscu(m)) / 100 })) } as any)
    woShipForm.value = null
  } catch (err: any) { f.error = err?.message ?? 'Erreur création work order.'; f.saving = false }
}

// ── Exposed API ───────────────────────────────────────────────────────────────
function openForGroup(group: any) {
  const memberUserIds = new Set(group.members.map((m: any) => m.userId).filter(Boolean))
  const mineralMap = new Map<number, { name: string; scu: number }>()
  for (const rock of (mining.sessionActive?.rocks ?? [])) {
    if (!rock.claimedByUserId || !memberUserIds.has(rock.claimedByUserId)) continue
    if (!['completed', 'extraction'].includes(rock.status)) continue
    for (const m of (rock.minerals ?? [])) {
      if (m.phase !== 'actual' || !m.commodityId || !m.quantityScuActual) continue
      const cur = mineralMap.get(m.commodityId)
      if (cur) cur.scu += Number(m.quantityScuActual)
      else mineralMap.set(m.commodityId, { name: m.commodityName ?? '', scu: Number(m.quantityScuActual) })
    }
  }
  const captain = group.members.find((m: any) => m.isCaptain || m.rank === 'captain') ?? group.members[0]
  const def = woDefaultMethod()
  woShipForm.value = { show:true, groupKey:group.key??null, shipName:group.shipName??null, members:group.members, selectedOwnerId:captain?.userId??null, method:def.key, methodQuery:def.label, methodSearch:'', methodOpen:false, methodActive:-1, notes:'', notifyOnComplete:true, durationOverrideSeconds:0, durationInput:'', previewSeconds:null, previewHasConfig:null, previewLoading:false, refineryPoiId:mining.sessionActive?.defaultRefineryId??null, refineryQuery:mining.sessionActive?.defaultRefineryName??'', refinerySearch:'', refineryOpen:false, refineryActive:-1, minerals:mineralMap.size>0?Array.from(mineralMap.entries()).map(([id,d])=>({commodityId:id,commodityName:d.name,scuInput:woScuToCscuInput(d.scu),_query:d.name,_name:d.name,_search:'',_open:false,_hi:-1}as any)):[{commodityId:null,commodityName:'',scuInput:'',_query:'',_search:'',_open:false,_hi:-1}as any], saving:false, error:null }
}
function openForSupport() {
  const me = mining.myParticipant; const def = woDefaultMethod()
  woShipForm.value = { show:true, groupKey:null, shipName:null, members:me?[me]:[], selectedOwnerId:me?.userId??null, method:def.key, methodQuery:def.label, methodSearch:'', methodOpen:false, methodActive:-1, notes:'', notifyOnComplete:true, durationOverrideSeconds:0, durationInput:'', previewSeconds:null, previewHasConfig:null, previewLoading:false, refineryPoiId:mining.sessionActive?.defaultRefineryId??null, refineryQuery:mining.sessionActive?.defaultRefineryName??'', refinerySearch:'', refineryOpen:false, refineryActive:-1, minerals:[{commodityId:null,commodityName:'',scuInput:'',_query:'',_search:'',_open:false,_hi:-1}as any], saving:false, error:null }
}
defineExpose({ openForGroup, openForSupport })
</script>

<template>
  <div v-if="woShipForm?.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" @click.self="woShipForm!.show = false">
    <div class="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-th-subtle bg-[#0d1117] p-4 shadow-2xl md:p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-widest text-accent/70">Work order</p>
          <h3 class="text-base font-semibold text-th-primary">Envoyer en raffinerie</h3>
          <p class="mt-0.5 text-xs text-th-muted">Même saisie que l'onglet Raffinerie, pré-remplie depuis les collectes du groupe.</p>
        </div>
        <button type="button" @click="woShipForm!.show = false" class="rounded-lg px-2 py-1 text-lg leading-none text-th-muted transition hover:bg-white/5 hover:text-th-primary">✕</button>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-th-muted">Propriétaire du work order</label>
          <select v-model.number="woShipForm!.selectedOwnerId" class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2.5 text-sm text-th-primary focus:border-accent/40 focus:outline-none">
            <option v-for="m in woShipForm!.members" :key="m.userId" :value="m.userId">{{ m.username }}{{ m.isCaptain ? ' 👑' : m.isSubCaptain ? ' ⚓' : '' }}</option>
          </select>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-th-muted">Origine session</div>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-th-primary">
            <span v-if="woShipForm!.shipName" class="rounded-full border border-accent/20 bg-accent/[0.08] px-2 py-1 text-accent">{{ woShipForm!.shipName }}</span>
            <span class="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">{{ woShipForm!.members.length }} membre{{ woShipForm!.members.length > 1 ? 's' : '' }}</span>
            <span v-if="woTotalValidCscuInput() > 0" class="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">{{ woTotalValidCscuInput() }} cSCU brut</span>
          </div>
        </div>
      </div>

      <div class="mt-5 grid gap-5 md:grid-cols-2">
        <!-- Raffinerie -->
        <div>
          <label class="mb-1.5 block text-xs font-medium text-th-muted">Raffinerie</label>
          <div class="relative">
            <input :value="woShipForm!.refineryPoiId ? woRefineryDisplayNameById(woShipForm!.refineryPoiId) : ''" autocomplete="off" readonly
              class="w-full cursor-pointer rounded-xl border border-th-subtle bg-black/30 px-3 py-2.5 pr-9 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
              placeholder="Sélectionnez une raffinerie..." type="text"
              @click="woOpenRefineryList()" @focus="woOpenRefineryList()" @keydown="woRefineryKeydown($event)" />
            <button v-if="woShipForm!.refineryPoiId" class="absolute right-3 top-1/2 -translate-y-1/2 text-th-muted transition hover:text-rose-300" type="button" @mousedown.prevent="woShipClearRefinery()">×</button>
            <div v-if="woShipForm!.refineryOpen" class="absolute inset-x-0 top-full z-50 mt-2 max-h-64 overflow-hidden rounded-xl border border-th-subtle bg-[#05080d]/95 shadow-2xl backdrop-blur-md refinery-dropdown-list">
              <div class="p-2"><input ref="woRefinerySearchInput" v-model="woShipForm!.refinerySearch" autocomplete="off" class="sticky top-0 z-10 w-full rounded-lg border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none" placeholder="Rechercher une raffinerie..." type="text" @blur="blurWoRefineryDrop()" @focus="woShipForm!.refineryOpen=true" @input="woHandleRefinerySearchInput()" @keydown="woRefineryKeydown($event)" /></div>
              <div v-if="filteredWoRefineries.length" class="max-h-52 overflow-y-auto p-1.5">
                <button v-for="(r, idx) in filteredWoRefineries" :key="r.id" :ref="(el) => woSetRefineryItem(idx, el as Element|null)" :class="['block w-full rounded-lg border px-3 py-2 text-left transition', woShipForm!.refineryActive===idx?'border-accent/25 bg-accent/[0.08] text-th-primary':'border-transparent hover:border-white/10 hover:bg-white/5']" type="button" @mouseenter="woShipForm!.refineryActive=idx" @mousedown.prevent="woShipSelectRefinery(r)">
                  <div class="text-sm font-medium text-th-primary">{{ r.name }}</div>
                  <div v-if="woRefineryLocationLabel(r)" class="mt-0.5 text-[11px] text-th-muted">{{ woRefineryLocationLabel(r) }}</div>
                </button>
              </div>
              <div v-else class="p-3 text-xs text-th-muted">Aucune raffinerie trouvée.</div>
            </div>
          </div>
        </div>
        <!-- Méthode -->
        <div>
          <label class="mb-1.5 block text-xs font-medium text-th-muted">Méthode</label>
          <div class="relative">
            <input :value="woShipForm!.method ? woMethodDisplayLabel(woShipForm!.method) : ''" autocomplete="off" readonly
              class="w-full cursor-pointer rounded-xl border border-th-subtle bg-black/30 px-3 py-2.5 pr-9 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
              placeholder="Sélectionnez une méthode..." type="text"
              @click="woOpenMethodList()" @focus="woOpenMethodList()" @keydown="woMethodKeydown($event)" />
            <button v-if="woShipForm!.method" class="absolute right-3 top-1/2 -translate-y-1/2 text-th-muted transition hover:text-rose-300" type="button" @mousedown.prevent="woClearMethod()">×</button>
            <div v-if="woShipForm!.methodOpen" class="absolute inset-x-0 top-full z-50 mt-2 max-h-72 overflow-hidden rounded-xl border border-th-subtle bg-[#05080d]/95 shadow-2xl backdrop-blur-md method-dropdown-list">
              <div class="p-2"><input ref="woMethodSearchInput" v-model="woShipForm!.methodSearch" autocomplete="off" class="sticky top-0 z-10 w-full rounded-lg border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none" placeholder="Rechercher une méthode..." type="text" @blur="blurWoMethodDrop()" @focus="woShipForm!.methodOpen=true" @input="woHandleMethodSearchInput()" @keydown="woMethodKeydown($event)" /></div>
              <div v-if="filteredWoMethods.length" class="max-h-56 overflow-y-auto p-1.5">
                <button v-for="(m, idx) in filteredWoMethods" :key="m.method" :ref="(el) => woSetMethodItem(idx, el as Element|null)" :class="['block w-full rounded-lg border px-3 py-2 text-left transition', woShipForm!.methodActive===idx?'border-accent/25 bg-accent/[0.08] text-th-primary':'border-transparent hover:border-white/10 hover:bg-white/5']" type="button" @mouseenter="woShipForm!.methodActive=idx" @mousedown.prevent="woSelectMethod(m)">
                  <div class="flex items-center justify-between gap-2"><span class="text-sm font-medium text-th-primary">{{ m.label ?? m.method }}</span><span v-if="woGetMethodYieldPct(m.method)!=null" class="rounded-full bg-accent/[0.1] px-2 py-0.5 text-[11px] font-semibold text-accent">{{ woGetMethodYieldPct(m.method) }}%</span></div>
                  <div class="mt-1 flex flex-wrap gap-3 text-[11px] text-th-muted"><span>Durée ×{{ woGetMethodDurationMultiplier(m.method) }}</span><span v-if="woGetMethodCostPerScu(m.method)!=null">{{ woGetMethodCostPerScu(m.method) }} aUEC/SCU</span></div>
                </button>
              </div>
              <div v-else class="p-3 text-xs text-th-muted">Aucune méthode trouvée.</div>
            </div>
          </div>
          <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-th-muted">
            <span v-if="woCurrentYieldPct()!=null" class="rounded-full border border-accent/20 bg-accent/[0.08] px-2 py-1 text-accent">Rendement {{ woCurrentYieldPct() }}%</span>
            <span v-if="woShipForm!.method" class="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">Durée ×{{ woGetMethodDurationMultiplier(woShipForm!.method) }}</span>
            <span v-if="woPreviewCostAuec()!=null" class="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">{{ woPreviewCostAuec()?.toLocaleString('fr-FR') }} aUEC</span>
          </div>
        </div>
      </div>

      <div class="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-th-muted">Notes <span class="font-normal">(optionnel)</span></label>
          <input v-model="woShipForm!.notes" class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2.5 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none" placeholder="Ex : Quantanium run Pyro" type="text" />
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-th-muted">Notification</label>
          <label class="flex cursor-pointer select-none items-start gap-3.5 rounded-xl border px-4 py-3 transition" :class="woShipForm!.notifyOnComplete ? 'border-accent/35 bg-accent/[0.04]' : 'border-th-subtle hover:border-white/20'">
            <input v-model="woShipForm!.notifyOnComplete" class="sr-only" type="checkbox">
            <div class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition" :class="woShipForm!.notifyOnComplete ? 'border-accent/60 bg-accent/25' : 'border-white/20 bg-white/5'">
              <svg v-if="woShipForm!.notifyOnComplete" class="h-3 w-3 text-accent" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            </div>
            <div><div class="text-sm text-th-primary">MP à la fin du WO</div><div class="mt-1 text-xs text-th-muted">Reçois un message privé quand le raffinage est prêt</div></div>
          </label>
        </div>
      </div>

      <!-- Minerais -->
      <div class="mt-5">
        <div class="mb-2 flex items-center justify-between gap-3">
          <label class="text-xs font-medium text-th-muted">Minerais récupérés</label>
          <button class="rounded-lg border border-accent/20 bg-accent/[0.08] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent transition hover:bg-accent/15" type="button" @click="addWoShipMineralLine()">+ Minerai</button>
        </div>
        <div v-if="woShipForm!.minerals.length" class="hidden grid-cols-[minmax(0,1.5fr)_6.5rem_5.5rem_2rem] gap-2 px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-th-muted md:grid"><span>Minerai</span><span class="text-center">cSCU brut</span><span class="text-center">Yields ↗</span><span></span></div>
        <div class="space-y-2">
          <div v-for="(line, index) in woShipForm!.minerals" :key="index" class="grid gap-2 rounded-xl border border-th-subtle bg-black/20 p-2 md:grid-cols-[minmax(0,1.5fr)_6.5rem_5.5rem_2rem] md:items-center">
            <div class="relative">
              <input :value="woMineralDisplayName(line)" readonly autocomplete="off" class="w-full cursor-pointer rounded-lg border border-th-subtle bg-black/30 px-3 py-2 pr-8 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none" :placeholder="`Minerai ${index + 1}`" @click="openMineralDropdown(line, $event)" @focus="openMineralDropdown(line, $event)" @keydown="woMineralDropdownKeydown($event, line)" />
              <button v-if="line.commodityId" class="absolute right-3 top-1/2 -translate-y-1/2 text-th-muted transition hover:text-rose-300" type="button" @click="woClearMineral(line)">×</button>
              <div v-if="line._open" class="absolute inset-x-0 top-full z-50 mt-2 h-60 overflow-hidden rounded-xl border border-th-subtle bg-[#05080d]/95 shadow-2xl backdrop-blur-md mineral-dropdown-list">
                <div class="p-2"><input :value="mineralSearch(line)" type="text" autocomplete="off" placeholder="Rechercher un minerai..." class="mineral-dropdown-search sticky top-0 z-10 w-full rounded-t-xl border-b border-white/10 bg-[#05080d]/95 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:outline-none" @input="setMineralSearch(line, $event)" @blur="blurWoMineralDrop(line)" @keydown="woMineralDropdownKeydown($event, line)" /></div>
                <div v-if="filteredMineralsForRow(line).length" class="max-h-44 overflow-y-auto p-1.5 space-y-0.5">
                  <button v-for="(min, mi) in filteredMineralsForRow(line)" :key="min.id" class="mineral-dropdown-item flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition" :class="mi===((line as any)._hi??-1)?'border-accent/25 bg-accent/10 text-accent':'border-transparent text-th-primary hover:border-white/10 hover:bg-white/5'" type="button" @mousedown.prevent="woShipSelectMineral(line, min)">
                    <span class="text-sm">{{ min.name }}</span><span v-if="woMineralMetaLabel(min as any)" class="text-[11px] text-th-muted">{{ woMineralMetaLabel(min as any) }}</span>
                  </button>
                </div>
                <div v-else class="p-3 text-xs text-th-muted">Aucun minerai trouvé.</div>
              </div>
            </div>
            <input v-model="line.scuInput" class="w-full rounded-lg border border-th-subtle bg-black/30 px-3 py-2 text-center text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none" inputmode="numeric" min="1" pattern="[0-9]*" placeholder="cSCU" step="1" type="number" @keydown="woBlockNonInteger($event)" @input="woClampCscuInput($event, line)" />
            <div class="text-center font-mono text-sm" :class="line.scuInput && Number(line.scuInput)>0 && line.commodityId ? 'text-accent' : 'text-th-muted/40'">{{ woPreviewCscuOutput(line.scuInput) }}</div>
            <button class="justify-self-end rounded-lg px-2 py-1 text-lg leading-none text-th-muted transition hover:bg-rose-500/10 hover:text-rose-300" type="button" @click="removeWoShipMineralLine(index)">×</button>
          </div>
        </div>
        <p v-if="!woShipForm!.minerals.length" class="mt-2 text-xs italic text-th-muted">Ajoutez au moins un minerai pour créer le work order.</p>
      </div>

      <!-- Durée -->
      <div v-if="woCanShowDurationBlock()" class="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-black/20 px-4 py-2.5" :class="woShipForm!.durationOverrideSeconds>0?'border-accent/25':(woShipForm!.previewHasConfig===false?'border-amber-400/20':'border-th-subtle')">
        <div class="flex shrink-0 items-center gap-2"><span class="text-xs font-medium text-th-muted">Durée</span><span class="rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-widest" :class="woDurationBadgeClass()">{{ woDurationBadgeLabel() }}</span></div>
        <div v-if="woShipForm!.previewHasConfig===false && woShipForm!.durationOverrideSeconds===0" class="w-full text-xs text-amber-300 md:order-last" style="font-family:'Share Tech Mono',monospace;letter-spacing:0.03em">⚠ Calcul incomplet — coefficient ou base temps manquante.</div>
        <div class="flex flex-1 items-center justify-end gap-2">
          <template v-if="woShipForm!.durationOverrideSeconds===0">
            <button type="button" class="font-bold tabular-nums text-accent transition hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-45" style="font-family:'Share Tech Mono',monospace;font-size:1.1rem;letter-spacing:.05em" :disabled="!woHasDurationPreviewInputs()" @click="woEnterDurationEdit()">{{ woDurationDisplayLabel() }}</button>
          </template>
          <template v-else>
            <input v-model="woShipForm!.durationInput" type="text" inputmode="numeric" placeholder="0:00:00" maxlength="9" class="w-28 border-0 border-b border-accent/30 bg-transparent text-right font-bold text-accent tabular-nums focus:outline-none" style="font-family:'Share Tech Mono',monospace;font-size:1.1rem;letter-spacing:.05em" @input="woHandleDurationInput($event)" @blur="woNormalizeDurationInput()" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
            <button type="button" class="rounded border border-white/10 px-2 py-1 text-[0.65rem] text-th-muted transition hover:border-accent/30 hover:text-accent" @click="woResetDuration()">↺ auto</button>
          </template>
        </div>
      </div>

      <div v-if="!woFormValid() && (woShipForm!.minerals.length>0 || woShipForm!.refineryQuery || woShipForm!.methodQuery)" class="mt-4 flex flex-wrap gap-2 text-xs">
        <span v-if="!woShipForm!.refineryPoiId" class="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-rose-300">⚠ Raffinerie requise</span>
        <span v-if="!woShipForm!.method" class="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-rose-300">⚠ Méthode requise</span>
        <span v-if="woTotalValidCscuInput()===0" class="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-rose-300">⚠ Au moins un minerai avec une quantité est requis</span>
      </div>
      <p v-if="woShipForm!.error" class="mt-4 text-xs text-rose-300">{{ woShipForm!.error }}</p>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <button class="inline-flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50" :disabled="woShipForm!.saving || !woFormValid()" @click="submitWoShipForm()">
          <svg v-if="woShipForm!.saving" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          <span>{{ woShipForm!.saving ? 'Enregistrement...' : 'Enregistrer WO' }}</span>
        </button>
        <button class="rounded-xl border border-th-subtle bg-white/5 px-4 py-2 text-xs text-th-muted transition hover:bg-white/10" type="button" @click="woShipForm!.show = false">Annuler</button>
        <div v-if="woFormValid() && woTotalValidCscuInput()>0" class="flex flex-wrap items-center gap-2 text-xs">
          <span v-if="woEffectiveDurationSeconds()!==null" class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-th-primary">⏱ {{ woModalDisplayDuration(woEffectiveDurationSeconds()!) }}</span>
          <span v-else-if="woShipForm!.previewLoading" class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-th-muted">⏱ calcul…</span>
          <span v-else-if="woShipForm!.previewHasConfig===false" class="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-amber-300">⚠ temps imprécis</span>
          <span v-if="woPreviewCostAuec()!=null" class="rounded-full border border-accent/20 bg-accent/[0.08] px-3 py-1.5 text-accent">aUEC {{ Math.ceil(woPreviewCostAuec()??0).toLocaleString('fr-FR') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
