export default {
  viewMode: 'order',

  opsOf(l) { return (l.cargos || l.manifests || []); },
  sum(arr) { return (arr || []).reduce((s, m) => s + (Number(m.quantity) || 0), 0); },
  sumLineAction(l, action) {
    return this.sum(this.opsOf(l).filter(m => action === 'load' ? (!m.action || m.action === 'load') : (m.action === 'unload')));
  },

  fromId(l) { return (l.from ?? l.pickup ?? l.pickupPoiId ?? null); },
  toId(l) { return (l.to ?? l.dropoff ?? l.dropoffPoiId ?? null); },

  fromName(l) { return (l.fromName || l.pickupNameDisplay || l.pickupName || '—'); },
  toName(l) { return (l.toName || l.dropoffNameDisplay || l.dropoffName || null); },

  fromSys(l) { return (l.fromSystemName || l.pickupSystemName || ''); },
  toSys(l) { return (l.toSystemName || l.dropoffSystemName || ''); },

  sortedLines() {
    return (this.viewModel?.itinerary?.lines || []).slice().sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0));
  },

  routeList() {
    const ls = this.sortedLines();
    if (!ls.length) return [];

    const out = [];
    let last = null;
    const push = (v) => {
      if (!v || v === last) return;
      out.push(v);
      last = v;
    };

    push(this.viewModel?.originNameDisplay || this.viewModel?.originName || this.fromName(ls[0]));
    ls.forEach(l => push(this.toName(l)));
    return out;
  },

  grouped(mode) {
    const ls = this.sortedLines();
    const map = new Map();
    for (const l of ls) {
      const isFrom = mode === 'from';
      const key = isFrom
        ? (this.fromId(l) ?? ('from_' + this.fromName(l)))
        : (this.toId(l) ?? (this.toName(l) ? ('to_' + this.toName(l)) : 'END'));

      if (!map.has(key)) {
        map.set(key, {
          key,
          label: isFrom ? this.fromName(l) : (this.toName(l) || 'Fin (terminée)'),
          sys: isFrom ? this.fromSys(l) : (this.toSys(l) || ''),
          legs: [],
          minOrder: Number(l.orderIndex) || 999999,
          loadScu: 0,
          unloadScu: 0,
        });
      }
      const g = map.get(key);
      g.legs.push(l);
      g.minOrder = Math.min(g.minOrder, Number(l.orderIndex) || 999999);
      g.loadScu += this.sumLineAction(l, 'load');
      g.unloadScu += this.sumLineAction(l, 'unload');
    }
    const arr = Array.from(map.values());
    arr.forEach(g => g.legs.sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0)));
    arr.sort((a, b) => a.minOrder - b.minOrder);
    return arr;
  },
};
