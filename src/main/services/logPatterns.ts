/**
 * logPatterns.ts
 *
 * Contient UNIQUEMENT les patterns de parsing du Game.log de Star Citizen.
 * Les patterns matchent sur la ligne normalisée (sans préfixe timestamp / level).
 */

export interface ParsedLine {
  type: string
  data: Record<string, string>
}

export interface Pattern {
  type: string
  regex: RegExp
  extract: (match: RegExpMatchArray, rawLine: string, normalizedLine: string) => Record<string, string>
}

// ─── Prefix normalization ─────────────────────────────────────────────────────

const TS_RE = /^\s*<(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)>\s*/
const LVL_RE = /^\s*\[(Notice|Error|Warning|Debug)\]\s*/

export function normalizeLogLine(line: string): {
  timestamp: string
  level: string
  rest: string
} {
  let rest = line
  let timestamp = ''
  let level = ''

  const ts = rest.match(TS_RE)
  if (ts) {
    timestamp = ts[1]
    rest = rest.slice(ts[0].length)
  }

  const lvl = rest.match(LVL_RE)
  if (lvl) {
    level = lvl[1]
    rest = rest.slice(lvl[0].length)
  }

  return { timestamp, level, rest: rest.trim() }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OOC_MAP: Record<string, string> = {
  OOC_Stanton_1_Hurston: 'Hurston',
  OOC_Stanton_2_Crusader: 'Crusader',
  OOC_Stanton_3_ArcCorp: 'ArcCorp',
  OOC_Stanton_4_MicroTech: 'MicroTech',
  OOC_Pyro_1_Pyro1: 'Pyro I',
  OOC_Pyro_2_Pyro2: 'Pyro II',
  OOC_Pyro_3_Pyro3: 'Pyro III',
}

export function labelLocation(raw: string): string {
  if (OOC_MAP[raw]) return OOC_MAP[raw]

  const ooc = raw.match(/OOC_\w+_\d+_(.+)/)
  if (ooc) return ooc[1]

  const rr = raw.match(/RR_(\w+)_(\w+)/)
  if (rr) return `${rr[1].toUpperCase()}-${rr[2].toUpperCase()}`

  return raw
}

export function labelShip(entityName: string): string {
  const clean = entityName.replace(/_\d+$/, '')
  const parts = clean.split('_')
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`
  return clean
}

function shipFromLine(line: string): string | null {
  const m = line.match(/\|\s*NOT AUTH\s*\|\s*([A-Z]+_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?)_\d+\[/)
  return m ? labelShip(m[1]) : null
}

function withMeta(
  data: Record<string, string>,
  rawLine: string,
): Record<string, string> {
  const pre = normalizeLogLine(rawLine)
  if (pre.timestamp) data.timestamp = pre.timestamp
  if (pre.level) data.level = pre.level
  return data
}

// ─── Pattern definitions ─────────────────────────────────────────────────────

export const PATTERNS: Pattern[] = [
  // ── Player name ────────────────────────────────────────────────────────────
  // Earliest detection : Channel Created contains nickname="<handle>" playerGEID=<id>
  {
    type: 'player',
    regex: /nickname="([^"]+)"\s+playerGEID=(\d+)/,
    extract: (m, rawLine) => withMeta({ player: m[1], playerGEID: m[2] }, rawLine),
  },
  {
    type: 'player',
    regex: /Resetting action state.*?Player:\s+([^,\s]+)/,
    extract: (m, rawLine) => withMeta({ player: m[1] }, rawLine),
  },
  {
    type: 'player',
    regex: /Player\[([^\]]+)\].*InventoryData/,
    extract: (m, rawLine) => withMeta({ player: m[1] }, rawLine),
  },

  // ── Session / join / spawn ────────────────────────────────────────────────
  {
    type: 'connect_started',
    regex: /^\[CSessionManager::ConnectCmd\]\s+Connect started!?/,
    extract: (_m, rawLine) => withMeta({}, rawLine),
  },
  {
    type: 'client_connected',
    regex: /^\[CSessionManager::OnClientConnected\]\s+Connected!?/,
    extract: (_m, rawLine) => withMeta({}, rawLine),
  },
  {
    type: 'client_spawned',
    regex: /^\[CSessionManager::OnClientSpawned\]\s+Spawned!?/,
    extract: (_m, rawLine) => withMeta({}, rawLine),
  },
  {
    type: 'shard',
    regex: /<Join PU>.*shard\[([^\]]+)\]/,
    extract: (m, rawLine) => withMeta({ shard: m[1] }, rawLine),
  },

  // ── Frontend / hangar ──────────────────────────────────────────────────────
  {
    type: 'hangar_enter',
    regex: /SubsumptionMissionComponent streaming in FrontendHangar/,
    extract: (_m, rawLine) => withMeta({}, rawLine),
  },

  // ── Véhicule : spawn / destruction ────────────────────────────────────────
  // Format : [VEHICLE SPAWN] CPlayerShipRespawnManager::OnVehicleSpawned <entityId> (<ShipName_entityId>) by player <playerGEID>
  {
    type: 'vehicle_spawn',
    regex: /\[VEHICLE SPAWN\] CPlayerShipRespawnManager::OnVehicleSpawned \d+ \(([^)]+)\) by player (\d+)/,
    extract: (m, rawLine) => withMeta({
      shipRaw: m[1],
      ship:    labelShip(m[1]),
      playerGEID: m[2],
    }, rawLine),
  },
  // Format : [VEHICLE SPAWN] Vehicle Destroyed (<ShipName_entityId>). Killed by (<player>). Reason: <reason>
  {
    type: 'vehicle_destroyed',
    regex: /\[VEHICLE SPAWN\] Vehicle Destroyed \(([^)]+)\)\. Killed by \(([^)]+)\)\. Reason: (.+)/,
    extract: (m, rawLine) => withMeta({
      shipRaw:  m[1],
      ship:     labelShip(m[1]),
      killedBy: m[2].trim(),
      reason:   m[3].trim(),
    }, rawLine),
  },

  // ── Mort du joueur / éjection de zone ─────────────────────────────────────
  // Format : <[ActorState] Dead> ... Actor '<player>' [id] ejected from zone '<from>' [id] to zone '<to>' [id]
  {
    type: 'player_ejected',
    regex: /<\[ActorState\] Dead>.*Actor '([^']+)' \[\d+\] ejected from zone '([^']+)' \[\d+\] to zone '([^']+)'/,
    extract: (m, rawLine) => withMeta({
      player:   m[1],
      fromZone: m[2],
      toZone:   m[3],
    }, rawLine),
  },

  // ── Quantum / navigation ──────────────────────────────────────────────────
  {
    type: 'quantum_selected',
    regex: /OnPlayerSelectedQuantumTarget\|Player has selected point (\S+) as their destination/,
    extract: (m, rawLine) =>
      withMeta({
        destination: labelLocation(m[1]),
        rawDestination: m[1],
        ship: shipFromLine(rawLine) ?? '',
      }, rawLine),
  },
  {
    type: 'quantum_route',
    regex: /CalculateRoute\|Projected Start Location is (.+?) for route to destination (\S+)/,
    extract: (m, rawLine) =>
      withMeta({
        location: m[1].trim(),
        destination: labelLocation(m[2]),
        rawDestination: m[2],
        ship: shipFromLine(rawLine) ?? '',
      }, rawLine),
  },
  {
    type: 'quantum_route_ready',
    regex: /CalculateRoute\|Successfully calculated route to (\S+) fuel estimate ([\d.]+)/,
    extract: (m, rawLine) =>
      withMeta({
        destination: labelLocation(m[1]),
        rawDestination: m[1],
        fuel: m[2],
        ship: shipFromLine(rawLine) ?? '',
      }, rawLine),
  },
  {
    type: 'quantum_preparing',
    regex: /OnPlayerRequestFuelToQuantumTarget\|Player has requested fuel calculation to destination (\S+)/,
    extract: (m, rawLine) =>
      withMeta({
        destination: labelLocation(m[1]),
        rawDestination: m[1],
        ship: shipFromLine(rawLine) ?? '',
      }, rawLine),
  },

  // ── ATC / landing request ─────────────────────────────────────────────────
  {
    type: 'atc_request',
    regex: /DoEstablishCommunicationCommon:.*\bfor (\S+) \[\d+\] to track their communication partner AImodule_ATC_/,
    extract: (m, rawLine) =>
      withMeta({ player: m[1] }, rawLine),
  },

  // ── Inventory / location ──────────────────────────────────────────────────
  {
    type: 'location',
    regex: /RequestLocationInventory.*Location\[([^\]]+)\]/,
    extract: (m, rawLine) =>
      withMeta({
        location: labelLocation(m[1]),
        rawLocation: m[1],
      }, rawLine),
  },

  // ── Notifications / zones ─────────────────────────────────────────────────
  {
    type: 'notification',
    regex: /Added notification "([^"]+)"/,
    extract: (m, rawLine) =>
      withMeta({
        notification: m[1].replace(/:\s*$/, '').trim(),
      }, rawLine),
  },

  // ── Disconnect ────────────────────────────────────────────────────────────
  {
    type: 'disconnect',
    regex: /^<Channel Disconnected>\s+cause=(\d+)\s+reason="([^"]+)".*hostType="([^"]+)".*nickname="([^"]+)"/,
    extract: (m, rawLine) =>
      withMeta({
        cause: m[1],
        reason: m[2],
        hostType: m[3],
        player: m[4],
      }, rawLine),
  },

]

// ─── Main parse function ─────────────────────────────────────────────────────

export function parseLine(line: string): ParsedLine | null {
  const normalized = normalizeLogLine(line)

  for (const pattern of PATTERNS) {
    const m = normalized.rest.match(pattern.regex)
    if (m) {
      return {
        type: pattern.type,
        data: pattern.extract(m, line, normalized.rest),
      }
    }
  }

  return null
}
