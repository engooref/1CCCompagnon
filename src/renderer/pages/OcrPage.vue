<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useOcrStore } from '@renderer/stores/ocrStore'
import { ocrCaptureService } from '@renderer/ocr/OcrCaptureService'
import { ocrRunner } from '@renderer/ocr/OcrRunner'
import { fetchMineralsOnly } from '@renderer/services/miningService'
import { loadRemoteMinerals } from '@renderer/ocr/OcrMaterialsDb'
import OcrProfileSelector from '@renderer/components/ocr/OcrProfileSelector.vue'
import OcrZoneOverlay from '@renderer/components/ocr/OcrZoneOverlay.vue'
import OcrZoneListItem from '@renderer/components/ocr/OcrZoneListItem.vue'
import OcrResultPanel from '@renderer/components/ocr/OcrResultPanel.vue'
import OcrPreprocessCalibrator from '@renderer/components/ocr/OcrPreprocessCalibrator.vue'

const ocr = useOcrStore()

const previewCanvas = ref<HTMLCanvasElement | null>(null)
const previewContainer = ref<HTMLDivElement | null>(null)

const containerW = ref(960)
const containerH = ref(540)

// Vraie taille rendue du wrapper (peut différer de containerW si max-width contraint)
const renderedW = ref(960)
const renderedH = ref(540)
let resizeObs: ResizeObserver | null = null

const scSourceName = ref<string | null>(null)
const sourceError = ref<string | null>(null)

const isDebug = import.meta.env.DEV
const SC_KEYWORDS = ['star citizen', 'starcitizen', 'rsi', 'live']
function isScSource(name: string): boolean {
  const n = name.toLowerCase()
  return SC_KEYWORDS.some(kw => n.includes(kw))
}
let _mineralsLoaded = false
const debugSources = ref<{ id: string; name: string; type: string }[]>([])
const debugSourceId = ref<string | null>(null)

const engineReady = ref(false)
const engineLoading = ref(true)
const engineError = ref<string | null>(null)

const sourceChecking = ref(false)
const captureRunning = ref(false)

// ── Computed ────────────────────────────────────────────────────────────────
const hasZones = computed(() => ocr.zones.length > 0)

const activeZoneCount = computed(() =>
  ocr.zones.filter((z: any) => z.enabled !== false).length
)

function zoneCategory(zone: any): 'rock' | 'hud' | 'custom' {
  if (zone.category === 'rock' || /^material\d+(Percent|Name|Qty)$/.test(zone.fieldKey)) return 'rock'
  if (zone.category === 'hud' || zone.fieldKey === 'coordinates' || zone.fieldKey === 'signal') return 'hud'
  return 'custom'
}

const zoneGroups = computed(() => {
  const groups = [
    { key: 'rock', label: 'Rocher', zones: [] as any[] },
    { key: 'hud', label: 'HUD', zones: [] as any[] },
    { key: 'custom', label: 'Personnalisées', zones: [] as any[] },
  ]
  for (const zone of ocr.zones) {
    groups.find(g => g.key === zoneCategory(zone))?.zones.push(zone)
  }
  return groups.filter(g => g.zones.length > 0)
})

function enabledCount(zones: any[]): number {
  return zones.filter(z => z.enabled !== false).length
}

function onSafeModeChange(e: Event): void {
  ocr.captureSafeMode = (e.target as HTMLInputElement).checked
}

const canScan = computed(() =>
  engineReady.value &&
  captureRunning.value &&
  hasZones.value &&
  activeZoneCount.value > 0 &&
  !ocr.isScanning
)

const previewStyle = computed(() => ({
  width: `${containerW.value}px`,
  height: `${containerH.value}px`,
}))

const sourceStatusLabel = computed(() => {
  if (sourceChecking.value) return 'Recherche de Star Citizen...'
  if (scSourceName.value) return scSourceName.value
  return 'Star Citizen non détecté'
})

const scanButtonLabel = computed(() => {
  if (ocr.isScanning) return 'Analyse...'
  if (!engineReady.value) return 'OCR indisponible'
  if (!captureRunning.value) return 'Capture absente'
  if (!hasZones.value) return 'Aucune zone'
  return 'Scanner maintenant'
})

const captureLabel = computed(() => {
  if (!captureRunning.value) return 'Capture inactive'
  return `${containerW.value}×${containerH.value}`
})

onMounted(() => {
  bootOcrPage()
  if (previewContainer.value) {
    resizeObs = new ResizeObserver(([entry]) => {
      renderedW.value = Math.round(entry.contentRect.width)
      renderedH.value = Math.round(entry.contentRect.height)
    })
    resizeObs.observe(previewContainer.value)
  }
})

onUnmounted(async () => {
  resizeObs?.disconnect()
  resizeObs = null
  stopPreviewLoop()
  ocrRunner.stopAutoScan()

  try {
    await window.oneCC?.ocrSetOverlayContentProtection?.(false)
    window.oneCC?.offOcrCalibration?.()
    window.oneCC?.offOcrProfilesChanged?.()
  } catch {
    // noop
  }

  try {
    ;(ocrCaptureService as any).stop?.()
  } catch {
    // noop
  }
})

// ── Init ────────────────────────────────────────────────────────────────────
async function bootOcrPage() {
  sourceError.value = null
  engineError.value = null
  engineLoading.value = true

  try {
    await ocr.loadProfiles()
    bindIpcEvents()
    await detectSource()
    await initEngine()
    await window.oneCC?.ocrSetOverlayContentProtection?.(true)
    startPreviewLoop()
  } catch (e) {
    sourceError.value = safeError(e)
  } finally {
    engineLoading.value = false
  }
}

function bindIpcEvents() {
  window.oneCC?.onOcrZoneRectUpdate?.(
    ({ id, rect }: { id: string; rect: any }) => {
      ocr.updateZone(id, { rect })
    }
  )

  window.oneCC?.onOcrProfilesChanged?.(() => {
    ocr.reloadFromRemote()
  })
}

async function initEngine() {
  engineLoading.value = true
  engineError.value = null

  try {
    await ocrRunner.init()
    engineReady.value = true
    if (captureRunning.value) {
      ocrRunner.startAutoScanZone('signal', ocr.scanIntervalMs)
    }
  } catch (e) {
    engineReady.value = false
    engineError.value = safeError(e)
    console.warn('[OCR] Engine init failed:', e)
  } finally {
    engineLoading.value = false
  }
}

// ── Source Star Citizen ─────────────────────────────────────────────────────
async function detectSource() {
  sourceChecking.value = true
  sourceError.value = null
  scSourceName.value = null
  captureRunning.value = false

  try {
    debugSources.value = await ocrCaptureService.listSources()

    const preferred = await ocrCaptureService.selectPreferredSource()

    if (!preferred) {
      sourceError.value = 'Star Citizen non détecté. Lance le jeu, puis clique sur “Détecter SC”.'
      return
    }

    ocr.setSource(preferred)
    scSourceName.value = preferred.name
    debugSourceId.value = preferred.id

    await startCapture(preferred.id)
  } catch (e) {
    sourceError.value = safeError(e)
    console.warn('[OCR] Source detection error:', e)
  } finally {
    sourceChecking.value = false
  }
}

async function debugSelectSource(id: string) {
  if (!id) return
  const source = debugSources.value.find(s => s.id === id)
  if (!source) return
  ocrRunner.stopAutoScan()
  captureRunning.value = false
  sourceError.value = null
  debugSourceId.value = id
  ocr.setSource(source)
  scSourceName.value = source.name
  await startCapture(id)
}

async function startCapture(sourceId: string) {
  try {
    await ocrCaptureService.start(sourceId)

    const size = ocrCaptureService.getCaptureSize()
    if (size.width > 0 && size.height > 0) {
      fitPreviewToSource(size.width, size.height)
    }

    captureRunning.value = true
    if (engineReady.value) {
      ocrRunner.startAutoScanZone('signal', ocr.scanIntervalMs)
    }
  } catch (e) {
    captureRunning.value = false
    sourceError.value = safeError(e)
    console.warn('[OCR] Capture start error:', e)
  }
}

function fitPreviewToSource(sourceW: number, sourceH: number) {
  const maxW = 1040
  const maxH = 620
  const ratio = sourceW / sourceH

  let w = Math.min(sourceW, maxW)
  let h = Math.round(w / ratio)

  if (h > maxH) {
    h = maxH
    w = Math.round(h * ratio)
  }

  containerW.value = Math.max(420, w)
  containerH.value = Math.max(240, h)
}

// ── Preview loop ────────────────────────────────────────────────────────────
let previewTimer: ReturnType<typeof setTimeout> | null = null
let previewLoopRunning = false

function startPreviewLoop() {
  if (previewLoopRunning) return

  previewLoopRunning = true

  const draw = async () => {
    if (!previewLoopRunning) return

    captureRunning.value = Boolean(ocrCaptureService.isRunning)

    if (captureRunning.value && previewCanvas.value) {
      try {
        const frame = await ocrCaptureService.captureFrame()
        const ctx = previewCanvas.value.getContext('2d')

        if (ctx) {
          previewCanvas.value.width = frame.width
          previewCanvas.value.height = frame.height
          ctx.clearRect(0, 0, frame.width, frame.height)
          ctx.drawImage(frame, 0, 0)
        }
      } catch {
        captureRunning.value = false
      }
    }

    previewTimer = setTimeout(draw, 120)
  }

  draw()
}

function stopPreviewLoop() {
  previewLoopRunning = false

  if (previewTimer !== null) {
    clearTimeout(previewTimer)
    previewTimer = null
  }
}

// ── Scan ────────────────────────────────────────────────────────────────────
async function scanNow() {
  if (!canScan.value) return

  if (!_mineralsLoaded) {
    _mineralsLoaded = true
    fetchMineralsOnly()
      .then(loadRemoteMinerals)
      .catch(e => console.warn('[OCR] fetchMinerals failed:', e))
  }

  try {
    await ocrRunner.scanOnce()
  } catch (e) {
    sourceError.value = safeError(e)
    console.warn('[OCR] Scan error:', e)
  }
}

function clearResults() {
  ocr.clearResults()
}

function safeError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
</script>

<template>
  <div class="ocr-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Calibration</p>
        <h2 class="page-title">OCR Star Citizen</h2>
        <p class="page-subtitle">
          Place les zones sur la capture, puis lance un scan pour tester la lecture.
        </p>
      </div>

      <div class="header-status">
        <span class="status-pill" :class="{ ok: engineReady, warn: engineLoading, err: engineError }">
          <template v-if="engineLoading">OCR en chargement</template>
          <template v-else-if="engineReady">OCR prêt</template>
          <template v-else>OCR indisponible</template>
        </span>

        <span class="status-pill" :class="{ ok: captureRunning, err: !captureRunning }">
          {{ captureLabel }}
        </span>
      </div>
    </header>

    <section class="toolbar">
      <div class="toolbar-block profile-block">
        <label>Profil OCR</label>
        <OcrProfileSelector />
      </div>

      <div class="toolbar-block source-block">
        <label>Source détectée</label>
        <div class="source-row">
          <div class="sc-status" :class="{ ok: !!scSourceName, err: !scSourceName }">
            <span class="dot" />
            <span>{{ sourceStatusLabel }}</span>
          </div>

          <button class="btn" :disabled="sourceChecking" @click="detectSource">
            {{ sourceChecking ? 'Recherche...' : 'Détecter SC' }}
          </button>
        </div>
      </div>

      <div v-if="debugSources.length" class="toolbar-block debug-block">
        <label>Source capture</label>
        <select
          :value="debugSourceId ?? ''"
          @change="debugSelectSource(($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>— choisir —</option>
          <option v-for="s in debugSources" :key="s.id" :value="s.id">
            {{ s.type === 'screen' ? '🖥' : '🪟' }} {{ s.name }}
          </option>
        </select>
      </div>

      <div class="toolbar-actions">
        <label class="safe-toggle" title="Masque les cadres OCR pendant la capture pour éviter de polluer l'image.">
          <input
            type="checkbox"
            :checked="ocr.captureSafeMode"
            @change="onSafeModeChange"
          />
          Capture safe
        </label>
        <button class="btn primary" :disabled="!canScan" @click="scanNow">
          {{ scanButtonLabel }}
        </button>
        <button class="btn ghost" :disabled="ocr.normalizedResults.length === 0" @click="clearResults">
          Vider
        </button>
      </div>
    </section>

    <section v-if="sourceError || engineError" class="alert-list">
      <div v-if="sourceError" class="alert error">
        <strong>Capture :</strong> {{ sourceError }}
      </div>

      <div v-if="engineError" class="alert warn">
        <strong>Moteur OCR :</strong> {{ engineError }}
      </div>
    </section>

    <section class="helper-strip">
      <div class="step" :class="{ done: !!scSourceName }">
        <span>1</span>
        <p>Détecter Star Citizen</p>
      </div>

      <div class="step" :class="{ done: hasZones }">
        <span>2</span>
        <p>Positionner les zones</p>
      </div>

      <div class="step" :class="{ done: engineReady }">
        <span>3</span>
        <p>Scanner et vérifier</p>
      </div>
    </section>

    <main class="main-layout">
      <section class="preview-col">
        <div class="preview-card">
          <div class="preview-head">
            <div>
              <strong>Prévisualisation</strong>
              <small>{{ activeZoneCount }} zone(s) active(s)</small>
            </div>

            <div class="preview-badges">
              <span v-if="captureRunning" class="mini-badge ok">Live</span>
              <span v-else class="mini-badge err">Off</span>
            </div>
          </div>

          <div class="preview-wrapper" :style="previewStyle" ref="previewContainer">
            <canvas ref="previewCanvas" class="preview-canvas" />

            <div v-if="!captureRunning" class="empty-preview">
              <strong>Aucune capture active</strong>
              <span>Lance Star Citizen puis clique sur “Détecter SC”.</span>
            </div>

            <OcrZoneOverlay
              v-if="captureRunning"
              :width="renderedW"
              :height="renderedH"
            />
          </div>

          <p class="hint">
            Les zones doivent encadrer uniquement le texte à lire. Évite les icônes, reflets et fonds trop lumineux.
          </p>
        </div>
      </section>

      <aside class="side-col">
        <section class="panel">
          <div class="panel-header">
            <span>Zones OCR</span>
            <small>{{ activeZoneCount }}/{{ ocr.zones.length }}</small>
          </div>

          <div v-if="ocr.zones.length" class="zone-list">
            <div v-for="group in zoneGroups" :key="group.key" class="zone-group">
              <div class="zone-group-title">
                <span>{{ group.label }}</span>
                <small>{{ enabledCount(group.zones) }}/{{ group.zones.length }}</small>
              </div>
              <OcrZoneListItem
                v-for="z in group.zones"
                :key="z.id"
                :zone="z"
                :engine-ready="engineReady"
              />
            </div>
          </div>

          <div v-else class="empty-panel">
            Aucune zone configurée pour ce profil.
          </div>
        </section>

        <OcrPreprocessCalibrator />

        <section class="panel">
          <div class="panel-header">
            <span>Résultats OCR</span>
          </div>

          <OcrResultPanel />
        </section>

      </aside>
    </main>
  </div>
</template>

<style scoped>
.ocr-page {
  min-height: 100vh;
  padding: 16px;
  color: var(--text-color, #f1f5f9);
  background:
    radial-gradient(circle at top left, rgba(34, 211, 238, 0.12), transparent 32rem),
    var(--bg-color, #0f172a);
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.eyebrow {
  margin: 0 0 2px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.9);
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--primary-color, #22d3ee);
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: rgba(226, 232, 240, 0.68);
}

.header-status {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.status-pill,
.mini-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(15, 23, 42, 0.7);
  padding: 4px 9px;
  font-size: 11px;
  white-space: nowrap;
}

.status-pill.ok,
.mini-badge.ok {
  color: #86efac;
  border-color: rgba(134, 239, 172, 0.35);
  background: rgba(134, 239, 172, 0.08);
}

.status-pill.warn {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.35);
  background: rgba(251, 191, 36, 0.08);
}

.status-pill.err,
.mini-badge.err {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
}

.mini-badge.active {
  color: var(--primary-color, #22d3ee);
  border-color: rgba(34, 211, 238, 0.45);
  background: rgba(34, 211, 238, 0.12);
}

.debug-block select {
  font-size: 11px;
  background: rgba(251, 191, 36, 0.08);
  border-color: rgba(251, 191, 36, 0.35);
  color: #fbbf24;
  border-radius: 4px;
  border: 1px solid;
  padding: 3px 6px;
  min-width: 180px;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 320px) 1fr auto;
  gap: 10px;
  align-items: end;
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(10px);
}

.toolbar-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.toolbar-block label,
.field span {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.9);
}

.source-row,
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.safe-toggle {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(226, 232, 240, 0.78);
  font-size: 11px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
}

.sc-status {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid;
  font-size: 12px;
}

.sc-status.ok {
  color: #86efac;
  border-color: rgba(134, 239, 172, 0.35);
  background: rgba(134, 239, 172, 0.08);
}

.sc-status.err {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 10px currentColor;
}

.btn {
  min-height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color, #f1f5f9);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
}

.btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.btn.primary {
  color: #06121a;
  background: var(--primary-color, #22d3ee);
  border-color: rgba(34, 211, 238, 0.7);
}

.btn.active {
  color: var(--primary-color, #22d3ee);
  background: rgba(34, 211, 238, 0.15);
  border-color: rgba(34, 211, 238, 0.55);
}

.btn.ghost {
  background: transparent;
}

.alert-list {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
}

.alert {
  border-radius: 7px;
  padding: 7px 9px;
  font-size: 12px;
}

.alert.error {
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.55);
  background: rgba(239, 68, 68, 0.13);
}

.alert.warn {
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.45);
  background: rgba(251, 191, 36, 0.11);
}

.helper-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.22);
  opacity: 0.65;
}

.step.done {
  opacity: 1;
  border-color: rgba(34, 211, 238, 0.32);
  background: rgba(34, 211, 238, 0.08);
}

.step span {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 800;
}

.step.done span {
  color: #06121a;
  background: var(--primary-color, #22d3ee);
}

.step p {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
}

.main-layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.preview-col {
  flex: 1;
  min-width: 0;
}

.preview-card,
.panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.32);
  overflow: hidden;
}

.preview-head,
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
}

.preview-head strong,
.panel-header span {
  font-weight: 800;
}

.preview-head small,
.panel-header small {
  color: rgba(203, 213, 225, 0.65);
}

.preview-badges {
  display: flex;
  gap: 5px;
}

.preview-wrapper {
  position: relative;
  max-width: 100%;
  background: #000;
  overflow: hidden;
}

.preview-canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.empty-preview {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 4px;
  text-align: center;
  color: rgba(226, 232, 240, 0.75);
  background:
    linear-gradient(45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
    #020617;
  background-size: 24px 24px;
}

.empty-preview span {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.9);
}

.hint {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(203, 213, 225, 0.65);
  font-size: 12px;
}

.side-col {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.zone-list {
  max-height: 330px;
  overflow: auto;
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.zone-group {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;
}

.zone-group-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 7px;
  background: rgba(34, 211, 238, 0.08);
  border-bottom: 1px solid rgba(34, 211, 238, 0.14);
  color: var(--primary-color, #22d3ee);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.zone-group-title small {
  color: rgba(203, 213, 225, 0.65);
  font-size: 10px;
}

.empty-panel {
  padding: 12px;
  color: rgba(203, 213, 225, 0.58);
  font-size: 12px;
}

.settings-panel {
  padding-bottom: 10px;
}

.field {
  display: grid;
  gap: 6px;
  padding: 10px;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-row input {
  width: 100px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  padding: 5px 7px;
  background: rgba(0, 0, 0, 0.45);
  color: var(--text-color, #f1f5f9);
  font-size: 12px;
}

.input-row small,
.settings-help {
  color: rgba(203, 213, 225, 0.58);
  font-size: 11px;
}

.settings-help {
  margin: 0;
  padding: 0 10px;
}

@media (max-width: 1180px) {
  .toolbar {
    grid-template-columns: 1fr;
  }

  .toolbar-actions {
    justify-content: flex-start;
  }
}
</style>
