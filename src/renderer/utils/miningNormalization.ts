/**
 * Normalisation des données Mining
 * Nettoie et standardise les réponses API
 */

import type {
  MiningWorkOrder,
  MiningWOLine,
  MiningRock,
} from '@shared/general'

/**
 * Détecte si un work order a déjà été notifié
 * Supporte plusieurs formats de réponse API
 */
export function isWorkOrderNotified(wo: Partial<MiningWorkOrder> | null | undefined): boolean {
  if (!wo) return false
  return Boolean(
    wo.isNotified
    || (wo as any).notified
    || (wo as any).notificationSent
    || wo.notifiedAt
    || (wo as any).notificationSentAt,
  )
}

/**
 * Normalise un work order depuis l'API
 * Réconcilie les différents noms de champs possibles
 */
export function normalizeWO(wo: any): MiningWorkOrder {
  const lines = Array.isArray(wo.lines)
    ? wo.lines.map((l: any) => ({
      ...l,
      // Supporte both `scuInput` et `quantityScuInput` depuis l'API
      scuInput: l.scuInput ?? l.quantityScuInput ?? l.quantityScuInput ?? null,
      quantityScuInput: l.quantityScuInput ?? l.scuInput ?? null,
      // Supporte les deux formats de sortie
      scuOutput: l.scuOutput ?? l.quantityScuOutput ?? null,
      quantityScuOutput: l.quantityScuOutput ?? l.scuOutput ?? null,
      yieldPercent: l.yieldPercent ?? l.yieldPercent ?? null,
    }))
    : []

  return {
    ...wo,
    userId:           wo.userId ?? wo.ownerId ?? null,
    refineryPoiId:    wo.refineryPoiId ?? wo.refineryId ?? wo.refinery ?? null,
    refineryName:     wo.refineryName ?? wo.refineryName ?? null,
    method:           wo.method ?? wo.method ?? null,
    methodLabel:      wo.methodLabel ?? wo.methodLabel ?? wo.method ?? null,
    startedAt:        wo.startedAt  ?? null,
    endAt:            wo.endAt      ?? null,
    durationSeconds:  wo.durationSeconds ?? null,
    remainingSeconds: wo.remainingSeconds ?? null,
    confidence:       wo.confidence ?? null,
    isReady:          wo.isReady    ?? false,
    lines,
    notes:            wo.notes ?? null,
    notifyOnComplete: typeof wo.notifyOnComplete === 'boolean' ? wo.notifyOnComplete : true,
    isNotified:       isWorkOrderNotified(wo),
    notifiedAt:       wo.notifiedAt ?? wo.notificationSentAt ?? wo.notificationStartedAt ?? null,
  }
}

/**
 * Détermine la phase d'un minéral (scan vs actuellement collecté)
 */
export function mineralPhase(mineral: any): 'actual' | 'scan' {
  return mineral?.phase === 'actual' ? 'actual' : 'scan'
}

/**
 * Crée une clé unique pour un minéral (pour déduplication)
 */
export function mineralMergeKey(mineral: any): string {
  if (mineral?.id != null) return `id:${mineral.id}`
  const phase = mineralPhase(mineral)
  const commodity = mineral?.commodityId ?? mineral?.commodityCode ?? mineral?.commodityName ?? 'unknown'
  return `${phase}:${commodity}`
}

/**
 * Déduplique une liste de minéraux par clé
 */
export function dedupeMinerals(minerals: any[]): any[] {
  const map = new Map<string, any>()
  for (const mineral of minerals) {
    if (!mineral) continue
    map.set(mineralMergeKey(mineral), mineral)
  }
  return Array.from(map.values())
}

/**
 * Fusionne les minéraux actuels avec les nouveaux (intelligemment)
 * Cas 1: réponse complète (scan + actual) → l'utiliser
 * Cas 2: réponse partielle après collecte (juste actual) → fusionner avec scan existant
 * Cas 3: réponse partielle après édition du scan → garder les collectes existantes
 */
export function mergeRockMinerals(current: any[] = [], incoming: any[] = []): any[] {
  if (!Array.isArray(incoming)) return current
  if (!incoming.length) return []

  const currentRows = Array.isArray(current) ? current : []
  const incomingHasScan = incoming.some((m) => mineralPhase(m) !== 'actual')
  const incomingHasActual = incoming.some((m) => mineralPhase(m) === 'actual')
  const currentHasScan = currentRows.some((m) => mineralPhase(m) !== 'actual')
  const currentHasActual = currentRows.some((m) => mineralPhase(m) === 'actual')

  // Réponse complète: elle contient déjà scan + actual, donc l'utiliser telle quelle
  if (incomingHasScan && incomingHasActual) return dedupeMinerals(incoming)

  // Réponse partielle après collecte: elle peut ne contenir que les lignes actual
  if (incomingHasActual && currentHasScan) {
    return dedupeMinerals([
      ...currentRows.filter((m) => mineralPhase(m) !== 'actual'),
      ...currentRows.filter((m) => mineralPhase(m) === 'actual'),
      ...incoming,
    ])
  }

  // Réponse partielle après édition du scan: garder les collectes déjà déclarées
  if (incomingHasScan && currentHasActual) {
    return dedupeMinerals([
      ...incoming,
      ...currentRows.filter((m) => mineralPhase(m) === 'actual'),
    ])
  }

  return dedupeMinerals(incoming)
}

/**
 * Crée un patch partiel en supprimant les undefined
 * Utile pour les mises à jour PATCH
 */
export function definedPatch<T extends Record<string, any>>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}
