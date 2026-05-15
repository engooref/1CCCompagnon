import type { OcrPreprocessPreset } from './OcrTypes'

// ─── Prétraitement image OCR ──────────────────────────────────────────────────
// Pas de dépendance OpenCV. Tout via canvas 2D.

const PRESETS: Record<string, OcrPreprocessPreset> = {
  defaultHud: {
    scale: 2,
    grayscale: true,
    contrast: 1.3,
  },
  numericHud: {
    scale: 3,
    grayscale: true,
    contrast: 1.8,
    threshold: 140,
  },
  percentHud: {
    scale: 3,
    grayscale: true,
    contrast: 1.8,
    threshold: 130,
  },
  materialHud: {
    scale: 2,
    grayscale: true,
    contrast: 1.5,
  },
  brightText: {
    scale: 2,
    grayscale: true,
    contrast: 1.2,
    invert: false,
  },
  darkText: {
    scale: 2,
    grayscale: true,
    contrast: 1.4,
    invert: true,
  },
  // Preset pour bloc SCAN RESULTS multi-lignes (PSM 6)
  scScanBlock: {
    scale: 3,
    grayscale: true,
    contrast: 2.0,
    threshold: 130,
    invert: true,
  },
  // Preset optimisé pour le HUD Star Citizen (texte blanc/jaune avec glow sur fond sombre)
  scScanHud: {
    scale: 3,
    grayscale: true,
    contrast: 2.2,
    threshold: 160,
    invert: true,
  },
  scScanNumber: {
    scale: 3,
    grayscale: true,
    contrast: 2.4,
    threshold: 170,
    invert: true,
  },
  // Preset pour texte orange SC (mass/resistance/instability)
  // Canal R dominant : texte orange R≈240 vs fond R≈35
  scOrangeHud: {
    scale: 3,
    grayscale: true,
    redBoost: true,
    contrast: 2.5,
    threshold: 150,
    invert: true,
  },
}

export function getPresetNames(): string[] {
  return Object.keys(PRESETS)
}

export function getPreset(name: string): OcrPreprocessPreset | undefined {
  return PRESETS[name]
}

export function preprocess(
  src: HTMLCanvasElement,
  presetName: string,
  override?: Partial<OcrPreprocessPreset>,
): HTMLCanvasElement {
  const base = PRESETS[presetName] ?? PRESETS['defaultHud']
  const preset = override ? { ...base, ...override } : base
  return applyPreset(src, preset)
}

function applyPreset(
  src: HTMLCanvasElement,
  preset: OcrPreprocessPreset,
): HTMLCanvasElement {
  const scaled = scale(src, preset.scale)
  if (preset.grayscale) {
    grayscaleContrast(scaled, preset.contrast, preset.channelWeights ?? (preset.redBoost ? { r: 0.8, g: 0.2, b: 0.0 } : undefined))
  }
  if (preset.threshold !== undefined) {
    threshold(scaled, preset.threshold)
  }
  if (preset.invert === true) {
    invert(scaled)
  }
  return scaled
}

function scale(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = Math.floor(src.width * factor)
  out.height = Math.floor(src.height * factor)
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

function grayscaleContrast(
  canvas: HTMLCanvasElement,
  contrast: number,
  weights?: { r: number; g: number; b: number },
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = data.data
  const f = (259 * (contrast * 255 - 255)) / (255 * (259 - (contrast * 255 - 255)))
  const wr = weights?.r ?? 0.299
  const wg = weights?.g ?? 0.587
  const wb = weights?.b ?? 0.114
  for (let i = 0; i < d.length; i += 4) {
    const gray = wr * d[i] + wg * d[i + 1] + wb * d[i + 2]
    const c = Math.min(255, Math.max(0, f * (gray - 128) + 128))
    d[i] = d[i + 1] = d[i + 2] = c
  }
  ctx.putImageData(data, 0, 0)
}

function threshold(canvas: HTMLCanvasElement, thresh: number): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > thresh ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(data, 0, 0)
}

function invert(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i]
    d[i + 1] = 255 - d[i + 1]
    d[i + 2] = 255 - d[i + 2]
  }
  ctx.putImageData(data, 0, 0)
}
