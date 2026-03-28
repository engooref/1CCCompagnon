/**
 * Mercure SSE — mises à jour temps réel pour le module transport.
 *
 * Utilise le cookie `mercureAuthorization` posé par TransportController::index()
 * pour s'authentifier auprès du hub Mercure avec withCredentials: true.
 *
 * Événements gérés :
 *  - leg.updated       → met à jour l'état completed du leg dans deliveries + viewModel
 *  - itinerary.generated → recharge la liste des livraisons, raffraîchit le viewModel si ouvert
 *  - delivery.deleted  → recharge la liste, retour à la liste si l'ordre courant est supprimé
 */
export default {
  _sse: null,

  initMercure() {
    const config = window.TRANSPORT_MERCURE;
    if (!config?.hubUrl || !config?.topic) return;

    // Fermer une éventuelle connexion précédente
    if (this._sse) {
      this._sse.close();
      this._sse = null;
    }

    try {
      const url = new URL(config.hubUrl);
      url.searchParams.append('topic', config.topic);

      // withCredentials envoie le cookie mercureAuthorization posé côté PHP
      const es = new EventSource(url.toString(), { withCredentials: true });
      this._sse = es;

      es.addEventListener('open', () => {});

      es.addEventListener('message', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.handleMercureEvent(data);
        } catch (err) {
          console.error('[SSE] Parse error:', err);
        }
      });

      es.addEventListener('error', () => {});
    } catch (err) {
      console.error('[SSE] initMercure error:', err);
    }
  },

  handleMercureEvent(data) {
    const type = data?.type;
    if (!type) return;

    if (type === 'leg.updated') {
      const { legId, completed, deliveryId } = data;

      // Mettre à jour dans la liste des livraisons
      for (const d of (this.deliveries || [])) {
        for (const l of (d?.itinerary?.lines || [])) {
          if (l.legId === legId || l.id === legId) {
            l.completed = !!completed;
          }
        }
      }

      // Mettre à jour dans le viewModel si c'est la même livraison
      if (this.viewModel?.id === deliveryId) {
        for (const l of (this.viewModel?.itinerary?.lines || [])) {
          if (l.legId === legId || l.id === legId) {
            l.completed = !!completed;
          }
        }
      }
      return;
    }

    if (type === 'itinerary.generated') {
      const deliveryId = data.deliveryId;
      this.loadDeliveries().then(() => {
        // Si le viewModel affiche cette livraison, le rafraîchir
        if (this.viewModel?.id === deliveryId && this.tab === 'results') {
          const updated = (this.deliveries || []).find(d => d.id === deliveryId);
          if (updated) this.viewDelivery(updated);
        }
      });
      return;
    }

    if (type === 'delivery.deleted') {
      const deliveryId = data.deliveryId;
      this.loadDeliveries();
      // Retourner à la liste si l'ordre supprimé était affiché/édité
      if (this.current?.id === deliveryId || this.viewModel?.id === deliveryId) {
        this.goToList();
      }
    }
  },
};
