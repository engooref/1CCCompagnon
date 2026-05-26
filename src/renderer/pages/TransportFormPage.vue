<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'
import { logger } from '../services/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormShip {
  _k: number
  shipId: string | null
  note: string
}

interface FormCargo {
  _k: number
  id?: number | null
  commodityId: number | null
  commodityName: string
  quantity: number
  pickup: number | null
  pickupName: string
  dropoff: number | null
  dropoffName: string
}

interface FormManifest {
  _k: number
  id: number | null
  missionGroup: string
  missionType: string
  maxBoxSize: number | null
  pickup: number | null
  pickupName: string
  dropoff: number | null
  dropoffName: string
  commodityId: number | null
  commodityName: string
  quantity: number
  cargos: FormCargo[]
}

interface SearchState {
  query: string
  results: any[]
  loading: boolean
  show: boolean
}

interface ShipModel {
  id: string | number
  name: string
  specification?: { scu?: number }
}

// ─── Store / Router ───────────────────────────────────────────────────────────

const app    = useAppStore()
const route  = useRoute()
const router = useRouter()

const isEdit  = computed(() => !!route.params.id)
const orderId = computed(() => isEdit.value ? Number(route.params.id) : null)

// ─── Form state ───────────────────────────────────────────────────────────────

const form = reactive({
  name:      null as string | null,
  origin:    null as number | null,
  originName: '',
  ships:     [] as FormShip[],
  manifests: [] as FormManifest[],
})

const loading    = ref(false)
const saving     = ref(false)
const generating = ref(false)
const generatingItinerary = ref(false)
const deleting   = ref(false)
const error      = ref<string | null>(null)
const saveError  = ref<string | null>(null)
const savedId    = ref<number | null>(null)
const itineraryGenerated = ref(false)

// ─── Guide interactif ────────────────────────────────────────────────────────

interface GuideStep {
  id: string
  selector: string
  title: string
  text: string
}

interface GuideRect {
  top: number
  left: number
  width: number
  height: number
}

interface GuideTooltipPos {
  top: number
  left: number
}

const GUIDE_EVENT = '1cc:start-transport-form-guide'
const formScrollRef = ref<HTMLElement | null>(null)
const showGuide = ref(false)
const guideIndex = ref(0)
const guideRect = ref<GuideRect | null>(null)
const guideTooltipPos = ref<GuideTooltipPos>({ top: 24, left: 24 })
const guideSteps = ref<GuideStep[]>([])
const guideRaf = ref<number | null>(null)

const guideCatalog: GuideStep[] = [
  {
    id: 'general',
    selector: '[data-guide="general"]',
    title: 'Informations generales',
    text: 'Commence ici pour definir le contexte de ton work order.',
  },
  {
    id: 'order-name',
    selector: '[data-guide="order-name"]',
    title: "Nom de l'ordre",
    text: 'Donne un nom clair et unique. Ce nom sera visible dans les listes et en detail.',
  },
  {
    id: 'origin',
    selector: '[data-guide="origin"]',
    title: 'Point de depart',
    text: 'Choisis le point de depart principal du work order via la recherche de POI.',
  },
  {
    id: 'ships',
    selector: '[data-guide="ships"]',
    title: 'Vaisseaux',
    text: 'Ajoute les vaisseaux qui participent au transport. Tu peux ajouter une note par vaisseau.',
  },
  {
    id: 'lines',
    selector: '[data-guide="lines"]',
    title: 'Lignes de chargement',
    text: 'Chaque ligne represente une mission de cargaison. Tu peux en empiler plusieurs.',
  },
  {
    id: 'add-line',
    selector: '[data-guide="add-line"]',
    title: 'Ajouter une ligne',
    text: 'Clique ici pour ajouter une nouvelle ligne de chargement dans ton work order.',
  },
  {
    id: 'line-type',
    selector: '[data-guide="line-type"]',
    title: 'Type de mission',
    text: 'Choisis le schema: simple, multi pickup, multi drop, ou multi route.',
  },
  {
    id: 'cargo',
    selector: '[data-guide="cargo"]',
    title: 'Champs cargaison',
    text: 'Renseigne la marchandise, la quantite, puis les pickup/dropoff selon le type choisi.',
  },
  {
    id: 'actions',
    selector: '[data-guide="actions"]',
    title: 'Finaliser',
    text: 'Sauvegarde ton work order, ou sauvegarde puis genere directement l\'itineraire.',
  },
]

const activeGuideStep = computed(() => guideSteps.value[guideIndex.value] ?? null)

function refreshGuideRect() {
  const step = activeGuideStep.value
  if (!showGuide.value || !step) {
    guideRect.value = null
    return
  }
  const node = document.querySelector(step.selector) as HTMLElement | null
  if (!node) {
    guideRect.value = null
    return
  }
  node.scrollIntoView({ block: 'center', behavior: 'smooth' })
  window.setTimeout(() => {
    const rect = node.getBoundingClientRect()
    const pad = 8
    const spotlight = {
      top: Math.max(8, rect.top - pad),
      left: Math.max(8, rect.left - pad),
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    }
    guideRect.value = spotlight

    const tooltipWidth = 360
    const margin = 16
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const preferBottom = spotlight.top + spotlight.height + 16 + 220 < viewportHeight
    const top = preferBottom
      ? Math.min(viewportHeight - 230, spotlight.top + spotlight.height + 12)
      : Math.max(16, spotlight.top - 220 - 12)
    const left = Math.max(
      margin,
      Math.min(
        spotlight.left,
        viewportWidth - tooltipWidth - margin,
      ),
    )
    guideTooltipPos.value = { top, left }
  }, 120)
}

function scheduleGuideRectRefresh() {
  if (!showGuide.value) return
  if (guideRaf.value != null) cancelAnimationFrame(guideRaf.value)
  guideRaf.value = requestAnimationFrame(() => {
    refreshGuideRect()
  })
}

function startGuide() {
  nextTick(() => {
    guideSteps.value = guideCatalog.filter((s) => Boolean(document.querySelector(s.selector)))
    if (!guideSteps.value.length) return
    guideIndex.value = 0
    showGuide.value = true
    refreshGuideRect()
  })
}

function stopGuide() {
  showGuide.value = false
  guideRect.value = null
}

function handleGuideKeydown(event: KeyboardEvent) {
  if (!showGuide.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    stopGuide()
    return
  }
  if (event.key === 'ArrowRight' || event.key === 'Enter') {
    event.preventDefault()
    guideNext()
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    guidePrev()
  }
}

function guidePrev() {
  if (!guideSteps.value.length) return
  guideIndex.value = Math.max(0, guideIndex.value - 1)
  refreshGuideRect()
}

function guideNext() {
  if (!guideSteps.value.length) return
  if (guideIndex.value >= guideSteps.value.length - 1) {
    stopGuide()
    return
  }
  guideIndex.value += 1
  refreshGuideRect()
}

function handleGuideEvent() {
  startGuide()
}

// ─── Ship models ──────────────────────────────────────────────────────────────

const shipModels      = ref<ShipModel[]>([])
const shipModelsError = ref(false)
const shipSearch      = ref('')
const showShipDropdown = ref(false)

const filteredShipModels = computed(() => {
  const q = shipSearch.value.trim().toLowerCase()
  if (!q) return shipModels.value.slice(0, 15)
  return shipModels.value.filter(s => s.name.toLowerCase().includes(q)).slice(0, 15)
})

// ─── Search states ────────────────────────────────────────────────────────────

const searches = reactive<Record<string, SearchState>>({})

function getSearch(key: string): SearchState {
  if (!searches[key]) {
    searches[key] = { query: '', results: [], loading: false, show: false }
  }
  return searches[key]
}

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debounce(key: string, fn: () => void, delay = 300) {
  clearTimeout(debounceTimers[key])
  debounceTimers[key] = setTimeout(fn, delay)
}

// ─── URLs / Auth ──────────────────────────────────────────────────────────────

const urls = computed(() => app.settings ? createOverlayUrls(app.settings) : null)

function authHeaders() {
  return { Authorization: `Bearer ${app.bearerToken}` }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function loadReference() {
  if (!urls.value) return
  try {
    const { data } = await http.get(urls.value.market.shipModels, { headers: authHeaders() })
    const raw = data?.data ?? data
    shipModels.value = (Array.isArray(raw) ? raw.filter(Boolean) : []) as ShipModel[]
  } catch (e: any) {
    shipModels.value = []
    shipModelsError.value = true
    logger.error('[TransportForm] loadReference error:', e?.response?.data ?? e?.message ?? e)
  }
}

async function loadOrder() {
  if (!orderId.value || !urls.value) return
  loading.value = true
  error.value   = null
  try {
    const { data } = await http.get(urls.value.transports.show(orderId.value), {
      headers: authHeaders(),
    })
    const raw = data?.data ?? data
    const order = (raw?.order ?? raw) as any
    if (!order) {
      error.value = 'Ordre introuvable'
      return
    }

    form.name            = order.name ?? null
    form.origin          = order.origin ?? null
    form.originName      = order.originName ?? ''
    form.ships = (order.ships ?? []).map((s: any, i: number) => ({
      _k:     Date.now() + i,
      shipId: s.shipId ?? null,
      note:   s.note ?? '',
    }))

      // Group server manifests by missionGroup into a single form manifest with multiple cargos
      const rawManifests: any[] = order.manifests ?? []
      const groups: Record<string, any> = {}
      for (const m of rawManifests) {
        const key = m.missionGroup ?? `${m.pickup ?? 'null'}::${m.dropoff ?? 'null'}`
        const cargo = (m.cargos && m.cargos.length)
          ? m.cargos.map((c: any) => ({
              id: c.id ?? null,
              commodityId: c.commodityId ?? null,
              commodityName: c.commodityName ?? '',
              quantity: c.quantity ?? 1,
              pickup: c.pickup ?? null,
              pickupName: c.pickupName ?? '',
              dropoff: c.dropoff ?? null,
              dropoffName: c.dropoffName ?? ''
            }))
          : [{ id: m.id ?? null, commodityId: m.commodityId ?? null, commodityName: m.commodityName ?? '', quantity: m.quantity ?? 1, pickup: m.pickup ?? null, pickupName: m.pickupName ?? '', dropoff: m.dropoff ?? null, dropoffName: m.dropoffName ?? '' }]

        if (!groups[key]) {
          groups[key] = {
            _k: Date.now() + Math.floor(Math.random() * 10000),
            id: null,
            missionGroup: m.missionGroup ?? crypto.randomUUID(),
            missionType: m.type ?? 'mono_route',
            maxBoxSize: m.maxBoxSize ?? null,
            pickup: m.pickup ?? null,
            pickupName: m.pickupName ?? '',
            dropoff: m.dropoff ?? null,
            dropoffName: m.dropoffName ?? '',
            commodityId: null,
            commodityName: '',
            quantity: 1,
            cargos: [] as FormCargo[],
          }
        }

        for (const c of cargo) {
          const _k = Date.now() + Math.floor(Math.random() * 10000)
          groups[key].cargos.push({ _k, id: c.id ?? null, commodityId: c.commodityId ?? null, commodityName: c.commodityName ?? '', quantity: c.quantity ?? 1, pickup: c.pickup ?? null, pickupName: c.pickupName ?? '', dropoff: c.dropoff ?? null, dropoffName: c.dropoffName ?? '' })
        }
      }
      form.manifests = Object.values(groups) as FormManifest[]

    getSearch('origin').query = form.originName
    for (const m of form.manifests) {
      getSearch(`pickup_${m._k}`).query    = m.pickupName
      getSearch(`dropoff_${m._k}`).query   = m.dropoffName
      getSearch(`commodity_${m._k}`).query = m.commodityName
      for (const c of m.cargos) {
        getSearch(`commodity_${m._k}_c_${c._k}`).query = c.commodityName ?? ''
        getSearch(`cargo_pickup_${m._k}_${c._k}`).query = c.pickupName ?? ''
        getSearch(`cargo_dropoff_${m._k}_${c._k}`).query = c.dropoffName ?? ''
      }
    }
    savedId.value = order.id
    itineraryGenerated.value = !!(order.itinerary && (order.itinerary.lines ?? []).length)
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e?.message ?? 'Erreur de chargement'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!app.status.authReady) return
  await Promise.all([loadReference(), loadOrder()])
  window.addEventListener(GUIDE_EVENT, handleGuideEvent)
  window.addEventListener('resize', scheduleGuideRectRefresh)
  window.addEventListener('keydown', handleGuideKeydown)
  if (route.hash === '#guide') startGuide()
})

onBeforeUnmount(() => {
  window.removeEventListener(GUIDE_EVENT, handleGuideEvent)
  window.removeEventListener('resize', scheduleGuideRectRefresh)
  window.removeEventListener('keydown', handleGuideKeydown)
  if (guideRaf.value != null) cancelAnimationFrame(guideRaf.value)
})

watch(() => route.hash, (hash) => {
  if (hash === '#guide') startGuide()
})

watch(() => guideIndex.value, () => {
  scheduleGuideRectRefresh()
})

// ─── Ships ────────────────────────────────────────────────────────────────────

function shipDisplayName(id: string | number | null): string {
  if (!id) return '—'
  const sm = shipModels.value.find(s => s.id == id)
  if (!sm) return `Vaisseau #${id}`
  return `${sm.name} (${sm.specification?.scu ?? '—'} SCU)`
}

let selectingShip = false

function addShip(shipId: string | number) {
  selectingShip = true
  form.ships.push({ _k: Date.now(), shipId: String(shipId), note: '' })
  shipSearch.value = ''
  setTimeout(() => { selectingShip = false }, 300)
}

function removeShip(idx: number) {
  form.ships.splice(idx, 1)
}

function hideShipSearch() {
  setTimeout(() => {
    if (!selectingShip) showShipDropdown.value = false
  }, 150)
}

// ─── Manifests ────────────────────────────────────────────────────────────────

function addLine() {
  const _k = Date.now()
  form.manifests.push({
    _k, id: null,
    missionGroup: crypto.randomUUID(),
    missionType: 'mono_route',
    maxBoxSize: null,
    pickup: null, pickupName: '',
    dropoff: null, dropoffName: '',
    commodityId: null, commodityName: '',
    quantity: 1,
    cargos: [],
  })
  getSearch(`pickup_${_k}`).query    = ''
  getSearch(`dropoff_${_k}`).query   = ''
  // initialize with one empty cargo so UI always shows multi-cargo inputs
  const m = form.manifests.find(mm => mm._k === _k)
  if (m) {
    const c_k = Date.now() + Math.floor(Math.random() * 1000)
    m.cargos.push({ _k: c_k, id: null, commodityId: null, commodityName: '', quantity: 1, pickup: null, pickupName: '', dropoff: null, dropoffName: '' })
    getSearch(`commodity_${_k}_c_${c_k}`).query = ''
    getSearch(`cargo_pickup_${_k}_${c_k}`).query = ''
    getSearch(`cargo_dropoff_${_k}_${c_k}`).query = ''
  }
}

function removeLine(idx: number) {
  const m = form.manifests[idx]
  if (m) {
    delete searches[`pickup_${m._k}`]
    delete searches[`dropoff_${m._k}`]
    delete searches[`commodity_${m._k}`]
    // remove cargo search keys
    ;(m.cargos ?? []).forEach(c => {
      delete searches[`commodity_${m._k}_c_${c._k}`]
      delete searches[`cargo_pickup_${m._k}_${c._k}`]
      delete searches[`cargo_dropoff_${m._k}_${c._k}`]
    })
  }
  form.manifests.splice(idx, 1)
}

// ─── POI search ───────────────────────────────────────────────────────────────

function onPoiInput(fieldKey: string, value: string) {
  const s = getSearch(fieldKey)
  s.query = value
  if (!value || value.length < 2) {
    s.results = []
    s.show    = false
    return
  }
  debounce(`poi_${fieldKey}`, () => searchPoi(fieldKey, value))
}

async function searchPoi(fieldKey: string, query: string) {
  if (!urls.value) return
  const s   = getSearch(fieldKey)
  s.loading = true
  try {
    const { data } = await http.get(
      `${urls.value.starmap.poiSearch}?q=${encodeURIComponent(query)}`,
      { headers: authHeaders() },
    )
    s.results = data?.data ?? []
    s.show    = s.results.length > 0
  } catch {
    s.results = []
    s.show    = false
  } finally {
    s.loading = false
  }
}

function selectPoi(fieldKey: string, poi: any) {
  const name = poi.systemName ? `${poi.name} (${poi.systemName})` : poi.name
  if (fieldKey === 'origin') {
    form.origin     = poi.id
    form.originName = name
  } else if (fieldKey.startsWith('cargo_pickup_') || fieldKey.startsWith('cargo_dropoff_')) {
    const isPickup = fieldKey.startsWith('cargo_pickup_')
    const withoutPrefix = fieldKey.startsWith('cargo_pickup_')
      ? fieldKey.slice('cargo_pickup_'.length)
      : fieldKey.slice('cargo_dropoff_'.length)
    for (const m of form.manifests) {
      const mk = String(m._k)
      if (!withoutPrefix.startsWith(mk + '_')) continue
      const cargoKeyStr = withoutPrefix.slice(mk.length + 1)
      const c = m.cargos.find(cc => String(cc._k) === cargoKeyStr)
      if (c) {
        if (isPickup) { c.pickup = poi.id; c.pickupName = name }
        else          { c.dropoff = poi.id; c.dropoffName = name }
      }
      break
    }
  } else {
    const sep  = fieldKey.indexOf('_')
    const type = fieldKey.substring(0, sep)
    const key  = Number(fieldKey.substring(sep + 1))
    const m    = form.manifests.find(m => m._k === key)
    if (m) {
      if (type === 'pickup') { m.pickup = poi.id; m.pickupName = name }
      else if (type === 'dropoff') { m.dropoff = poi.id; m.dropoffName = name }
    }
  }
  const s   = getSearch(fieldKey)
  s.query   = name
  s.show    = false
  s.results = []
}

function hideSearch(fieldKey: string) {
  setTimeout(() => {
    const s = searches[fieldKey]
    if (s) s.show = false
  }, 150)
}

// ─── Commodity search ─────────────────────────────────────────────────────────

function onCommodityInput(fieldKey: string, value: string) {
  const s = getSearch(fieldKey)
  s.query = value
  if (!value || value.length < 2) {
    s.results = []
    s.show    = false
    return
  }
  debounce(`commo_${fieldKey}`, () => searchCommodity(fieldKey, value))
}

async function searchCommodity(fieldKey: string, query: string) {
  if (!urls.value) return
  const s   = getSearch(fieldKey)
  s.loading = true
  try {
    const { data } = await http.get(
      `${urls.value.market.commodities}?q=${encodeURIComponent(query)}`,
      { headers: authHeaders() },
    )
    s.results = data?.data ?? []
    s.show    = s.results.length > 0
  } catch {
    s.results = []
    s.show    = false
  } finally {
    s.loading = false
  }
}

function selectCommodity(fieldKey: string, commodity: any) {
  // support cargo keys: commodity_{manifestKey}_c_{cargoKey}
  if (fieldKey.includes('_c_')) {
    const parts = fieldKey.replace('commodity_', '').split('_c_')
    const manifestKey = Number(parts[0])
    const cargoKey = Number(parts[1])
    const m = form.manifests.find(mm => mm._k === manifestKey)
    if (m) {
      const c = m.cargos.find(cc => cc._k === cargoKey)
      if (c) {
        c.commodityId = commodity.id
        c.commodityName = commodity.name
      }
    }
  } else {
    const key = Number(fieldKey.replace('commodity_', ''))
    const m   = form.manifests.find(m => m._k === key)
    if (m) {
      m.commodityId   = commodity.id
      m.commodityName = commodity.name
    }
  }
  const s   = getSearch(fieldKey)
  s.query   = commodity.name
  s.show    = false
  s.results = []
}

function addCargo(manifestKey: number) {
  const m = form.manifests.find(mm => mm._k === manifestKey)
  if (!m) return
  const _k = Date.now() + Math.floor(Math.random() * 1000)
  m.cargos.push({ _k, id: null, commodityId: null, commodityName: '', quantity: 1, pickup: null, pickupName: '', dropoff: null, dropoffName: '' })
  getSearch(`commodity_${manifestKey}_c_${_k}`).query = ''
  getSearch(`cargo_pickup_${manifestKey}_${_k}`).query = ''
  getSearch(`cargo_dropoff_${manifestKey}_${_k}`).query = ''
}

function removeCargo(manifestKey: number, cargoKey: number) {
  const m = form.manifests.find(mm => mm._k === manifestKey)
  if (!m) return
  const idx = m.cargos.findIndex(c => c._k === cargoKey)
  if (idx !== -1) {
    delete searches[`commodity_${manifestKey}_c_${cargoKey}`]
    delete searches[`cargo_pickup_${manifestKey}_${cargoKey}`]
    delete searches[`cargo_dropoff_${manifestKey}_${cargoKey}`]
    m.cargos.splice(idx, 1)
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function save(): Promise<number | null> {
  if (!urls.value) return null
  saving.value    = true
  saveError.value = null
  const payload = {
    name:            form.name,
    origin:          form.origin,
    ships:    form.ships.map(s => ({ shipId: s.shipId, note: s.note })),
    lines:    form.manifests.flatMap(m => {
      const type = m.missionType ?? 'mono_route'
      const missionGroup = m.missionGroup ?? crypto.randomUUID()
      const cargos = m.cargos && m.cargos.length
        ? m.cargos
        : [{ _k: 0, id: m.id, commodityId: m.commodityId, commodityName: m.commodityName, quantity: m.quantity ?? 1, pickup: null, pickupName: '', dropoff: null, dropoffName: '' }]

      return cargos.map(c => ({
        ...(c.id ? { id: c.id } : {}),
        missionType:  type,
        missionGroup,
        maxBoxSize:   m.maxBoxSize ?? null,

        // Manifest-level pickup / dropoff (mono_route)
        pickup:       (type === 'multi_pickup' || type === 'multi_route') ? null : (m.pickup ?? null),
        pickupName:   (type === 'multi_pickup' || type === 'multi_route') ? null : (m.pickupName ?? null),
        pickupPoiId:  (type === 'multi_pickup' || type === 'multi_route') ? null : (m.pickup ?? null),
        pickupPoiName:(type === 'multi_pickup' || type === 'multi_route') ? null : (m.pickupName ?? null),

        dropoff:      (type === 'multi_drop'   || type === 'multi_route') ? null : (m.dropoff ?? null),
        dropoffName:  (type === 'multi_drop'   || type === 'multi_route') ? null : (m.dropoffName ?? null),
        dropoffPoiId: (type === 'multi_drop'   || type === 'multi_route') ? null : (m.dropoff ?? null),
        dropoffPoiName:(type === 'multi_drop'   || type === 'multi_route') ? null : (m.dropoffName ?? null),

        // Cargo-specific pickup / dropoff (multi_pickup / multi_route or multi_drop)
        cargoPickup:   (type === 'multi_pickup' || type === 'multi_route') ? (c.pickup ?? null) : null,
        cargoPickupName:(type === 'multi_pickup' || type === 'multi_route') ? (c.pickupName ?? null) : null,
        cargoPickupPoiId:(type === 'multi_pickup' || type === 'multi_route') ? (c.pickup ?? null) : null,
        cargoPickupPoiName:(type === 'multi_pickup' || type === 'multi_route') ? (c.pickupName ?? null) : null,

        cargoDropoff:   (type === 'multi_drop'   || type === 'multi_route') ? (c.dropoff ?? null) : null,
        cargoDropoffName:(type === 'multi_drop'   || type === 'multi_route') ? (c.dropoffName ?? null) : null,
        cargoDropoffPoiId:(type === 'multi_drop'   || type === 'multi_route') ? (c.dropoff ?? null) : null,
        cargoDropoffPoiName:(type === 'multi_drop'   || type === 'multi_route') ? (c.dropoffName ?? null) : null,

        commodityId:  c.commodityId,
        commodityName:c.commodityName ?? null,
        quantity:     c.quantity ?? 1,
      }))
    }),
  }
  try {
    if (savedId.value) {
      const { data } = await http.patch(
        urls.value.transports.show(savedId.value),
        payload,
        { headers: { ...authHeaders(), 'Content-Type': 'application/json' } },
      )
      return data?.id ?? savedId.value
    } else {
      const { data } = await http.post(
        urls.value.transports.index,
        payload,
        { headers: { ...authHeaders(), 'Content-Type': 'application/json' } },
      )
      savedId.value = data?.id
      return savedId.value
    }
  } catch (e: any) {
    saveError.value = e?.response?.data?.message ?? e?.message ?? 'Erreur de sauvegarde'
    return null
  } finally {
    saving.value = false
  }
}

async function saveAndGoBack() {
  const id = await save()
  if (id != null) router.push({ name: 'transport' })
}

// ─── Generate ─────────────────────────────────────────────────────────────────

async function generate() {
  if (!urls.value) return
  saveError.value = null

  const id = await save()
  if (!id) return

  generating.value = true
  try {
    await http.post(
      urls.value.transports.generate(id),
      {},
      { headers: { ...authHeaders(), 'Content-Type': 'application/json' } },
    )
    router.push({ name: 'transport-detail', params: { id } })
  } catch (e: any) {
    saveError.value = e?.response?.data?.message ?? e?.message ?? 'Erreur de génération'
  } finally {
    generating.value = false
  }
}

async function generateItinerary() {
  if (!urls.value || !savedId.value) return
  generatingItinerary.value = true
  try {
    await http.post(
      urls.value.transports.generate(savedId.value),
      {},
      { headers: { ...authHeaders(), 'Content-Type': 'application/json' } },
    )
    // refresh order data for the form
    await loadOrder()
  } catch (e: any) {
    saveError.value = e?.response?.data?.message ?? e?.message ?? 'Erreur de génération'
  } finally {
    generatingItinerary.value = false
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteDelivery() {
  if (!savedId.value || !urls.value) return
  if (!confirm('Supprimer définitivement cet ordre de transport ?')) return
  deleting.value = true
  try {
    await http.delete(urls.value.transports.show(savedId.value), {
      headers: authHeaders(),
    })
    router.push({ name: 'transport' })
  } catch (e: any) {
    saveError.value = e?.response?.data?.message ?? e?.message ?? 'Erreur de suppression'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="h-full flex flex-col gap-4">

    <!-- Not authenticated -->
    <div
      v-if="!app.status.authReady"
      class="flex flex-1 items-center justify-center text-th-muted text-sm"
    >
      Connexion requise pour accéder au transport.
    </div>

    <template v-else>

      <!-- ── Header ──────────────────────────────────────────────────────── -->
      <div class="shrink-0 flex items-center gap-3">
        <button
          @click="router.push({ name: 'transport' })"
          class="flex items-center gap-1.5 rounded-md border border-th-subtle bg-th-card px-2.5 py-1 text-xs font-medium text-th-secondary hover:text-th-primary hover:border-th-subtle transition"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Retour
        </button>
        <button
          v-if="savedId && !itineraryGenerated"
          @click="generateItinerary"
          :disabled="generatingItinerary || saving || generating"
          class="shrink-0 flex items-center gap-1 rounded-md border border-accent/20 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent/70 hover:bg-accent/10 hover:text-accent transition disabled:opacity-40"
        >
          <svg v-if="generatingItinerary" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          {{ generatingItinerary ? 'Génération…' : 'Générer l\'itinéraire' }}
        </button>

        <div class="flex items-center gap-2 min-w-0 flex-1">
          <div class="h-7 w-7 shrink-0 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center">
            <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/>
            </svg>
          </div>
          <span class="text-sm font-bold truncate text-th-primary">
            {{ isEdit ? (form.name ?? `Ordre #${orderId}`) : 'Nouvel ordre' }}
          </span>
        </div>

        <button
          @click="startGuide"
          type="button"
          class="shrink-0 flex items-center gap-1 rounded-md border border-accent/25 bg-accent/8 px-2.5 py-1 text-xs font-medium text-accent/80 hover:bg-accent/15 hover:text-accent transition"
          title="Lancer le guide interactif"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.55-1.165 1.83-2 3.272-2 1.934 0 3.5 1.343 3.5 3 0 1.236-.87 2.298-2.104 2.762-.67.252-1.146.85-1.146 1.567V15M12 18h.01"/>
          </svg>
          Guide champs
        </button>

        <!-- Delete (only when editing an existing, saved order) -->
        <button
          v-if="savedId"
          @click="deleteDelivery"
          :disabled="deleting || saving || generating"
          class="shrink-0 flex items-center gap-1 rounded-md border border-rose-400/25 bg-rose-400/5 px-2.5 py-1 text-xs font-medium text-rose-400/70 hover:bg-rose-400/10 hover:text-rose-300 transition disabled:opacity-40"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          {{ deleting ? '…' : 'Supprimer' }}
        </button>
      </div>

      <!-- ── Loading ─────────────────────────────────────────────────────── -->
      <div v-if="loading" class="rounded-lg border border-accent/10 bg-black/20 p-4 text-sm text-th-muted">
        Chargement…
      </div>

      <!-- ── Load error ──────────────────────────────────────────────────── -->
      <div v-else-if="error" class="rounded-lg border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-300">
        <span class="font-semibold">Erreur :</span> {{ error }}
      </div>

      <!-- ── Form body ───────────────────────────────────────────────────── -->
      <div ref="formScrollRef" @scroll.passive="scheduleGuideRectRefresh" v-else class="flex-1 min-h-0 overflow-y-auto space-y-3">

        <!-- Save / action error -->
        <div v-if="saveError" class="rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-300">
          <span class="font-semibold">Erreur :</span> {{ saveError }}
        </div>

        <!-- ──────────────────────────────────────────────────────────────── -->
        <!-- General info                                                     -->
        <!-- ──────────────────────────────────────────────────────────────── -->
        <div data-guide="general" class="rounded-lg border border-accent/20 bg-black/20 p-4 space-y-3">
          <p class="text-[10px] font-bold uppercase tracking-widest text-th-muted">Informations générales</p>

          <!-- Name -->
          <div data-guide="order-name">
            <label class="block text-[11px] font-semibold text-th-muted mb-1">Nom de l'ordre</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="Ex: Run LaGrange → Crusader"
              class="w-full rounded-md border border-th-subtle bg-th-card px-3 py-1.5 text-xs text-th-primary placeholder:text-th-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
            />
          </div>

          <!-- Origin POI autocomplete -->
          <div data-guide="origin">
            <label class="block text-[11px] font-semibold text-th-muted mb-1">Point de départ</label>
            <div class="relative">
              <input
                :value="getSearch('origin').query"
                @input="onPoiInput('origin', ($event.target as HTMLInputElement).value)"
                @blur="hideSearch('origin')"
                type="text"
                placeholder="Rechercher un lieu…"
                class="w-full rounded-md border border-th-subtle bg-th-card px-3 py-1.5 text-xs text-th-primary placeholder:text-th-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              />
              <div
                v-if="getSearch('origin').show || getSearch('origin').loading"
                class="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-th-subtle bg-th-surface shadow-xl max-h-48 overflow-y-auto"
              >
                <div v-if="getSearch('origin').loading" class="px-3 py-2 text-xs text-th-muted">Recherche…</div>
                <button
                  v-for="poi in getSearch('origin').results"
                  :key="poi.id"
                  @mousedown.prevent="selectPoi('origin', poi)"
                  class="w-full text-left px-3 py-2 text-xs text-th-primary hover:bg-th-card border-b border-th-muted last:border-0"
                >
                  {{ poi.name }}
                  <span v-if="poi.systemName" class="text-th-muted ml-1">({{ poi.systemName }})</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        <!-- ──────────────────────────────────────────────────────────────── -->
        <!-- Ships                                                            -->
        <!-- ──────────────────────────────────────────────────────────────── -->
        <div data-guide="ships" class="rounded-lg border border-accent/20 bg-black/20 p-4 space-y-3">
          <p class="text-[10px] font-bold uppercase tracking-widest text-th-muted">Vaisseaux</p>

          <!-- Ship search -->
          <div class="relative">
            <input
              v-model="shipSearch"
              @focus="showShipDropdown = true"
              @blur="hideShipSearch"
              type="text"
              placeholder="Ajouter un vaisseau…"
              class="w-full rounded-md border border-dashed border-accent/20 bg-black/10 px-3 py-1.5 text-xs text-th-secondary placeholder:text-th-muted focus:outline-none focus:border-accent/40"
            />
            <div
              v-if="showShipDropdown"
              class="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-th-subtle bg-th-surface shadow-xl max-h-48 overflow-y-auto"
            >
              <div v-if="!filteredShipModels.length" class="px-3 py-2 text-xs" :class="shipModelsError ? 'text-rose-400' : 'text-th-muted'">
                {{ shipModelsError ? 'Erreur de chargement des vaisseaux.' : (shipSearch.length < 1 ? 'Tapez pour rechercher…' : 'Aucun résultat.') }}
              </div>
              <button
                v-for="sm in filteredShipModels"
                :key="sm.id"
                @mousedown.prevent="addShip(sm.id)"
                class="w-full text-left px-3 py-2 text-xs text-th-primary hover:bg-th-card border-b border-th-muted last:border-0"
              >
                {{ sm.name }}
                <span class="text-th-muted ml-1">({{ sm.specification?.scu ?? '—' }} SCU)</span>
              </button>
            </div>
          </div>

          <div v-if="!form.ships.length" class="text-xs text-th-muted italic">Aucun vaisseau ajouté.</div>

          <div v-else class="space-y-2">
            <div
              v-for="(ship, idx) in form.ships"
              :key="ship._k"
              class="flex items-start gap-2 rounded-md border border-th-muted bg-th-card px-2.5 py-2"
            >
              <svg class="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-th-primary">{{ shipDisplayName(ship.shipId) }}</p>
                <input
                  v-model="ship.note"
                  type="text"
                  placeholder="Note (optionnelle)"
                  class="mt-1 w-full rounded border border-th-muted bg-th-card/30 px-2 py-1 text-[11px] text-th-secondary placeholder:text-th-muted focus:outline-none focus:border-accent/30"
                />
              </div>
              <button
                @click="removeShip(idx)"
                class="mt-0.5 shrink-0 text-th-muted hover:text-rose-400 transition"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- ──────────────────────────────────────────────────────────────── -->
        <!-- Manifest lines                                                   -->
        <!-- ──────────────────────────────────────────────────────────────── -->
        <div data-guide="lines" class="rounded-lg border border-accent/20 bg-black/20 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-[10px] font-bold uppercase tracking-widest text-th-muted">Lignes de chargement</p>
            <button
              @click="addLine"
              data-guide="add-line"
              class="flex items-center gap-1 rounded-md border border-accent/20 bg-accent/5 px-2 py-1 text-[11px] font-medium text-accent/70 hover:bg-accent/10 hover:text-accent transition"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Ajouter une ligne
            </button>
          </div>

          <div v-if="!form.manifests.length" class="text-xs text-th-muted italic">
            Aucune ligne de chargement. Cliquez sur « Ajouter une ligne ».
          </div>

          <div class="space-y-3">
            <div
              v-for="(m, idx) in form.manifests"
              :key="m._k"
              class="rounded-md border border-th-muted bg-th-card/20 p-3 space-y-2"
            >
              <!-- Line header -->
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[11px] font-bold text-th-muted">Ligne {{ idx + 1 }}</span>
                  <!-- Type selector -->
                  <div :data-guide="idx === 0 ? 'line-type' : undefined" class="flex items-center rounded border border-th-muted/50 overflow-hidden text-[10px]">
                    <button
                      v-for="[val, label] in Object.entries({'mono_route':'A→B','multi_drop':'A→B+C','multi_pickup':'A+B→C','multi_route':'A+B→C+D'})"
                      :key="val"
                      @click="m.missionType = val"
                      class="px-2 py-0.5 transition"
                      :class="m.missionType === val ? 'bg-accent/25 text-accent font-semibold' : 'text-th-muted hover:bg-th-card hover:text-th-secondary'"
                    >{{ label }}</button>
                  </div>
                </div>
                <button @click="removeLine(idx)" class="text-th-muted hover:text-rose-400 transition">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              <!-- Pickup + Dropoff (manifest-level, conditional on type) -->
              <div class="grid grid-cols-2 gap-2">

                <!-- Pickup (mono_route or multi_drop) -->
                <div v-show="m.missionType === 'mono_route' || m.missionType === 'multi_drop'">
                  <label class="block text-[10px] text-th-muted mb-1">
                    Pickup
                    <span v-if="m.missionType === 'multi_drop'" class="normal-case font-normal text-th-muted/70"> (partagé)</span>
                  </label>
                  <div class="relative">
                    <input
                      :value="getSearch(`pickup_${m._k}`).query"
                      @input="onPoiInput(`pickup_${m._k}`, ($event.target as HTMLInputElement).value)"
                      @blur="hideSearch(`pickup_${m._k}`)"
                      type="text"
                      placeholder="Lieu de pickup…"
                      class="w-full rounded-md border border-th-subtle bg-th-card px-2.5 py-1.5 text-[11px] text-th-primary placeholder:text-th-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                    />
                    <div
                      v-if="getSearch(`pickup_${m._k}`).show || getSearch(`pickup_${m._k}`).loading"
                      class="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-th-subtle bg-th-surface shadow-xl max-h-40 overflow-y-auto"
                    >
                      <div v-if="getSearch(`pickup_${m._k}`).loading" class="px-3 py-2 text-xs text-th-muted">Recherche…</div>
                      <button
                        v-for="poi in getSearch(`pickup_${m._k}`).results"
                        :key="poi.id"
                        @mousedown.prevent="selectPoi(`pickup_${m._k}`, poi)"
                        class="w-full text-left px-3 py-1.5 text-[11px] text-th-primary hover:bg-th-card border-b border-th-muted last:border-0"
                      >
                        {{ poi.name }}
                        <span v-if="poi.systemName" class="text-th-muted ml-1">({{ poi.systemName }})</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Dropoff (mono_route or multi_pickup) -->
                <div v-show="m.missionType === 'mono_route' || m.missionType === 'multi_pickup'">
                  <label class="block text-[10px] text-th-muted mb-1">
                    Dropoff
                    <span v-if="m.missionType === 'multi_pickup'" class="normal-case font-normal text-th-muted/70"> (partagé)</span>
                  </label>
                  <div class="relative">
                    <input
                      :value="getSearch(`dropoff_${m._k}`).query"
                      @input="onPoiInput(`dropoff_${m._k}`, ($event.target as HTMLInputElement).value)"
                      @blur="hideSearch(`dropoff_${m._k}`)"
                      type="text"
                      placeholder="Lieu de dropoff…"
                      class="w-full rounded-md border border-th-subtle bg-th-card px-2.5 py-1.5 text-[11px] text-th-primary placeholder:text-th-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                    />
                    <div
                      v-if="getSearch(`dropoff_${m._k}`).show || getSearch(`dropoff_${m._k}`).loading"
                      class="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-th-subtle bg-th-surface shadow-xl max-h-40 overflow-y-auto"
                    >
                      <div v-if="getSearch(`dropoff_${m._k}`).loading" class="px-3 py-2 text-xs text-th-muted">Recherche…</div>
                      <button
                        v-for="poi in getSearch(`dropoff_${m._k}`).results"
                        :key="poi.id"
                        @mousedown.prevent="selectPoi(`dropoff_${m._k}`, poi)"
                        class="w-full text-left px-3 py-1.5 text-[11px] text-th-primary hover:bg-th-card border-b border-th-muted last:border-0"
                      >
                        {{ poi.name }}
                        <span v-if="poi.systemName" class="text-th-muted ml-1">({{ poi.systemName }})</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Max box size -->
              <div>
                <label class="block text-[10px] text-th-muted mb-1">Taille max des caisses (SCU) — optionnel</label>
                <input
                  :value="m.maxBoxSize ?? ''"
                  @input="m.maxBoxSize = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)"
                  type="number"
                  min="1"
                  placeholder="Aucune limite"
                  class="w-32 rounded-md border border-th-subtle bg-th-card px-2.5 py-1.5 text-[11px] text-th-primary placeholder:text-th-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                />
              </div>

              <!-- Commodity + Quantity (support multiple cargos per line) -->
              <div :data-guide="idx === 0 ? 'cargo' : undefined">
                <label class="block text-[10px] text-th-muted mb-1">Marchandises</label>

                <div class="space-y-2">
                  <div
                    v-for="c in m.cargos"
                    :key="c._k"
                    class="rounded border border-th-muted/30 bg-th-card/10 p-2 space-y-1.5"
                  >
                    <!-- Commodity + qty + remove -->
                    <div class="grid grid-cols-12 gap-2 items-center">
                      <div class="col-span-7">
                        <div class="relative">
                          <input
                            :value="getSearch(`commodity_${m._k}_c_${c._k}`).query"
                            @input="onCommodityInput(`commodity_${m._k}_c_${c._k}`, ($event.target as HTMLInputElement).value)"
                            @blur="hideSearch(`commodity_${m._k}_c_${c._k}`)"
                            type="text"
                            placeholder="Marchandise…"
                            class="w-full rounded-md border border-th-subtle bg-th-card px-2.5 py-1.5 text-[11px] text-th-primary placeholder:text-th-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                          />
                          <div
                            v-if="getSearch(`commodity_${m._k}_c_${c._k}`).show || getSearch(`commodity_${m._k}_c_${c._k}`).loading"
                            class="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-th-subtle bg-th-surface shadow-xl max-h-40 overflow-y-auto"
                          >
                            <div v-if="getSearch(`commodity_${m._k}_c_${c._k}`).loading" class="px-3 py-2 text-xs text-th-muted">Recherche…</div>
                            <button
                              v-for="res in getSearch(`commodity_${m._k}_c_${c._k}`).results"
                              :key="res.id"
                              @mousedown.prevent="selectCommodity(`commodity_${m._k}_c_${c._k}`, res)"
                              class="w-full text-left px-3 py-1.5 text-[11px] text-th-primary hover:bg-th-card border-b border-th-muted last:border-0"
                            >
                              {{ res.name }}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div class="col-span-3">
                        <input
                          v-model.number="c.quantity"
                          type="number"
                          min="1"
                          class="w-full rounded-md border border-th-subtle bg-th-card px-2.5 py-1.5 text-[11px] text-th-primary"
                        />
                      </div>
                      <div class="col-span-2 flex items-center justify-end">
                        <button @click="removeCargo(m._k, c._k)" type="button" class="text-rose-400 hover:underline text-xs">Suppr</button>
                      </div>
                    </div>
                    <!-- Per-cargo POI (multi types) -->
                    <div
                      v-if="m.missionType === 'multi_pickup' || m.missionType === 'multi_route' || m.missionType === 'multi_drop'"
                      class="grid gap-2"
                      :class="m.missionType === 'multi_route' ? 'grid-cols-2' : 'grid-cols-1'"
                    >
                      <!-- Per-cargo pickup (multi_pickup or multi_route) -->
                      <div v-if="m.missionType === 'multi_pickup' || m.missionType === 'multi_route'">
                        <label class="block text-[10px] text-emerald-400/70 mb-1">Pickup cargaison</label>
                        <div class="relative">
                          <input
                            :value="getSearch(`cargo_pickup_${m._k}_${c._k}`).query"
                            @input="onPoiInput(`cargo_pickup_${m._k}_${c._k}`, ($event.target as HTMLInputElement).value)"
                            @blur="hideSearch(`cargo_pickup_${m._k}_${c._k}`)"
                            type="text" placeholder="Lieu de pickup…"
                            class="w-full rounded-md border border-emerald-400/20 bg-th-card px-2.5 py-1.5 text-[11px] text-th-primary placeholder:text-th-muted focus:outline-none focus:border-emerald-400/40"
                          />
                          <div
                            v-if="getSearch(`cargo_pickup_${m._k}_${c._k}`).show || getSearch(`cargo_pickup_${m._k}_${c._k}`).loading"
                            class="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-th-subtle bg-th-surface shadow-xl max-h-40 overflow-y-auto"
                          >
                            <div v-if="getSearch(`cargo_pickup_${m._k}_${c._k}`).loading" class="px-3 py-2 text-xs text-th-muted">Recherche…</div>
                            <button
                              v-for="poi in getSearch(`cargo_pickup_${m._k}_${c._k}`).results"
                              :key="poi.id"
                              @mousedown.prevent="selectPoi(`cargo_pickup_${m._k}_${c._k}`, poi)"
                              class="w-full text-left px-3 py-1.5 text-[11px] text-th-primary hover:bg-th-card border-b border-th-muted last:border-0"
                            >{{ poi.name }}<span v-if="poi.systemName" class="text-th-muted ml-1">({{ poi.systemName }})</span></button>
                          </div>
                        </div>
                      </div>
                      <!-- Per-cargo dropoff (multi_drop or multi_route) -->
                      <div v-if="m.missionType === 'multi_drop' || m.missionType === 'multi_route'">
                        <label class="block text-[10px] text-orange-400/70 mb-1">Dropoff cargaison</label>
                        <div class="relative">
                          <input
                            :value="getSearch(`cargo_dropoff_${m._k}_${c._k}`).query"
                            @input="onPoiInput(`cargo_dropoff_${m._k}_${c._k}`, ($event.target as HTMLInputElement).value)"
                            @blur="hideSearch(`cargo_dropoff_${m._k}_${c._k}`)"
                            type="text" placeholder="Lieu de dropoff…"
                            class="w-full rounded-md border border-orange-400/20 bg-th-card px-2.5 py-1.5 text-[11px] text-th-primary placeholder:text-th-muted focus:outline-none focus:border-orange-400/40"
                          />
                          <div
                            v-if="getSearch(`cargo_dropoff_${m._k}_${c._k}`).show || getSearch(`cargo_dropoff_${m._k}_${c._k}`).loading"
                            class="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-th-subtle bg-th-surface shadow-xl max-h-40 overflow-y-auto"
                          >
                            <div v-if="getSearch(`cargo_dropoff_${m._k}_${c._k}`).loading" class="px-3 py-2 text-xs text-th-muted">Recherche…</div>
                            <button
                              v-for="poi in getSearch(`cargo_dropoff_${m._k}_${c._k}`).results"
                              :key="poi.id"
                              @mousedown.prevent="selectPoi(`cargo_dropoff_${m._k}_${c._k}`, poi)"
                              class="w-full text-left px-3 py-1.5 text-[11px] text-th-primary hover:bg-th-card border-b border-th-muted last:border-0"
                            >{{ poi.name }}<span v-if="poi.systemName" class="text-th-muted ml-1">({{ poi.systemName }})</span></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <button @click="addCargo(m._k)" type="button" class="text-xs text-accent hover:underline">+ Ajouter une cargaison</button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- ── Action buttons ──────────────────────────────────────────── -->
        <div data-guide="actions" class="flex items-center gap-2 pb-2">

          <!-- Save -->
          <button
            @click="saveAndGoBack"
            :disabled="saving || generating || deleting"
            class="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-40"
          >
            <svg v-if="saving" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            {{ saving ? 'Sauvegarde…' : 'Sauvegarder' }}
          </button>

          <!-- Save & Generate -->
          <button
            @click="generate"
            :disabled="saving || generating || deleting"
            class="flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/15 transition disabled:opacity-40"
          >
            <svg v-if="saving || generating" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
            </svg>
            {{ generating ? 'Génération…' : (saving ? 'Sauvegarde…' : 'Sauvegarder & Générer') }}
          </button>

        </div>
      </div>

      <div v-if="showGuide" class="fixed inset-0 z-[70]">
        <div class="absolute inset-0 bg-black/55" />

        <div
          v-if="guideRect"
          class="absolute rounded-xl border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-none"
          :style="{
            top: `${guideRect.top}px`,
            left: `${guideRect.left}px`,
            width: `${guideRect.width}px`,
            height: `${guideRect.height}px`,
          }"
        />

        <div
          class="absolute w-[360px] rounded-xl border border-accent/30 bg-th-base/95 backdrop-blur-sm shadow-2xl p-4 space-y-3"
          :style="{
            top: `${guideTooltipPos.top}px`,
            left: `${guideTooltipPos.left}px`,
          }"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] font-bold uppercase tracking-widest text-th-secondary">Guide interactif</p>
            <button @click="stopGuide" class="text-th-muted hover:text-th-secondary transition text-xs">Fermer</button>
          </div>

          <div v-if="activeGuideStep">
            <p class="text-sm font-semibold text-th-primary">{{ activeGuideStep.title }}</p>
            <p class="text-xs text-th-secondary mt-1 leading-relaxed">{{ activeGuideStep.text }}</p>
          </div>

          <div class="flex items-center justify-between pt-1">
            <span class="text-[11px] text-th-muted">
              Etape {{ Math.min(guideIndex + 1, guideSteps.length) }} / {{ guideSteps.length }}
            </span>
            <div class="flex items-center gap-2">
              <button
                @click="guidePrev"
                :disabled="guideIndex === 0"
                class="rounded-md border border-th-subtle bg-th-card px-2.5 py-1 text-[11px] font-semibold text-th-secondary hover:text-th-primary transition disabled:opacity-40"
              >
                Precedent
              </button>
              <button
                @click="guideNext"
                class="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20 transition"
              >
                {{ guideIndex >= guideSteps.length - 1 ? 'Terminer' : 'Suivant' }}
              </button>
            </div>
          </div>

          <p class="text-[10px] text-th-muted">
            Raccourcis: <span class="font-semibold">←</span> precedent, <span class="font-semibold">→</span> suivant, <span class="font-semibold">Echap</span> fermer
          </p>
        </div>
      </div>

    </template>
  </section>
</template>
