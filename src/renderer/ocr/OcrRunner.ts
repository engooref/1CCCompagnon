import { useOcrStore } from '@renderer/stores/ocrStore'
import { ocrCaptureService } from './OcrCaptureService'
import { cropZoneToCanvas } from './OcrZoneCropper'
import { preprocess } from './OcrPreprocessor'
import { TesseractOcrEngine } from './TesseractOcrEngine'
import { normalizeByZone } from './OcrNormalizer'
import { ocrStabilizer } from './OcrStabilizer'
import type { OcrNormalizedResult, OcrRawResult } from './OcrTypes'

export class OcrRunner {
  private engine = new TesseractOcrEngine()
  private scanning = false
  private autoTimer: ReturnType<typeof setInterval> | null = null

  async init(): Promise<void> {
    await this.engine.init()
  }

  async scanOnce(): Promise<OcrNormalizedResult[]> {
    if (this.scanning) return []
    const store = useOcrStore()
    const profile = store.activeProfile
    if (!profile) return []
    const zones = profile.zones.filter(z => z.enabled)
    if (zones.length === 0) return []
    if (!ocrCaptureService.isRunning) return []

    this.scanning = true
    store.isScanning = true

    try {
      const hideBefore = store.captureSafeMode
      if (hideBefore) {
        store.hideOcrVisuals = true
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => setTimeout(resolve, 40))
        })
      }

      let frame: HTMLCanvasElement
      try {
        frame = await ocrCaptureService.captureFrame()
      } finally {
        if (hideBefore) store.hideOcrVisuals = false
      }

      const results: OcrNormalizedResult[] = []
      for (const zone of zones) {
        try {
          const cropped   = cropZoneToCanvas(frame, zone)
          const processed = preprocess(cropped, zone.preprocessingPreset, { ...(profile?.profilePreprocessing ?? {}), ...(zone.preprocessingOverride ?? {}) })
          const raw = await this.engine.recognize(processed, { whitelist: zone.whitelist, mode: zone.mode })
          const rawResult: OcrRawResult = {
            zoneId: zone.id, fieldKey: zone.fieldKey,
            rawText: raw.text, confidence: raw.confidence, timestamp: Date.now(),
          }
          const normalized = normalizeByZone(rawResult, zone)
          const stable = ocrStabilizer.push(normalized, zone)
          store.setResult(stable)
          results.push(stable)
        } catch (err) {
          console.warn(`[OCR] Zone "${zone.label}" error:`, err)
        }
      }
      return results
    } finally {
      this.scanning = false
      store.isScanning = false
    }
  }

  async scanZone(zoneId: string): Promise<OcrNormalizedResult | null> {
    const store = useOcrStore()
    const profile = store.activeProfile
    const zone = profile?.zones.find(z => z.id === zoneId)
    if (!zone || !ocrCaptureService.isRunning) return null
    const frame = await ocrCaptureService.captureFrame()
    const cropped = cropZoneToCanvas(frame, zone)
    const processed = preprocess(cropped, zone.preprocessingPreset, { ...(profile?.profilePreprocessing ?? {}), ...(zone.preprocessingOverride ?? {}) })
    const raw = await this.engine.recognize(processed, { whitelist: zone.whitelist, mode: zone.mode })
    const rawResult: OcrRawResult = {
      zoneId: zone.id, fieldKey: zone.fieldKey,
      rawText: raw.text, confidence: raw.confidence, timestamp: Date.now(),
    }
    const normalized = normalizeByZone(rawResult, zone)
    store.setResult(normalized)
    return normalized
  }

  startAutoScan(intervalMs: number): void {
    this.stopAutoScan()
    this.autoTimer = setInterval(() => {
      this.scanOnce().catch(err => console.warn('[OCR] Auto-scan error:', err))
    }, Math.max(500, intervalMs))
  }

  startAutoScanZone(fieldKey: string, intervalMs: number): void {
    this.stopAutoScan()
    this.autoTimer = setInterval(() => {
      this.scanZonesByFieldKey(fieldKey).catch(err => console.warn('[OCR] Auto-scan zone error:', err))
    }, Math.max(500, intervalMs))
  }

  private async scanZonesByFieldKey(fieldKey: string): Promise<void> {
    if (this.scanning) return
    const store = useOcrStore()
    const profile = store.activeProfile
    const zones = (profile?.zones ?? []).filter(z => z.enabled && z.fieldKey === fieldKey)
    if (zones.length === 0 || !ocrCaptureService.isRunning) return

    this.scanning = true
    store.isScanning = true
    try {
      const frame = await ocrCaptureService.captureFrame()
      for (const zone of zones) {
        try {
          const cropped   = cropZoneToCanvas(frame, zone)
          const processed = preprocess(cropped, zone.preprocessingPreset, { ...(profile?.profilePreprocessing ?? {}), ...(zone.preprocessingOverride ?? {}) })
          const raw = await this.engine.recognize(processed, { whitelist: zone.whitelist, mode: zone.mode })
          const rawResult: OcrRawResult = {
            zoneId: zone.id, fieldKey: zone.fieldKey,
            rawText: raw.text, confidence: raw.confidence, timestamp: Date.now(),
          }
          const normalized = normalizeByZone(rawResult, zone)
          const stable = ocrStabilizer.push(normalized, zone)
          store.setResult(stable)
        } catch (err) {
          console.warn(`[OCR] Zone "${zone.label}" error:`, err)
        }
      }
    } finally {
      this.scanning = false
      store.isScanning = false
    }
  }

  stopAutoScan(): void {
    if (this.autoTimer !== null) { clearInterval(this.autoTimer); this.autoTimer = null }
  }

  get isAutoScanning(): boolean { return this.autoTimer !== null }

  async dispose(): Promise<void> {
    this.stopAutoScan()
    await this.engine.terminate()
    ocrStabilizer.clear()
  }
}

export const ocrRunner = new OcrRunner()
