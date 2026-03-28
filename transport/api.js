/**
 * Network layer — data loaders that feed the Alpine component.
 */
import { getJson, postJsonExpectJson } from '../utils/apiClient.js';
import { API, normalizeDelivery, normalizeCargo } from './constants';

export default {
  async loadShipModels() {
    this.loading.shipModels = true;
    this.errors.shipModels = null;
    try {
      const data = await getJson(API.SHIP_MODELS);
      this.shipModels = Array.isArray(data) ? data : (data.data || []);
    } catch (err) {
      console.error('loadShipModels:', err);
      this.shipModels = [];
      this.errors.shipModels = err.message || 'Erreur shipModels';
    } finally {
      this.loading.shipModels = false;
    }
  },

  async loadDeliveries() {
    this.loading.deliveries = true;
    this.errors.deliveries = null;
    try {
      const rows = await getJson(API.DELIVERIES);
      this.deliveries = (Array.isArray(rows) ? rows : []).map(normalizeDelivery);
    } catch (err) {
      console.error('loadDeliveries:', err);
      this.deliveries = [];
      this.errors.deliveries = err.message || 'Erreur deliveries';
    } finally {
      this.loading.deliveries = false;
    }
  },

  async getTradeSuggestionsBatch(legs, limit = 10) {
    try {
      const data = await postJsonExpectJson(API.TRADE_SUGGESTIONS_BATCH, { legs, limit });
      if (!data) return {};
      // Normalize each leg's results
      const out = {};
      for (const [idx, rows] of Object.entries(data)) {
        out[idx] = (Array.isArray(rows) ? rows : []).map(r => normalizeCargo({
          commodityId:      r.commodityId ?? null,
          commodityName:    r.commodityName ?? null,
          buyPrice:         r.buyPrice ?? null,
          sellPrice:        r.sellPrice ?? null,
          profitPerUnit:    r.profitPerUnit ?? null,
          profitTotal:      r.profitTotal ?? null,
          maxQty:           r.maxQty ?? null,
          depTerminalName:  r.depTerminalName ?? null,
          arrTerminalName:  r.arrTerminalName ?? null,
        }));
      }
      return out;
    } catch (err) {
      console.error('getTradeSuggestionsBatch:', err);
      return {};
    }
  },

  async getTradeSuggestions(fromPoi, toPoi, freeSpace, budgetRemaining = null, limit = 20) {
    try {
      const body = {
        fromPoi,
        toPoi,
        freeSpace: Number(freeSpace) || 0,
        budgetRemaining: budgetRemaining == null ? null : Number(budgetRemaining),
        limit: Number(limit) || 20,
      };

      const rows = await postJsonExpectJson(API.TRADE_SUGGESTIONS, body);
      if (!rows) return [];

      // The backend returns an array of rows with depTerminal/arrTerminal/commodity/buyPrice etc.
      // Normalize each row into the cargo-like shape used elsewhere.
      return (Array.isArray(rows) ? rows : rows.results || []).map(r => normalizeCargo({
        commodity: r.commodity?.id ?? r.commodityId ?? r.commodity,
        commodityName: r.commodity?.name ?? r.commodityName ?? null,
        buyPrice: r.buyPrice ?? null,
        sellPrice: r.sellPrice ?? null,
        profitPerUnit: r.profitPerUnit ?? null,
        profitTotal: r.profitTotal ?? null,
        maxQty: r.maxQty ?? r.max_qty ?? null,
        depTerminalId: r.depTerminal?.id ?? r.depTerminalId ?? null,
        depTerminalName: r.depTerminal?.name ?? r.depTerminalName ?? null,
        arrTerminalId: r.arrTerminal?.id ?? r.arrTerminalId ?? null,
        arrTerminalName: r.arrTerminal?.name ?? r.arrTerminalName ?? null,
      }));
    } catch (err) {
      console.error('getTradeSuggestions:', err);
      return [];
    }
  },
};
