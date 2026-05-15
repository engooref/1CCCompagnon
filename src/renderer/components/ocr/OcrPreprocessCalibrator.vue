<script setup lang="ts">
import { computed, ref } from 'vue'
import { useOcrStore } from '@renderer/stores/ocrStore'
import type { OcrPreprocessPreset } from '@renderer/ocr/OcrTypes'

const ocr = useOcrStore()

const expanded = ref(false)

const pp = computed(() => ocr.activeProfile?.profilePreprocessing ?? {})

// ── helpers ───────────────────────────────────────────────────────────────────

function getNum(key: keyof OcrPreprocessPreset, fallback: number): number {
  const v = pp.value[key]
  return typeof v === 'number' ? v : fallback
}

function getCW(ch: 'r' | 'g' | 'b', fallback: number): number {
  const cw = (pp.value as any).channelWeights
  return typeof cw?.[ch] === 'number' ? cw[ch] : fallback
}

// ── setters ───────────────────────────────────────────────────────────────────

function setNum(key: keyof OcrPreprocessPreset, value: number) {
  ocr.updateProfilePreprocessing({ [key]: value } as any)
}

function setCW(ch: 'r' | 'g' | 'b', value: number) {
  const current = (pp.value as any).channelWeights ?? { r: 0.299, g: 0.587, b: 0.114 }
  ocr.updateProfilePreprocessing({ channelWeights: { ...current, [ch]: value } })
}

function clearCW() {
  const patch = { ...(ocr.activeProfile?.profilePreprocessing ?? {}) } as any
  delete patch.channelWeights
  if (ocr.activeProfile) {
    ocr.activeProfile.profilePreprocessing = Object.keys(patch).length ? patch : undefined
    ocr.saveProfiles()
  }
}

function reset() {
  ocr.resetProfilePreprocessing()
}

const hasOverride = computed(() =>
  ocr.activeProfile?.profilePreprocessing !== undefined &&
  Object.keys(ocr.activeProfile.profilePreprocessing).length > 0
)

// Presets couleurs rapides
const COLOR_PRESETS = [
  { label: 'Orange (HUD SC)', w: { r: 0.8, g: 0.2, b: 0.0 } },
  { label: 'Blanc/Cyan',      w: { r: 0.33, g: 0.34, b: 0.33 } },
  { label: 'Bleu (scan)',     w: { r: 0.05, g: 0.25, b: 0.70 } },
  { label: 'Vert',            w: { r: 0.1,  g: 0.8,  b: 0.1  } },
  { label: 'Standard',        w: { r: 0.299,g: 0.587,b: 0.114 } },
]

function applyColorPreset(w: { r: number; g: number; b: number }) {
  ocr.updateProfilePreprocessing({ channelWeights: w })
}
</script>

<template>
  <div class="calibrator" :class="{ expanded }">
    <button class="calibrator-header" @click="expanded = !expanded">
      <span class="label">
        🎨 Calibration couleurs
        <span v-if="hasOverride" class="badge">actif</span>
      </span>
      <span class="chevron">{{ expanded ? '▲' : '▼' }}</span>
    </button>

    <div v-if="expanded" class="calibrator-body">
      <p class="hint">
        Surcharge le prétraitement pour <strong>toutes les zones</strong> du profil actif.<br>
        Ajuste les poids RGB pour isoler la couleur du texte à détecter.
      </p>

      <!-- Presets rapides -->
      <div class="preset-row">
        <span class="field-label">Présets :</span>
        <button
          v-for="p in COLOR_PRESETS"
          :key="p.label"
          class="preset-btn"
          @click="applyColorPreset(p.w)"
        >{{ p.label }}</button>
      </div>

      <!-- Poids RGB -->
      <div class="section-title">Poids canaux RGB (conversion niveaux de gris)</div>

      <div class="slider-row">
        <label class="ch-label ch-r">R</label>
        <input type="range" min="0" max="1" step="0.01"
          :value="getCW('r', 0.299)"
          @input="setCW('r', +($event.target as HTMLInputElement).value)"
        />
        <span class="val">{{ getCW('r', 0.299).toFixed(2) }}</span>
      </div>
      <div class="slider-row">
        <label class="ch-label ch-g">G</label>
        <input type="range" min="0" max="1" step="0.01"
          :value="getCW('g', 0.587)"
          @input="setCW('g', +($event.target as HTMLInputElement).value)"
        />
        <span class="val">{{ getCW('g', 0.587).toFixed(2) }}</span>
      </div>
      <div class="slider-row">
        <label class="ch-label ch-b">B</label>
        <input type="range" min="0" max="1" step="0.01"
          :value="getCW('b', 0.114)"
          @input="setCW('b', +($event.target as HTMLInputElement).value)"
        />
        <span class="val">{{ getCW('b', 0.114).toFixed(2) }}</span>
      </div>

      <button class="clear-btn" @click="clearCW">Réinitialiser poids</button>

      <!-- Contrast override -->
      <div class="section-title" style="margin-top:12px">Surcharge contraste / seuil</div>

      <div class="slider-row">
        <label class="field-label">Contraste</label>
        <input type="range" min="1" max="4" step="0.05"
          :value="getNum('contrast', 2.0)"
          @input="setNum('contrast', +($event.target as HTMLInputElement).value)"
        />
        <span class="val">{{ getNum('contrast', 2.0).toFixed(2) }}</span>
        <button class="mini-clear" @click="ocr.updateProfilePreprocessing({ contrast: undefined as any })">✕</button>
      </div>

      <div class="slider-row">
        <label class="field-label">Seuil (0=off)</label>
        <input type="range" min="0" max="255" step="1"
          :value="getNum('threshold', 0)"
          @input="setNum('threshold', +($event.target as HTMLInputElement).value || undefined as any)"
        />
        <span class="val">{{ getNum('threshold', 0) || '—' }}</span>
        <button class="mini-clear" @click="ocr.updateProfilePreprocessing({ threshold: undefined as any })">✕</button>
      </div>

      <!-- Reset global -->
      <button v-if="hasOverride" class="reset-btn" @click="reset">
        Tout réinitialiser
      </button>
    </div>
  </div>
</template>

<style scoped>
.calibrator {
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  overflow: hidden;
}

.calibrator-header {
  width: 100%;
  background: none;
  border: none;
  color: var(--text-color, #f1f5f9);
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.calibrator-header:hover { background: rgba(255,255,255,0.05); }

.label { display: flex; align-items: center; gap: 6px; }
.badge {
  background: rgba(34,211,238,0.25);
  color: var(--primary-color, #22d3ee);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
}
.chevron { font-size: 10px; opacity: 0.6; }

.calibrator-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hint {
  font-size: 11px;
  color: rgba(226,232,240,0.55);
  margin: 0 0 4px;
  line-height: 1.5;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: rgba(148,163,184,0.8);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 6px;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.preset-btn {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  color: var(--text-color, #f1f5f9);
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 11px;
  cursor: pointer;
}
.preset-btn:hover { background: rgba(255,255,255,0.15); }

.slider-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ch-label {
  width: 14px;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}
.ch-r { color: #f87171; }
.ch-g { color: #4ade80; }
.ch-b { color: #60a5fa; }

.field-label {
  width: 90px;
  font-size: 11px;
  color: rgba(226,232,240,0.7);
  flex-shrink: 0;
}

input[type=range] {
  flex: 1;
  accent-color: var(--primary-color, #22d3ee);
  height: 3px;
}

.val {
  width: 32px;
  text-align: right;
  font-size: 11px;
  color: var(--primary-color, #22d3ee);
  font-variant-numeric: tabular-nums;
}

.mini-clear {
  background: none;
  border: none;
  color: rgba(255,255,255,0.3);
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
}
.mini-clear:hover { color: #f87171; }

.clear-btn, .reset-btn {
  align-self: flex-start;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(226,232,240,0.6);
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}
.reset-btn {
  margin-top: 8px;
  color: #f87171;
  border-color: rgba(248,113,113,0.3);
}
.clear-btn:hover { background: rgba(255,255,255,0.12); }
.reset-btn:hover { background: rgba(248,113,113,0.15); }
</style>
