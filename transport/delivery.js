import { postJsonExpectJson, deleteJson } from '../utils/apiClient.js';
import {
  API,
  createEmptyDelivery,
  createEmptyViewModel,
  normalizeDelivery,
} from './constants';

export default {
  goToList() {
    this.tab = 'list';
    this.allowEditTab = false;
    this.showResultsTab = false;
  },

  newDelivery() {
    this.current = createEmptyDelivery();
    this.generationOutput = null;
    this.generatedLines = [];
    this.initPoiSearchStateForCurrent();
    this.allowEditTab = true;
    this.tab = 'edit';
  },

  duplicateDelivery(d) {
    const row = normalizeDelivery(d);
    const base = Date.now();

    this.current = {
      id: null,
      name: row.name ? row.name + ' (copie)' : null,
      autoFillCargo: row.autoFillCargo,
      startingCredits: row.startingCredits,
      origin: row.origin,
      originName: row.originNameDisplay || row.originName || '',
      ships: (row.ships || []).map(ship => ({
        shipId: ship.shipId,
        note: ship.note ?? '',
      })),
      manifests: (row.manifests || []).map((manifest, idx) => ({
        _k: base + idx * 1000,
        type: manifest.type ?? 'mono_route',
        missionGroup: null, // reset group UUID on duplicate
        maxBoxSize: manifest.maxBoxSize ?? null,
        pickup: manifest.pickup ?? null,
        pickupName: manifest.pickupNameDisplay || manifest.pickupName || '',
        pickupSystemName: manifest.pickupSystemName ?? '',
        pickupNameDisplay: manifest.pickupNameDisplay || manifest.pickupName || '',
        dropoff: manifest.dropoff ?? null,
        dropoffName: manifest.dropoffNameDisplay || manifest.dropoffName || '',
        dropoffSystemName: manifest.dropoffSystemName ?? '',
        dropoffNameDisplay: manifest.dropoffNameDisplay || manifest.dropoffName || '',
        cargos: (manifest.cargos || []).map((c, ci) => ({
          _k: base + idx * 1000 + ci + Math.random(),
          id: null,
          commodityId: c.commodityId ?? '',
          commodityName: c.commodityName ?? '',
          quantity: c.quantity ?? 1,
          pickup: c.pickup ?? null,
          pickupName: c.pickupName ?? '',
          pickupSystemName: c.pickupSystemName ?? '',
          dropoff: c.dropoff ?? null,
          dropoffName: c.dropoffName ?? '',
          dropoffSystemName: c.dropoffSystemName ?? '',
        })),
      })),
      itinerary: null,
    };

    this.generationOutput = null;
    this.generatedLines = [];
    this._editSnapshot = null;
    this.initPoiSearchStateForCurrent();
    this.allowEditTab = true;
    this.tab = 'edit';
  },

  editDelivery(d) {
    const row = normalizeDelivery(d);
    this.current = {
      id: row.id,
      name: row.name,
      autoFillCargo: row.autoFillCargo,
      startingCredits: row.startingCredits,
      origin: row.origin,
      originName: row.originNameDisplay || row.originName || '',
      ships: row.ships || [],
      manifests: (row.manifests || []).map((manifest, idx) => ({
        _k: manifest._k ?? Date.now() + idx,
        type: manifest.type ?? 'mono_route',
        missionGroup: manifest.missionGroup ?? null,
        maxBoxSize: manifest.maxBoxSize ?? null,
        pickup: manifest.pickup ?? null,
        pickupName: manifest.pickupNameDisplay || manifest.pickupName || '',
        dropoff: manifest.dropoff ?? null,
        dropoffName: manifest.dropoffNameDisplay || manifest.dropoffName || '',
        cargos: (manifest.cargos || []).map((c, ci) => ({
          _k: c._k ?? Date.now() + idx * 100 + ci,
          id: c.id ?? null,
          commodityId: c.commodityId ?? '',
          commodityName: c.commodityName ?? '',
          quantity: c.quantity ?? 1,
          pickup: c.pickup ?? null,
          pickupName: c.pickupName ?? '',
          pickupSystemName: c.pickupSystemName ?? '',
          dropoff: c.dropoff ?? null,
          dropoffName: c.dropoffName ?? '',
          dropoffSystemName: c.dropoffSystemName ?? '',
        })),
      })),
      itinerary: row.itinerary ?? null,
    };

    this.generationOutput = null;
    this.generatedLines = [];
    this.initPoiSearchStateForCurrent();
    this.allowEditTab = true;
    this.tab = 'edit';

    try {
      this._editSnapshot = JSON.parse(JSON.stringify(this.current));
      this.viewModel = {
        ...createEmptyViewModel(),
        ...row,
      };
    } catch {
      this._editSnapshot = null;
      this.viewModel = createEmptyViewModel();
    }
  },

  viewDelivery(d) {
    const row = normalizeDelivery(d);
    if (!row.itinerary) {
      this.showResultsTab = false;
      this.editDelivery(row);
      return;
    }

    this.viewModel = {
      ...createEmptyViewModel(),
      ...row,
    };

    this.generationOutput = null;
    this.generatedLines = [];
    this.showResultsTab = true;
    this.allowEditTab = false;
    this.tab = 'results';
    // fetch trade suggestions for each itinerary line when showing results
    try {
      if (this.viewModel?.itinerary?.lines?.length) {
        // do not await to avoid blocking UI; errors are logged inside
        this.fetchTradeSuggestionsForView(this.viewModel.itinerary);
      }
    } catch (e) {
      console.error('viewDelivery:fetchTradeSuggestions', e);
    }
  },

  debounceFetchTradeOpp() {
    clearTimeout(this._tradeOppTimer);
    this._tradeOppTimer = setTimeout(() => this.fetchTradeSuggestionsForView(this.viewModel?.itinerary), 600);
  },

  async fetchTradeSuggestionsForView(itinerary) {
    if (!itinerary || !Array.isArray(itinerary.lines)) return;
    if (!this.viewModel.autoFillCargo) {
      for (const l of itinerary.lines) l.tradeSuggestions = [];
      return;
    }

    const totalCapacity = (this.viewModel.ships || []).reduce((sum, ship) => {
      const model = this.shipModels.find(s => s.id == ship.shipId);
      return sum + (Number(model?.specification?.scu) || 0);
    }, 0);

    let runningBudget = this.viewModel.startingCredits != null
      ? Math.max(0, Number(this.viewModel.startingCredits))
      : null;

    const sortedLines = [...itinerary.lines].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    let cargoOnShip = 0;
    const batchLegs = [];

    // Passe sync : calculer freeSpace/budget par leg, construire le payload batch
    for (let i = 0; i < sortedLines.length; i++) {
      const line = sortedLines[i];
      cargoOnShip -= (Number(line.unloadScu) || 0);
      cargoOnShip += (Number(line.loadScu) || 0);
      cargoOnShip = Math.max(0, cargoOnShip);

      const freeSpace = Math.max(0, totalCapacity - cargoOnShip);
      line.tradeFreeScu = freeSpace;
      line.tradeBudget  = runningBudget;

      const fromPoi = line.pickup ?? line.from ?? line.pickupPoiId ?? null;
      const toPoi   = line.dropoff ?? line.to ?? line.dropoffPoiId ?? null;

      if (fromPoi && toPoi && freeSpace > 0) {
        batchLegs.push({ legIndex: i, fromPoi, toPoi, freeSpace, budgetRemaining: runningBudget });
      } else {
        line.tradeSuggestions = [];
      }

      // Mettre à jour le budget courant avec les cargos marché déjà planifiés
      if (runningBudget !== null) {
        for (const op of (line.cargos || line.manifests || [])) {
          if (op.cargoType !== 'market') continue;
          if (op.action === 'unload' && op.sellPrice)
            runningBudget += (Number(op.quantity) || 0) * Number(op.sellPrice);
          if ((!op.action || op.action === 'load') && op.buyPrice)
            runningBudget -= (Number(op.quantity) || 0) * Number(op.buyPrice);
        }
        runningBudget = Math.max(0, runningBudget);
      }
    }

    if (!batchLegs.length) return;

    // UNE seule requête pour tous les legs
    const batchResults = await this.getTradeSuggestionsBatch(batchLegs, 10);
    for (let i = 0; i < sortedLines.length; i++) {
      if (batchResults[i] !== undefined) {
        sortedLines[i].tradeSuggestions = batchResults[i];
      }
    }
  },

  editFromView() {
    if (!this.viewModel?.id) return;
    const found = (this.deliveries || []).find(m => m.id === this.viewModel.id);
    if (found) this.editDelivery(found);
  },

  isManifestComplete(manifest) {
    if (!manifest.pickup || !manifest.dropoff) return false;
    return (manifest.cargos || []).some(c => c.commodityId && Number(c.quantity) > 0);
  },

  scheduleAutoSave() {
    if (!this.current) return;
    const hasComplete = (this.current.manifests || []).some(m => this.isManifestComplete(m));
    if (!hasComplete) return;
    clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = setTimeout(() => this.saveDelivery(true), 1500);
  },

  async saveDelivery(silent = false) {
    this.errors.edit = null;
    if (!this.current) {
      this.errors.edit = 'Aucun ordre actif';
      return null;
    }

    this.loading.edit = true;
    try {
      if (!this.current) {
        window.showNotification('error', 'Aucun ordre actif');
        this.errors.edit = 'Aucun ordre actif';
        return null;
      }

      const payload = {
        id: this.current.id ?? null,
        name: this.current.name,
        origin: this.current.origin,
        ships: this.current.ships || [],
        lines: (this.current.manifests || []).flatMap(l => {
          const type = l.type ?? 'mono_route';
          const missionGroup = l.missionGroup ?? crypto.randomUUID();
          return (l.cargos || []).map(c => ({
            missionType:  type,
            missionGroup,
            maxBoxSize:   l.maxBoxSize ?? null,
            // Shared (manifest-level) POIs
            pickup:       (type === 'multi_pickup' || type === 'multi_route') ? null  : (l.pickup ?? null),
            dropoff:      (type === 'multi_drop'   || type === 'multi_route') ? null  : (l.dropoff ?? null),
            // Per-cargo POIs (only sent when type requires it)
            cargoPickup:  (type === 'multi_pickup' || type === 'multi_route') ? (c.pickup  ?? null) : null,
            cargoDropoff: (type === 'multi_drop'   || type === 'multi_route') ? (c.dropoff ?? null) : null,
            commodityId:  c.commodityId,
            quantity:     c.quantity ?? 1,
          }));
        }),
      };

      const res = await postJsonExpectJson(API.DELIVERIES, payload);
      await this.loadDeliveries();
      this.current.id = res?.id ?? res?.manifestId ?? this.current.id ?? this._findDeliveryIdByMatch();

      if (!silent) {
        window.showNotification('success', 'Ordre de transport enregistré');
        this.goToList();
      }
      return this.current.id;
    } catch (err) {
      console.error('saveDelivery:', err);
      const msg = err.message || 'Erreur lors de la sauvegarde';
      window.showNotification('error', msg);
      this.errors.edit = msg;
      return null;
    } finally {
      this.loading.edit = false;
    }
  },

  async fetchTradeSuggestionsForLine(idx) {
    try {
      const manifest = this.viewModel?.manifests?.[idx];
      if (!manifest) {
        window.showNotification('error', 'Ligne introuvable');
        return;
      }
      if (!manifest.pickup || !manifest.dropoff) {
        window.showNotification('error', 'Pickup et dropoff requis pour obtenir des suggestions');
        return;
      }

      const freeSpace = (this.current.ships || []).reduce((sum, ship) => {
        const model = this.shipModels.find(s => s.id == ship.shipId);
        return sum + (Number(model?.specification?.scu) || 0);
      }, 0);
      if (freeSpace <= 0) {
        window.showNotification('error', 'Espace cargo indisponible (aucun vaisseau avec SCU défini)');
        return;
      }

      // clear previous suggestions
      manifest.tradeSuggestions = [];
      const rows = await this.getTradeSuggestions(manifest.pickup, manifest.dropoff, freeSpace, this.viewModel?.startingCredits ?? null, 20);
      manifest.tradeSuggestions = Array.isArray(rows) ? rows : [];
      return manifest.tradeSuggestions;
    } catch (err) {
      console.error('fetchTradeSuggestionsForLine:', err);
      window.showNotification('error', err.message || 'Erreur lors de la recherche de suggestions');
      return [];
    }
  },

  clearTradeSuggestionsForLine(idx) {
    const manifest = this.viewModel?.manifests?.[idx];
    if (manifest) manifest.tradeSuggestions = [];
  },

  async deleteDelivery(id) {
    if (!confirm('Supprimer cet ordre ?')) return;
    try {
      await deleteJson(`${API.DELIVERIES}/${id}`);
      await this.loadDeliveries();
      this.current = createEmptyDelivery();
      this.viewModel = createEmptyViewModel();
      window.showNotification('success', 'Ordre de transport supprimé');
      this.goToList();
    } catch (err) {
      window.showNotification('error', 'Erreur: ' + (err.message || err));
    }
  },

  removeManifest(idx) {
    if (!this.current || !Array.isArray(this.current.manifests)) return;
    const manifest = this.current.manifests[idx];
    if (!manifest) return;
    if (!confirm('Supprimer cette ligne de livraison ?')) return;

    try {
      const pk = manifest._k;
      if (pk) {
        delete this.poiSearches[`pickup_${pk}`];
        delete this.poiSearches[`dropoff_${pk}`];
        for (const cargo of (manifest.cargos || [])) {
          delete this.commoditySearches[`commodity_${pk}_${cargo._k}`];
        }
      }
    } catch {}

    this.current.manifests.splice(idx, 1);
  },

  resetForm() {
    if (this.current?.id && this._editSnapshot) {
      try {
        this.current = JSON.parse(JSON.stringify(this._editSnapshot));
        this.allowEditTab = true;
        this.initPoiSearchStateForCurrent();
        this.tab = 'edit';
        return;
      } catch {}
    }

    if (this.current?.id) {
      const found = (this.deliveries || []).find(m => m.id === this.current.id);
      if (found) {
        this.editDelivery(found);
        return;
      }
    }

    this.newDelivery();
  },

  async toggleLegCompleted(legId, value) {
    try {
      const res = await postJsonExpectJson(`${API.ITINERARY_LEG}/${legId}`, { completed: !!value });

      if (res?.id) {
        for (const d of (this.deliveries || [])) {
          const legsArr = d?.itinerary?.lines || [];
          for (const l of legsArr) {
            if (l.legId === res.id || l.id === res.id) l.completed = !!res.completed;
          }
        }
        for (const l of (this.viewModel?.itinerary?.lines || [])) {
          if (l.legId === res.id || l.id === res.id) l.completed = !!res.completed;
        }
      }
      return res;
    } catch (err) {
      console.error('toggleLegCompleted:', err);
      throw err;
    }
  },

  async handleToggleLeg(line) {
    if (!line.legId && !line.id) {
      window.showNotification('warning', "Aucune ligne d'itinéraire associée");
      return;
    }
    try {
      const res = await this.toggleLegCompleted(line.legId || line.id, !line.completed);
      line.completed = !!(res?.completed ?? !line.completed);
    } catch {
      window.showNotification('error', 'Erreur lors de la mise à jour du statut');
    }
  },

  groupedViewLines() {
    const lines = this.viewModel?.itinerary?.lines || [];
    const groups = new Map();

    for (const line of lines) {
      const key = line.dropoff || line.dropoffNameDisplay || line.dropoffName || '__unknown__';
      if (!groups.has(key)) {
        groups.set(key, {
          dropoff: line.dropoff,
          dropoffNameDisplay: line.dropoffNameDisplay || line.dropoffName || '—',
          dropoffSystemName: line.dropoffSystemName || null,
          totalScu: 0,
          legs: [],
        });
      }
      const g = groups.get(key);
      g.legs.push(line);
      g.totalScu += Number(line.loadScu) || 0;
    }

    return Array.from(groups.values());
  },

  filteredDeliveries() {
    const q = (this.filters.q || '').toLowerCase().trim();
    if (!q) return this.deliveries;

    return (this.deliveries || []).filter(d => {
      const commodityNames = (d.manifests || []).map(m => m.commodityName || '').join(' ');
      return [
        d.name || '',
        d.originNameDisplay || d.originName || '',
        commodityNames,
      ].some(f => f.toLowerCase().includes(q));
    });
  },

  _findDeliveryIdByMatch() {
    const match = (this.deliveries || []).find(m =>
      (m.name || null) === (this.current.name || null) &&
      m.origin === this.current.origin &&
      (m.manifests?.length || 0) === (this.current.manifests?.length || 0)
    );
    return match?.id ?? null;
  },
};
