import type { OcrEngine } from './OcrEngine'
import type { OcrRecognizeOptions, OcrEngineResult } from './OcrTypes'

// ─── Moteur OCR Tesseract.js ──────────────────────────────────────────────────
// Un seul worker pour tout le lifetime de l'app (MVP).
// Import dynamique pour éviter de bloquer le bundle si tesseract.js absent.

export class TesseractOcrEngine implements OcrEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private worker: any = null
  private initialized = false

  async init(): Promise<void> {
    if (this.initialized) return

    // Import dynamique : tesseract.js doit être installé (npm install tesseract.js)
    const { createWorker } = await import('tesseract.js')

    this.worker = await createWorker('eng', 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js',
      logger: () => {},
    })

    // Config de base Tesseract pour HUD jeux
    await this.worker.setParameters({
      tessedit_pageseg_mode: '7', // single line
      preserve_interword_spaces: '0',
    })

    this.initialized = true
  }

  async recognize(
    canvas: HTMLCanvasElement,
    options: OcrRecognizeOptions = {},
  ): Promise<OcrEngineResult> {
    if (!this.worker) throw new Error('[OCR] Tesseract worker not initialized')

    const isBlock = options.mode === 'composition' || options.mode === 'mining-scan'
    await this.worker.setParameters({
      tessedit_char_whitelist: options.whitelist ?? '',
      tessedit_pageseg_mode:   isBlock ? '6' : '7',
      preserve_interword_spaces: isBlock ? '1' : '0',
    })

    const { data } = await this.worker.recognize(canvas)

    return {
      text: (data.text ?? '').trim(),
      confidence: data.confidence ?? 0,
    }
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
      this.initialized = false
    }
  }
}
