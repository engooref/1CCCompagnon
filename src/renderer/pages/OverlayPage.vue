<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { GameState, GameEvent } from '../../main/services/logParserService'
import type { LayoutState } from '@shared/general'
import StatusModule from '../components/overlay/StatusModule.vue'
import TransportModule from '../components/overlay/TransportModule.vue'
import QuantumModule from '../components/overlay/QuantumModule.vue'
import ZoneToast from '../components/overlay/ZoneToast.vue'
import MapModule from '../components/overlay/MapModule.vue'
import { useOverlayLayout } from '../composables/useOverlayLayout'
import { usePinnedMap } from '../composables/usePinnedMap'

const gameState = ref<GameState | null>(null)
const zoneEvent = ref<GameEvent | null>(null)
const scBounds  = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const mapVisible        = ref(false)
const mapOverlayOpacity = ref(0.85)
const mapModuleRef      = ref<{ refresh: () => void } | null>(null)
let zoneTimer: ReturnType<typeof setTimeout> | null = null

watch(mapVisible, (visible) => {
  if (visible) nextTick(() => mapModuleRef.value?.refresh())
})

const { pinnedMapId } = usePinnedMap()
const { modules, getStyle, loadLayout, applyLayout } = useOverlayLayout()

/** Conteneur positionné sur la fenêtre SC. Fallback = plein écran si bounds inconnues. */
const scContainerStyle = computed(() => {
  const b = scBounds.value
  if (!b) return { position: 'absolute' as const, inset: '0' }
  return {
    position: 'absolute' as const,
    left: `${b.x}px`,
    top:  `${b.y}px`,
    width:  `${b.width}px`,
    height: `${b.height}px`,
  }
})

function isVisible(mod: (typeof modules)[number]): boolean {
  if (!mod.visible) return false
  switch (mod.type) {
    case 'status':
      return true
    case 'transport':
      return true
    case 'quantum':
      return gameState.value?.activity === 'quantum'
    case 'zone':
      return !!zoneEvent.value
    default:
      return true
  }
}

onMounted(async () => {
  const settings = await window.oneCC.getSettings()
  mapOverlayOpacity.value = settings.mapOverlayOpacity ?? 0.85

  await loadLayout()
  const initial = await window.oneCC.overlaySubscribe()
  if (initial?.player) gameState.value = initial

  window.oneCC.onOverlayState((s) => {
    gameState.value = s
  })

  window.oneCC.onOverlayEvent((e) => {
    if (e.type === 'zone') {
      zoneEvent.value = e
      if (zoneTimer) clearTimeout(zoneTimer)
      zoneTimer = setTimeout(() => {
        zoneEvent.value = null
      }, 5000)
    }
  })

  window.oneCC.onOverlayLayoutUpdate((l: LayoutState) => applyLayout(l))

  window.oneCC.onOverlayGameBounds((b) => { scBounds.value = b })

  window.oneCC.onMapToggle(() => {
    mapVisible.value = !mapVisible.value
  })

  window.oneCC.onSettingsUpdate((s: any) => {
    if (s?.mapOverlayOpacity != null) mapOverlayOpacity.value = s.mapOverlayOpacity
  })
})

onUnmounted(() => {
  window.oneCC.offOverlay()
  window.oneCC.offSettingsUpdate()
  if (zoneTimer) clearTimeout(zoneTimer)
})
</script>

<template>
  <div class="fixed inset-0 overflow-hidden select-none pointer-events-none overlay-root">

    <!-- ── Conteneur calqué sur la fenêtre SC ──────────────────────────── -->
    <div :style="scContainerStyle" class="overflow-hidden">

      <!-- ── Modules positionnés ────────────────────────────────────────── -->
      <template v-for="mod in modules" :key="mod.id">
        <Transition name="fade">
          <div
            v-if="isVisible(mod)"
            class="absolute pointer-events-none"
            :style="getStyle(mod.id, scBounds?.width, scBounds?.height)"
          >
            <template v-if="!mod.minimized">
              <div class="w-full overflow-hidden rounded-2xl" :style="{ zoom: mod.fontSize ?? 1 }">
                <StatusModule v-if="mod.type === 'status'" :state="gameState" />
                <TransportModule v-else-if="mod.type === 'transport'" />
                <QuantumModule v-else-if="mod.type === 'quantum' && gameState" :state="gameState" />
                <ZoneToast v-else-if="mod.type === 'zone' && zoneEvent" :event="zoneEvent" />
              </div>
            </template>
            <div v-else class="rounded-xl border border-white/10 bg-black/60 px-3 py-1 text-[10px] text-th-muted backdrop-blur-sm">
              {{ mod.title }}
            </div>
          </div>
        </Transition>
      </template>

      <!-- ── Carte tactique plein overlay (z-index max, au-dessus de tout) ── -->
      <!-- Monté dès qu'une carte est épinglée, caché/montré par CSS pour éviter le rechargement -->
      <div
        v-if="pinnedMapId"
        class="absolute pointer-events-none"
        :style="{
          inset: '40px',
          zIndex: 9999,
          opacity: mapVisible ? mapOverlayOpacity : 0,
          visibility: mapVisible ? 'visible' : 'hidden',
          transition: 'opacity 0.2s ease',
        }"
      >
        <MapModule ref="mapModuleRef" />
      </div>

    </div>
  </div>
</template>

<style scoped>
.overlay-root {
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
