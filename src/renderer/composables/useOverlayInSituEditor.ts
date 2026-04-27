import { ref } from 'vue'
import type { LayoutState, OverlayElementPos, OverlayModuleConfig } from '@shared/general'
import { useOverlayLayout } from './useOverlayLayout'

const GRID_SIZE = 8
const MIN_WIDTH = 140
const MIN_HEIGHT = 56

const editMode = ref(false)
const selectedId = ref<string | null>(null)
const dragActive = ref(false)
const snapEnabled = ref(true)

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function snap(value: number): number {
  return snapEnabled.value ? Math.round(value / GRID_SIZE) * GRID_SIZE : Math.round(value)
}

function cloneLayoutState(
  modules: OverlayModuleConfig[],
  positions: Partial<Record<string, OverlayElementPos>>,
): LayoutState {
  return {
    modules: JSON.parse(JSON.stringify(modules)),
    positions: JSON.parse(JSON.stringify(positions)),
  }
}

export function useOverlayInSituEditor() {
  const { positions, modules, loadLayout, getModule } = useOverlayLayout()

  function setEditMode(enabled: boolean) {
    editMode.value = enabled
    dragActive.value = false
    if (!enabled) selectedId.value = null
  }

  function ensurePosition(id: string, bounds: { width: number; height: number }): OverlayElementPos {
    const existing = positions[id]
    if (existing) return existing

    const mod = getModule(id)
    const width = mod?.width ?? 240
    const height = mod?.height ?? 100
    const next: OverlayElementPos = { xPct: 16 / bounds.width, yPct: 16 / bounds.height }

    if (mod?.anchor === 'top-right') {
      next.xPct = Math.max(0, (bounds.width - width - 16) / bounds.width)
      next.yPct = 16 / bounds.height
    } else if (mod?.anchor === 'bottom-left') {
      next.xPct = 16 / bounds.width
      next.yPct = Math.max(0, (bounds.height - height - 40) / bounds.height)
    } else if (mod?.anchor === 'bottom-right') {
      next.xPct = Math.max(0, (bounds.width - width - 16) / bounds.width)
      next.yPct = Math.max(0, (bounds.height - height - 40) / bounds.height)
    } else if (mod?.anchor === 'center') {
      next.xPct = Math.max(0, (bounds.width - width) / 2 / bounds.width)
      next.yPct = Math.max(0, (bounds.height - height) / 2 / bounds.height)
    }

    positions[id] = next
    return next
  }

  function selectModule(id: string, bounds: { width: number; height: number }) {
    ensurePosition(id, bounds)
    selectedId.value = id
  }

  async function saveLayout() {
    await window.oneCC.editorSave(cloneLayoutState(modules, positions))
  }

  async function reloadLayout() {
    await loadLayout()
  }

  function moveModule(id: string, pixelX: number, pixelY: number, bounds: { width: number; height: number }) {
    const mod = getModule(id)
    if (!mod || mod.locked) return

    const pos = ensurePosition(id, bounds)
    const maxX = Math.max(0, bounds.width - mod.width)
    const maxY = Math.max(0, bounds.height - (mod.minimized ? 34 : Math.max(MIN_HEIGHT, mod.height)))
    const nextX = clamp(snap(pixelX), 0, maxX)
    const nextY = clamp(snap(pixelY), 0, maxY)

    pos.xPct = nextX / bounds.width
    pos.yPct = nextY / bounds.height
  }

  function startDrag(event: MouseEvent, id: string, bounds: { width: number; height: number }) {
    const mod = getModule(id)
    if (!editMode.value || !mod || mod.locked) return

    event.preventDefault()
    event.stopPropagation()
    dragActive.value = true
    selectModule(id, bounds)

    const pos = ensurePosition(id, bounds)
    const startMouseX = event.clientX
    const startMouseY = event.clientY
    const startX = pos.xPct * bounds.width
    const startY = pos.yPct * bounds.height

    const onMove = (moveEvent: MouseEvent) => {
      moveModule(
        id,
        startX + (moveEvent.clientX - startMouseX),
        startY + (moveEvent.clientY - startMouseY),
        bounds,
      )
    }

    const onUp = async () => {
      dragActive.value = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      await saveLayout()
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startResize(event: MouseEvent, id: string, bounds: { width: number; height: number }) {
    const mod = getModule(id)
    if (!editMode.value || !mod || mod.locked) return

    event.preventDefault()
    event.stopPropagation()
    dragActive.value = true
    selectModule(id, bounds)

    const startMouseX = event.clientX
    const startMouseY = event.clientY
    const startWidth = mod.width
    const startHeight = mod.height

    const onMove = (moveEvent: MouseEvent) => {
      mod.width = clamp(snap(startWidth + (moveEvent.clientX - startMouseX)), MIN_WIDTH, bounds.width)
      mod.height = clamp(snap(startHeight + (moveEvent.clientY - startMouseY)), MIN_HEIGHT, bounds.height)
      moveModule(id, (positions[id]?.xPct ?? 0) * bounds.width, (positions[id]?.yPct ?? 0) * bounds.height, bounds)
    }

    const onUp = async () => {
      dragActive.value = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      await saveLayout()
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function setField<K extends keyof OverlayModuleConfig>(
    id: string,
    key: K,
    value: OverlayModuleConfig[K],
  ) {
    const mod = getModule(id)
    if (!mod) return

    ;(mod[key] as OverlayModuleConfig[K]) = value
    await saveLayout()
  }

  async function toggleVisibility(id: string) {
    const mod = getModule(id)
    if (!mod) return

    mod.visible = !mod.visible
    if (!mod.visible && selectedId.value === id) {
      selectedId.value = null
    }
    await saveLayout()
  }

  async function toggleMinimized(id: string) {
    const mod = getModule(id)
    if (!mod) return

    mod.minimized = !mod.minimized
    await saveLayout()
  }

  async function discardChanges() {
    await reloadLayout()
    selectedId.value = null
    dragActive.value = false
  }

  return {
    GRID_SIZE,
    editMode,
    selectedId,
    dragActive,
    snapEnabled,
    setEditMode,
    selectModule,
    startDrag,
    startResize,
    setField,
    toggleVisibility,
    toggleMinimized,
    discardChanges,
    saveLayout,
  }
}