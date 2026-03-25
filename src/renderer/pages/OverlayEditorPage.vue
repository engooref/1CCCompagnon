<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { TransportOrder } from '../../shared/deliveries'
import TransportModule from '../components/overlay/TransportModule.vue'
import { useOverlayEditor } from '../composables/useOverlayEditor'

const previewRef = ref<HTMLElement | null>(null)
const previewScale = ref(1)

const stageRatio = computed(() => {
  const { width, height } = stageSize()
  return width / height
})

function updatePreviewScale() {
  if (!previewRef.value) { previewScale.value = 1; return }
  const rect = previewRef.value.getBoundingClientRect()
  const stage = stageSize()
  if (!stage.width || !stage.height) { previewScale.value = 1; return }
  const s = Math.min(rect.width / stage.width, rect.height / stage.height)
  previewScale.value = (Number.isFinite(s) && s > 0) ? s : 1
}


const {
  GRID_SIZE,
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
  commitSelected,
  setField,
  toggleModuleType,
  isTypeVisible,
  removeModule,
  resetLayout,
  nudgeSelected,
} = useOverlayEditor()

const selectedModule = computed(() => getModule(selectedId.value))

const FAKE_TRANSPORT_ORDER: TransportOrder = {
  id: 999,
  name: 'Mission logistique Stanton',
  itinerary: {
    id: 1,
    lines: [
      {
        legId: 1,
        orderIndex: 0,
        completed: true,
        pickupName: 'Port Tressler',
        dropoffName: 'Area18',
        cargos: [
          { commodityName: 'Medical Supplies', quantity: 12 },
          { commodityName: 'Foodstuffs', quantity: 8 },
        ],
      },
      {
        legId: 2,
        orderIndex: 1,
        completed: false,
        pickupName: 'Area18',
        dropoffName: 'Baijini Point',
        cargos: [{ commodityName: 'Titanium', quantity: 16, action: 'load' as const }],
      },
      {
        legId: 3,
        orderIndex: 2,
        completed: false,
        pickupName: 'Baijini Point',
        dropoffName: 'Everus Harbor',
        cargos: [{ commodityName: 'Hydrogen Fuel', quantity: 24, action: 'unload' as const }],
      },
    ],
  },
} as TransportOrder

function handleKeydown(event: KeyboardEvent) {
  if (!selectedModule.value) return
  const step = event.shiftKey ? GRID_SIZE : 1

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    void nudgeSelected(-step, 0)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    void nudgeSelected(step, 0)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    void nudgeSelected(0, -step)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    void nudgeSelected(0, step)
  } else if (event.key === 'Delete' && selectedId.value) {
    event.preventDefault()
    void removeModule(selectedId.value)
  }
}

onMounted(async () => {
  await loadContext()
  updatePreviewScale()
  window.addEventListener('resize', updatePreviewScale)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('resize', updatePreviewScale)
  window.removeEventListener('keydown', handleKeydown)
  window.oneCC.offEditor()
})

function closeEditor() {
  window.oneCC.closeEditor()
}
</script>

<template>
  <div class="min-h-screen bg-th-base text-th-primary">
    <div class="flex h-screen">
      <section class="flex min-w-0 flex-1 flex-col border-r border-white/10">
        <header class="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h1 class="text-sm font-semibold text-white">Éditeur overlay</h1>
          </div>
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
              <input v-model="snapEnabled" type="checkbox" class="accent-[rgb(var(--accent-rgb))]" />
              Snap
            </label>
            <button class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10" @click="resetLayout">
              Reset
            </button>
            <button class="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent hover:bg-accent/20" @click="commitSelected">
              Sauvegarder
            </button>
            <button class="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-400/20" @click="closeEditor()">
              Fermer
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-auto p-3">
          <div>
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <button
                class="rounded-full border px-3 py-1.5 text-xs transition"
                :class="isTypeVisible('transport')
                  ? 'border-accent/30 bg-accent/10 text-accent'
                  : 'border-white/10 bg-white/5 text-th-secondary hover:bg-white/10'"
                @click="toggleModuleType('transport')"
              >
                Transport
              </button>
            </div>

            <div class="relative overflow-hidden rounded-[20px] border border-accent/20 bg-[radial-gradient(circle_at_top,rgba(var(--accent-rgb),0.12),transparent_35%),linear-gradient(180deg,rgba(5,9,18,0.96),rgba(8,14,24,0.96))] p-3 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
              <div class="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-th-muted">
                <span>Preview</span>
                <span class="tabular-nums">{{ stageSize().width }} × {{ stageSize().height }} px</span>
              </div>
              <!-- Canvas mis à l'échelle -->
              <div
                ref="previewRef"
                class="relative w-full overflow-hidden rounded-[20px] border border-white/10 bg-th-base"
                :style="{ aspectRatio: stageRatio }"
              >
                <div
                  class="overlay-grid absolute inset-0 rounded-[18px]"
                  :style="{ backgroundSize: `${GRID_SIZE * 4 * previewScale}px ${GRID_SIZE * 4 * previewScale}px` }"
                ></div>

                <div
                  v-for="mod in modules"
                  :key="mod.id"
                  v-show="mod.visible"
                  class="group absolute"
                  :style="getStyle(mod.id, previewScale)"
                  @mousedown="startDrag($event, mod.id, previewScale)"
                  @click.stop="selectModule(mod.id)"
                >
                  <!-- Contour de sélection -->
                  <div
                    class="pointer-events-none absolute inset-0 rounded-xl border transition"
                    :class="selectedId === mod.id
                      ? 'border-accent/70 shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.35),0_0_20px_rgba(var(--accent-rgb),0.15)]'
                      : 'border-white/10 group-hover:border-white/25'"
                  />

                  <!-- Label flottant (visible au survol ou si sélectionné) -->
                  <div
                    class="pointer-events-none absolute -top-5 left-0 flex items-center gap-1.5 transition-opacity"
                    :class="selectedId === mod.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
                  >
                    <span class="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-th-secondary backdrop-blur-sm">{{ mod.title }}</span>
                    <span v-if="mod.locked" class="rounded bg-amber-400/20 px-1 py-0.5 text-[9px] font-bold text-amber-300">LOCK</span>
                  </div>

                  <!-- Placeholder positionnel — l'aperçu réel est dans l'inspecteur -->
                  <div class="pointer-events-none min-h-[56px] w-full overflow-hidden rounded-xl bg-white/5 flex items-center justify-center">
                    <span class="text-[10px] font-medium text-th-muted uppercase tracking-widest select-none">{{ mod.title }}</span>
                  </div>


                </div><!-- /v-for module -->
              </div><!-- /canvas -->
            </div><!-- /outer bg -->
          </div><!-- /max-w -->
        </div><!-- /min-h-0 -->
      </section>

      <aside class="w-[360px] shrink-0 overflow-auto bg-black/30">
        <div class="border-b border-white/10 px-5 py-4">
          <h2 class="text-sm font-semibold text-white">Inspecteur</h2>
          <p class="text-xs text-th-muted">Sélectionne un module pour éditer ses propriétés.</p>
        </div>

        <div v-if="selectedModule" class="space-y-5 p-5">

          <!-- ── Aperçu réel 1:1 ── -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs uppercase tracking-[0.2em] text-th-muted">Aperçu réel</span>
              <span class="text-[10px] tabular-nums text-th-muted">
                {{ selectedModule.width }}px
                <span class="text-th-disabled">·</span>
                {{ Math.round(selectedModule.width / (gameBounds?.width ?? stageSize().width) * 100) }}% larg.
              </span>
            </div>
            <div class="overflow-auto rounded-xl border border-white/[0.08] bg-th-base" style="max-height: 260px">
              <div class="p-2 inline-block min-w-full">
                <div
                  class="pointer-events-none overflow-hidden rounded-xl"
                  :style="{
                    width: selectedModule.width + 'px',
                    '--bg-alpha': String(selectedModule.opacity),
                    '--bg-color': selectedModule.bgColor || '#000000',
                    zoom: selectedModule.fontSize ?? 1,
                  }"
                >
                  <TransportModule v-if="selectedModule.type === 'transport'" :preview="true" :preview-order="FAKE_TRANSPORT_ORDER" />
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs uppercase tracking-[0.2em] text-th-muted">Titre</label>
            <input
              :value="selectedModule.title"
              class="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-accent/40"
              @input="setField(selectedModule.id, 'title', ($event.target as HTMLInputElement).value)"
              @blur="commitSelected"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs uppercase tracking-[0.2em] text-th-muted">Texte</span>
                <span class="text-xs font-semibold tabular-nums text-accent">{{ Math.round((selectedModule.fontSize ?? 1) * 100) }}%</span>
              </div>
              <input
                type="range" min="0.75" max="1.5" step="0.05"
                :value="selectedModule.fontSize ?? 1"
                class="w-full accent-[rgb(var(--accent-rgb))]"
                @input="setField(selectedModule.id, 'fontSize', Number(($event.target as HTMLInputElement).value))"
                @change="commitSelected()"
              />
              <div class="flex justify-between text-[10px] text-th-disabled">
                <span>75%</span><span>100%</span><span>150%</span>
              </div>
            </label>
            <label class="space-y-2">
              <span class="text-xs uppercase tracking-[0.2em] text-th-muted">Fond couleur</span>
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  :value="selectedModule.bgColor || '#000000'"
                  class="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
                  @input="setField(selectedModule.id, 'bgColor', ($event.target as HTMLInputElement).value)"
                  @change="commitSelected()"
                />
                <button
                  class="text-[10px] text-th-muted hover:text-th-secondary"
                  @click="setField(selectedModule.id, 'bgColor', ''); commitSelected()"
                >Reset</button>
              </div>
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs uppercase tracking-[0.2em] text-th-muted">Fond</span>
                <span class="text-xs font-semibold tabular-nums text-accent">{{ Math.round(selectedModule.opacity * 100) }}%</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.05"
                :value="selectedModule.opacity"
                class="w-full accent-[rgb(var(--accent-rgb))]"
                @input="setField(selectedModule.id, 'opacity', Number(($event.target as HTMLInputElement).value))"
                @change="commitSelected()"
              />
              <div class="flex justify-between text-[10px] text-th-disabled">
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </label>
            <label class="space-y-2">
              <span class="text-xs uppercase tracking-[0.2em] text-th-muted">Z-index</span>
              <input type="number" min="1" max="999" :value="selectedModule.zIndex" class="field" @change="setField(selectedModule.id, 'zIndex', Number(($event.target as HTMLInputElement).value)); commitSelected()" />
            </label>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
              <span>Visible</span>
              <input type="checkbox" :checked="selectedModule.visible" class="accent-[rgb(var(--accent-rgb))]" @change="setField(selectedModule.id, 'visible', ($event.target as HTMLInputElement).checked); commitSelected()" />
            </label>
            <label class="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
              <span>Lock</span>
              <input type="checkbox" :checked="selectedModule.locked" class="accent-[rgb(var(--accent-rgb))]" @change="setField(selectedModule.id, 'locked', ($event.target as HTMLInputElement).checked); commitSelected()" />
            </label>
          </div>

          <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p class="mb-3 text-xs uppercase tracking-[0.2em] text-th-muted">Raccourcis</p>
            <div class="space-y-2 text-xs text-th-secondary">
              <p>Flèches : déplacer</p>
              <p>Shift + flèches : déplacer par grille</p>
              <p>Delete : supprimer</p>
            </div>
          </div>

          <div class="flex gap-2">
            <button class="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" @click="commitSelected">
              Sauvegarder
            </button>
            <button class="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-400/20" @click="removeModule(selectedModule.id)">
              Supprimer
            </button>
          </div>
        </div>

        <div v-else class="p-5 text-sm text-th-muted">
          Aucun module sélectionné.
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.overlay-grid {
  background-image:
    linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
  mask-image: radial-gradient(circle at center, black, transparent 92%);
}

.field {
  width: 100%;
  border-radius: 0.95rem;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  padding: 0.65rem 0.8rem;
  color: white;
  outline: none;
}

.field:focus {
  border-color: rgba(var(--accent-rgb), 0.4);
}
</style>
