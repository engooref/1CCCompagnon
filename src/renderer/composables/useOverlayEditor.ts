import { reactive, ref, watch } from 'vue'
import type { OverlayBounds, OverlayContext, OverlayLayout, OverlayModuleConfig, OverlayModuleType, LayoutState } from '@shared/general'
import { DEFAULT_OVERLAY_MODULES } from '@shared/general'

const GRID_SIZE = 8
const MIN_WIDTH  = 140
const MIN_HEIGHT = 56

// ─── Résolutions prédéfinies ──────────────────────────────────────────────────

export const STAGE_PRESETS = [
  { id: 'actual',    label: 'SC Actuel' },
  { id: '1080p',     label: '1920 × 1080' },
  { id: '1440p',     label: '2560 × 1440' },
  { id: 'ultrawide', label: '3440 × 1440' },
] as const

export type StagePresetId = (typeof STAGE_PRESETS)[number]['id']

// ─── État module-level (partagé par toutes les instances) ─────────────────────

// Position interne en pixels absolus (meilleure précision pour le drag)
type AbsPos = { x: number; y: number }

const positions   = reactive<Record<string, AbsPos>>({})
const modules     = reactive<OverlayModuleConfig[]>([])
const gameBounds  = ref<OverlayBounds | null>(null)
const selectedId  = ref<string | null>(null)
const snapEnabled = ref(true)
const stagePreset = ref<StagePresetId>('actual')

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function snap(value: number): number {
  return snapEnabled.value ? Math.round(value / GRID_SIZE) * GRID_SIZE : Math.round(value)
}

function stageSize(): { width: number; height: number } {
  if (stagePreset.value === '1080p')     return { width: 1920, height: 1080 }
  if (stagePreset.value === '1440p')     return { width: 2560, height: 1440 }
  if (stagePreset.value === 'ultrawide') return { width: 3440, height: 1440 }
  return {
    width:  Math.max(800, gameBounds.value?.width  ?? 1920),
    height: Math.max(450, gameBounds.value?.height ?? 1080),
  }
}

// Quand le preset change, rescaler les positions proportionnellement
let _prevStage = stageSize()
watch(stagePreset, () => {
  const oldStage = _prevStage
  const newStage = stageSize()
  for (const id of Object.keys(positions)) {
    const pos = positions[id]
    if (!pos) continue
    pos.x = (pos.x / oldStage.width)  * newStage.width
    pos.y = (pos.y / oldStage.height) * newStage.height
    const mod = modules.find((m) => m.id === id)
    if (mod) constrainModule(mod, pos)
  }
  _prevStage = newStage
})

// ─── Conversion abs ↔ fraction ────────────────────────────────────────────────

function absToPct(pos: AbsPos): { xPct: number; yPct: number } {
  const stage = stageSize()
  return {
    xPct: clamp(pos.x / stage.width,  0, 1),
    yPct: clamp(pos.y / stage.height, 0, 1),
  }
}

function pctToAbs(pos: { xPct: number; yPct: number }): AbsPos {
  const stage = stageSize()
  return { x: pos.xPct * stage.width, y: pos.yPct * stage.height }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeModule(mod: Partial<OverlayModuleConfig> & Pick<OverlayModuleConfig, 'id' | 'type' | 'title'>): OverlayModuleConfig {
  const fallback = DEFAULT_OVERLAY_MODULES.find((m) => m.id === mod.id || m.type === mod.type)
  return {
    id:        mod.id,
    type:      mod.type,
    title:     mod.title,
    visible:   mod.visible   ?? true,
    minimized: mod.minimized ?? false,
    width:     Math.max(MIN_WIDTH,  Math.round(mod.width   ?? fallback?.width   ?? 240)),
    height:    Math.max(MIN_HEIGHT, Math.round(mod.height  ?? fallback?.height  ?? 100)),
    opacity:   Math.min(1, Math.max(0, mod.opacity ?? fallback?.opacity ?? 1)),
    locked:    mod.locked ?? false,
    zIndex:    Math.round(mod.zIndex ?? fallback?.zIndex ?? 10),
    fontSize:    Math.min(1.5, Math.max(0.75, mod.fontSize ?? fallback?.fontSize ?? 1)),
    bgColor:     mod.bgColor ?? fallback?.bgColor ?? '',
    anchor:    mod.anchor ?? fallback?.anchor ?? 'top-left',
    radioDensity: mod.radioDensity ?? fallback?.radioDensity ?? 'medium',
    radioShowSpeakers: mod.radioShowSpeakers ?? fallback?.radioShowSpeakers ?? true,
    radioShowParticipants: mod.radioShowParticipants ?? fallback?.radioShowParticipants ?? true,
    radioShowAdvancedStatus: mod.radioShowAdvancedStatus ?? fallback?.radioShowAdvancedStatus ?? true,
  }
}

const KNOWN_TYPES = new Set(DEFAULT_OVERLAY_MODULES.map((m) => m.type))

function replaceModules(next: OverlayModuleConfig[]) {
  const filtered = next.filter((m) => KNOWN_TYPES.has(m.type))
  modules.splice(0, modules.length, ...filtered.map(normalizeModule))
}

replaceModules(DEFAULT_OVERLAY_MODULES)

function defaultPosition(mod: OverlayModuleConfig): AbsPos {
  const stage = stageSize()
  if (mod.anchor === 'top-right')    return { x: stage.width  - mod.width  - 24, y: 24 }
  if (mod.anchor === 'bottom-left')  return { x: 24, y: stage.height - mod.height - 32 }
  if (mod.anchor === 'bottom-right') return { x: stage.width  - mod.width  - 24, y: stage.height - mod.height - 32 }
  if (mod.anchor === 'center')       return { x: Math.round((stage.width - mod.width) / 2), y: Math.round((stage.height - mod.height) / 2) }
  return { x: 24, y: 24 }
}

function ensurePosition(id: string): AbsPos {
  const mod = modules.find((item) => item.id === id)
  if (!positions[id]) positions[id] = mod ? defaultPosition(mod) : { x: 24, y: 24 }
  return positions[id]!
}

function constrainModule(mod: OverlayModuleConfig, pos = ensurePosition(mod.id)) {
  const stage = stageSize()
  const modH  = mod.minimized ? 34 : 80
  pos.x      = clamp(snap(pos.x), 0, Math.max(0, stage.width  - mod.width))
  pos.y      = clamp(snap(pos.y), 0, Math.max(0, stage.height - modH))
  mod.width  = clamp(snap(mod.width), MIN_WIDTH, stage.width)
}

function snapshot(): LayoutState {
  // Convertit les positions absolues en fractions pour le stockage
  const pctPositions: OverlayLayout = {}
  for (const [id, absPos] of Object.entries(positions)) {
    pctPositions[id] = absToPct(absPos)
  }
  return {
    modules:   JSON.parse(JSON.stringify(modules)),
    positions: pctPositions,
  }
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function useOverlayEditor() {
  async function loadContext() {
    const ctx: OverlayContext = await window.oneCC.editorGetContext()
    gameBounds.value = ctx.gameBounds
    _prevStage = stageSize()

    // Convertit les fractions stockées en pixels absolus pour l'éditeur
    for (const key of Object.keys(positions)) delete positions[key]
    for (const [id, pctPos] of Object.entries(ctx.layout.positions ?? {})) {
      if (pctPos) positions[id] = pctToAbs(pctPos)
    }

    replaceModules(ctx.layout.modules?.length ? ctx.layout.modules : DEFAULT_OVERLAY_MODULES)
    modules.forEach((mod) => constrainModule(mod))
    if (!selectedId.value && modules[0]) selectedId.value = modules[0].id
  }

  function getModule(id: string | null) {
    return modules.find((mod) => mod.id === id) ?? null
  }

  function getStyle(id: string, scale = 1): Record<string, string> {
    const mod = getModule(id)
    const pos = ensurePosition(id)
    const s   = scale || 1

    return {
      position: 'absolute',
      left:     `${Math.round(pos.x * s)}px`,
      top:      `${Math.round(pos.y * s)}px`,
      width:    `${Math.round((mod?.width ?? 240) * s)}px`,
      height:   'auto',
      '--bg-alpha': `${mod?.opacity ?? 0.65}`,
      zIndex:   `${mod?.zIndex ?? 1}`,
      '--bg-color': (mod?.bgColor || '#000000'),
    }
  }

  async function saveAll(preview = false) {
    const payload = snapshot()
    if (preview) await window.oneCC.editorPreview(payload)
    else          await window.oneCC.editorSave(payload)
  }

  function selectModule(id: string) { selectedId.value = id }

  function applyDelta(id: string, deltaX: number, deltaY: number) {
    const mod = getModule(id)
    if (!mod || mod.locked) return
    const pos = ensurePosition(id)
    pos.x += deltaX
    pos.y += deltaY
    constrainModule(mod, pos)
  }

  function startDrag(e: MouseEvent, id: string, scale = 1) {
    const mod = getModule(id)
    if (!mod || mod.locked) return
    e.preventDefault()
    selectModule(id)
    const startX   = e.clientX
    const startY   = e.clientY
    const startPos = { ...ensurePosition(id) }
    const s        = scale || 1

    const onMove = (mv: MouseEvent) => {
      const pos = ensurePosition(id)
      pos.x = startPos.x + (mv.clientX - startX) / s
      pos.y = startPos.y + (mv.clientY - startY) / s
      constrainModule(mod, pos)
      void saveAll(true)
    }
    const onUp = async () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
      await saveAll()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }

  function startResize(e: MouseEvent, id: string, scale = 1) {
    const mod = getModule(id)
    if (!mod || mod.locked) return
    e.preventDefault()
    e.stopPropagation()
    selectModule(id)
    const startX      = e.clientX
    const startY      = e.clientY
    const startWidth  = mod.width
    const startHeight = mod.height
    const s           = scale || 1

    const onMove = (mv: MouseEvent) => {
      mod.width  = startWidth  + (mv.clientX - startX) / s
      mod.height = startHeight + (mv.clientY - startY) / s
      constrainModule(mod)
      void saveAll(true)
    }
    const onUp = async () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
      await saveAll()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }

  async function setField<K extends keyof OverlayModuleConfig>(id: string, key: K, value: OverlayModuleConfig[K]) {
    const mod = getModule(id)
    if (!mod) return
    ;(mod[key] as OverlayModuleConfig[K]) = value
    constrainModule(mod)
    await saveAll(true)
  }

  async function commitSelected() { await saveAll() }

  async function toggleModuleType(type: OverlayModuleType) {
    const existing = modules.find((m) => m.type === type)
    if (existing) {
      existing.visible = !existing.visible
      selectedId.value = existing.id
    } else {
      const fallback = DEFAULT_OVERLAY_MODULES.find((m) => m.type === type)!
      modules.push(structuredClone ? structuredClone(fallback) : JSON.parse(JSON.stringify(fallback)))
      positions[fallback.id] = { x: 32, y: 32 }
      selectedId.value = fallback.id
    }
    await saveAll()
  }

  function isTypeVisible(type: OverlayModuleType): boolean {
    return modules.some((m) => m.type === type && m.visible)
  }

  async function removeModule(id: string) {
    const idx = modules.findIndex((m) => m.id === id)
    if (idx >= 0) modules.splice(idx, 1)
    delete positions[id]
    if (selectedId.value === id) selectedId.value = modules[0]?.id ?? null
    await saveAll()
  }

  async function resetLayout() {
    for (const key of Object.keys(positions)) delete positions[key]
    replaceModules(DEFAULT_OVERLAY_MODULES)
    await saveAll()
  }

  async function nudgeSelected(deltaX: number, deltaY: number) {
    if (!selectedId.value) return
    applyDelta(selectedId.value, deltaX, deltaY)
    await saveAll(true)
  }

  return {
    GRID_SIZE,
    STAGE_PRESETS,
    positions,
    modules,
    gameBounds,
    selectedId,
    snapEnabled,
    stagePreset,
    stageSize,
    loadContext,
    getModule,
    getStyle,
    selectModule,
    startDrag,
    startResize,
    saveAll,
    commitSelected,
    setField,
    toggleModuleType,
    isTypeVisible,
    removeModule,
    resetLayout,
    nudgeSelected,
  }
}
