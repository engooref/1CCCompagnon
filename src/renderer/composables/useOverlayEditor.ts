import { reactive, ref } from 'vue'
import type { OverlayBounds, OverlayContext, OverlayLayout, OverlayModuleConfig, OverlayModuleType, LayoutState } from '@shared/general'
import { DEFAULT_OVERLAY_MODULES } from '@shared/general'

const GRID_SIZE = 8
const MIN_WIDTH = 140
const MIN_HEIGHT = 56

const positions = reactive<OverlayLayout>({})
const modules = reactive<OverlayModuleConfig[]>([])
const gameBounds = ref<OverlayBounds | null>(null)
const selectedId = ref<string | null>(null)
const snapEnabled = ref(true)

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function snap(value: number): number {
  return snapEnabled.value ? Math.round(value / GRID_SIZE) * GRID_SIZE : Math.round(value)
}

function normalizeModule(mod: Partial<OverlayModuleConfig> & Pick<OverlayModuleConfig, 'id' | 'type' | 'title'>): OverlayModuleConfig {
  const fallback = DEFAULT_OVERLAY_MODULES.find((m) => m.id === mod.id || m.type === mod.type)
  return {
    id: mod.id,
    type: mod.type,
    title: mod.title,
    visible: mod.visible ?? true,
    minimized: mod.minimized ?? false,
    width: Math.max(MIN_WIDTH, Math.round(mod.width ?? fallback?.width ?? 240)),
    height: Math.max(MIN_HEIGHT, Math.round(mod.height ?? fallback?.height ?? 100)),
    opacity: Math.min(1, Math.max(0, mod.opacity ?? fallback?.opacity ?? 1)),
    locked: mod.locked ?? false,
    zIndex: Math.round(mod.zIndex ?? fallback?.zIndex ?? 10),
    anchor: mod.anchor ?? fallback?.anchor ?? 'top-left',
  }
}

function replaceModules(next: OverlayModuleConfig[]) {
  modules.splice(0, modules.length, ...next.map(normalizeModule))
}

replaceModules(DEFAULT_OVERLAY_MODULES)

function snapshot(): LayoutState {
  return {
    modules: JSON.parse(JSON.stringify(modules)),
    positions: JSON.parse(JSON.stringify(positions)),
  }
}

function stageSize() {
  return {
    width: Math.max(800, gameBounds.value?.width ?? 1980),
    height: Math.max(450, gameBounds.value?.height ?? 1080),
  }
}

function defaultPosition(mod: OverlayModuleConfig) {
  const stage = stageSize()
  if (mod.anchor === 'top-right') return { x: stage.width - mod.width - 24, y: 24 }
  if (mod.anchor === 'bottom-left') return { x: 24, y: stage.height - mod.height - 32 }
  if (mod.anchor === 'bottom-right') return { x: stage.width - mod.width - 24, y: stage.height - mod.height - 32 }
  if (mod.anchor === 'center') return { x: Math.round((stage.width - mod.width) / 2), y: Math.round((stage.height - mod.height) / 2) }
  return { x: 24, y: 24 }
}

function ensurePosition(id: string) {
  const mod = modules.find((item) => item.id === id)
  if (!positions[id]) positions[id] = mod ? defaultPosition(mod) : { x: 24, y: 24 }
  return positions[id]!
}

function constrainModule(mod: OverlayModuleConfig, pos = ensurePosition(mod.id)) {
  const stage = stageSize()
  const modH = mod.minimized ? 34 : 80
  pos.x = clamp(snap(pos.x), 0, Math.max(0, stage.width - mod.width))
  pos.y = clamp(snap(pos.y), 0, Math.max(0, stage.height - modH))
  mod.width = clamp(snap(mod.width), MIN_WIDTH, stage.width)
}

export function useOverlayEditor() {
  async function loadContext() {
    const ctx: OverlayContext = await window.oneCC.editorGetContext()
    gameBounds.value = ctx.gameBounds
    for (const key of Object.keys(positions)) delete positions[key]
    Object.assign(positions, ctx.layout.positions ?? {})
    replaceModules(ctx.layout.modules?.length ? ctx.layout.modules : DEFAULT_OVERLAY_MODULES)
    modules.forEach((mod) => constrainModule(mod))
    if (!selectedId.value && modules[0]) selectedId.value = modules[0].id
  }

  function getModule(id: string | null) {
    return modules.find((mod) => mod.id === id) ?? null
  }

  function getStyle(id: string, scale = 1, offsetX = 0, offsetY = 0): Record<string, string> {
    const mod = getModule(id)
    const pos = ensurePosition(id)
    const effectiveScale = scale || 1

    const logicalWidth = Math.round(mod?.width ?? 240)

    const scaledX = Math.round(pos.x * effectiveScale + offsetX)
    const scaledY = Math.round(pos.y * effectiveScale + offsetY)

    const scaledWidth = Math.round(logicalWidth * effectiveScale)

    return {
      position: 'absolute',
      left: `${scaledX}px`,
      top: `${scaledY}px`,
      width: `${scaledWidth}px`,
      height: 'auto',
      '--bg-alpha': `${mod?.opacity ?? 0.65}`,
      zIndex: `${mod?.zIndex ?? 1}`,
    }
  }

  async function saveAll(preview = false) {
    const payload = snapshot()
    if (preview) await window.oneCC.editorPreview(payload)
    else await window.oneCC.editorSave(payload)
  }

  function selectModule(id: string) {
    selectedId.value = id
  }

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
    const startX = e.clientX
    const startY = e.clientY
    const startPos = { ...ensurePosition(id) }

    const effectiveScale = scale || 1

    const onMove = (mv: MouseEvent) => {
      const pos = ensurePosition(id)
      pos.x = startPos.x + (mv.clientX - startX) / effectiveScale
      pos.y = startPos.y + (mv.clientY - startY) / effectiveScale
      constrainModule(mod, pos)
      void saveAll(true)
    }

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      await saveAll()
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startResize(e: MouseEvent, id: string, _scale = 1) {
    const mod = getModule(id)
    if (!mod || mod.locked) return
    e.preventDefault()
    e.stopPropagation()
    selectModule(id)
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = mod.width
    const startHeight = mod.height

    const effectiveScale2 = _scale || 1
    const onMove = (mv: MouseEvent) => {
      mod.width = startWidth + (mv.clientX - startX) / effectiveScale2
      mod.height = startHeight + (mv.clientY - startY) / effectiveScale2
      constrainModule(mod)
      void saveAll(true)
    }

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      await saveAll()
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function setField<K extends keyof OverlayModuleConfig>(id: string, key: K, value: OverlayModuleConfig[K]) {
    const mod = getModule(id)
    if (!mod) return
    ;(mod[key] as OverlayModuleConfig[K]) = value
    constrainModule(mod)
    await saveAll(true)
  }

  async function commitSelected() {
    await saveAll()
  }

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
    positions,
    modules,
    gameBounds,
    selectedId,
    snapEnabled,
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
