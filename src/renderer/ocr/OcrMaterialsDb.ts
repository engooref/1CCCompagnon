// ─── Base de données matériaux Star Citizen ───────────────────────────────────
// name    : nom canonique affiché dans le jeu
// aliases : variantes OCR connues (après cleanForMatch : minuscules, sans ponctuation)
// category: classification
// scu     : valeur approximative (pour tri/affichage futur)

export type ScMaterial = {
  name: string
  aliases: string[]
  category: 'rare' | 'ore' | 'raw' | 'inert' | 'gas'
}

export const SC_MATERIALS: ScMaterial[] = [
  // ── Gemmes / Rares ──────────────────────────────────────────────────────────
  {
    name: 'Quantainium',
    aliases: ['quantanium', 'quantaniurn', 'quantainiurn', 'ouantainium', 'ouantanium'],
    category: 'rare',
  },
  {
    name: 'Bexalite',
    aliases: ['bexaite', 'bexallte', 'bexalte', 'bexalita'],
    category: 'rare',
  },
  {
    name: 'Taranite',
    aliases: ['taranita', 'taranite', 'taranife', 'taranlte'],
    category: 'rare',
  },
  {
    name: 'Borase',
    aliases: ['borase', 'borase', 'borasa', 'b0rase'],
    category: 'rare',
  },
  {
    name: 'Laranite',
    aliases: ['laranita', 'laranlte', 'laranife', 'laranife'],
    category: 'rare',
  },
  {
    name: 'Agricium',
    aliases: ['agriculm', 'agriclum', 'agricium', 'agrlcium'],
    category: 'rare',
  },
  {
    name: 'Hephaestanite',
    aliases: ['hephaestanite', 'hephaestanita', 'hephaestanlte', 'hephaestanife'],
    category: 'rare',
  },
  {
    name: 'Aphorite',
    aliases: ['aphorita', 'aphorlte', 'aphorife', 'aphorite'],
    category: 'rare',
  },
  {
    name: 'Dolivine',
    aliases: ['doltvine', 'dolivlne', 'dollvine', 'dolivme'],
    category: 'rare',
  },
  {
    name: 'Hadanite',
    aliases: ['hadanita', 'hadanlte', 'hadanife', 'hadanite'],
    category: 'rare',
  },

  // ── Minerais communs — format "Nom (Ore/Raw)" ────────────────────────────────
  {
    name: 'Iron (Ore)',
    // I souvent perdu en début de ligne, E→S dans les parenthèses
    aliases: ['iron ore', 'ron ore', 'mon ore', 'iron ors', 'ron ors', 'mon ors', 'ibon ore', 'lron ore'],
    category: 'ore',
  },
  {
    name: 'Copper (Ore)',
    aliases: ['copper ore', 'coppe ore', 'opper ore', 'copper ors', 'copr ore'],
    category: 'ore',
  },
  {
    name: 'Corundum (Raw)',
    aliases: ['corundum raw', 'corundum rw', 'corundurn raw', 'corundum raw'],
    category: 'raw',
  },
  {
    name: 'Quartz (Raw)',
    aliases: ['quartz raw', 'ouartz raw', 'quarlz raw', 'quariz raw'],
    category: 'raw',
  },
  {
    name: 'Diamond (Raw)',
    aliases: ['diamond raw', 'dlamond raw', 'diarnond raw', 'diamord raw'],
    category: 'raw',
  },
  {
    name: 'Gold (Raw)',
    aliases: ['gold raw', 'g0ld raw', 'g01d raw', 'goid raw'],
    category: 'raw',
  },
  {
    name: 'Titanium (Raw)',
    aliases: ['titanium raw', 'titaniurn raw', 'titanium rw', 'tltanium raw'],
    category: 'raw',
  },
  {
    name: 'Tungsten (Raw)',
    aliases: ['tungsten raw', 'tungsten rw', 'tungslen raw', 'tungsten raw'],
    category: 'raw',
  },
  {
    name: 'Aluminum (Raw)',
    aliases: ['aluminum raw', 'alumlnum raw', 'aluminurn raw', 'alurninurn raw'],
    category: 'raw',
  },
  {
    name: 'Silicon (Raw)',
    aliases: ['silicon raw', 'sillcon raw', 'silcon raw', 'silic0n raw'],
    category: 'raw',
  },
  {
    name: 'Carbon (Raw)',
    aliases: ['carbon raw', 'carb0n raw', 'carbon rw'],
    category: 'raw',
  },
  {
    name: 'Beryl (Raw)',
    aliases: ['beryl raw', 'beryl rw', 'bery raw'],
    category: 'raw',
  },
  {
    name: 'Ice (Raw)',
    aliases: ['ice raw', 'lce raw'],
    category: 'raw',
  },

  // ── Indésirables / Inertes ───────────────────────────────────────────────────
  {
    name: 'Inert Materials',
    // I souvent perdu, T→Y possible, rn→m (tesseract)
    aliases: [
      'inert materials', 'nert materials', 'nery materials',
      'inert matenals', 'inert rnaterials', 'nert matenals',
      'nery matenals', 'inert material', 'nert material',
    ],
    category: 'inert',
  },
  {
    name: 'Agricultural Supplies',
    aliases: [
      'agricultural supplies', 'agriculural supplies', 'agricultural supplles',
      'agncultural supplies', 'agricutural supplies',
    ],
    category: 'inert',
  },
]

// ─── Index plat : alias nettoyé → nom canonique (hardcodé) ──────────────────

export function cleanKey(s: string): string {
  return s.replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

const ALIAS_INDEX = new Map<string, string>()

for (const mat of SC_MATERIALS) {
  ALIAS_INDEX.set(cleanKey(mat.name), mat.name)
  for (const alias of mat.aliases) {
    ALIAS_INDEX.set(cleanKey(alias), mat.name)
  }
}

// ─── Minéraux distants (chargés depuis l'API au boot) ────────────────────────

export type RemoteMineral = {
  id: number
  name: string
  code: string | null
  priceSell: number | null
  signal: number | null
}

let _remoteMinerals: RemoteMineral[] = []
const _remoteIndex = new Map<string, RemoteMineral>()

/**
 * À appeler au démarrage avec la liste renvoyée par /compagnon/mining/minerals.
 * Remplace le contenu distant précédent.
 */
export function loadRemoteMinerals(minerals: RemoteMineral[]): void {
  _remoteMinerals = minerals
  console.log(`[OcrMaterialsDb] Loaded ${minerals.length} remote minerals from API.`)
  _remoteIndex.clear()
  for (const m of minerals) {
    _remoteIndex.set(cleanKey(m.name), m)
  }
}

/**
 * Retourne l'id serveur pour un nom canonique (après matching OCR).
 * Null si les minéraux distants ne sont pas encore chargés ou si introuvable.
 */
export function getRemoteMineralId(canonicalName: string): number | null {
  // Match exact sur le nom canonique
  const direct = _remoteIndex.get(cleanKey(canonicalName))
  if (direct) return direct.id

  // Fuzzy sur les noms distants (cas où le nom canonique hardcodé diffère légèrement)
  const key = cleanKey(canonicalName)
  for (const m of _remoteMinerals) {
    const maxLen = Math.max(key.length, cleanKey(m.name).length)
    const threshold = Math.min(4, Math.floor(maxLen * 0.35))
    if (levenshtein(key, cleanKey(m.name)) <= threshold) return m.id
  }
  return null
}

/**
 * Retourne le nom canonique du matériau SC à partir d'un texte OCR brut.
 * Priorité : distant exact → alias hardcodé exact → distant fuzzy → hardcodé fuzzy.
 */
export function matchMaterial(raw: string): string | null {
  const key = cleanKey(raw)
  if (!key || key.length < 2) return null

  // 1. Distant exact
  const remoteExact = _remoteIndex.get(key)
  if (remoteExact) return remoteExact.name

  // 2. Alias hardcodé exact
  const aliasExact = ALIAS_INDEX.get(key)
  if (aliasExact) return aliasExact

  // 3. Distant fuzzy
  let bestDist = Infinity
  let best: string | null = null
  for (const m of _remoteMinerals) {
    const mKey = cleanKey(m.name)
    const maxLen = Math.max(key.length, mKey.length)
    const threshold = Math.min(6, Math.floor(maxLen * 0.40))
    const d = levenshtein(key, mKey)
    if (d < bestDist && d <= threshold) { bestDist = d; best = m.name }
  }
  if (best) return best

  // 4. Hardcodé fuzzy (fallback si API indisponible)
  bestDist = Infinity
  best = null
  for (const mat of SC_MATERIALS) {
    const candidates = [cleanKey(mat.name), ...mat.aliases.map(cleanKey)]
    for (const candidate of candidates) {
      const maxLen = Math.max(key.length, candidate.length)
      const threshold = Math.min(6, Math.floor(maxLen * 0.40))
      const d = levenshtein(key, candidate)
      if (d < bestDist && d <= threshold) { bestDist = d; best = mat.name }
    }
  }
  return best
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
