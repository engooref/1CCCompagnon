import type { OcrZone, OcrZoneMode } from './OcrTypes'

export type OcrZoneTemplate = Omit<OcrZone, 'id'>

export type ZoneTemplateOption = {
  key: string
  label: string
  description: string
  zone: OcrZoneTemplate
}

type RockPanelRect = { x: number; y: number; w: number; h: number }

type ZoneOptions = Partial<Pick<
  OcrZoneTemplate,
  'preprocessingOverride' | 'whitelist' | 'regex' | 'minConfidence' | 'stabilize' | 'category'
>>

const NUMBER_WHITELIST = '0123456789.,'
const PERCENT_WHITELIST = '0123456789.,%'

function zone(
  label: string,
  fieldKey: string,
  rect: RockPanelRect,
  mode: OcrZoneMode,
  preprocessingPreset: string,
  options: ZoneOptions = {},
): OcrZoneTemplate {
  return {
    label,
    fieldKey,
    enabled: true,
    rect,
    mode,
    preprocessingPreset,
    minConfidence: options.minConfidence ?? 40,
    stabilize: options.stabilize ?? { samples: 2 },
    ...(options.category ? { category: options.category } : {}),
    ...(options.preprocessingOverride ? { preprocessingOverride: options.preprocessingOverride } : {}),
    ...(options.whitelist ? { whitelist: options.whitelist } : {}),
    ...(options.regex ? { regex: options.regex } : {}),
  }
}

function subRect(panel: RockPanelRect, x: number, y: number, w: number, h: number): RockPanelRect {
  return {
    x: panel.x + panel.w * x,
    y: panel.y + panel.h * y,
    w: panel.w * w,
    h: panel.h * h,
  }
}

export function buildRockScanZones(panel: RockPanelRect): OcrZoneTemplate[] {
  const zones: OcrZoneTemplate[] = [
    zone('Type rocher', 'rockName', subRect(panel, 0.02, 0.00, 0.96, 0.09), 'text', 'scScanHud', {
      category: 'rock',
      minConfidence: 35,
    }),
    zone('Masse', 'rockMass', subRect(panel, 0.52, 0.13, 0.44, 0.075), 'number', 'scOrangeHud', {
      category: 'rock',
      whitelist: NUMBER_WHITELIST,
    }),
    zone('Résistance', 'rockResistance', subRect(panel, 0.52, 0.22, 0.44, 0.075), 'percent', 'scOrangeHud', {
      category: 'rock',
      whitelist: PERCENT_WHITELIST,
    }),
    zone('Instabilité', 'rockInstability', subRect(panel, 0.52, 0.31, 0.44, 0.075), 'percent', 'scOrangeHud', {
      category: 'rock',
      whitelist: PERCENT_WHITELIST,
    }),
    zone('Total SCU', 'totalScu', subRect(panel, 0.58, 0.43, 0.38, 0.075), 'number', 'scOrangeHud', {
      category: 'rock',
      whitelist: NUMBER_WHITELIST,
    }),
  ]

  zones.push(
    zone('Composition minerais', 'compositionBlock', subRect(panel, 0.02, 0.54, 0.96, 0.42), 'composition', 'scScanHud', {
      category: 'rock',
      minConfidence: 28,
      stabilize: { samples: 2 },
      preprocessingOverride: {
        scale: 3,
        contrast: 2.1,
        threshold: 118,
        channelWeights: { r: 0.8, g: 0.2, b: 0 },
      },
    }),
  )

  return zones
}

// ─── Zones fixes — présentes dans tout profil ─────────────────────────────────

export const ROCK_PANEL_GENERIC: RockPanelRect = { x: 0.625, y: 0.325, w: 0.105, h: 0.265 }

export const FIXED_ZONES: ZoneTemplateOption[] = [
  ...buildRockScanZones(ROCK_PANEL_GENERIC).map((z, i) => ({
    key: `rock_${z.fieldKey}_${i}`,
    label: z.label,
    description: 'Zone rocher individuelle à positionner sur le SCAN RESULTS.',
    zone: z,
  })),
  {
    key: 'coordinates',
    label: 'Coordonnées',
    description: 'Position OOC du joueur (haut-droite HUD).',
    zone: {
      label: 'Coordonnées',
      fieldKey: 'coordinates',
      enabled: true,
      rect: { x: 0.22, y: 0.494, w: 0.56, h: 0.011 },
      mode: 'text',
      category: 'hud',
      preprocessingPreset: 'scScanHud',
      minConfidence: 40,
      stabilize: { samples: 2 },
    },
  },
  {
    key: 'signal',
    label: 'Signal',
    description: 'Indicateur de signal du ping mining.',
    zone: {
      label: 'Signal',
      fieldKey: 'signal',
      enabled: true,
      rect: { x: 0.44, y: 0.488, w: 0.12, h: 0.025 },
      mode: 'number',
      category: 'hud',
      preprocessingPreset: 'scScanNumber',
      whitelist: NUMBER_WHITELIST,
      minConfidence: 45,
      stabilize: { samples: 2 },
    },
  },
]

// ─── Templates libres ────────────────────────────────────────────────────────

export const ZONE_TEMPLATES: ZoneTemplateOption[] = [
  {
    key: 'rock_value_number',
    label: 'Rocher — valeur nombre',
    description: 'Petite zone numérique pour masse, SCU ou qualité.',
    zone: zone('Valeur rocher', 'customRockNumber', { x: 0.62, y: 0.33, w: 0.06, h: 0.02 }, 'number', 'scOrangeHud', {
      category: 'rock',
      whitelist: NUMBER_WHITELIST,
      minConfidence: 45,
      stabilize: { samples: 3 },
    }),
  },
  {
    key: 'rock_composition_block',
    label: 'Rocher — bloc composition',
    description: 'Bloc multi-lignes pour tous les minerais détectés. Recommandé si le nombre de minerais varie.',
    zone: zone('Composition minerais', 'compositionBlock', { x: 0.62, y: 0.47, w: 0.10, h: 0.12 }, 'composition', 'scScanHud', {
      category: 'rock',
      minConfidence: 28,
      stabilize: { samples: 2 },
      preprocessingOverride: {
        scale: 3,
        contrast: 2.1,
        threshold: 118,
        channelWeights: { r: 0.8, g: 0.2, b: 0 },
      },
    }),
  },
  {
    key: 'position_ooc',
    label: 'Position OOC (haut-droite)',
    description: "Ligne 2 du bloc d'informations haut-droite.",
    zone: {
      label: 'Position OOC',
      fieldKey: 'coordinates',
      enabled: true,
      rect: { x: 0.22, y: 0.494, w: 0.56, h: 0.011 },
      mode: 'text',
      category: 'hud',
      preprocessingPreset: 'scScanHud',
      minConfidence: 40,
      stabilize: { samples: 2 },
    },
  },
  {
    key: 'custom_text',
    label: 'Zone texte personnalisée',
    description: 'Zone générique en mode texte.',
    zone: {
      label: 'Zone personnalisée',
      fieldKey: 'custom',
      enabled: true,
      rect: { x: 0.30, y: 0.30, w: 0.15, h: 0.05 },
      mode: 'text',
      category: 'custom',
      preprocessingPreset: 'scScanHud',
      minConfidence: 50,
      stabilize: { samples: 2 },
    },
  },
  {
    key: 'custom_number',
    label: 'Zone nombre personnalisée',
    description: 'Zone générique en mode nombre.',
    zone: {
      label: 'Zone nombre',
      fieldKey: 'customNumber',
      enabled: true,
      rect: { x: 0.30, y: 0.30, w: 0.10, h: 0.04 },
      mode: 'number',
      category: 'custom',
      preprocessingPreset: 'scScanNumber',
      whitelist: NUMBER_WHITELIST,
      minConfidence: 55,
      stabilize: { samples: 3 },
    },
  },
]

export function buildZoneFromTemplate(key: string): OcrZone | null {
  const tpl = ZONE_TEMPLATES.find(t => t.key === key)
  if (!tpl) return null
  return { ...tpl.zone, id: crypto.randomUUID() }
}

// ─── Presets vaisseau ─────────────────────────────────────────────────────────

export type ShipPreset = {
  key: string
  label: string
  referenceResolution: { width: number; height: number }
  zones: OcrZoneTemplate[]
}

export const SHIP_PRESETS: ShipPreset[] = [
  {
    key: 'mole',
    label: 'ARGO MOLE',
    referenceResolution: { width: 2560, height: 1440 },
    zones: [
      ...buildRockScanZones({ x: 0.625, y: 0.325, w: 0.105, h: 0.265 }),
      {
        label: 'Coordonnées',
        fieldKey: 'coordinates',
        enabled: true,
        rect: { x: 0.22, y: 0.494, w: 0.56, h: 0.011 },
        mode: 'text',
        category: 'hud',
        preprocessingPreset: 'scScanHud',
        minConfidence: 40,
        stabilize: { samples: 2 },
      },
    ],
  },
  {
    key: 'prospector',
    label: 'MISC Prospector',
    referenceResolution: { width: 2560, height: 1440 },
    zones: [
      ...buildRockScanZones({ x: 0.635, y: 0.30, w: 0.10, h: 0.28 }),
      {
        label: 'Coordonnées',
        fieldKey: 'coordinates',
        enabled: true,
        rect: { x: 0.22, y: 0.494, w: 0.56, h: 0.011 },
        mode: 'text',
        category: 'hud',
        preprocessingPreset: 'scScanHud',
        minConfidence: 40,
        stabilize: { samples: 2 },
      },
    ],
  },
  {
    key: 'roc',
    label: 'Greycat ROC / ROC-DS',
    referenceResolution: { width: 2560, height: 1440 },
    zones: buildRockScanZones({ x: 0.64, y: 0.32, w: 0.10, h: 0.24 }),
  },
  {
    key: 'generic',
    label: 'Générique (personnalisé)',
    referenceResolution: { width: 2560, height: 1440 },
    zones: buildRockScanZones(ROCK_PANEL_GENERIC),
  },
]

export function getShipPreset(key: string): ShipPreset | undefined {
  return SHIP_PRESETS.find(s => s.key === key)
}

export function buildZonesFromShipPreset(key: string): OcrZone[] {
  const preset = getShipPreset(key)
  if (!preset) return []
  return preset.zones.map(z => ({ ...z, id: crypto.randomUUID() }))
}
