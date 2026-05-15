import type { OcrRect, OcrZone } from './OcrTypes'

// ─── Crop de zones depuis un canvas de capture ────────────────────────────────

const MIN_PX = 4 // taille minimale en pixels pour qu'un crop soit utile

export function convertNormalizedRectToPixels(
  rect: OcrRect,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  // Sécurisation des bornes
  const x = Math.max(0, Math.min(1, rect.x))
  const y = Math.max(0, Math.min(1, rect.y))
  const w = Math.max(0, Math.min(1 - x, rect.w))
  const h = Math.max(0, Math.min(1 - y, rect.h))

  return {
    x: Math.floor(x * width),
    y: Math.floor(y * height),
    w: Math.max(MIN_PX, Math.floor(w * width)),
    h: Math.max(MIN_PX, Math.floor(h * height)),
  }
}

export function cropZoneToCanvas(
  frameCanvas: HTMLCanvasElement,
  zone: OcrZone,
): HTMLCanvasElement {
  const { width, height } = frameCanvas
  const px = convertNormalizedRectToPixels(zone.rect, width, height)

  const out = document.createElement('canvas')
  out.width = px.w
  out.height = px.h

  const ctx = out.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('[OCR] Canvas 2D context unavailable in cropper')

  ctx.drawImage(frameCanvas, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h)
  return out
}

export function cropZoneToDataUrl(
  frameCanvas: HTMLCanvasElement,
  zone: OcrZone,
): string {
  return cropZoneToCanvas(frameCanvas, zone).toDataURL('image/png')
}
