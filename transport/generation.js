import { postJsonExpectJson } from '../utils/apiClient.js';
import { safeJson } from '../utils/data.js';
import { API, normalizeItineraryLine } from './constants';

export default {
  async generateDelivery() {
    this.generationOutput = null;
    this.generatedLines = [];

    try {
      const deliveryId = await this.saveDelivery(true);
      if (!deliveryId) {
        window.showNotification('error', 'Enregistrement échoué — vérifiez les données du formulaire');
        this.generationOutput = 'Enregistrement échoué';
        return;
      }

      const existing = (this.deliveries || []).find(m => m.id === deliveryId);
      if (existing && existing.itinerary) {
        if (!confirm('Une génération existe déjà pour cet ordre. Regénérer et écraser les résultats existants ?')) {
          window.showNotification('warning', 'Génération annulée — itinéraire existant conservé');
          this.generationOutput = 'Génération déjà existante — opération annulée';
          this.viewDelivery(existing);
          return;
        }
      }

      const error = this._validateForGeneration();
      if (error) {
        window.showNotification('error', error);
        this.errors.edit = error;
        return;
      }

      const res = await postJsonExpectJson(API.GENERATE.replace('{id}', deliveryId));
      if (res?.status === 'ok') {
        this.generationOutput = JSON.stringify(res, null, 2);
        this.generatedLines = this.parseGeneratedLines(res);

        const segCount = this.generatedLines.length;
        window.showNotification('success', `Itinéraire généré avec succès — ${segCount} segment${segCount > 1 ? 's' : ''}`);

        await this.loadDeliveries();
        const updated = (this.deliveries || []).find(m => m.id === deliveryId);
        if (updated) this.viewDelivery(updated);
        else this.tab = 'results';
      } else {
        const msg = 'Erreur génération: ' + (res?.message || JSON.stringify(res));
        window.showNotification('error', msg);
        this.generationOutput = msg;
      }
    } catch (err) {
      console.error('generateDelivery:', err);
      const msg = err.message || String(err);
      window.showNotification('error', 'Erreur génération: ' + msg);
      this.generationOutput = msg;
    }
  },

  _validateForGeneration() {
    if (!this.current.origin) return 'Le lieu de départ est requis';
    if (!this.current.ships?.length) return 'Au moins un vaisseau est requis';
    if (!this.current.manifests?.length) return 'Au moins une ligne de manifeste est requise';

    for (const [i, line] of this.current.manifests.entries()) {
      const type = line.type ?? 'mono_route';
      const n = i + 1;

      // Validate manifest-level POIs based on type
      if (type === 'mono_route' || type === 'multi_drop') {
        if (!line.pickup) return `Mission ${n}: le point de pickup est requis`;
      }
      if (type === 'mono_route' || type === 'multi_pickup') {
        if (!line.dropoff) return `Mission ${n}: le point de dropoff est requis`;
      }

      const cargos = Array.isArray(line.cargos) ? line.cargos : [];
      if (!cargos.length) return `Mission ${n}: au moins une cargaison requise`;

      for (const [ci, cargo] of cargos.entries()) {
        if (!cargo) return `Mission ${n} Cargaison ${ci + 1}: introuvable`;
        if (!cargo.commodityId) return `Mission ${n} Cargaison ${ci + 1}: cargaison requise`;
        if (!cargo.quantity || Number(cargo.quantity) <= 0) return `Mission ${n} Cargaison ${ci + 1}: quantité invalide`;

        // Validate per-cargo POIs for types that require them
        if ((type === 'multi_pickup' || type === 'multi_route') && !cargo.pickup) {
          return `Mission ${n} Cargaison ${ci + 1}: pickup requis (type ${type})`;
        }
        if ((type === 'multi_drop' || type === 'multi_route') && !cargo.dropoff) {
          return `Mission ${n} Cargaison ${ci + 1}: dropoff requis (type ${type})`;
        }
      }
    }
    return null;
  },

  parseGeneratedLines(payload) {
    const p = payload || {};
    const route = p.route || p.data?.route || null;
    const candidates = p.lines || route?.lines || route?.segments || p.segments || p.generatedLines || [];

    return (Array.isArray(candidates) ? candidates : []).map((seg, idx) => {
      const line = normalizeItineraryLine(seg, idx);
      const cargoNames = (line.cargos || []).map(m => m.commodityName).filter(Boolean);
      const cargo = cargoNames.length ? Array.from(new Set(cargoNames)).join(', ') : '';
      const qty = (line.cargos || []).reduce((s, m) => s + (Number(m.quantity) || 0), 0);
      const title = (line.pickupName || line.dropoffName)
        ? `${line.pickupName || '…'} → ${line.dropoffName || '…'}`
        : `Segment ${idx + 1}`;

      const detailParts = [];
      if (cargo) detailParts.push(`Cargo: ${cargo}`);
      if (qty) detailParts.push(`Qté: ${qty}`);

      return {
        status: (line.pickupName && line.dropoffName) ? 'ok' : 'warn',
        title,
        detail: detailParts.join(' · ') || (seg.detail || ''),
        raw: line,
      };
    });
  },

  isLineGenerated(lineId) {
    if (!lineId) return false;

    for (const d of (this.deliveries || [])) {
      const legsArray = d?.itinerary?.lines || [];
      if (Array.isArray(legsArray)) {
        for (const l of legsArray) {
          if (!l) continue;
          if (Array.isArray(l.manifests) && l.manifests.some(m => m?.id === lineId || m?.manifestId === lineId)) return true;
        }
      }
    }
    return false;
  },

  summarizeRoute(routeJson) {
    const r = safeJson(routeJson);
    if (!r) return '—';
    const segs = r?.lines || r?.segments || [];
    if (!Array.isArray(segs) || segs.length === 0) return '—';

    const first = normalizeItineraryLine(segs[0], 0);
    const last = normalizeItineraryLine(segs[segs.length - 1], segs.length - 1);
    return `${first.pickupName || '…'} → ${last.dropoffName || '…'} · ${segs.length} segment(s)`;
  },
};
