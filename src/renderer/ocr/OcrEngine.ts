import type { OcrRecognizeOptions, OcrEngineResult } from './OcrTypes'

// ─── Interface abstraite moteur OCR ──────────────────────────────────────────
// Permet de remplacer Tesseract par PaddleOCR ou autre sans toucher au runner.

export interface OcrEngine {
  init(): Promise<void>
  recognize(canvas: HTMLCanvasElement, options?: OcrRecognizeOptions): Promise<OcrEngineResult>
  terminate(): Promise<void>
}
