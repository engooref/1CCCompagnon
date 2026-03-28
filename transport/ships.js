/**
 * Ship management — add, remove, search, display helpers.
 *
 * All methods use `this` (Alpine component context via object spread).
 */

export default {

  /** Add a ship (by model id) to the current delivery's fleet. */
  addShip(shipId) {
    if (!shipId) return;
    this.current.ships = this.current.ships || [];
    this.current.ships.push({ shipId, note: '' });
    this.shipSearch      = '';
    this.showShipDropdown = false;
  },

  /** Remove a ship from the fleet by index. */
  removeShip(idx) {
    this.current?.ships?.splice(idx, 1);
  },

  /** Filter ship models by the current search query (max 15 results). */
  filteredShipModels() {
    const q   = (this.shipSearch || '').trim().toLowerCase();
    const src = this.shipModels || [];
    if (!q) return src.slice(0, 15);
    return src.filter(s => (s.name || '').toLowerCase().includes(q)).slice(0, 15);
  },

  /** Formatted display name for a ship model object: "Name (Capacité: X SCU)". */
  shipName(sm) {
    return `${sm.name} (Capacité: ${sm.specification?.scu || '—'} SCU)`;
  },

  /** Display name for a ship model looked up by ID. */
  shipModelName(id) {
    const sm = this.shipModels.find(s => s.id == id);
    if (!sm) return `Vaisseau #${id}`;
    return this.shipName(sm);
  },

  /** Short metadata string (SCU, size class) for a ship model. */
  shipMeta(sm) {
    if (!sm?.specification) return '';
    const parts = [];
    if (sm.specification.scu) parts.push(`SCU: ${sm.specification.scu}`);
    if (sm.size) parts.push(`Taille: ${sm.size}`);
    return parts.join(' · ');
  },

  /** Short metadata for a ship model looked up by ID. */
  shipMetaById(id) {
    return this.shipMeta(this.shipModels.find(s => s.id === id));
  },
};
