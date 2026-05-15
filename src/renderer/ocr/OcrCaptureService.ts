import type { OcrCaptureSource } from './OcrTypes'

// ─── Service de capture frame pour OCR ───────────────────────────────────────
// Utilise getUserMedia avec un chromeMediaSourceId fourni par le main process.
// Le renderer ne fait pas d'appel IPC direct — il passe par window.oneCC.

export class OcrCaptureService {
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private stream: MediaStream | null = null
  private currentSourceId: string | null = null

  // ── API publique ────────────────────────────────────────────────────────

  async listSources(): Promise<OcrCaptureSource[]> {
    return window.oneCC.ocrListSources()
  }

  async selectPreferredSource(): Promise<OcrCaptureSource | null> {
    return window.oneCC.ocrGetPreferredSource()
  }

  /** Démarre la capture sur la source donnée */
  async start(sourceId: string): Promise<void> {
    if (this.currentSourceId === sourceId && this.stream?.active) return

    this.stop()

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        // @ts-expect-error — contrainte Electron non standard
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
        },
      },
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      console.warn('[OCR] Capture start failed, trying screen fallback:', err)
      // Fallback : récupérer un vrai ID d'écran (évite WGC avec handle null)
      let screenId: string | null = null
      try {
        const sources = await window.oneCC.ocrListSources()
        screenId = sources.find(s => s.type === 'screen')?.id ?? null
      } catch { /* ignore */ }

      if (screenId) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            // @ts-expect-error
            mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: screenId },
          },
        })
      } else {
        // Dernier recours sans ID — peut générer des logs WGC mais reste fonctionnel
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            // @ts-expect-error
            mandatory: { chromeMediaSource: 'screen' },
          },
        })
      }
    }

    this.video = document.createElement('video')
    this.video.srcObject = this.stream
    this.video.muted = true

    // Attendre que videoWidth soit disponible avant de résoudre
    await new Promise<void>((resolve, reject) => {
      const v = this.video!
      v.onloadedmetadata = () => { v.play().then(resolve).catch(reject) }
      v.onerror = () => reject(new Error('[OCR] Video error on metadata load'))
    })

    this.canvas = document.createElement('canvas')
    this.currentSourceId = sourceId
  }

  stop(): void {
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    if (this.video) {
      this.video.srcObject = null
      this.video = null
    }
    this.currentSourceId = null
  }

  get isRunning(): boolean {
    return !!this.stream?.active
  }

  /** Capture une frame dans un canvas et le retourne */
  async captureFrame(): Promise<HTMLCanvasElement> {
    if (!this.video || !this.canvas) {
      throw new Error('[OCR] CaptureService not started')
    }

    const w = this.video.videoWidth
    const h = this.video.videoHeight
    if (w === 0 || h === 0) {
      throw new Error('[OCR] Video dimensions are zero — source not ready yet')
    }

    this.canvas.width = w
    this.canvas.height = h

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('[OCR] Canvas 2D context unavailable')

    ctx.drawImage(this.video, 0, 0, w, h)
    return this.canvas
  }

  getCaptureSize(): { width: number; height: number } {
    return {
      width: this.video?.videoWidth ?? 0,
      height: this.video?.videoHeight ?? 0,
    }
  }
}

// Singleton partagé
export const ocrCaptureService = new OcrCaptureService()
