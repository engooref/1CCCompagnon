import { preprocess } from './OcrPreprocessor'
import type { OcrEngine } from './OcrEngine'
import type { OcrCompositionRow, OcrPreprocessPreset, OcrRect, OcrZoneMode } from './OcrTypes'
import { matchMaterial } from './OcrMaterialsDb'

// SCAN RESULTS : 1 cadre utilisateur -> sous-zones OCR virtuelles.
// V3 : auto-fit du vrai panel HUD dans le cadre utilisateur, puis lecture par sous-zones.

export type MiningScanResult = {
  rockName?: string
  mass?: number
  resistance?: number
  instability?: number
  totalScu?: number
  composition: OcrCompositionRow[]
}

export type MiningScanExtraction = {
  result: MiningScanResult
  rawText: string
  confidence: number
  valid: boolean
}

type ChildSpec = {
  label: string
  rect: OcrRect
  mode: OcrZoneMode
  preset: string
  whitelist?: string
  override?: Partial<OcrPreprocessPreset>
}

// Ratios relatifs au cadre parent que tu places autour de tout le panneau SCAN RESULTS.
const LAYOUT = {
  rockName: {
    label: 'rockName',
    rect: { x: 0.06, y: 0.120, w: 0.66, h: 0.095 },
    mode: 'material',
    preset: 'scScanMaterial',
    whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz() -/',
    override: { scale: 6, threshold: 120, contrast: 3.2, channelWeights: { r: 0.55, g: 0.45, b: 0.0 }, invert: true },
  } satisfies ChildSpec,
  mass: {
    label: 'mass',
    rect: { x: 0.55, y: 0.195, w: 0.26, h: 0.075 },
    mode: 'number',
    preset: 'scScanNumber',
    whitelist: '0123456789',
    override: { scale: 7, threshold: 120, contrast: 3.2, invert: true },
  } satisfies ChildSpec,
  resistance: {
    label: 'resistance',
    rect: { x: 0.55, y: 0.270, w: 0.24, h: 0.075 },
    mode: 'percent',
    preset: 'scScanNumber',
    whitelist: '0123456789.,%',
    override: { scale: 7, threshold: 120, contrast: 3.2, invert: true },
  } satisfies ChildSpec,
  instability: {
    label: 'instability',
    rect: { x: 0.55, y: 0.345, w: 0.30, h: 0.075 },
    mode: 'number',
    preset: 'scScanNumber',
    whitelist: '0123456789.,',
    override: { scale: 7, threshold: 120, contrast: 3.2, invert: true },
  } satisfies ChildSpec,
  totalScu: {
    label: 'totalScu',
    rect: { x: 0.62, y: 0.545, w: 0.36, h: 0.080 },
    mode: 'number',
    preset: 'scScanNumber',
    whitelist: '0123456789.,SCUscu ',
    override: { scale: 7, threshold: 120, contrast: 3.1, invert: true },
  } satisfies ChildSpec,
  composition: {
    label: 'composition',
    rect: { x: 0.04, y: 0.660, w: 0.94, h: 0.320 },
    mode: 'composition',
    preset: 'scScanComposition',
    whitelist: '0123456789.,%ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz() -/',
    override: { scale: 6, threshold: 120, contrast: 3.1, channelWeights: { r: 0.55, g: 0.45, b: 0.0 }, invert: true },
  } satisfies ChildSpec,
}

const COMPOSITION_ROWS = 5
const COMPOSITION_COLUMNS = {
  percent: { x: 0.00, y: 0, w: 0.26, h: 1 },
  name:    { x: 0.26, y: 0, w: 0.52, h: 1 },
  qty:     { x: 0.78, y: 0, w: 0.22, h: 1 },
}

export async function extractMiningScanFromPanel(
  panelCanvas: HTMLCanvasElement,
  engine: OcrEngine,
  profileOverride?: Partial<OcrPreprocessPreset>,
): Promise<MiningScanExtraction> {
  const raws: string[] = []
  const confidences: number[] = []

  const fitted = autoFitHudTextPanel(panelCanvas)
  const workingPanel = fitted.canvas
  raws.push(`autofit: ${fitted.used ? 'used' : 'original'} x=${fitted.rect.x.toFixed(3)} y=${fitted.rect.y.toFixed(3)} w=${fitted.rect.w.toFixed(3)} h=${fitted.rect.h.toFixed(3)} score=${fitted.score}`)

  const read = async (spec: ChildSpec) => {
    const crop = cropRelative(workingPanel, spec.rect)
    const processed = preprocess(crop, spec.preset, { ...(profileOverride ?? {}), ...(spec.override ?? {}) })
    const out = await engine.recognize(processed, { mode: spec.mode, whitelist: spec.whitelist })
    const text = (out.text ?? '').trim()
    raws.push(`${spec.label}: ${text}`)
    if (Number.isFinite(out.confidence)) confidences.push(out.confidence)
    return out
  }

  const [rockNameRaw, massRaw, resistanceRaw, instabilityRaw, totalScuRaw, compositionRaw] = await Promise.all([
    read(LAYOUT.rockName),
    read(LAYOUT.mass),
    read(LAYOUT.resistance),
    read(LAYOUT.instability),
    read(LAYOUT.totalScu),
    read(LAYOUT.composition),
  ])

  let composition = parseCompositionBlock(compositionRaw.text)
  if (composition.length < 2) {
    const rowComposition = await readCompositionRows(workingPanel, engine, profileOverride, raws, confidences)
    if (rowComposition.length > composition.length) composition = rowComposition
  }

  const result: MiningScanResult = {
    rockName: normalizeRockName(rockNameRaw.text),
    mass: parseHudInteger(massRaw.text),
    resistance: parseHudPercent(resistanceRaw.text),
    instability: parseHudDecimal(instabilityRaw.text),
    totalScu: parseHudScu(totalScuRaw.text),
    composition,
  }

  if (!result.rockName) {
    const firstUseful = composition.find(r => r.name && !/^INERT MATERIALS$/i.test(r.name))
    if (firstUseful) result.rockName = firstUseful.name
  }

  const hasData = result.rockName !== undefined || result.mass !== undefined ||
    result.resistance !== undefined || result.instability !== undefined ||
    result.totalScu !== undefined || result.composition.length > 0

  const confidence = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0

  raws.push(`json: ${JSON.stringify(result)}`)

  return {
    result,
    rawText: raws.join('\n'),
    confidence,
    valid: hasData,
  }
}


type AutoFitResult = {
  canvas: HTMLCanvasElement
  rect: OcrRect
  used: boolean
  score: number
}

function autoFitHudTextPanel(panelCanvas: HTMLCanvasElement): AutoFitResult {
  const width = panelCanvas.width
  const height = panelCanvas.height
  const ctx = panelCanvas.getContext('2d', { willReadFrequently: true })

  const original: AutoFitResult = {
    canvas: panelCanvas,
    rect: { x: 0, y: 0, w: 1, h: 1 },
    used: false,
    score: 0,
  }

  if (!ctx || width < 40 || height < 40) return original

  const img = ctx.getImageData(0, 0, width, height)
  const xs: number[] = []
  const ys: number[] = []

  const lumAt = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4
      const r = img.data[i]
      const g = img.data[i + 1]
      const b = img.data[i + 2]
      const max = Math.max(r, g, b)

      // Ignore le cadre cyan de configuration s'il apparaît dans la preview/capture debug.
      if (g > 145 && b > 145 && r < 140) continue

      const l = 0.299 * r + 0.587 * g + 0.114 * b
      const localContrast =
        Math.abs(l - lumAt(x + 1, y)) +
        Math.abs(l - lumAt(x - 1, y)) +
        Math.abs(l - lumAt(x, y + 1)) +
        Math.abs(l - lumAt(x, y - 1))

      // Texte SCAN RESULTS = jaune/blanc très lumineux, avec contours fins.
      // On prend surtout le signal jaune + contraste local pour éviter le sol lumineux.
      const yellowScore = ((r + g) / 2 - b) + (r - b) * 0.35
      const isHudTextPixel = max > 115 && yellowScore > 30 && localContrast > 40

      if (isHudTextPixel) {
        xs.push(x)
        ys.push(y)
      }
    }
  }

  // Trop peu de pixels détectés : cadre probablement mauvais ou texte trop bruité.
  if (xs.length < 120 || ys.length < 120) return original

  xs.sort((a, b) => a - b)
  ys.sort((a, b) => a - b)

  // Percentiles = retire les petits parasites autour du panel.
  let minX = quantile(xs, 0.02)
  let maxX = quantile(xs, 0.985)
  let minY = quantile(ys, 0.01)
  let maxY = quantile(ys, 0.995)

  const marginX = Math.max(8, Math.round(width * 0.055))
  const marginY = Math.max(6, Math.round(height * 0.035))

  minX = clampInt(minX - marginX, 0, width - 2)
  maxX = clampInt(maxX + marginX, minX + 2, width)
  minY = clampInt(minY - marginY, 0, height - 2)
  maxY = clampInt(maxY + marginY, minY + 2, height)

  const fittedW = maxX - minX
  const fittedH = maxY - minY

  // Si l'auto-fit produit un truc absurde, on garde le cadre utilisateur.
  if (fittedW < width * 0.35 || fittedH < height * 0.45 || fittedW < 70 || fittedH < 100) {
    return { ...original, score: xs.length }
  }

  const out = document.createElement('canvas')
  out.width = fittedW
  out.height = fittedH
  const outCtx = out.getContext('2d', { willReadFrequently: true })
  if (!outCtx) return { ...original, score: xs.length }
  outCtx.drawImage(panelCanvas, minX, minY, fittedW, fittedH, 0, 0, fittedW, fittedH)

  return {
    canvas: out,
    rect: { x: minX / width, y: minY / height, w: fittedW / width, h: fittedH / height },
    used: true,
    score: xs.length,
  }
}

function quantile(sorted: number[], q: number): number {
  const idx = clampInt(Math.round((sorted.length - 1) * q), 0, sorted.length - 1)
  return sorted[idx]
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

async function readCompositionRows(
  panelCanvas: HTMLCanvasElement,
  engine: OcrEngine,
  profileOverride: Partial<OcrPreprocessPreset> | undefined,
  raws: string[],
  confidences: number[],
): Promise<OcrCompositionRow[]> {
  const compCanvas = cropRelative(panelCanvas, LAYOUT.composition.rect)
  const rows: OcrCompositionRow[] = []

  for (let i = 0; i < COMPOSITION_ROWS; i++) {
    const y = i / COMPOSITION_ROWS
    const h = 1 / COMPOSITION_ROWS
    const rowBase = { x: 0, y, w: 1, h }

    const pctCrop = cropRelative(compCanvas, mergeRects(rowBase, COMPOSITION_COLUMNS.percent))
    const nameCrop = cropRelative(compCanvas, mergeRects(rowBase, COMPOSITION_COLUMNS.name))
    const qtyCrop = cropRelative(compCanvas, mergeRects(rowBase, COMPOSITION_COLUMNS.qty))

    const [pctOcr, nameOcr, qtyOcr] = await Promise.all([
      recognizeSmall(engine, pctCrop, 'percent', 'scScanNumber', '0123456789.,%', { ...(profileOverride ?? {}), scale: 7, threshold: 120, contrast: 3.2, invert: true }),
      recognizeSmall(engine, nameCrop, 'material', 'scScanMaterial', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz() -/', { ...(profileOverride ?? {}), scale: 6, threshold: 120, contrast: 3.1, channelWeights: { r: 0.55, g: 0.45, b: 0.0 }, invert: true }),
      recognizeSmall(engine, qtyCrop, 'number', 'scScanNumber', '0123456789', { ...(profileOverride ?? {}), scale: 7, threshold: 120, contrast: 3.2, invert: true }),
    ])

    raws.push(`composition[${i + 1}].percent: ${pctOcr.text}`)
    raws.push(`composition[${i + 1}].name: ${nameOcr.text}`)
    raws.push(`composition[${i + 1}].qty: ${qtyOcr.text}`)

    for (const c of [pctOcr.confidence, nameOcr.confidence, qtyOcr.confidence]) {
      if (Number.isFinite(c)) confidences.push(c)
    }

    const percent = parseHudPercent(pctOcr.text)
    const name = normalizeRockName(nameOcr.text)
    const qty = parseHudInteger(qtyOcr.text)

    if (name && (percent !== undefined || qty !== undefined)) {
      rows.push({ percent: percent ?? 0, name, qty: qty ?? 0 })
    }
  }

  return mergeDuplicateCompositionRows(rows)
}

async function recognizeSmall(
  engine: OcrEngine,
  canvas: HTMLCanvasElement,
  mode: OcrZoneMode,
  preset: string,
  whitelist: string,
  override: Partial<OcrPreprocessPreset>,
) {
  const processed = preprocess(canvas, preset, override)
  return engine.recognize(processed, { mode, whitelist })
}

function cropRelative(src: HTMLCanvasElement, rect: OcrRect): HTMLCanvasElement {
  const x = clamp(rect.x, 0, 1)
  const y = clamp(rect.y, 0, 1)
  const w = clamp(rect.w, 0, 1 - x)
  const h = clamp(rect.h, 0, 1 - y)

  const sx = Math.floor(x * src.width)
  const sy = Math.floor(y * src.height)
  const sw = Math.max(2, Math.floor(w * src.width))
  const sh = Math.max(2, Math.floor(h * src.height))

  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  const ctx = out.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('[OCR] Canvas 2D context unavailable in mining scan extractor')
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)
  return out
}

function mergeRects(row: OcrRect, col: OcrRect): OcrRect {
  return {
    x: row.x + row.w * col.x,
    y: row.y + row.h * col.y,
    w: row.w * col.w,
    h: row.h * col.h,
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function normalizeRockName(raw: string): string | undefined {
  const cleaned = raw
    .replace(/[|]/g, 'I')
    .replace(/[{}\[\]]/g, '')
    .replace(/0/g, 'O')
    .replace(/5/g, 'S')
    .replace(/[^A-Za-z()\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || cleaned.length < 2) return undefined

  const direct = matchMaterial(cleaned)
  if (direct) return direct

  const rawPrefix = cleaned.match(/^RAW\s+(.+)$/i)
  if (rawPrefix) {
    const reordered = matchMaterial(`${rawPrefix[1]} RAW`)
    if (reordered) return reordered
  }

  return cleaned.toUpperCase()
}

function normalizeNumberText(raw: string): { text: string; hadDecimal: boolean } {
  const fixed = raw
    .replace(/[OoQD]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/,/g, '.')
  const hadDecimal = fixed.includes('.')
  return {
    text: fixed.replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, ''),
    hadDecimal,
  }
}

function parseHudInteger(raw: string): number | undefined {
  const { text } = normalizeNumberText(raw)
  if (!text) return undefined
  const n = parseInt(text.replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : undefined
}

function parseHudDecimal(raw: string): number | undefined {
  const { text, hadDecimal } = normalizeNumberText(raw)
  if (!text) return undefined
  let n = parseFloat(text)
  if (!Number.isFinite(n)) return undefined
  if (!hadDecimal && n >= 100 && n < 10000) n = n / 100
  return round2(n)
}

function parseHudScu(raw: string): number | undefined {
  const n = parseHudDecimal(raw)
  if (n === undefined) return undefined
  return n > 100 ? round2(n / 100) : n
}

function parseHudPercent(raw: string): number | undefined {
  const { text, hadDecimal } = normalizeNumberText(raw)
  if (!text) return undefined
  let n = parseFloat(text)
  if (!Number.isFinite(n)) return undefined
  if (!hadDecimal && n > 100 && n < 10000) n = n / 100
  if (n < 0 || n > 100) return undefined
  return round2(n)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseCompositionBlock(raw: string): OcrCompositionRow[] {
  const rows = raw
    .split(/\r?\n/)
    .map(line => parseCompositionLine(line))
    .filter((row): row is OcrCompositionRow => row !== null)
  return mergeDuplicateCompositionRows(rows)
}

function parseCompositionLine(line: string): OcrCompositionRow | null {
  const cleaned = line
    .replace(/[|]/g, 'I')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return null

  const percentMatch = cleaned.match(/([0-9OoQDIl|Ss.,]{1,6})\s*%?/)
  if (!percentMatch) return null
  const percent = parseHudPercent(percentMatch[1])
  if (percent === undefined) return null

  const qtyMatch = cleaned.match(/([0-9OoQDIl|Ss]{1,4})\s*$/)
  const qty = qtyMatch ? parseHudInteger(qtyMatch[1]) : undefined

  const between = cleaned
    .slice(percentMatch.index! + percentMatch[0].length, qtyMatch?.index ?? cleaned.length)
    .replace(/[^A-Za-z()\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const name = normalizeRockName(between)
  if (!name) return null

  return { percent, name, qty: qty ?? 0 }
}

function mergeDuplicateCompositionRows(rows: OcrCompositionRow[]): OcrCompositionRow[] {
  const out: OcrCompositionRow[] = []
  for (const row of rows) {
    const existing = out.find(r => r.name === row.name && Math.abs((r.percent ?? 0) - (row.percent ?? 0)) < 0.05)
    if (existing) {
      if (!existing.qty && row.qty) existing.qty = row.qty
      continue
    }
    out.push(row)
  }
  return out.slice(0, COMPOSITION_ROWS)
}
