// ─── Types OCR 1CCOverlay ─────────────────────────────────────────────────────
// Coordonnées toujours en ratio 0→1 (relatif à la taille de capture)

export type OcrZoneMode =
  | 'text'
  | 'number'
  | 'percent'
  | 'material'
  | 'coordinate'
  | 'quality'
  | 'composition'    // bloc multi-lignes : "X%  NOM  QTY" par ligne
  | 'mining-scan'    // panel SCAN RESULTS complet → JSON avec tous les champs mining

export type OcrCompositionRow = {
  percent: number
  name: string
  qty: number
}

export type OcrRect = {
  /** 0→1 relatif à la largeur de capture */
  x: number
  /** 0→1 relatif à la hauteur de capture */
  y: number
  /** 0→1 relatif à la largeur de capture */
  w: number
  /** 0→1 relatif à la hauteur de capture */
  h: number
}

export type OcrZone = {
  id: string
  label: string
  /** Clé utilisée pour mapper vers le store mining */
  fieldKey: string
  enabled: boolean
  rect: OcrRect
  mode: OcrZoneMode
  /** Catégorie UI pour regrouper les zones dans la liste */
  category?: 'rock' | 'hud' | 'custom'
  preprocessingPreset: string
  preprocessingOverride?: Partial<OcrPreprocessPreset>
  whitelist?: string
  regex?: string
  minConfidence: number
  stabilize: {
    samples: number
    maxDelta?: number
  }
}

export type OcrProfile = {
  id: string
  label: string
  shipKey?: string
  /** Override de prétraitement appliqué à toutes les zones du profil (avant l'override par zone) */
  profilePreprocessing?: Partial<OcrPreprocessPreset>
  aspectRatio?: string   // ex: '16:9' | '21:9' | '32:9'
  presetKey?: string     // clé du preset source (ex: 'mole_16_9')
  gameVersion?: string
  referenceResolution: {
    width: number
    height: number
    scaleFactor?: number
  }
  zones: OcrZone[]
  createdAt: string
  updatedAt: string
}

export type OcrRawResult = {
  zoneId: string
  fieldKey: string
  rawText: string
  confidence: number
  imageDataUrl?: string
  timestamp: number
}

export type OcrNormalizedResult = {
  zoneId: string
  fieldKey: string
  rawText: string
  value: string | number | null
  confidence: number
  valid: boolean
  stable: boolean
  timestamp: number
}

export type OcrCaptureSource = {
  id: string
  name: string
  type: 'window' | 'screen'
  thumbnail?: string
}

export type OcrRecognizeOptions = {
  whitelist?: string
  mode?: OcrZoneMode
}

export type OcrEngineResult = {
  text: string
  confidence: number
}

export type OcrPreprocessPreset = {
  scale: number
  grayscale: boolean
  contrast: number
  threshold?: number
  invert?: boolean
  /** Utilise canal R dominant (0.8R+0.2G) — optimal texte orange SC. Remplacé par channelWeights si défini. */
  redBoost?: boolean
  /** Poids RGB pour la conversion en niveaux de gris. Surcharge redBoost et luminance standard.
   *  Ex: texte orange → { r: 0.8, g: 0.2, b: 0.0 }
   *      texte bleu SC → { r: 0.0, g: 0.3, b: 0.7 }
   *      texte vert    → { r: 0.1, g: 0.8, b: 0.1 }
   */
  channelWeights?: { r: number; g: number; b: number }
}
