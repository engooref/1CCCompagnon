<script setup lang="ts">
import { computed } from 'vue'
import { useOcrStore } from '@renderer/stores/ocrStore'
import { useMiningStore } from '@renderer/stores/mining'
import { mapOcrResultsToMining, isPayloadUseful } from '@renderer/ocr/OcrMiningMapper'

const ocr = useOcrStore()
const mining = useMiningStore()

const payload = computed(() => mapOcrResultsToMining(ocr.normalizedResults))
const hasStructuredPayload = computed(() => isPayloadUseful(payload.value) || !!payload.value.coordinates)

function importToMining() {
  if (!hasStructuredPayload.value) return
  mining.applyOcrPayload(payload.value)
}

function confidenceColor(conf: number): string {
  if (conf >= 80) return '#4ade80'
  if (conf >= 60) return '#fbbf24'
  return '#f87171'
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

function displayValue(value: string | number | null): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return `${parsed.length} minerai(s) détecté(s)`
    } catch { /* valeur texte normale */ }
    return value
  }
  return String(value)
}
</script>

<template>
  <div class="ocr-result-panel">
    <div class="import-bar" v-if="hasStructuredPayload">
      <button class="import-btn" @click="importToMining">
        ⬆ Préremplir formulaire rocher
      </button>
    </div>

    <div v-if="ocr.normalizedResults.length === 0" class="empty">
      Aucun résultat — lance un scan
    </div>

    <div v-if="hasStructuredPayload" class="scan-block">
      <div class="scan-material">{{ payload.mainMaterial ?? 'Rocher détecté' }}</div>

      <div class="scan-fields">
        <div class="scan-field">
          <span class="sf-label">Masse</span>
          <span class="sf-value">{{ payload.rockMass ?? '—' }}</span>
        </div>
        <div class="scan-field">
          <span class="sf-label">Résistance</span>
          <span class="sf-value">{{ payload.resistance !== undefined ? payload.resistance + '%' : '—' }}</span>
        </div>
        <div class="scan-field">
          <span class="sf-label">Instabilité</span>
          <span class="sf-value">{{ payload.instability !== undefined ? payload.instability + '%' : '—' }}</span>
        </div>
        <div class="scan-field">
          <span class="sf-label">Total SCU</span>
          <span class="sf-value">{{ payload.totalScu ?? '—' }}</span>
        </div>
      </div>

      <div v-if="payload.materials?.length" class="scan-compo">
        <div class="sc-title">Composition</div>
        <div
          v-for="(row, i) in payload.materials"
          :key="i"
          class="sc-row"
        >
          <span class="sc-pct">{{ row.percent !== undefined ? row.percent + '%' : '' }}</span>
          <span class="sc-name">{{ row.name }}</span>
          <span class="sc-qty">{{ row.qty !== undefined ? 'Q ' + row.qty : '' }}</span>
        </div>
      </div>

      <div v-if="payload.coordinates" class="scan-coords">
        Coordonnées : <span>{{ payload.coordinates }}</span>
      </div>
    </div>

    <div
      v-for="r in ocr.normalizedResults"
      :key="r.zoneId"
      class="result-row"
      :class="{ valid: r.valid, invalid: !r.valid }"
    >
      <div class="result-header">
        <span class="field-key">{{ r.fieldKey }}</span>
        <span class="badges">
          <span v-if="r.stable" class="badge stable">stable</span>
          <span v-if="!r.valid" class="badge invalid">invalide</span>
        </span>
      </div>
      <div class="result-body">
        <span class="value">{{ displayValue(r.value) }}</span>
        <span
          class="confidence"
          :style="{ color: confidenceColor(r.confidence) }"
        >{{ Math.round(r.confidence) }}%</span>
      </div>
      <details v-if="r.rawText" class="raw-debug">
        <summary>brut</summary>
        <pre>{{ r.rawText }}</pre>
      </details>
      <div class="result-ts">{{ formatTs(r.timestamp) }}</div>
    </div>
  </div>
</template>

<style scoped>
.ocr-result-panel {
  font-size: 11px;
  color: var(--text-color, #f1f5f9);
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
}
.empty {
  opacity: 0.4;
  text-align: center;
  padding: 8px;
}
.result-row {
  background: rgba(0,0,0,0.4);
  border-radius: 4px;
  padding: 4px 6px;
  border-left: 2px solid rgba(255,255,255,0.1);
}
.result-row.valid  { border-left-color: #4ade80; }
.result-row.invalid { border-left-color: #f87171; }
.result-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 2px;
}
.field-key { font-weight: 600; color: var(--primary-color, #22d3ee); }
.badges { display: flex; gap: 4px; }
.badge {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
}
.badge.stable  { background: rgba(74,222,128,0.2); color: #4ade80; }
.badge.invalid { background: rgba(248,113,113,0.2); color: #f87171; }
.result-body {
  display: flex;
  gap: 6px;
  align-items: center;
}
.value  { font-weight: 700; font-size: 13px; word-break: break-word; }
.confidence { font-size: 10px; margin-left: auto; }
.result-ts  { opacity: 0.3; font-size: 9px; text-align: right; }
.import-bar { margin-bottom: 6px; }
.import-btn {
  width: 100%;
  padding: 5px 8px;
  background: rgba(34,211,238,0.15);
  border: 1px solid var(--primary-color, #22d3ee);
  color: var(--primary-color, #22d3ee);
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
}
.import-btn:hover { background: rgba(34,211,238,0.25); }

.scan-block {
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(34,211,238,0.25);
  border-radius: 5px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.scan-material {
  font-size: 12px;
  font-weight: 700;
  color: var(--primary-color, #22d3ee);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.scan-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 8px;
}
.scan-field {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}
.sf-label { opacity: 0.55; }
.sf-value  { font-weight: 600; color: #f1f5f9; }
.scan-compo { margin-top: 2px; }
.sc-title {
  font-size: 10px;
  text-transform: uppercase;
  opacity: 0.45;
  margin-bottom: 3px;
  letter-spacing: 0.05em;
}
.sc-row {
  display: flex;
  gap: 6px;
  font-size: 11px;
  padding: 1px 0;
}
.sc-pct  { width: 44px; text-align: right; opacity: 0.8; }
.sc-name { flex: 1; font-weight: 600; }
.sc-qty  { opacity: 0.6; }
.scan-coords {
  font-size: 10px;
  color: rgba(203, 213, 225, 0.65);
}
.scan-coords span { color: #f1f5f9; }
.raw-debug {
  margin-top: 4px;
  font-size: 9px;
  opacity: 0.45;
}
.raw-debug summary { cursor: pointer; }
.raw-debug pre {
  white-space: pre-wrap;
  word-break: break-all;
  margin: 2px 0 0;
  max-height: 80px;
  overflow-y: auto;
  background: rgba(0,0,0,0.4);
  padding: 4px;
  border-radius: 3px;
}
</style>
