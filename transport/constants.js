/**
 * Transport module — constants, factories & pure helpers.
 */

export const API = Object.freeze({
  SHIP_MODELS:        '/market/transport/api/shipmodels',
  DELIVERIES:         '/market/transport/api/deliveries',
  ITINERARIES:        '/market/transport/api/itineraries',
  GENERATE:           '/market/transport/api/itineraries/{id}/generate',
  ITINERARY_LEG:      '/market/transport/api/itineraries/legs',
  COMMODITIES:        '/market/transport/api/commodities',
  POI_SEARCH:         '/starmap/api/poi/search',
  TRADE_SUGGESTIONS:       '/market/transport/api/deliveries/trade-suggestions',
  TRADE_SUGGESTIONS_BATCH: '/market/transport/api/deliveries/trade-suggestions/batch',
});

export function createEmptyDelivery() {
  return {
    id: null,
    name: null,
    autoFillCargo: false,
    startingCredits: null,
    status: 'draft',
    origin: null,
    startingCredits: null,

    originName: '',
    originSystemName: '',
    originNameDisplay: '',
    cargoTot: 0,
    ships: [],
    manifests: [],
    generated: false,
    itinerary: null,
  };
}

export function createEmptyViewModel() {
  return {
    id: null,
    name: null,
    status: 'draft',
    origin: null,
    originName: '',
    originSystemName: '',
    originNameDisplay: '',
    cargoTot: 0,
    startingCredits: null,
    generatedAt: null,
    ships: [],
    itinerary: {
      id: null,
      name: null,
      generatedAt: null,
      obsolete: false,
      lines: [],
    },
    manifests: [],
    generationOutput: null,
  };
}

export function createEmptyCargo(key = null) {
  return {
    _k: key ?? `cargo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    commodityId: '',
    commodityName: '',
    quantity: 1,
  };
}

export function createEmptyLine(key = null) {
  return {
    _k: key ?? `line_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type: 'mono_route',
    missionGroup: null,
    maxBoxSize: null,
    pickup: null,
    pickupName: '',
    pickupSystemName: '',
    pickupNameDisplay: '',
    dropoff: null,
    dropoffName: '',
    dropoffSystemName: '',
    dropoffNameDisplay: '',
    cargos: [createEmptyCargo()],
  };
}

export function createSearchState(query = '') {
  return { query, results: [], show: false, loading: false };
}

export function formatWithSystem(name, systemName) {
  return systemName ? `${name} (${systemName})` : (name || '');
}

export function normalizeCargo(raw = {}) {
  const pickupName = raw.pickupPoiName ?? raw.pickupName ?? raw.originName ?? '';
  const pickupSystemName = raw.pickupSystemName ?? raw.originSystemName ?? '';
  const dropoffName = raw.dropoffPoiName ?? raw.dropoffName ?? raw.destinationName ?? '';
  const dropoffSystemName = raw.dropoffSystemName ?? raw.destinationSystemName ?? '';
  const quantity = Number(raw.quantity ?? raw.qty ?? 0) || 0;
  const profitPerUnit = raw.profitPerUnit != null ? Number(raw.profitPerUnit) : null;

  return {
    _k: raw._k ?? raw.id ?? `cargo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ...raw,
    id: raw.id ?? raw.manifestId ?? null,
    manifestId: raw.manifestId ?? raw.id ?? null,
    action: raw.action ?? 'load',
    cargoType: raw.cargoType ?? raw.type ?? 'delivery',
    commodityId: raw.commodityId ?? raw.commodity ?? null,
    commodityName: raw.commodityName ?? raw.commodity ?? '—',
    quantity,
    pickupPoiId: raw.pickupPoiId ?? raw.pickup ?? raw.origin ?? null,
    pickupPoiName: pickupName,
    pickupSystemName,
    pickupNameDisplay: formatWithSystem(pickupName, pickupSystemName),
    dropoffPoiId: raw.dropoffPoiId ?? raw.dropoff ?? raw.destination ?? null,
    dropoffPoiName: dropoffName,
    dropoffSystemName,
    dropoffNameDisplay: formatWithSystem(dropoffName, dropoffSystemName),
    buyPrice: raw.buyPrice != null ? Number(raw.buyPrice) : null,
    sellPrice: raw.sellPrice != null ? Number(raw.sellPrice) : null,
    profitPerUnit,
    profitTotal: raw.profitTotal != null
      ? Number(raw.profitTotal)
      : (profitPerUnit != null ? quantity * profitPerUnit : null),
    depTerminalId: raw.depTerminalId ?? null,
    depTerminalName: raw.depTerminalName ?? null,
    arrTerminalId: raw.arrTerminalId ?? null,
    arrTerminalName: raw.arrTerminalName ?? null,
  };
}

export function normalizeItineraryLine(raw = {}, idx = 0) {
  const pickupName = raw.pickupName ?? raw.fromName ?? raw.originName ?? '';
  const pickupSystemName = raw.pickupSystemName ?? raw.fromSystemName ?? raw.originSystemName ?? '';
  const dropoffName = raw.dropoffName ?? raw.toName ?? raw.destinationName ?? '';
  const dropoffSystemName = raw.dropoffSystemName ?? raw.toSystemName ?? raw.destinationSystemName ?? '';

  const opsRaw = raw.cargos || raw.manifests || [];
  const ops = Array.isArray(opsRaw) ? opsRaw.map(normalizeCargo) : [];

  return {
    ...raw,
    _k: raw._k ?? `leg_${raw.legId ?? raw.id ?? idx}`,
    id: raw.id ?? raw.legId ?? null,
    legId: raw.legId ?? raw.id ?? null,
    orderIndex: Number(raw.orderIndex ?? idx + 1) || (idx + 1),
    completed: !!raw.completed,
    status: raw.status ?? null,
    pickup: raw.pickup ?? raw.from ?? raw.origin ?? null,
    pickupName,
    pickupSystemName,
    pickupNameDisplay: formatWithSystem(pickupName, pickupSystemName),
    from: raw.from ?? raw.pickup ?? raw.origin ?? null,
    fromName: raw.fromName ?? pickupName,
    fromSystemName: raw.fromSystemName ?? pickupSystemName,
    dropoff: raw.dropoff ?? raw.to ?? raw.destination ?? null,
    dropoffName,
    dropoffSystemName,
    dropoffNameDisplay: formatWithSystem(dropoffName, dropoffSystemName),
    to: raw.to ?? raw.dropoff ?? raw.destination ?? null,
    toName: raw.toName ?? dropoffName,
    toSystemName: raw.toSystemName ?? dropoffSystemName,
    cargos: ops,
    manifests: ops,
    loadScu: ops.filter(m => !m.action || m.action === 'load').reduce((s, m) => s + (Number(m.quantity) || 0), 0),
    unloadScu: ops.filter(m => m.action === 'unload').reduce((s, m) => s + (Number(m.quantity) || 0), 0),
    expanded: !!raw.expanded,
    tradeSuggestions: raw.tradeSuggestions ?? [],
    tradeFreeScu: raw.tradeFreeScu ?? null,
    tradeBudget: raw.tradeBudget ?? null,
  };
}

export function normalizeItinerary(raw = null) {
  if (!raw) return null;
  const lines = Array.isArray(raw.lines) ? raw.lines.map(normalizeItineraryLine) : [];
  return {
    ...raw,
    id: raw.id ?? null,
    name: raw.name ?? null,
    generatedAt: raw.generatedAt ?? null,
    obsolete: !!raw.obsolete,
    lines,
  };
}

export function normalizeDelivery(raw = {}) {
  const originName = raw.originName ?? '';
  const originSystemName = raw.originSystemName ?? '';

  // Group flat manifests by pickup+dropoff into route lines with cargos[]
  const rawManifests = Array.isArray(raw.manifests) ? raw.manifests : [];

  let manifests;

  // Detect new grouped format: manifest objects that already have a `cargos` array and a `type` field
  const isNewFormat = rawManifests.length === 0 || rawManifests.every(m => Array.isArray(m.cargos) && m.type != null);

  if (isNewFormat) {
    // Server already returns grouped missions – map them directly
    manifests = rawManifests.map((m, idx) => {
      const type = m.type ?? 'mono_route';
      const baseKey = Date.now() + idx * 1000;
      const cargos = (Array.isArray(m.cargos) ? m.cargos : []).map((c, ci) => ({
        _k: c._k ?? baseKey + ci + Math.random(),
        id: c.id ?? null,
        commodityId: c.commodityId ?? '',
        commodityName: c.commodityName ?? '',
        quantity: Number(c.quantity ?? 1) || 1,
        // Per-cargo POIs (only for multi_drop / multi_pickup / multi_route)
        pickup: c.pickup ?? null,
        pickupName: c.pickupName ?? '',
        pickupSystemName: c.pickupSystemName ?? '',
        dropoff: c.dropoff ?? null,
        dropoffName: c.dropoffName ?? '',
        dropoffSystemName: c.dropoffSystemName ?? '',
      }));
      const pickupName = m.pickupName ?? '';
      const pickupSystemName = m.pickupSystemName ?? '';
      const dropoffName = m.dropoffName ?? '';
      const dropoffSystemName = m.dropoffSystemName ?? '';
      return {
        _k: m._k ?? baseKey,
        type,
        missionGroup: m.missionGroup ?? null,
        maxBoxSize: m.maxBoxSize ?? null,
        pickup: m.pickup ?? null,
        pickupName,
        pickupSystemName,
        pickupNameDisplay: formatWithSystem(pickupName, pickupSystemName),
        dropoff: m.dropoff ?? null,
        dropoffName,
        dropoffSystemName,
        dropoffNameDisplay: formatWithSystem(dropoffName, dropoffSystemName),
        cargos: cargos.length ? cargos : [createEmptyCargo()],
      };
    });
  } else {
    // Legacy flat format — group by pickup+dropoff (backward compat)
    const flatManifests = rawManifests.flatMap(m => {
      if (Array.isArray(m.cargos) && m.cargos.length > 0) {
        return m.cargos.map(c => ({
          pickup: m.pickup ?? null,
          pickupName: m.pickupName ?? m.pickupNameDisplay ?? '',
          pickupSystemName: m.pickupSystemName ?? '',
          dropoff: m.dropoff ?? null,
          dropoffName: m.dropoffName ?? m.dropoffNameDisplay ?? '',
          dropoffSystemName: m.dropoffSystemName ?? '',
          id: c.id ?? null,
          commodityId: c.commodityId ?? '',
          commodityName: c.commodityName ?? '',
          quantity: c.quantity ?? 1,
        }));
      }
      return [m];
    });

    const routeMap = new Map();
    flatManifests.forEach((manifest, idx) => {
      const pickupId  = manifest.pickup ?? manifest.origin ?? null;
      const dropoffId = manifest.dropoff ?? manifest.destination ?? null;
      const routeKey  = `${pickupId}_${dropoffId}`;

      if (!routeMap.has(routeKey)) {
        routeMap.set(routeKey, {
          _k: manifest._k ?? Date.now() + idx,
          type: 'mono_route',
          missionGroup: null,
          pickup: pickupId,
          pickupName: manifest.pickupName ?? '',
          pickupSystemName: manifest.pickupSystemName ?? '',
          pickupNameDisplay: formatWithSystem(manifest.pickupName ?? '', manifest.pickupSystemName ?? ''),
          dropoff: dropoffId,
          dropoffName: manifest.dropoffName ?? '',
          dropoffSystemName: manifest.dropoffSystemName ?? '',
          dropoffNameDisplay: formatWithSystem(manifest.dropoffName ?? '', manifest.dropoffSystemName ?? ''),
          cargos: [],
        });
      }

      routeMap.get(routeKey).cargos.push({
        _k: Date.now() + idx + Math.random(),
        id: manifest.id ?? null,
        commodityId: manifest.commodityId ?? manifest.commodity ?? '',
        commodityName: manifest.commodityName ?? '',
        quantity: Number(manifest.quantity ?? 1) || 1,
        pickup: null, pickupName: '', pickupSystemName: '',
        dropoff: null, dropoffName: '', dropoffSystemName: '',
      });
    });

    manifests = Array.from(routeMap.values()).map(line => ({
      ...line,
      cargos: line.cargos.length ? line.cargos : [createEmptyCargo()],
    }));
  }

  const itinerary = normalizeItinerary(raw.itinerary ?? null);

  return {
    ...createEmptyDelivery(),
    ...raw,
    id: raw.id ?? null,
    name: raw.name ?? null,
    autoFillCargo: !!raw.autoFillCargo,
    startingCredits: raw.startingCredits ?? null,
    origin: raw.origin ?? null,
    originName,
    originSystemName,
    originNameDisplay: formatWithSystem(originName, originSystemName),
    cargoTot: Number(raw.cargoTot ?? manifests.reduce((s, line) =>
      s + (line.cargos || []).reduce((sc, c) => sc + (Number(c.quantity) || 0), 0), 0)) || 0,
    ships: Array.isArray(raw.ships) ? raw.ships.map(ship => ({
      shipId: ship.shipId ?? ship.id ?? null,
      note: ship.note ?? '',
    })) : [],
    manifests,
    itinerary,
    generated: !!itinerary,
    generatedAt: itinerary?.generatedAt ?? raw.generatedAt ?? null,
  };
}

export function isGenerated(d) {
  return !!(
    d?.generated ||
    d?.itinerary?.generatedAt ||
    (Array.isArray(d?.itinerary?.lines) && d.itinerary.lines.length > 0)
  );
}
