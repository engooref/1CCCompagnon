import { ref, onUnmounted } from 'vue'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — JS module without declarations
import { ShipHologramViewer } from '../lib/ShipHologramViewer.js'

export function useShipHologram(
  onHotspotClick: (index: number) => void,
  getToken: () => string | null | undefined = () => null,
) {
  const containerRef = ref<HTMLElement | null>(null)
  let viewer: InstanceType<typeof ShipHologramViewer> | null = null
  let resizeObserver: ResizeObserver | null = null

  function _ensureViewer(): boolean {
    if (viewer) return true
    if (!containerRef.value) return false

    viewer = new ShipHologramViewer(containerRef.value)
    viewer.setAuthToken(getToken() ?? null)

    resizeObserver = new ResizeObserver(() => viewer?._onResize?.())
    resizeObserver.observe(containerRef.value)

    containerRef.value.addEventListener('holo:hotspot-click', (e: Event) => {
      const idx = (e as CustomEvent).detail?.index
      if (idx != null) onHotspotClick(idx)
    })

    return true
  }

  function loadShip(glbUrl: string, name: string, turrets: any[]) {
    if (!_ensureViewer()) return
    viewer!.setAuthToken(getToken() ?? null)
    viewer!._onResize?.()
    viewer!.setTurrets(turrets)
    viewer!.loadModel(glbUrl, name)
  }

  function clearShip() {
    viewer?.clearModelAndHotspots()
  }

  function setActiveHotspot(index: number | null) {
    viewer?.setActiveHotspot(index ?? null)
  }

  function destroy() {
    resizeObserver?.disconnect()
    resizeObserver = null
    viewer?.destroy()
    viewer = null
  }

  onUnmounted(destroy)

  return { containerRef, loadShip, clearShip, setActiveHotspot }
}
