import type { OcrNormalizedResult, OcrZone } from './OcrTypes'

// ─── Stabilisation des lectures OCR ──────────────────────────────────────────
// Un résultat est "stable" si les N dernières lectures sont cohérentes.

type SampleBuffer = {
  results: OcrNormalizedResult[]
}

export class OcrStabilizer {
  private buffers = new Map<string, SampleBuffer>()

  /** Pousse un résultat, retourne le résultat annoté avec stable=true/false */
  push(result: OcrNormalizedResult, zone: OcrZone): OcrNormalizedResult {
    const { samples, maxDelta } = zone.stabilize
    const buf = this.getOrCreate(result.zoneId)

    buf.results.push(result)
    if (buf.results.length > samples) {
      buf.results.shift()
    }

    const stable = this.isStable(buf.results, samples, maxDelta, zone)

    return { ...result, stable }
  }

  clear(zoneId?: string): void {
    if (zoneId) {
      this.buffers.delete(zoneId)
    } else {
      this.buffers.clear()
    }
  }

  // ── Privé ─────────────────────────────────────────────────────────────────

  private getOrCreate(zoneId: string): SampleBuffer {
    if (!this.buffers.has(zoneId)) {
      this.buffers.set(zoneId, { results: [] })
    }
    return this.buffers.get(zoneId)!
  }

  private isStable(
    results: OcrNormalizedResult[],
    samples: number,
    maxDelta: number | undefined,
    zone: OcrZone,
  ): boolean {
    if (results.length < samples) return false
    if (results.some(r => !r.valid)) return false

    const recent = results.slice(-samples)

    if (zone.mode === 'number' || zone.mode === 'percent') {
      // Stabilité numérique : variation <= maxDelta
      const values = recent.map(r => r.value as number | null).filter(v => v !== null) as number[]
      if (values.length < samples) return false
      const min = Math.min(...values)
      const max = Math.max(...values)
      return (max - min) <= (maxDelta ?? 0.5)
    }

    // Stabilité texte : toutes les valeurs identiques
    const vals = recent.map(r => String(r.value ?? ''))
    return vals.every(v => v === vals[0])
  }
}

// Singleton partagé
export const ocrStabilizer = new OcrStabilizer()
