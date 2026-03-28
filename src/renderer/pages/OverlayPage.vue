<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { LayoutState } from '@shared/general'
import TransportModule from '../components/overlay/TransportModule.vue'
import MapModule from '../components/overlay/MapModule.vue'
import RadioModule from '../components/overlay/RadioModule.vue'
import { useOverlayLayout } from '../composables/useOverlayLayout'
import { usePinnedMap } from '../composables/usePinnedMap'

const scBounds  = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const mapVisible        = ref(false)
const mapOverlayOpacity = ref(0.85)
const mapModuleRef      = ref<{ refresh: () => void } | null>(null)
const mapOnlyMode       = ref(false)

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
  if (mapOnlyMode.value) return false
  if (!mod.visible) return false
  return mod.type === 'transport'
}

onMounted(async () => {
  const settings = await window.oneCC.getSettings()
  mapOverlayOpacity.value = settings.mapOverlayOpacity ?? 0.85

  await loadLayout()

  window.oneCC.onOverlayLayoutUpdate((l: LayoutState) => applyLayout(l))

  window.oneCC.onOverlayGameBounds((b) => { scBounds.value = b })

  window.oneCC.onMapToggle(() => {
    mapVisible.value = !mapVisible.value
  })

  window.oneCC.onMapOnlyMode((v) => { mapOnlyMode.value = v })

  window.oneCC.onSettingsUpdate((s: any) => {
    if (s?.mapOverlayOpacity != null) mapOverlayOpacity.value = s.mapOverlayOpacity
  })
})

onUnmounted(() => {
  window.oneCC.offOverlay()
  window.oneCC.offSettingsUpdate()
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
                <TransportModule v-if="mod.type === 'transport'" />
              </div>
            </template>
            <div v-else class="rounded-xl border border-white/10 bg-black/60 px-3 py-1 text-[10px] text-th-muted backdrop-blur-sm">
              {{ mod.title }}
            </div>
          </div>
        </Transition>
      </template>

      <!-- ── Radio status widget (coin bas-gauche) ─────────────────── -->
      <div class="absolute bottom-4 left-4 pointer-events-none" style="z-index: 100;">
        <RadioModule />
      </div>

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
