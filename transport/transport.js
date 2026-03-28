import { createEmptyDelivery, createEmptyViewModel, createSearchState } from './constants';
import apiMethods from './api';
import shipMethods from './ships';
import lineMethods from './lines';
import searchMethods from './search';
import generationMethods from './generation';
import itineraryMethods from './itinerary';
import deliveryMethods from './delivery';
import sseMethods from './sse';

export default () => ({
  shipModels: [],
  deliveries: [],
  itineraries: [],

  tab: 'list',
  filters: { q: '' },
  allowEditTab: false,
  showResultsTab: false,
  shipSearch: '',
  showShipDropdown: false,

  current: createEmptyDelivery(),
  viewModel: createEmptyViewModel(),
  _editSnapshot: null,

  poiSearches: { origin: createSearchState() },
  commoditySearches: {},

  loading: { deliveries: false, edit: false, view: false, shipModels: false, itineraries: false },
  errors: { deliveries: null, edit: null, view: null, shipModels: null, itineraries: null },

  _autoSaveTimer: null,
  _searchTimers: {},
  floatDdIndex: -1,
  pasteMode: {},

  generationOutput: null,
  generatedLines: [],
  showTradeOpp: true,

  floatDd: {
    open: false,
    kind: null,
    key: null,
    x: 0, y: 0, w: 320,
    results: [],
    loading: false,
  },

  async init() {
    await Promise.all([
      this.loadShipModels(),
      this.loadDeliveries(),
    ]);
    this.initPoiSearchStateForCurrent();
    this.initMercure();
    this.$watch('current.manifests', () => this.scheduleAutoSave());
  },

  async refreshAll() {
    await Promise.all([
      this.loadShipModels(),
      this.loadDeliveries(),
    ]);
    this.initPoiSearchStateForCurrent();
  },

  ...apiMethods,
  ...shipMethods,
  ...lineMethods,
  ...searchMethods,
  ...generationMethods,
  ...itineraryMethods,
  ...deliveryMethods,
  ...sseMethods,
});
