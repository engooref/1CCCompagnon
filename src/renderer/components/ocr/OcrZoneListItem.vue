<script setup lang="ts">
import { ref } from 'vue'
import type { OcrZone, OcrNormalizedResult } from '@renderer/ocr/OcrTypes'
import { useOcrStore } from '@renderer/stores/ocrStore'
import { ocrRunner } from '@renderer/ocr/OcrRunner'

const props = defineProps<{ zone: OcrZone; engineReady: boolean }>()
const ocr = useOcrStore()

const testing    = ref(false)
const testResult = ref<OcrNormalizedResult | null>(null)

async function testZone() {
  if (testing.value || !props.engineReady) return
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await ocrRunner.scanZone(props.zone.id)
  } catch (e) {
    console.warn('[OCR] testZone error:', e)
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="zone-item" :class="{ disabled: !zone.enabled }">
    <input type="checkbox" :checked="zone.enabled" @change="ocr.toggleZone(zone.id)" />
    <span class="label">
      {{ zone.label }}
      <small>{{ zone.fieldKey }}</small>
    </span>
    <span class="mode">{{ zone.mode }}</span>
    <button class="btn-test" :disabled="testing || !engineReady" @click="testZone" title="Tester cette zone">
      {{ testing ? '...' : 'Test' }}
    </button>
  </div>
  <div v-if="testResult" class="test-result" :class="{ invalid: !testResult.valid }">
    <span class="raw">{{ testResult.rawText || '(vide)' }}</span>
    <span class="conf">{{ testResult.confidence.toFixed(0) }}%</span>
    <span v-if="!testResult.valid" class="badge-invalid">invalide</span>
  </div>
</template>

<style scoped>
.zone-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 3px 4px;
  border-radius: 3px;
  color: var(--text-color, #f1f5f9);
}
.zone-item:hover { background: rgba(255,255,255,0.05); }
.zone-item.disabled { opacity: 0.45; }
.label { flex: 1; display: grid; gap: 1px; font-weight: 500; }
.label small { font-size: 9px; font-weight: 400; opacity: 0.45; }
.mode {
  font-size: 9px;
  padding: 1px 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
}
.btn-test {
  background: rgba(34,211,238,0.12);
  color: var(--primary-color, #22d3ee);
  border: 1px solid rgba(34,211,238,0.3);
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 11px;
  cursor: pointer;
}
.btn-test:hover:not(:disabled) { background: rgba(34,211,238,0.22); }
.btn-test:disabled { opacity: 0.35; cursor: default; }
.test-result {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  padding: 2px 4px 3px 22px;
  color: #86efac;
  border-left: 2px solid rgba(34,211,238,0.25);
  margin-bottom: 2px;
}
.test-result.invalid { color: #fca5a5; border-left-color: rgba(239,68,68,0.4); }
.raw { flex: 1; font-family: monospace; word-break: break-all; }
.conf { opacity: 0.6; white-space: nowrap; }
.badge-invalid {
  font-size: 9px;
  padding: 1px 4px;
  background: rgba(239,68,68,0.2);
  border-radius: 3px;
  color: #f87171;
}
</style>
