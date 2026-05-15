<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { LayoutState, OverlayModuleConfig, OverlayRadioDensity, OverlayModuleCategory } from '@shared/general'
import TransportModule from '../components/overlay/TransportModule.vue'
import MapModule from '../components/overlay/MapModule.vue'
import RadioModule from '../components/overlay/RadioModule.vue'
import ModeSelector from '../components/overlay/ModeSelector.vue'
import NotificationModule from '../components/overlay/NotificationModule.vue'
import SessionModule from '../components/overlay/SessionModule.vue'
import SessionLogModule from '../components/overlay/SessionLogModule.vue'
import OcrZoneBox from '../components/ocr/OcrZoneBox.vue'
import OcrEditorTab from '../components/ocr/OcrEditorTab.vue'
import type { OcrZone } from '../ocr/OcrTypes'
import { useOverlayLayout } from '../composables/useOverlayLayout'
import { usePinnedMap } from '../composables/usePinnedMap'
import { usePinnedSession } from '../composables/usePinnedSession'
import { usePinnedTransport } from '../composables/usePinnedTransport'
import { useOverlayInSituEditor } from '../composables/useOverlayInSituEditor'
import { useNotificationBus } from '../composables/useNotificationBus'
import { useModeStore } from '../stores/mode'
import { useAppStore } from '../stores/app'
import { useMiningStore } from '../stores/mining'
import { useOcrStore } from '../stores/ocrStore'

const modeStore = useModeStore()
const appStore  = useAppStore()
const miningStore = useMiningStore()
const ocrStore = useOcrStore()
const editShortcut = computed(() => appStore.settings?.overlayEditKey ?? 'Ctrl+Shift+E')
const { push: pushNotification } = useNotificationBus()

const scBounds  = ref<{ x: number; y: number; width: number; height: number } | null>(null)

// ── OCR Calibration in-situ ───────────────────────────────────────────────
const ocrCalibMode        = ref(false)
const ocrCalibZones       = ref<OcrZone[]>([])
const ocrCalibProfileLabel = ref('')
const ocrCalibProfileId   = ref<string | null>(null)

function onCalibZoneUpdate(id: string, partial: Partial<OcrZone>) {
  const idx = ocrCalibZones.value.findIndex(z => z.id === id)
  if (idx >= 0) ocrCalibZones.value[idx] = { ...ocrCalibZones.value[idx], ...partial }
}

async function exitCalibration() {
  // Persister les positions calibrées directement sur disk — indépendant d'OcrPage
  if (ocrCalibProfileId.value && ocrCalibZones.value.length > 0) {
    try {
      const data = await window.oneCC.ocrLoadProfiles()
      const profiles = (data.profiles ?? []) as any[]
      const profile = profiles.find((p: any) => p.id === ocrCalibProfileId.value)
      if (profile) {
        for (const cz of ocrCalibZones.value) {
          const idx = (profile.zones as any[]).findIndex((z: any) => z.id === cz.id)
          if (idx >= 0) profile.zones[idx] = { ...profile.zones[idx], rect: cz.rect }
        }
        profile.updatedAt = new Date().toISOString()
        await window.oneCC.ocrSaveProfiles({
          profiles,
          selectedProfileId: data.selectedProfileId,
          scanIntervalMs: data.scanIntervalMs ?? 2000,
          selectedSourceName: data.selectedSourceName,
        })
      }
    } catch (e) {
      console.error('[OCR] exitCalibration save failed:', e)
    }
  }
  await window.oneCC.ocrExitOverlayCalibration()
}
const mapVisible        = ref(false)
const mapOverlayOpacity = ref(0.85)
const mapModuleRef      = ref<{ refresh: () => void } | null>(null)
const mapOnlyMode       = ref(false)
const settingsPanelOpen  = ref(false)
const interactionMode    = ref(false)
const activeEditorTab    = ref<'modules' | 'ocr'>('modules')

watch(mapVisible, (visible) => {
  if (visible) nextTick(() => mapModuleRef.value?.refresh())
})

const { pinnedMapId } = usePinnedMap()
const { pinnedSessionId, pin: pinSession, unpin: unpinSession } = usePinnedSession()
const { pinnedTransport, pin: pinTransport, unpin: unpinTransport } = usePinnedTransport()
const { positions, modules, getStyle, loadLayout, applyLayout } = useOverlayLayout()
const {
  editMode,
  selectedId,
  setEditMode,
  selectModule,
  startDrag,
  startResize,
  setField,
  toggleVisibility,
  toggleMinimized,
  discardChanges,
} = useOverlayInSituEditor()

const overlayBounds = computed(() => {
  const bounds = scBounds.value
  return {
    width: bounds?.width ?? window.innerWidth,
    height: bounds?.height ?? window.innerHeight,
  }
})

const selectedModule = computed<OverlayModuleConfig | null>(() => {
  return modules.find((mod) => mod.id === selectedId.value) ?? null
})

const isBuiltInMode = computed(() => {
  const active = modeStore.modes.find((m) => m.id === modeStore.activeModeId)
  return active?.builtIn ?? true
})

const selectedPanelStyle = computed(() => {
  if (!selectedModule.value || !selectedId.value) return null

  const pos = positions[selectedId.value]
  const width = overlayBounds.value.width
  const height = overlayBounds.value.height
  const panelWidth = 260
  const moduleLeft = Math.round((pos?.xPct ?? 0.02) * width)
  const moduleTop = Math.round((pos?.yPct ?? 0.02) * height)
  const moduleWidth = selectedModule.value.width
  const panelLeft = Math.max(12, Math.min(width - panelWidth - 12, moduleLeft + moduleWidth + 14))
  const panelTop = Math.max(12, Math.min(height - 260, moduleTop))

  return {
    left: `${panelLeft}px`,
    top: `${panelTop}px`,
    width: `${panelWidth}px`,
  }
})

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

/** Catégorie par type de module — définie côté dev, non modifiable par l'utilisateur. */
const MODULE_CATEGORY: Record<OverlayModuleType, OverlayModuleCategory> = {
  radio:        'communication',
  transport:    'navigation',
  notification: 'hud',
  mining:       'mining',
}

const CATEGORY_LABELS: Record<OverlayModuleCategory, string> = {
  communication: '📡 Communication',
  navigation:    '🗺 Navigation',
  hud:           '🖥 HUD',
  mining:        '⛏ Mining',
  autre:         'Autre',
}

const CATEGORY_ORDER: OverlayModuleCategory[] = ['communication', 'navigation', 'hud', 'mining', 'autre']

const modulesByCategory = computed(() => {
  const map = new Map<OverlayModuleCategory, OverlayModuleConfig[]>()
  for (const mod of modules) {
    const cat = MODULE_CATEGORY[mod.type] ?? 'autre'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(mod)
  }
  const sorted = new Map<OverlayModuleCategory, OverlayModuleConfig[]>()
  for (const cat of CATEGORY_ORDER) { if (map.has(cat)) sorted.set(cat, map.get(cat)!) }
  return sorted
})

function isVisible(mod: (typeof modules)[number]): boolean {
  if (mapOnlyMode.value) return false
  // Onglet OCR actif en mode éditeur → masquer tous les modules (vue dégagée pour calibration)
  if (editMode.value && activeEditorTab.value === 'ocr') return false
  // En mode Minage (builtIn), les modules mining s'affichent si session épinglée,
  // sans tenir compte du flag `visible` (qui peut être false dans un layout sauvegardé ancien)
  const inMiningMode = modeStore.activeModeId === 'mining'
  if (mod.type === 'mining' || mod.type === 'session-log') {
    if (inMiningMode) return editMode.value || pinnedSessionId.value !== null
    return mod.visible && (editMode.value || pinnedSessionId.value !== null)
  }
  if (!mod.visible) return false
  if (mod.visibleOnlyInInteraction && !interactionMode.value && !editMode.value) return false
  if (mod.type === 'transport') return editMode.value || !!pinnedTransport.value
  return true
}

/** Types de modules qui supportent l'interaction souris (défini côté dev). */
const INTERACTABLE_MODULE_TYPES = new Set(['radio'])

function isModuleInteractive(mod: OverlayModuleConfig): boolean {
  return interactionMode.value && (mod.allowInteraction || INTERACTABLE_MODULE_TYPES.has(mod.type))
}

function selectForEditing(id: string) {
  selectModule(id, overlayBounds.value)
}

function toggleSettingsPanel(id: string) {
  if (isBuiltInMode.value) return
  if (selectedId.value !== id) {
    selectForEditing(id)
    settingsPanelOpen.value = true
    return
  }
  settingsPanelOpen.value = !settingsPanelOpen.value
}

async function exitEditMode() {
  settingsPanelOpen.value = false
  try { await discardChanges() } catch { /* ignore reload error */ }
  setEditMode(false)
  void window.oneCC.setOverlayEditMode(false)
}

async function updateField<K extends keyof OverlayModuleConfig>(
  key: K,
  value: OverlayModuleConfig[K],
) {
  if (!selectedModule.value) return
  await setField(selectedModule.value.id, key, value)
}

async function toggleSelectedVisibility() {
  if (!selectedModule.value) return
  await toggleVisibility(selectedModule.value.id)
}

async function toggleSelectedMinimized() {
  if (!selectedModule.value) return
  await toggleMinimized(selectedModule.value.id)
}


onMounted(async () => {
  const settings = await window.oneCC.getSettings()
  mapOverlayOpacity.value = settings.mapOverlayOpacity ?? 0.85

  await Promise.all([loadLayout(), modeStore.load(), miningStore.init()])

  window.oneCC.onActiveModeChange((modeId) => {
    const prev = modeStore.activeModeId
    modeStore.setActiveModeId(modeId)
    if (modeId !== prev) {
      const mode = modeStore.modes.find((m) => m.id === modeId)
      pushNotification({
        id: `mode-${modeId}-${Date.now()}`,
        title: 'Mode activé',
        message: mode?.label ?? modeId,
        type: 'info',
        duration: 3000,
      })
    }
  })

  window.oneCC.onOverlayLayoutUpdate((l: LayoutState) => applyLayout(l))
  window.oneCC.onOverlayEditMode(async (enabled) => {
    if (enabled) {
      settingsPanelOpen.value = false
      await loadLayout()
      setEditMode(true)
      return
    }
    // Skip if already exited (e.g. exitEditMode() already acted locally)
    if (!editMode.value) return
    settingsPanelOpen.value = false
    try { await discardChanges() } catch { /* ignore */ }
    setEditMode(false)
  })

  window.oneCC.onOverlayGameBounds((b) => { scBounds.value = b })

  // Sync profils OCR : recharger quand la main window sauvegarde
  window.oneCC?.onOcrProfilesChanged?.(() => {
    ocrStore.reloadFromRemote()
  })

  window.oneCC.onOcrCalibrationStart(async (profileId: string) => {
    const data = await window.oneCC.ocrLoadProfiles()
    const profile = (data.profiles as any[]).find((p: any) => p.id === profileId)
    if (profile) {
      ocrCalibZones.value = [...profile.zones]
      ocrCalibProfileLabel.value = profile.label
      ocrCalibProfileId.value = profileId
      ocrCalibMode.value = true
    }
  })

  window.oneCC.onOcrCalibrationStop(() => {
    ocrCalibMode.value = false
    ocrCalibZones.value = []
    ocrCalibProfileId.value = null
  })

  window.oneCC.onMapToggle(() => {
    mapVisible.value = !mapVisible.value
  })

  window.oneCC.onMapOnlyMode((v) => { mapOnlyMode.value = v })
  window.oneCC.onInteractionMode((active: boolean) => { interactionMode.value = active })

  window.oneCC.onSettingsUpdate((s: any) => {
    if (s?.mapOverlayOpacity != null) mapOverlayOpacity.value = s.mapOverlayOpacity
  })

  // Point d'entrée unique : tous les events Mercure session propagés depuis le main process
  window.oneCC.onSessionEvent((raw: string) => {
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw
      miningStore._handleSessionEvent(data)
    } catch { /* ignore parse errors */ }
  })
})

onUnmounted(() => {
  window.oneCC.offOverlay()
  window.oneCC.offSettingsUpdate()
  window.oneCC.offActiveModeChange()
  window.oneCC.offOcrCalibration()
  window.oneCC?.offOcrProfilesChanged?.()
})
</script>

<template>
  <div class="fixed inset-0 overflow-hidden select-none overlay-root" :class="{ 'overlay-root--editing': editMode }">

    <!-- Panneau contrôle OCR calibration -->
    <Transition name="fade">
      <div
        v-if="ocrCalibMode"
        class="pointer-events-auto fixed top-4 right-4 z-[15000] rounded-xl border border-violet-400/40 bg-slate-950/92 p-3 text-[11px] text-white backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        style="min-width: 220px"
      >
        <div class="font-bold text-violet-300 mb-1" style="font-size:13px">⊞ Calibration OCR</div>
        <div class="text-slate-400 mb-2" style="font-size:10px">{{ ocrCalibProfileLabel }} — glissez les zones</div>
        <button
          class="w-full rounded-lg border border-violet-400/40 bg-violet-500/20 py-1.5 text-violet-200 hover:bg-violet-500/30 transition"
          style="font-size:11px; cursor:pointer"
          @click="exitCalibration"
        >
          ✓ Terminer la calibration
        </button>
      </div>
    </Transition>

    <!-- Voile de fond en mode édition -->
    <Transition name="fade">
      <div v-if="editMode" class="pointer-events-none absolute inset-0" style="background: linear-gradient(180deg, rgba(2,6,23,0.40) 0%, rgba(2,6,23,0.30) 100%), radial-gradient(circle at top, rgba(14,165,233,0.12), transparent 45%)" />
    </Transition>

    <!-- Panneau de contrôle — haut centre -->
    <Transition name="fade">
      <div v-if="editMode" class="pointer-events-auto fixed top-4 left-1/2 -translate-x-1/2 z-[12000]">
        <div class="rounded-2xl border border-sky-400/35 bg-slate-950/90 px-5 py-3.5 text-[12px] text-sky-100 shadow-[0_20px_60px_rgba(2,6,23,0.55)] backdrop-blur-md min-w-[440px] max-w-[520px]">

          <!-- En-tête -->
          <div class="flex items-center justify-between gap-6 mb-3">
            <div>
              <div class="font-bold text-[13px] text-white">Édition intégrée</div>
              <div class="text-[11px] text-sky-300/70 mt-0.5">
                Glissez les modules · appuyez sur
                <kbd class="mx-0.5 rounded border border-sky-400/30 bg-sky-500/10 px-1 py-0.5 font-mono text-[10px] text-sky-200">{{ editShortcut }}</kbd>
                pour fermer
              </div>
            </div>
          </div>

          <!-- Onglets -->
          <div class="flex gap-1 mb-3 border-b border-white/8 pb-2">
            <button
              v-for="tab in ([{ key: 'modules', label: '⊙ Modules' }, { key: 'ocr', label: '⊞ OCR' }] as const)"
              :key="tab.key"
              class="rounded-lg px-3 py-1 text-[11px] font-medium transition"
              :class="activeEditorTab === tab.key
                ? 'bg-sky-500/20 border border-sky-400/50 text-sky-200'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'"
              @click="activeEditorTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- Contenu onglet Modules -->
          <template v-if="activeEditorTab === 'modules'">
            <div class="flex flex-wrap gap-x-5 gap-y-2">
              <template v-for="[cat, catMods] in modulesByCategory" :key="cat">
                <div class="min-w-[120px]">
                  <div class="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-sky-400/50">
                    {{ CATEGORY_LABELS[cat] ?? cat }}
                  </div>
                  <div class="flex flex-col gap-1">
                    <button
                      v-for="mod in catMods"
                      :key="`${mod.id}-toggle`"
                      class="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition text-left"
                      :class="isBuiltInMode || mod.type === 'notification'
                        ? 'border-sky-400/30 bg-sky-500/10 text-sky-100/70 cursor-default'
                        : mod.visible
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20'
                          : 'border-white/10 bg-white/5 text-slate-500 hover:text-slate-300 hover:bg-white/10'"
                      :title="isBuiltInMode || mod.type === 'notification' ? mod.title : (mod.visible ? 'Cliquer pour masquer' : 'Cliquer pour afficher')"
                      @click="!isBuiltInMode && mod.type !== 'notification' && void toggleVisibility(mod.id)"
                    >
                      <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="mod.visible ? 'bg-emerald-400' : 'bg-slate-600'" />
                      {{ mod.title }}
                      <span v-if="INTERACTABLE_MODULE_TYPES.has(mod.type) || mod.allowInteraction" class="ml-auto text-[9px] text-amber-300/60" title="Interaction activable">⊙</span>
                    </button>
                  </div>
                </div>
              </template>
            </div>
            <!-- Séparateur + Sélecteur de mode -->
            <div class="mt-3 border-t border-white/8 pt-3">
              <ModeSelector />
            </div>
          </template>

          <!-- Contenu onglet OCR -->
          <template v-else-if="activeEditorTab === 'ocr'">
            <OcrEditorTab />
          </template>

        </div>
      </div>
    </Transition>

    <div :style="scContainerStyle" class="overflow-hidden" :class="{ 'pointer-events-auto': editMode }">
      <template v-for="mod in modules" :key="mod.id">
        <Transition name="fade">
          <div
            v-if="isVisible(mod)"
            class="absolute module-draggable"
            :data-module-id="mod.id"
            :class="{
              'pointer-events-none': !editMode && !isModuleInteractive(mod),
              'pointer-events-auto': !editMode && isModuleInteractive(mod),
              'pointer-events-auto cursor-move': editMode,
              'overlay-module--selected': editMode && selectedId === mod.id,
              'overlay-module--interactive': !editMode && isModuleInteractive(mod),
            }"
            :style="getStyle(mod.id, scBounds?.width, scBounds?.height)"
            @mousedown="editMode && startDrag($event, mod.id, overlayBounds)"
          >
            <template v-if="!mod.minimized">
              <div class="w-full overflow-hidden rounded-2xl" :style="{ zoom: mod.fontSize ?? 1 }">
                <NotificationModule v-if="mod.type === 'notification'" :preview="editMode" />
                <TransportModule v-else-if="mod.type === 'transport'" />
                <RadioModule
                  v-else-if="mod.type === 'radio'"
                  :config="mod"
                  :preview="editMode"
                  :preview-state="editMode ? {
                    connected: true,
                    currentChannel: 'ops-1',
                    currentChannelName: 'OPS-1',
                    participantCount: 4,
                    transmitting: false,
                    muted: false,
                    mutedIncoming: false,
                    activeSpeakers: [{ identity: 'Cdt. Dupont', channel: 'OPS-1', audioLevel: 0.8 }],
                  } : null"
                />
                <SessionModule v-else-if="mod.type === 'mining'" :config="mod" :preview="editMode" :interactive="isModuleInteractive(mod)" />
                <SessionLogModule v-else-if="mod.type === 'session-log'" :preview="editMode" />
              </div>
            </template>
            <div v-else class="rounded-xl border border-white/10 bg-black/60 px-3 py-1 text-[10px] text-th-muted backdrop-blur-sm">
              {{ mod.title }}
            </div>

            <template v-if="editMode && selectedId === mod.id">
              <div class="overlay-module-frame" />

              <div class="overlay-module-tools">
                <button
                  v-if="mod.type !== 'notification' && !isBuiltInMode"
                  class="overlay-module-tool"
                  :title="mod.visible ? 'Masquer' : 'Afficher'"
                  @mousedown.stop
                  @click.stop="void toggleVisibility(mod.id)"
                >
                  {{ mod.visible ? 'VIS' : 'OFF' }}
                </button>
                <button
                  v-if="!isBuiltInMode"
                  class="overlay-module-tool"
                  title="Parametres"
                  @mousedown.stop
                  @click.stop="toggleSettingsPanel(mod.id)"
                >
                  ⚙
                </button>
              </div>

              <div
                v-if="!mod.locked"
                class="overlay-module-resize"
                title="Redimensionner"
                @click.stop
                @mousedown.stop="startResize($event, mod.id, overlayBounds)"
              />
            </template>
          </div>
        </Transition>
      </template>

      <Transition name="fade">
        <div
          v-if="editMode && settingsPanelOpen && selectedModule && selectedPanelStyle && !isBuiltInMode"
          class="pointer-events-auto absolute z-[11000] rounded-2xl border border-white/12 bg-slate-950/88 p-3 text-[12px] text-slate-100 shadow-[0_18px_60px_rgba(2,6,23,0.45)] backdrop-blur-md"
          :style="selectedPanelStyle"
        >
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <div class="font-semibold text-white">{{ selectedModule.title }}</div>
              <div class="text-[11px] text-slate-400">{{ selectedModule.type === 'radio' ? 'Module radio' : 'Module transport' }}</div>
            </div>
            <button class="rounded-md px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white" @click="settingsPanelOpen = false">×</button>
          </div>

          <div class="space-y-2">
            <label v-if="selectedModule.type !== 'notification'" class="overlay-setting-row">
              <span>Visible</span>
              <input type="checkbox" :checked="selectedModule.visible" @change="void toggleSelectedVisibility()" />
            </label>
            <label class="overlay-setting-block">
              <span>Opacité</span>
              <input type="range" min="0.2" max="1" step="0.05" :value="selectedModule.opacity" @input="void updateField('opacity', Number(($event.target as HTMLInputElement).value))" />
            </label>
            <label class="overlay-setting-block">
              <span>Taille du texte</span>
              <input type="range" min="0.75" max="1.5" step="0.05" :value="selectedModule.fontSize" @input="void updateField('fontSize', Number(($event.target as HTMLInputElement).value))" />
            </label>

            <!-- Pin transport -->
            <label v-if="selectedModule.type === 'transport'" class="overlay-setting-row">
              <span>Épingler</span>
              <input type="checkbox" :checked="pinnedTransport" @change="pinnedTransport ? unpinTransport() : pinTransport(1)" />
            </label>

            <!-- Pin session mining -->
            <template v-if="selectedModule.type === 'mining'">
              <div class="overlay-setting-row">
                <span>Session épinglée</span>
                <span class="text-[10px]" :class="pinnedSessionId ? 'text-cyan-400' : 'text-slate-500'">
                  {{ pinnedSessionId ? `#${pinnedSessionId}` : 'Aucune' }}
                </span>
              </div>
              <button
                v-if="pinnedSessionId"
                class="w-full rounded-lg border border-red-500/30 bg-red-500/10 py-1.5 text-[10px] text-red-400 hover:bg-red-500/20 transition"
                @click="unpinSession()"
              >
                Désépingler la session
              </button>
            </template>

            <template v-if="selectedModule.type === 'radio'">
              <label class="overlay-setting-block">
                <span>Densité</span>
                <select :value="selectedModule.radioDensity ?? 'medium'" @change="void updateField('radioDensity', ($event.target as HTMLSelectElement).value as OverlayRadioDensity)">
                  <option value="compact">Compact</option>
                  <option value="medium">Intermédiaire</option>
                  <option value="detailed">Détaillé</option>
                </select>
              </label>
              <label class="overlay-setting-row">
                <span>Participants</span>
                <input type="checkbox" :checked="selectedModule.radioShowParticipants ?? true" @change="void updateField('radioShowParticipants', ($event.target as HTMLInputElement).checked)" />
              </label>
              <label class="overlay-setting-row">
                <span>Speakers actifs</span>
                <input type="checkbox" :checked="selectedModule.radioShowSpeakers ?? true" @change="void updateField('radioShowSpeakers', ($event.target as HTMLInputElement).checked)" />
              </label>
              <label class="overlay-setting-row">
                <span>Détails avancés</span>
                <input type="checkbox" :checked="selectedModule.radioShowAdvancedStatus ?? true" @change="void updateField('radioShowAdvancedStatus', ($event.target as HTMLInputElement).checked)" />
              </label>
            </template>
          </div>
        </div>
      </Transition>

      <!-- ── OCR zones : éditeur OCR actif (aperçu + déplacement) ────────── -->
      <template v-if="editMode && activeEditorTab === 'ocr' && !ocrCalibMode">
        <OcrZoneBox
          v-for="zone in ocrStore.zones"
          :key="zone.id"
          :zone="zone"
          :container-width="overlayBounds.width"
          :container-height="overlayBounds.height"
          class="pointer-events-auto"
        />
      </template>

      <!-- ── OCR Calibration in-situ ─────────────────────────────────────── -->
      <template v-if="ocrCalibMode">
        <OcrZoneBox
          v-for="zone in ocrCalibZones"
          :key="zone.id"
          :zone="zone"
          :container-width="overlayBounds.width"
          :container-height="overlayBounds.height"
          :update-handler="onCalibZoneUpdate"
          class="pointer-events-auto"
        />
      </template>

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
  pointer-events: none;
}

.overlay-root.overlay-root--editing {
  pointer-events: auto;
}

.overlay-module--selected {
  filter: drop-shadow(0 0 14px rgba(56, 189, 248, 0.4));
}

/* Module interactif (touche maintenue) */
.overlay-module--interactive {
  outline: 1px solid rgba(251, 191, 36, 0.4);
  outline-offset: 2px;
  border-radius: 18px;
}


.overlay-module-frame {
  position: absolute;
  inset: -3px;
  border: 2px solid rgba(56, 189, 248, 0.9);
  border-radius: 18px;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(186, 230, 253, 0.25), 0 0 30px rgba(14, 165, 233, 0.15);
}

.overlay-module-tools {
  position: absolute;
  top: -12px;
  right: -8px;
  display: flex;
  gap: 6px;
}

.overlay-module-tool {
  min-width: 28px;
  height: 28px;
  border-radius: 9999px;
  border: 1px solid rgba(186, 230, 253, 0.5);
  background: rgba(2, 6, 23, 0.88);
  color: white;
  font-size: 10px;
  font-weight: 700;
  box-shadow: 0 6px 20px rgba(2, 6, 23, 0.35);
}

.overlay-module-tool:hover {
  background: rgba(14, 165, 233, 0.22);
}

.overlay-module-resize {
  position: absolute;
  right: -8px;
  bottom: -8px;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  border: 1px solid rgba(186, 230, 253, 0.8);
  background: rgba(14, 165, 233, 0.95);
  box-shadow: 0 0 0 2px rgba(2, 6, 23, 0.55);
  cursor: nwse-resize;
}

.overlay-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.04);
}

.overlay-setting-block {
  display: block;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.04);
}

.overlay-setting-block span {
  display: block;
  margin-bottom: 8px;
}

.overlay-setting-block input[type='range'] {
  width: 100%;
}

.overlay-setting-block select {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.95);
  padding: 8px 10px;
  color: white;
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
