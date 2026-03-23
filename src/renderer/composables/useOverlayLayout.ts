import { reactive } from 'vue'
import type { OverlayLayout, OverlayModuleConfig, LayoutState } from '@shared/general'
import { DEFAULT_OVERLAY_MODULES } from '@shared/general'

const positions = reactive<OverlayLayout>({})
const modules = reactive<OverlayModuleConfig[]>([])

function normalizeModule(mod: Partial<OverlayModuleConfig> & Pick<OverlayModuleConfig, 'id' | 'type' | 'title'>): OverlayModuleConfig {
  const fallback = DEFAULT_OVERLAY_MODULES.find((m) => m.id === mod.id || m.type === mod.type)
  return {
    id: mod.id,
    type: mod.type,
    title: mod.title,
    visible: mod.visible ?? true,
    minimized: mod.minimized ?? false,
    width: Math.max(140, Math.round(mod.width ?? fallback?.width ?? 240)),
    height: Math.max(56, Math.round(mod.height ?? fallback?.height ?? 100)),
    opacity: Math.min(1, Math.max(0, mod.opacity ?? fallback?.opacity ?? 1)),
    locked: mod.locked ?? false,
    zIndex: Math.round(mod.zIndex ?? fallback?.zIndex ?? 10),
    fontSize:    Math.min(1.5, Math.max(0.75, mod.fontSize ?? fallback?.fontSize ?? 1)),
    bgColor:     mod.bgColor ?? fallback?.bgColor ?? '',
    anchor: mod.anchor ?? fallback?.anchor ?? 'top-left',
  }
}

function replaceModules(next: OverlayModuleConfig[]) {
  modules.splice(0, modules.length, ...next.map(normalizeModule))
}

replaceModules(DEFAULT_OVERLAY_MODULES)

export function useOverlayLayout() {
  async function loadLayout() {
    const state = await window.oneCC.overlayGetLayout()
    applyLayout(state)
  }

  function applyLayout(state: LayoutState) {
    for (const key of Object.keys(positions)) delete positions[key]
    Object.assign(positions, state.positions ?? {})
    replaceModules(state.modules?.length ? state.modules : DEFAULT_OVERLAY_MODULES)
  }

  function getModule(id: string) {
    return modules.find((mod) => mod.id === id)
  }

  function getStyle(id: string, vw?: number, vh?: number): Record<string, string> {
    const mod = getModule(id)
    const pos = positions[id]
    const width = Math.round(mod?.width ?? 240)
    const anchor = mod?.anchor ?? 'top-left'

    const style: Record<string, string> = {
      position: 'absolute',
      width: `${width}px`,
      height: 'auto',
      '--bg-alpha': `${mod?.opacity ?? 0.65}`,
      zIndex: `${mod?.zIndex ?? 1}`,
      '--bg-color': (mod?.bgColor || '#000000'),
      transform: 'translateZ(0)',
      willChange: 'transform',
    }

    if (pos) {
      // Conversion fraction → pixels selon la taille de la fenêtre SC (ou du viewport si absent)
      const w = vw ?? window.innerWidth
      const h = vh ?? window.innerHeight
      style.left = `${Math.round(pos.xPct * w)}px`
      style.top  = `${Math.round(pos.yPct * h)}px`
      return style
    }

    if (anchor === 'top-right') {
      style.right = '16px'
      style.top = '16px'
    } else if (anchor === 'bottom-left') {
      style.left = '16px'
      style.bottom = '40px'
    } else if (anchor === 'bottom-right') {
      style.right = '16px'
      style.bottom = '40px'
    } else if (anchor === 'center') {
      style.left = '50%'
      style.top = '50%'
      style.transform = 'translate(-50%, -50%) translateZ(0)'
    } else {
      style.left = '16px'
      style.top = '16px'
    }

    return style
  }

  return { positions, modules, loadLayout, applyLayout, getStyle }
}
