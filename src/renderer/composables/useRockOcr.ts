import { computed, watch } from 'vue'
import { useMiningStore } from '@renderer/stores/mining'
import { useOcrStore } from '@renderer/stores/ocrStore'
import { mapOcrResultsToMining, isPayloadUseful } from '@renderer/ocr/OcrMiningMapper'
import { ocrRunner } from '@renderer/ocr/OcrRunner'

/**
 * Ouvre le formulaire rocher et le pré-remplit depuis les résultats OCR courants.
 * Utilisable depuis l'overlay (hotkey) ou le compagnon.
 */
export function useRockOcr() {
  const mining = useMiningStore()
  const ocr    = useOcrStore()

  function openRockFormWithOcr() {
    mining.openRockForm()
    const payload = mapOcrResultsToMining(ocr.normalizedResults)
    if (isPayloadUseful(payload)) mining.applyOcrPayload(payload)
  }

  /** Déclenche un scan immédiat puis applique le résultat au formulaire. */
  async function applyOcrToForm(): Promise<void> {
    console.log('[applyOcrToForm] scDetected:', ocr.scDetected, '| results avant scan:', ocr.normalizedResults.length)

    // Scan immédiat pour avoir les données les plus fraîches
    try {
      await ocrRunner.scanOnce()
    } catch (e) {
      console.warn('[applyOcrToForm] scanOnce error:', e)
    }

    console.log('[applyOcrToForm] results après scan:', ocr.normalizedResults.length, ocr.normalizedResults)

    const payload = mapOcrResultsToMining(ocr.normalizedResults)
    console.log('[applyOcrToForm] payload:', JSON.stringify(payload, null, 2))

    if (isPayloadUseful(payload) || payload.coordinates) {
      mining.applyOcrPayload(payload)
      console.log('[applyOcrToForm] rockForm après assignation:', JSON.stringify({
        sizeScuEstimate: mining.rockForm.sizeScuEstimate,
        mass:            mining.rockForm.mass,
        instability:     mining.rockForm.instability,
        resistance:      mining.rockForm.resistance,
        posX:            mining.rockForm.posX,
        posY:            mining.rockForm.posY,
        minerals:        mining.rockForm.minerals.map(m => ({ name: m._name, pct: m.percentage })),
      }, null, 2))
    } else {
      console.warn('[applyOcrToForm] payload vide — rien à remplir. normalizedResults bruts:', JSON.stringify(ocr.normalizedResults, null, 2))
    }
  }

  function hasOcrData(): boolean {
    return ocr.scDetected && ocr.normalizedResults.some((r) => r.valid && r.stable)
  }

  const scDetected = computed(() => ocr.scDetected)

  // DEBUG OCR
  console.log('[useRockOcr] init — scDetected:', ocr.scDetected, '| normalizedResults:', ocr.normalizedResults.length)
  watch(scDetected, (val) => console.log('[useRockOcr] scDetected changed →', val))
  watch(() => ocr.normalizedResults, (val) => {
    console.log('[useRockOcr] normalizedResults changed — count:', val.length, '| valid+stable:', val.filter(r => r.valid && r.stable).length)
  }, { deep: true })

  return { openRockFormWithOcr, applyOcrToForm, hasOcrData, scDetected }
}
