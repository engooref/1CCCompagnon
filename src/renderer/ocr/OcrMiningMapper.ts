import type { OcrNormalizedResult, OcrCompositionRow } from './OcrTypes'

// ─── Mapping résultats OCR → payload session mining ───────────────────────────

export type MiningOcrPayload = {
  mainMaterial?: string
  rockMass?: number
  instability?: number
  resistance?: number
  totalScu?: number
  materials?: Array<{
    name: string
    percent?: number
    qty?: number
  }>
  coordinates?: string
}

/**
 * Transforme un tableau de résultats OCR normalisés en payload mining.
 * Seules les valeurs valides et stables sont utilisées.
 */
export function mapOcrResultsToMining(
  results: OcrNormalizedResult[],
): MiningOcrPayload {
  const byField = new Map<string, OcrNormalizedResult>()
  for (const r of results) {
    if (r.valid && r.stable) byField.set(r.fieldKey, r)
  }

  const payload: MiningOcrPayload = {}

  // ── Mode zone unique : panel SCAN RESULTS complet (mining-scan) ────────────
  const scanR = byField.get('scanResults')
  if (scanR?.value) {
    try {
      const scan = JSON.parse(scanR.value as string)
      if (scan.rockName !== undefined)     payload.mainMaterial = scan.rockName
      if (scan.mass !== undefined)        payload.rockMass    = scan.mass
      if (scan.resistance !== undefined)  payload.resistance  = scan.resistance
      if (scan.instability !== undefined) payload.instability = scan.instability
      if (scan.totalScu !== undefined)    payload.totalScu    = scan.totalScu
      if (scan.composition?.length)       payload.materials   = scan.composition
    } catch { /* ignore */ }
  }

  // ── Mode zones individuelles : chaque champ du rocher a sa propre zone ───
  const rockName = byField.get('rockName')
  if (rockName) payload.mainMaterial = rockName.value as string

  const rockMass = byField.get('rockMass') ?? byField.get('mass')
  if (rockMass) payload.rockMass = rockMass.value as number

  const instability = byField.get('rockInstability') ?? byField.get('instability')
  if (instability) payload.instability = instability.value as number

  const resistance = byField.get('rockResistance') ?? byField.get('resistance')
  if (resistance) payload.resistance = resistance.value as number

  const totalScu = byField.get('totalScu')
  if (totalScu) payload.totalScu = totalScu.value as number

  // Mode bloc : une seule zone parse toute la composition, peu importe le nombre de lignes.
  const compositionR = byField.get('compositionBlock') ?? byField.get('composition')
  if (compositionR?.value) {
    try {
      const rows: OcrCompositionRow[] = JSON.parse(compositionR.value as string)
      payload.materials = rows.map(r => ({ name: r.name, percent: r.percent, qty: r.qty }))
    } catch { /* ignore parse error */ }
  }

  // Fallback lecture seule : anciens résultats avec zones individuelles material1..N.
  // Les profils sont migrés automatiquement vers compositionBlock.
  if (!payload.materials) {
    const materials: MiningOcrPayload['materials'] = []
    for (let i = 1; i <= 5; i++) {
      const nameR = byField.get(`material${i}Name`) ?? byField.get(`composition[${i}].name`)
      const pctR  = byField.get(`material${i}Percent`) ?? byField.get(`composition[${i}].percent`)
      const qtyR  = byField.get(`material${i}Qty`) ?? byField.get(`composition[${i}].qty`)
      if (nameR || pctR || qtyR) {
        const name = nameR?.value ? String(nameR.value) : `Minerai ${i}`
        materials.push({
          name,
          percent: pctR ? (pctR.value as number) : undefined,
          qty: qtyR ? (qtyR.value as number) : undefined,
        })
      }
    }
    if (materials.length > 0) payload.materials = materials
  }

  const coords = byField.get('coordinates')
  if (coords) payload.coordinates = coords.value as string

  return payload
}

/**
 * Vérifie si le payload contient au moins un champ utile.
 */
export function isPayloadUseful(payload: MiningOcrPayload): boolean {
  return (
    payload.mainMaterial !== undefined ||
    payload.rockMass !== undefined ||
    payload.instability !== undefined ||
    payload.resistance !== undefined ||
    payload.totalScu !== undefined ||
    (payload.materials !== undefined && payload.materials.length > 0)
  )
}
