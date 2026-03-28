/**
 * Delivery line editing — add, remove, reorder lines.
 *
 * All methods use `this` (Alpine component context via object spread).
 */
import { getJson } from '../utils/apiClient.js';
import { createEmptyLine, createEmptyCargo, API } from './constants';

export default {

  /** Add a new empty delivery line and initialise its search states. */
  addLine() {
    this.current.manifests = this.current.manifests || [];
    const key = Date.now();
    const line = createEmptyLine(key);
    this.current.manifests.unshift(line);
    this.initPoiSearchForLine(key);
    this.initCommoditySearchForLine(key);
  },

  /** Add a new cargo row to an existing manifest line. */
  addCargo(lineKey) {
    const manifest = (this.current?.manifests || []).find(m => m._k === lineKey);
    if (!manifest) return;
    manifest.cargos = manifest.cargos || [];
    const cargo = createEmptyCargo();
    cargo.pickup = null; cargo.pickupName = ''; cargo.pickupSystemName = '';
    cargo.dropoff = null; cargo.dropoffName = ''; cargo.dropoffSystemName = '';
    manifest.cargos.push(cargo);
    this.commoditySearches[`commodity_${lineKey}_${cargo._k}`] = { query: '', results: [], show: false, loading: false };
    if (typeof this.initCargoPoiSearch === 'function') this.initCargoPoiSearch(lineKey, cargo);
  },

  /** Remove a cargo row from a manifest line. */
  removeCargo(lineKey, cargoKey) {
    const manifest = (this.current?.manifests || []).find(m => m._k === lineKey);
    if (!manifest) return;
    const idx = (manifest.cargos || []).findIndex(c => c._k === cargoKey);
    if (idx === -1) return;
    manifest.cargos.splice(idx, 1);
    delete this.commoditySearches[`commodity_${lineKey}_${cargoKey}`];
    delete this.poiSearches[`cargo_pickup_${lineKey}_${cargoKey}`];
    delete this.poiSearches[`cargo_dropoff_${lineKey}_${cargoKey}`];
  },

  /** Remove a delivery line by index. */
  removeLine(idx) {
    this.current?.manifests?.splice(idx, 1);
  },

  /** Duplicate a manifest line and insert it just below the source. */
  duplicateLine(idx) {
    const manifests = this.current?.manifests;
    if (!manifests || !manifests[idx]) return;

    const source = manifests[idx];
    const newKey = Date.now() + Math.random();

    const newCargos = (source.cargos || []).map(c => ({
      _k: Date.now() + Math.random(),
      id: null,
      commodityId: c.commodityId,
      commodityName: c.commodityName,
      quantity: c.quantity,
      pickup: c.pickup ?? null,
      pickupName: c.pickupName ?? '',
      pickupSystemName: c.pickupSystemName ?? '',
      dropoff: c.dropoff ?? null,
      dropoffName: c.dropoffName ?? '',
      dropoffSystemName: c.dropoffSystemName ?? '',
    }));

    const clone = {
      _k: newKey,
      type: source.type ?? 'mono_route',
      missionGroup: null, // new UUID will be assigned on save
      maxBoxSize: source.maxBoxSize ?? null,
      pickup: source.pickup,
      pickupName: source.pickupName,
      pickupSystemName: source.pickupSystemName ?? '',
      pickupNameDisplay: source.pickupNameDisplay ?? '',
      dropoff: source.dropoff,
      dropoffName: source.dropoffName,
      dropoffSystemName: source.dropoffSystemName ?? '',
      dropoffNameDisplay: source.dropoffNameDisplay ?? '',
      cargos: newCargos,
    };

    // Insérer juste après la source, puis initialiser les search states
    manifests.splice(idx + 1, 0, clone);
    this.initPoiSearchForLine(newKey);
    this.initCommoditySearchForLine(newKey);  },

  /**
   * Parse a freeform text block (one cargo per line: "Commodity Name qty")
   * and add resolved cargos to the manifest. Returns an array of error strings.
   */
  async parsePasteText(lineKey, rawText) {
    const manifest = (this.current?.manifests || []).find(m => m._k === lineKey);
    if (!manifest || !rawText?.trim()) return [];

    const lines = rawText.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const errors = [];

    for (const line of lines) {
      // Parse optional syntaxes:
      //  - pipe-separated: "Commodity qty | pickup | dropoff"   (qty before first |)
      //  - arrow: "Commodity qty @pickup -> dropoff"            (qty before @)
      //  - at-only: "Commodity qty @pickup"
      //  - arrow-only: "Commodity qty -> dropoff"
      //  - plain: "Commodity qty"                               (qty is last token)
      let commodityQuery = '';
      let pickupName = null;
      let dropoffName = null;
      let qty = 0;

      if (line.includes('|')) {
        // "Commodity qty | pickup | dropoff" — qty is last token of the first segment
        const parts = line.split('|').map(p => p.trim());
        const firstTokens = (parts[0] ?? '').split(/\s+/);
        qty = Number(firstTokens[firstTokens.length - 1]);
        commodityQuery = firstTokens.slice(0, -1).join(' ').trim();
        pickupName  = parts[1]?.trim() || null;
        dropoffName = parts[2]?.trim() || null;
      } else {
        // For all other syntaxes qty is the last numeric token of the whole line
        const tokens = line.split(/\s+/);
        qty = Number(tokens[tokens.length - 1]);
        const main = line.slice(0, line.lastIndexOf(tokens[tokens.length - 1])).trim();

        const arrowParts = main.split('->').map(p => p.trim());
        if (arrowParts.length > 1) {
          const left = arrowParts[0];
          dropoffName = arrowParts.slice(1).join(' -> ').trim() || null;
          if (left.includes('@')) {
            const atParts = left.split('@').map(p => p.trim());
            commodityQuery = atParts[0] ?? '';
            pickupName = atParts[1] ?? null;
          } else {
            commodityQuery = left;
          }
        } else if (main.includes('@')) {
          const atParts = main.split('@').map(p => p.trim());
          commodityQuery = atParts[0] ?? '';
          pickupName = atParts[1] ?? null;
        } else {
          commodityQuery = main;
        }
      }

      if (!commodityQuery) { errors.push(`Ligne ignorée : "${line}"`); continue; }
      if (!qty || qty <= 0) { errors.push(`Quantité invalide : "${line}"`); continue; }

      try {
        const res = await getJson(`${API.COMMODITIES}?q=${encodeURIComponent(commodityQuery)}`);
        const results = Array.isArray(res) ? res : [];
        if (!results.length) { errors.push(`Cargaison introuvable : "${commodityQuery}"`); continue; }

        const commodity = results[0];
        const cargo = createEmptyCargo();
        cargo.commodityId   = commodity.id;
        cargo.commodityName = commodity.name;
        cargo.quantity      = qty;

        // Initialize per-cargo pickup/dropoff fields (may remain null)
        cargo.pickup = null; cargo.pickupName = '' ; cargo.pickupSystemName = '';
        cargo.dropoff = null; cargo.dropoffName = '' ; cargo.dropoffSystemName = '';

        // If names were provided in the paste, try to resolve them to POIs
        try {
          if (pickupName) {
            const pr = await getJson(`${API.POI_SEARCH}?q=${encodeURIComponent(pickupName)}`);
            const pres = pr?.pois ?? (Array.isArray(pr) ? pr : []);
            if (pres.length) {
              cargo.pickup = pres[0].id;
              cargo.pickupName = pres[0].name ?? pickupName;
              cargo.pickupSystemName = pres[0].systemName ?? '';
            } else {
              errors.push(`Pickup introuvable: "${pickupName}" pour ligne "${line}"`);
            }
          }
        } catch {
          errors.push(`Erreur réseau lors recherche pickup: "${pickupName}"`);
        }

        try {
          if (dropoffName) {
            const dr = await getJson(`${API.POI_SEARCH}?q=${encodeURIComponent(dropoffName)}`);
            const dres = dr?.pois ?? (Array.isArray(dr) ? dr : []);
            if (dres.length) {
              cargo.dropoff = dres[0].id;
              cargo.dropoffName = dres[0].name ?? dropoffName;
              cargo.dropoffSystemName = dres[0].systemName ?? '';
            } else {
              errors.push(`Dropoff introuvable: "${dropoffName}" pour ligne "${line}"`);
            }
          }
        } catch {
          errors.push(`Erreur réseau lors recherche dropoff: "${dropoffName}"`);
        }

        manifest.cargos = manifest.cargos || [];
        // Remplace le cargo vide par défaut s'il est seul et non rempli
        if (manifest.cargos.length === 1 && !manifest.cargos[0].commodityId) {
          const oldKey = manifest.cargos[0]._k;
          delete this.commoditySearches[`commodity_${lineKey}_${oldKey}`];
          manifest.cargos.splice(0, 1);
        }

        // Validate required POIs based on manifest type; if required POI missing, skip adding cargo and report error
        const manifestType = manifest.type ?? 'mono_route';
        let missingRequiredPoi = false;
        if ((manifestType === 'multi_pickup' || manifestType === 'multi_route') && !cargo.pickup) {
          errors.push(`Cargaison ignorée (pickup requis pour type ${manifestType}): "${line}"`);
          missingRequiredPoi = true;
        }
        if ((manifestType === 'multi_drop' || manifestType === 'multi_route') && !cargo.dropoff) {
          errors.push(`Cargaison ignorée (dropoff requis pour type ${manifestType}): "${line}"`);
          missingRequiredPoi = true;
        }

        if (!missingRequiredPoi) {
          manifest.cargos.push(cargo);
          this.commoditySearches[`commodity_${lineKey}_${cargo._k}`] = { query: commodity.name, results: [], show: false, loading: false };
          // Init per-cargo POI search states so user can edit/confirm resolved POIs
          if (typeof this.initCargoPoiSearch === 'function') this.initCargoPoiSearch(lineKey, cargo);
        }
      } catch {
        errors.push(`Erreur réseau pour : "${commodityQuery}"`);
      }
    }

    return errors;
  },

  /** Return a paste example string adapted to the manifest type. */
  getPasteExample(type) {
    switch (type) {
      case 'multi_drop':
        return 'Iron 100 -> TDD\nCopper 50 -> GrimHex\nTitanium 75 -> Levski';
      case 'multi_pickup':
        return 'Iron 100 @Lorville\nCopper 50 @MicroTech\nTitanium 75 @ArcCorp';
      case 'multi_route':
        return 'Iron 100 @Lorville -> TDD\nCopper 50 @MicroTech -> GrimHex\nTitanium 25 @ArcCorp -> Levski';
      default: // mono_route
        return 'Iron 100\nCopper 50\nTitanium 75';
    }
  },

  /** Move a line from position `from` to position `to`. */
  moveLine(from, to) {
    const manifests = this.current?.manifests;
    if (!manifests || to < 0 || to >= manifests.length) return;
    const [item] = manifests.splice(from, 1);
    manifests.splice(to, 0, item);
  },
};
