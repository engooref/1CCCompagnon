/**
 * POI and Commodity autocomplete search logic.
 *
 * All methods use `this` (Alpine component context via object spread).
 */
import { getJson } from '../utils/apiClient.js';
import { API, createSearchState } from './constants';

export default {

  // ── Initialisation ───────────────────────────────────────────────────────────

  /** Reset all search states to match the current delivery model. */
  initPoiSearchStateForCurrent() {
    this.poiSearches = {
      origin: createSearchState(this.current?.originName || ''),
    };
    this.commoditySearches = {};

    for (const manifest of (this.current?.manifests || [])) {
      this.initPoiSearchForLine(manifest._k);
      this.initCommoditySearchForLine(manifest._k);
    }
  },

  /** Create POI search states (pickup + dropoff) for a specific line key. */
  initPoiSearchForLine(lineKey) {
    const manifest = (this.current?.manifests || []).find(m => m._k === lineKey);
    if (!manifest) return;
    this.poiSearches[`pickup_${lineKey}`]  = createSearchState(manifest.pickupName  || '');
    this.poiSearches[`dropoff_${lineKey}`] = createSearchState(manifest.dropoffName || '');
    // Per-cargo POI states for multi_pickup / multi_drop / multi_route
    for (const cargo of (manifest.cargos || [])) {
      this.initCargoPoiSearch(lineKey, cargo);
    }
  },

  /** Create per-cargo POI search states for multi-type missions. */
  initCargoPoiSearch(lineKey, cargo) {
    this.poiSearches[`cargo_pickup_${lineKey}_${cargo._k}`]  = createSearchState(cargo.pickupName  || '');
    this.poiSearches[`cargo_dropoff_${lineKey}_${cargo._k}`] = createSearchState(cargo.dropoffName || '');
  },

  /** Create commodity search states for all cargos of a line. */
  initCommoditySearchForLine(lineKey) {
    const manifest = (this.current?.manifests || []).find(m => m._k === lineKey);
    if (!manifest) return;
    for (const cargo of (manifest.cargos || [])) {
      this.commoditySearches[`commodity_${lineKey}_${cargo._k}`] = createSearchState(cargo.commodityName || '');
    }
  },

  // ── POI search ───────────────────────────────────────────────────────────────

  /** Trigger an async POI search and populate the dropdown results. */
  async searchPoi(fieldKey, query, { anchorEl = null } = {}) {
    const state = this.poiSearches[fieldKey] ??= createSearchState();
    state.query = query;

    // seuil: pas d'ouverture avant X chars
    if (!query || query.length < this.minSearchChars) {
      state.results = [];
      state.loading = false;
      if (this.floatDd?.open && this.floatDd.key === fieldKey) this.closeFloat();
      return;
    }

    state.loading = true;

    // ouvre ici (pas au focus)
    if (anchorEl) this.openFloat('poi', fieldKey, anchorEl);

    try {
      const res = await getJson(`${API.POI_SEARCH}?q=${encodeURIComponent(query)}`);
      state.results = res.pois || [];
    } catch (err) {
      console.error('searchPoi:', err);
      state.results = [];
    } finally {
      state.loading = false;
      this.syncFloatFromStores(fieldKey);
    }
  },

  /**
   * Apply a selected POI to either the origin or a line's pickup/dropoff.
   * The fieldKey determines the target: 'origin', 'pickup_<lineKey>', 'dropoff_<lineKey>'.
   */
  selectPoi(fieldKey, poi) {
    const name = this.getPoiDisplayName(poi);

    if (fieldKey === 'origin') {
      this.current.origin     = poi.id;
      this.current.originName = name;
    } else if (fieldKey.startsWith('cargo_pickup_') || fieldKey.startsWith('cargo_dropoff_')) {
      // Per-cargo POI: "cargo_pickup_<lineKey>_<cargoKey>" or "cargo_dropoff_<lineKey>_<cargoKey>"
      // _k can be numeric or a string with underscores, so scan instead of splitting blindly
      const poiType = fieldKey.startsWith('cargo_pickup_') ? 'pickup' : 'dropoff';
      const withoutPrefix = fieldKey.startsWith('cargo_pickup_')
        ? fieldKey.slice('cargo_pickup_'.length)
        : fieldKey.slice('cargo_dropoff_'.length);
      for (const manifest of (this.current?.manifests || [])) {
        const manifestKeyStr = String(manifest._k);
        if (!withoutPrefix.startsWith(manifestKeyStr + '_')) continue;
        const cargoKeyStr = withoutPrefix.slice(manifestKeyStr.length + 1);
        const cargo = (manifest.cargos || []).find(c => String(c._k) === cargoKeyStr);
        if (cargo) {
          cargo[poiType]                = poi.id;
          cargo[`${poiType}Name`]       = name;
          cargo[`${poiType}SystemName`] = poi.systemName || poi.system?.name || '';
        }
        break;
      }
    } else {
      // manifest-level: "pickup_<lineKey>" or "dropoff_<lineKey>"
      const sep     = fieldKey.indexOf('_');
      const type    = fieldKey.substring(0, sep);         // 'pickup' | 'dropoff'
      const manifestKey = Number(fieldKey.substring(sep + 1));
      const manifest    = (this.current?.manifests || []).find(m => m._k === manifestKey);
      if (manifest) {
        manifest[type]          = poi.id;
        manifest[`${type}Name`] = name;
        manifest[`${type}SystemName`] = poi.systemName || poi.system?.name || '';
      }
    }

    if (this.poiSearches[fieldKey]) {
      this.poiSearches[fieldKey].query = name;
      this.poiSearches[fieldKey].show  = false;
    }
  },

  /** Close a POI dropdown after a short delay (allows click to register). */
  hidePoiDropdown(fieldKey) {
    setTimeout(() => {
      if (this.poiSearches[fieldKey]) this.poiSearches[fieldKey].show = false;
    }, 200);
  },

  // ── Commodity search ─────────────────────────────────────────────────────────

  /** Trigger an async commodity search. */
  async searchCommodity(fieldKey, query, { anchorEl = null } = {}) {
    const state = this.commoditySearches[fieldKey] ??= createSearchState();
    state.query = query;

    if (!query || query.length < this.minSearchChars) {
      state.results = [];
      state.loading = false;
      if (this.floatDd?.open && this.floatDd.key === fieldKey) this.closeFloat();
      return;
    }

    state.loading = true;

    if (anchorEl) this.openFloat('commodity', fieldKey, anchorEl);

    try {
      const res = await getJson(`${API.COMMODITIES}?q=${encodeURIComponent(query)}`);
      state.results = res || [];
    } catch (err) {
      console.error('searchCommodity:', err);
      state.results = [];
    } finally {
      state.loading = false;
      this.syncFloatFromStores(fieldKey);
    }
  },

  /** Apply a selected commodity to the matching delivery manifest cargo. */
  selectCommodity(fieldKey, commodity) {
    // Key format: commodity_${manifest._k}_${cargo._k}
    // _k can be numeric or a string containing underscores, so we scan instead of splitting blindly
    const withoutPrefix = fieldKey.slice('commodity_'.length);
    for (const manifest of (this.current?.manifests || [])) {
      const manifestKeyStr = String(manifest._k);
      if (!withoutPrefix.startsWith(manifestKeyStr + '_')) continue;
      const cargoKeyStr = withoutPrefix.slice(manifestKeyStr.length + 1);
      const cargo = (manifest.cargos || []).find(c => String(c._k) === cargoKeyStr);
      if (!cargo) continue;
      cargo.commodityId   = commodity.id;
      cargo.commodityName = commodity.name;
      if (this.commoditySearches[fieldKey]) {
        this.commoditySearches[fieldKey].query = commodity.name;
        this.commoditySearches[fieldKey].show  = false;
      }
      return;
    }
  },

  // ── Display helpers ──────────────────────────────────────────────────────────

  /** Format a POI for display: "Name (System)" or just "Name". */
  getPoiDisplayName(poi) {
    if (!poi) return '';
    const sys = poi.systemName || poi.system?.name || '';
    return sys ? `${poi.name} (${sys})` : poi.name;
  },

  /** Return a human-readable type label for a POI. */
  getPoiTypeLabel(poi) {
    if (!poi?.type) return '';
    return (poi.type === 'MainMan' && poi.subtype) ? poi.subtype : poi.type;
  },

  openFloat(kind, key, el){
    const r = el.getBoundingClientRect();
    this.floatDd.open = true;
    this.floatDd.kind = kind;
    this.floatDd.key = key;
    this.floatDdIndex = -1;
    this.floatDd.x = Math.round(r.left);
    this.floatDd.y = Math.round(r.bottom + 6);
    this.floatDd.w = Math.round(r.width);
    this.lastAnchorEl = el;


    // sync immédiat (si déjà des résultats)
    if(kind === 'poi'){
      this.floatDd.loading = !!this.poiSearches[key]?.loading;
      this.floatDd.results = this.poiSearches[key]?.results || [];
    } else if (kind === 'ship') {
      this.floatDd.loading = !!this.floatDd.loading; // keep state
      this.floatDd.results = this.floatDd.results || [];
    } else {
      this.floatDd.loading = !!this.commoditySearches[key]?.loading;
      this.floatDd.results = this.commoditySearches[key]?.results || [];
    }

    // auto-close au scroll du container (simple)
    if (this._floatScrollHandler) window.removeEventListener('scroll', this._floatScrollHandler, true);
    this._floatScrollHandler = () => {
      if(!this.floatDd.open) return;
      // si on a l'anchor, on recalc la position
      const el = this.lastAnchorEl;
      if(!el) return;
      const r = el.getBoundingClientRect();
      this.floatDd.x = Math.round(r.left);
      this.floatDd.y = Math.round(r.bottom + 6);
      this.floatDd.w = Math.round(r.width);
    };
    window.addEventListener('scroll', this._floatScrollHandler, true);
  },

  closeFloat(){
    this.floatDd.open = false;
    this.floatDd.kind = null;
    this.floatDd.key = null;
    this.floatDd.results = [];
    this.floatDd.loading = false;
    if (this._floatScrollHandler) {
      window.removeEventListener('scroll', this._floatScrollHandler, true);
      this._floatScrollHandler = null;
    }
  },

  // à appeler à la fin de tes searchPoi/searchCommodity (après update results/loading)
  syncFloatFromStores(key){
    if(!this.floatDd.open || this.floatDd.key !== key) return;
    this.floatDdIndex = -1;

    if(this.floatDd.kind === 'poi'){
      this.floatDd.loading = !!this.poiSearches[key]?.loading;
      this.floatDd.results = this.poiSearches[key]?.results || [];
    } else if (this.floatDd.kind === 'ship') {
      // ship results are stored directly on floatDd.results by searchShip
      this.floatDd.loading = !!this.floatDd.loading;
      this.floatDd.results = this.floatDd.results || [];
    } else {
      this.floatDd.loading = !!this.commoditySearches[key]?.loading;
      this.floatDd.results = this.commoditySearches[key]?.results || [];
    }
  },

  selectFloatPoi(poi){
    const key = this.floatDd.key;
    if(!key) return;
    this.selectPoi(key, poi);   // ta fonction existante
    this.closeFloat();
  },

  selectFloatCommodity(c){
    const key = this.floatDd.key;
    if(!key) return;
    this.selectCommodity(key, c); // ta fonction existante
    this.closeFloat();
  },

  selectFloatShip(s){
    const key = this.floatDd.key;
    if(!key) return;
    // addShip expects an id
    if (typeof this.addShip === 'function') this.addShip(s.id ?? s.id);
    this.closeFloat();
  },

  minSearchChars: 2,
  lastAnchorEl: null,

  /** Debounce helper — évite un appel API par frappe. */
  _debouncedSearch(type, fieldKey, query, anchorEl, delay = 300) {
    this._searchTimers ??= {};
    clearTimeout(this._searchTimers[fieldKey]);
    this._searchTimers[fieldKey] = setTimeout(() => {
      if (type === 'poi') this.searchPoi(fieldKey, query, { anchorEl });
      else this.searchCommodity(fieldKey, query, { anchorEl });
    }, delay);
  },

  onFieldInput(kind, key, el){
    const q = el.value || '';
    this.lastAnchorEl = el;

    if(kind === 'poi'){
      this.poiSearches[key] ??= createSearchState();
      this.poiSearches[key].query = q;
      this._debouncedSearch('poi', key, q, el);
    } else if (kind === 'ship') {
      // ship search uses the float dropdown
      this.shipSearch = q;
      this.searchShip(key, q, { anchorEl: el });
    } else {
      this.commoditySearches[key] ??= createSearchState();
      this.commoditySearches[key].query = q;
      this._debouncedSearch('commodity', key, q, el);
    }
  },

  // ── Ship model search (client-side) ───────────────────────────────────────
  async searchShip(key, query, { anchorEl = null } = {}) {
    if (!query || query.length < this.minSearchChars) {
      if (this.floatDd.open && this.floatDd.key === key) this.closeFloat();
      return;
    }

    if (anchorEl) this.openFloat('ship', key, anchorEl);
    this.floatDd.loading = true;

    try {
      const src = this.shipModels || [];
      const q = query.toLowerCase().trim();
      const results = src.filter(s => (s.name || '').toLowerCase().includes(q)).slice(0, 50);
      this.floatDd.results = results;
    } catch (err) {
      console.error('searchShip:', err);
      this.floatDd.results = [];
    } finally {
      this.floatDd.loading = false;
    }
  },
};
