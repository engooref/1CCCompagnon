<script setup lang="ts">
/**
 * OcrZoneOverlay — zones toujours visibles dans la page OCR (drag+resize).
 * En runtime overlay : masquées via hideOcrVisuals.
 */
import { ref, computed } from 'vue'
import { useOcrStore } from '@renderer/stores/ocrStore'
import OcrZoneBox from './OcrZoneBox.vue'

const props = defineProps<{
  width: number
  height: number
}>()

const ocr = useOcrStore()
const selectedZoneId = ref<string | null>(null)

const visible = computed(() => !ocr.hideOcrVisuals)
</script>

<template>
  <div
    class="ocr-zone-overlay"
    :style="{ width: `${width}px`, height: `${height}px` }"
  >
    <template v-if="visible">
      <OcrZoneBox
        v-for="zone in ocr.zones"
        :key="zone.id"
        :zone="zone"
        :container-width="width"
        :container-height="height"
        :selected="selectedZoneId === zone.id"
        @select="selectedZoneId = $event"
      />
    </template>
  </div>
</template>

<style scoped>
.ocr-zone-overlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: all;
  overflow: hidden;
}
</style>
