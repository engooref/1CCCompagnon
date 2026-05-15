import type { OcrRawResult, OcrNormalizedResult, OcrZone, OcrCompositionRow } from './OcrTypes'
import { matchMaterial } from './OcrMaterialsDb'


// ─── Corrections OCR communes ─────────────────────────────────────────────────

function cleanCommonOcrErrors(raw: string): string {
  return raw
    .replace(/[|lI]/g, '1')  // pour chiffres seulement (appelé avant contexte)
    .replace(/O/g, '0')
    .replace(/o/g, '0')
    .replace(/,/g, '.')
    .replace(/[^\x20-\x7E]/g, '') // supprimer non-ASCII
    .trim()
}

function cleanForNumber(raw: string): string {
  // Corrections spécifiques aux chiffres
  return raw
    .replace(/[|lIioO]/g, match => ['i','o','l','|'].includes(match.toLowerCase()) ? '0' : match)
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '')
    .trim()
}

function applyRegex(raw: string, regex: string): string {
  try {
    const match = raw.match(new RegExp(regex))
    return match ? match[0] : raw
  } catch {
    return raw
  }
}

// ─── Normalisation par mode ───────────────────────────────────────────────────

function normalizeNumber(raw: string): number | null {
  const cleaned = cleanForNumber(raw)
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function normalizePercent(raw: string): number | null {
  const n = normalizeNumber(raw)
  if (n === null) return null
  if (n < 0 || n > 100) return null
  return n
}

function normalizeMaterial(raw: string): string | null {
  return matchMaterial(raw)
}

function normalizeText(raw: string): string | null {
  const cleaned = raw.replace(/[^\x20-\x7E]/g, '').trim()
  return cleaned || null
}

function normalizeCoordinate(raw: string): string | null {
  const cleaned = raw.replace(/[^0-9.,\-\s]/g, '').trim()
  return cleaned || null
}

// ─── Composition bloc (multi-lignes) ─────────────────────────────────────────

function normalizeCompositionName(raw: string): string | null {
  const cleaned = raw
    .replace(/[0-9.,%]+/g, ' ')
    .replace(/\b(SCU|QTY|QT|UNITS?)\b/gi, ' ')
    .replace(/[^A-Za-z\s()/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
  if (!cleaned || cleaned.length < 2) return null
  return normalizeMaterial(cleaned) ?? cleaned
}

function parseOcrNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/[OoDQ]/g, '0')
    .replace(/[IlL|]/g, '1')
    .replace(/S/g, '5')
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseCompositionLine(line: string): OcrCompositionRow | null {
  const src = line.trim()
  if (!src || src.length < 4) return null

  // Format cible courant : "12.34% AGRICIUM 3.20 SCU".
  // Tolère aussi : "12.34 AGRICIUM 3.20".
  const percentMatch = src.match(/([0-9OoIlL|S]+(?:[.,][0-9OoIlL|S]+)?)\s*%/) ??
    src.match(/^\s*([0-9OoIlL|S]+(?:[.,][0-9OoIlL|S]+)?)/)
  if (!percentMatch) return null

  const percent = parseOcrNumber(percentMatch[1])
  if (percent === null || percent <= 0 || percent > 100) return null

  const beforePercent = src.slice(0, percentMatch.index ?? 0).trim()
  const afterPercent = src.slice((percentMatch.index ?? 0) + percentMatch[0].length)
  const qtyMatch = afterPercent.match(/([0-9OoIlL|S]+(?:[.,][0-9OoIlL|S]+)?)\s*(?:SCU|QTY|QT)?\s*$/i)
  const betweenPercentAndQty = qtyMatch ? afterPercent.slice(0, qtyMatch.index).trim() : afterPercent.trim()
  const nameRaw = betweenPercentAndQty || beforePercent

  const name = normalizeCompositionName(nameRaw)
  if (!name) return null

  const qty = qtyMatch ? parseOcrNumber(qtyMatch[1]) : null

  return {
    percent,
    name,
    qty: qty ?? 0,
  }
}

function normalizeComposition(raw: string): OcrCompositionRow[] {
  return raw
    .split('\n')
    .map(parseCompositionLine)
    .filter((r): r is OcrCompositionRow => r !== null)
}

// ─── Mode mining-scan : panel SCAN RESULTS complet ───────────────────────────
// Une seule zone couvre tout le panel → on extrait tous les champs par regex.

type MiningScanResult = {
  rockName?: string
  mass?: number
  resistance?: number
  instability?: number
  totalScu?: number
  composition: OcrCompositionRow[]
}

function normalizeMiningScan(raw: string): string | null {
  const up = raw.toUpperCase()

  // MASS : M/N, S/5, séparateur : ou saut de ligne ou espace(s)
  const massMatch    = up.match(/[MN]A[S5]{1,2}[\s:]*[\n\r]?\s*([\d][\d ]{1,9})/)
  // RESISTANCE : tolérer % et séparateur saut de ligne
  const resMatch     = up.match(/RES[I1]STANCE[\s:]*[\n\r]?\s*([\d.,]+)/)
  // INSTABILITY : idem
  const instMatch    = up.match(/[I1]N[S5]TAB[I1]L[I1]TY[\s:]*[\n\r]?\s*([\d.,]+)/)
  // COMPOSITION : "O" souvent lu "0" par OCR, cherche aussi le pattern "X.XX SCU"
  const scuMatch     = up.match(/COMP[O0]S[I1]T[I1][O0]N.{1,30}?([\d.,]+)\s*SCU/) ??
                       up.match(/([\d]+[.,][\d]+)\s*SCU/)
  // Nom : ligne contenant "(ORE)" ou "(RAW)" ou ligne après "SCAN RESULTS"
  const oreLineMatch  = raw.match(/^([A-Z][A-Z\s]+\([A-Z]+\))\s*$/m)
  const nameLineMatch = raw.match(/SCAN\s*RESULTS?\s*[\n\r]+([^\n\r]+)/i)
  const rockNameRaw   = (oreLineMatch?.[1] ?? nameLineMatch?.[1] ?? '').trim()
  const rockName      = rockNameRaw ? (normalizeMaterial(rockNameRaw) ?? (rockNameRaw.toUpperCase() || undefined)) : undefined

  const result: MiningScanResult = {
    rockName,
    mass:        massMatch  ? parseInt(massMatch[1].replace(/\s+/g, ''), 10)      : undefined,
    resistance:  resMatch   ? parseInt(resMatch[1].replace(',', '.'))             : undefined,
    instability: instMatch  ? parseFloat(instMatch[1].replace(',', '.'))          : undefined,
    totalScu:    scuMatch   ? parseFloat(scuMatch[1].replace(',', '.'))           : undefined,
    composition: normalizeComposition(raw),
  }

  const hasData = result.mass !== undefined || result.composition.length > 0
  return hasData ? JSON.stringify(result) : null
}

// ─── Normalisation principale ─────────────────────────────────────────────────

export function normalizeByZone(
  raw: OcrRawResult,
  zone: OcrZone,
): OcrNormalizedResult {
  let text = raw.rawText
  if (zone.regex) text = applyRegex(text, zone.regex)

  let value: string | number | null = null
  let valid = false

  switch (zone.mode) {
    case 'number': {
      const n = normalizeNumber(text)
      value = n
      valid = n !== null
      break
    }
    case 'percent': {
      const p = normalizePercent(text)
      value = p
      valid = p !== null
      break
    }
    case 'material': {
      const mat = normalizeMaterial(text)
      value = mat
      valid = mat !== null
      break
    }
    case 'coordinate': {
      const coord = normalizeCoordinate(text)
      value = coord
      valid = coord !== null
      break
    }
    case 'composition': {
      const rows = normalizeComposition(text)
      value = rows.length > 0 ? JSON.stringify(rows) : null
      valid = rows.length > 0
      break
    }
    case 'mining-scan': {
      const scan = normalizeMiningScan(text)
      value = scan
      valid = scan !== null
      break
    }
    case 'text':
    case 'quality':
    default: {
      const t = normalizeText(text)
      value = t
      valid = t !== null && t.length > 0
    }
  }

  const confOk = raw.confidence >= zone.minConfidence

  return {
    zoneId: raw.zoneId,
    fieldKey: raw.fieldKey,
    rawText: raw.rawText,
    value: confOk ? value : null,
    confidence: raw.confidence,
    valid: valid && confOk,
    stable: false, // sera mis à jour par le Stabilizer
    timestamp: raw.timestamp,
  }
}
