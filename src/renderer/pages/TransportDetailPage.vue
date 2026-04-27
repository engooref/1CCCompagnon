<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'
import { useMercure } from '../composables/useMercure'
import { CargoItem, ItineraryLine, TransportOrder } from '../../shared/deliveries'
import { usePinnedTransport } from '../composables/usePinnedTransport'

// ─── State ────────────────────────────────────────────────────────────────────

const app    = useAppStore()
const route  = useRoute()
const router = useRouter()

const { connected: liveConnected, sseError, connect: connectMercure } = useMercure()
const { isPinned, toggle: togglePin } = usePinnedTransport()

const order     = ref<TransportOrder | null>(null)
const loading   = ref(false)
const error     = ref<string | null>(null)
const deleting  = ref(false)
const savingLeg = ref<string | null>(null)
const expandedLegs = ref(new Set<string | number>())
const generatingItinerary = ref(false)

// ─── Market Opportunities ──────────────────────────────────────────────────
const showMarketOpp    = ref(false)
const marketBudget     = ref<number | null>(null)
const legOpportunities = ref(new Map<string | number, any[]>())
const loadingOpp       = ref(false)

const orderId = computed(() => Number(route.params.id))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urls = computed(() => app.settings ? createOverlayUrls(app.settings) : null)

function authHeaders() {
  return { Authorization: `Bearer ${app.bearerToken}` }
}

function legKey(leg: ItineraryLine): string | number | null {
  return leg.legId ?? leg.orderIndex ?? null
}

function getOps(leg: ItineraryLine): CargoItem[] { return leg.cargos ?? [] }
function loadOps(leg: ItineraryLine):   CargoItem[] { return getOps(leg).filter(m => !m.action || m.action === 'load') }
function unloadOps(leg: ItineraryLine): CargoItem[] { return getOps(leg).filter(m => m.action === 'unload') }
function sumScu(items: CargoItem[]): number { return items.reduce((s, m) => s + (Number(m.quantity) || 0), 0) }

/** Capacité totale de cargaison = somme du champ cargo de chaque vaisseau de l'ordre. */
const shipCapacity = computed(() =>
  (order.value?.ships ?? []).reduce((s, ship) => s + (Number(ship.cargo) || 0), 0)
)

/** Espace libre pendant le trajet du leg : capacité − cargo chargé à bord (y compris le chargement de ce leg). */
function freespaceForLeg(targetLeg: ItineraryLine): number {
  const capacity = shipCapacity.value
  const targetIdx = targetLeg.orderIndex ?? 0
  let onBoard = 0
  for (const leg of lines.value) {
    const legIdx = leg.orderIndex ?? 0
    if (legIdx > targetIdx) break
    onBoard += sumScu(loadOps(leg))
    // Les déchargements se font à l'arrivée, donc après le trajet — ne pas les compter pour la leg cible
    if (legIdx < targetIdx) {
      onBoard -= sumScu(unloadOps(leg))
    }
  }
  return Math.max(0, capacity - onBoard)
}

function isExpanded(leg: ItineraryLine): boolean {
  const k = legKey(leg)
  return k != null && expandedLegs.value.has(k)
}

function legOpps(leg: ItineraryLine): any[] {
  const k = legKey(leg)
  return k != null ? (legOpportunities.value.get(k) ?? []) : []
}

function toggleExpand(leg: ItineraryLine) {
  const k = legKey(leg)
  if (k == null) return
  if (expandedLegs.value.has(k)) {
    expandedLegs.value.delete(k)
  } else {
    expandedLegs.value.add(k)
  }
}

async function fetchAllOpportunities() {
  if (!app.bearerToken || !urls.value) return
  if (shipCapacity.value <= 0) { legOpportunities.value.clear(); return }

  // Build ordered list of valid legs (with pickup + dropoff) and retain their keys
  const indexed = lines.value
    .map(leg => ({ leg, key: legKey(leg) }))
    .filter(({ leg, key }) => key != null && leg.pickup && leg.dropoff) as
      { leg: ItineraryLine; key: string | number }[]

  if (!indexed.length) return

  loadingOpp.value = true
  try {
    const { data } = await http.post(
      urls.value.transports.opportunities,
      JSON.stringify({
        legs: indexed.map(({ leg }) => ({
          legIndex:        leg.orderIndex,
          fromPoi:         leg.pickup,
          toPoi:           leg.dropoff,
          freeSpace:       freespaceForLeg(leg),
          budgetRemaining: marketBudget.value,
        })),
        limit: 20,
      }),
      { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
    )
    const results: Record<string, any[]> = data?.data ?? {}
    legOpportunities.value.clear()
    indexed.forEach(({ key, leg }) => {
      legOpportunities.value.set(key, results[String(leg.orderIndex)] ?? [])
    })
  } catch {
    legOpportunities.value.clear()
  } finally {
    loadingOpp.value = false
  }
}

async function toggleMarketOpp() {
  if (!urls.value || !app.bearerToken) return
  const next = !showMarketOpp.value
  showMarketOpp.value = next
  try {
    await http.post(
      urls.value.transports.settings(orderId.value),
      JSON.stringify({ marketOpportunitiesEnabled: next }),
      { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
    )
  } catch { /* silent */ }
  if (!next) {
    legOpportunities.value.clear()
  } else {
    fetchAllOpportunities()
  }
}

async function saveMarketBudget() {
  if (!urls.value || !app.bearerToken) return
  try {
    await http.post(
      urls.value.transports.settings(orderId.value),
      JSON.stringify({ marketBudget: marketBudget.value }),
      { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
    )
  } catch { /* silent */ }
}

watch(order, (o) => {
  if (!o) return
  showMarketOpp.value = o.marketOpportunitiesEnabled ?? false
  marketBudget.value  = o.marketBudget ?? null
})

watch([order, marketBudget], () => {
  if (!showMarketOpp.value) return
  fetchAllOpportunities()
})

function formatDate(raw: string | undefined): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Computed ─────────────────────────────────────────────────────────────────

const lines = computed<ItineraryLine[]>(() =>
  [...(order.value?.itinerary?.lines ?? [])].sort(
    (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
  )
)

const completedCount  = computed(() => lines.value.filter(l => l.completed).length)
const progressPercent = computed(() => {
  if (!lines.value.length) return 0
  return Math.round((completedCount.value / lines.value.length) * 100)
})

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchOrder() {
  if (!app.bearerToken || !urls.value) return
  loading.value = true
  error.value = null
  try {
    const { data } = await http.get(urls.value.transports.show(orderId.value), {
      headers: authHeaders()
    })
    const raw = data?.data ?? data
    order.value = (raw?.order ?? raw) as TransportOrder | null

    connectMercure(
      urls.value.transports.mercureInfo,
      `Bearer ${app.bearerToken}`,
      async (_payload) => {
        const { data } = await http.get(urls.value!.transports.show(orderId.value), {
          headers: authHeaders()
        })
        const raw = data?.data ?? data
        order.value = (raw?.order ?? raw) as TransportOrder | null
      },
    )
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e?.message ?? 'Erreur de chargement'
  } finally {
    loading.value = false
  }
}

async function deleteOrder() {
  if (!app.bearerToken || !urls.value || !order.value) return
  if (!confirm(`Supprimer l'ordre "${order.value.name}" ? Cette action est irréversible.`)) return

  deleting.value = true
  try {
    await http.delete(urls.value.transports.show(orderId.value), {
      headers: authHeaders()
    })
    app.transportsLoaded = false
    router.push({ name: 'transport' })
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e?.message ?? 'Erreur lors de la suppression'
  } finally {
    deleting.value = false
  }
}

async function toggleLeg(leg: ItineraryLine) {
  if (!app.bearerToken || !order.value || !urls.value) return
  if (leg.legId == null) return

  savingLeg.value = String(leg.legId)
  const next = !leg.completed
  try {
    await http.post(
      urls.value.transports.progress(leg.legId),
      JSON.stringify({ completed: next }),
      { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
    )
    leg.completed = next
    window.oneCC.refreshOverlayTransport()
  } catch {
    // silently ignore
  } finally {
    savingLeg.value = null
  }
}

onMounted(() => {
  if (app.status.authReady) fetchOrder()
})

onUnmounted(() => {
  // Invalider le cache pour forcer un rechargement de la liste
  // (le statut obsolete peut avoir changé depuis la dernière fetch de liste)
  app.transportsLoaded = false
})

async function generateItinerary() {
  if (!app.bearerToken || !urls.value || !order.value) return
  generatingItinerary.value = true
  try {
    await http.post(
      urls.value.transports.generate(orderId.value),
      {},
      { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
    )
    await fetchOrder()
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e?.message ?? 'Erreur lors de la génération'
  } finally {
    generatingItinerary.value = false
  }
}
</script>

<template>
  <section class="h-full flex flex-col gap-4">

    <!-- Back + title -->
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

      <div class="flex items-center gap-2 min-w-0">
        <div class="h-7 w-7 shrink-0 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center">
          <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/>
          </svg>
        </div>
        <span class="text-sm font-bold truncate text-th-primary">
          {{ order?.name ?? `Ordre #${orderId}` }}
        </span>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <button
          @click="router.push({ name: 'transport-edit', params: { id: orderId } })"
          class="flex items-center gap-1.5 rounded-md border border-th-subtle bg-th-card px-2.5 py-1 text-xs font-medium text-th-secondary hover:text-th-primary hover:border-th-subtle transition"
          title="Modifier l'ordre"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Modifier
        </button>
        <button
          @click="deleteOrder"
          :disabled="deleting"
          class="flex items-center gap-1.5 rounded-md border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-400/15 hover:border-rose-400/50 transition disabled:opacity-50"
          title="Supprimer l'ordre"
        >
          <svg v-if="deleting" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Supprimer
        </button>
        <button
          @click="togglePin(orderId)"
          class="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition"
          :class="isPinned(orderId)
            ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/15'
            : 'border-th-subtle bg-th-card text-th-secondary hover:text-accent hover:border-accent/30'"
          :title="isPinned(orderId) ? 'Désépingler de l\'overlay' : 'Épingler dans l\'overlay'"
        >
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
          </svg>
          {{ isPinned(orderId) ? 'Épinglé dans l\'overlay' : 'Épingler dans l\'overlay' }}
        </button>
        <span
          v-if="loading"
          class="inline-flex items-center gap-1 rounded-full border border-th-subtle bg-th-card px-2 py-0.5 text-[11px] font-semibold text-th-muted"
        >
          <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Chargement
        </span>
        <span
          v-else-if="liveConnected"
          class="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"
          title="Mises à jour en temps réel actives"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"/>
          EN DIRECT
        </span>
        <span
          v-else-if="sseError"
          class="inline-flex items-center gap-1 rounded-full border border-rose-400/25 bg-rose-400/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300"
          :title="sseError"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-rose-400"/>
          HORS LIGNE
        </span>
      </div>
    </div>

    <!-- Loading / Error -->
    <div v-if="loading && !order" class="rounded-lg border border-accent/10 bg-black/20 p-4 text-sm text-th-muted">
      Chargement…
    </div>

    <div v-else-if="error" class="rounded-lg border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-300">
      <span class="font-semibold">Erreur :</span> {{ error }}
    </div>

    <template v-else-if="order">

      <!-- Order summary card -->
      <div class="shrink-0 rounded-lg border border-accent/20 bg-black/20 p-4">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="min-w-0">
            <p v-if="order.originName" class="text-xs text-th-muted">
              Départ : <span class="text-th-secondary">{{ order.originName }}</span>
              <span v-if="order.originSystemName" class="text-th-muted"> · {{ order.originSystemName }}</span>
            </p>
          </div>
          <span
            v-if="order.itinerary?.obsolete"
            class="shrink-0 inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300"
          >Obsolète</span>
          <span
            v-else-if="order.itinerary"
            class="shrink-0 inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-400/8 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"
          >Valide</span>
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-th-muted mb-3">
          <span><span class="text-th-secondary font-medium">{{ lines.length }}</span> étape(s)</span>
          <span><span class="text-th-secondary font-medium">{{ order.ships?.length ?? 0 }}</span> vaisseau(x)</span>
          <div class="ml-auto flex items-center gap-2">
            <span v-if="order.itinerary?.generatedAt" class="text-th-muted">
              Généré : {{ formatDate(order.itinerary.generatedAt) }}
            </span>
            <button
              v-if="order.itinerary?.obsolete || !order.itinerary?.generatedAt"
              @click="generateItinerary"
              :disabled="generatingItinerary"
              class="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition disabled:opacity-40"
              :class="order.itinerary?.obsolete
                ? 'border-rose-400/30 bg-rose-400/5 text-rose-300 hover:bg-rose-400/10'
                : 'border-accent/20 bg-accent/5 text-accent hover:bg-accent/10'"
            >
              <svg v-if="generatingItinerary" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <svg v-else-if="order.itinerary?.obsolete" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              {{ generatingItinerary ? 'Génération…' : order.itinerary?.obsolete ? 'Régénérer' : 'Générer l\'itinéraire' }}
            </button>
          </div>
        </div>

        <!-- Ships list -->
        <div v-if="order.ships?.length" class="mb-3">
          <p class="text-[10px] font-bold uppercase tracking-wider text-th-muted mb-1.5">Vaisseaux</p>
          <div class="space-y-1">
            <div
              v-for="(ship, i) in order.ships"
              :key="ship.shipId ?? i"
              class="flex items-start gap-2 rounded-md border border-th-muted bg-th-card px-2.5 py-1.5"
            >
              <svg class="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
              <div class="min-w-0 flex-1">
                <span class="text-xs font-semibold text-th-primary">{{ ship.shipName ?? '—' }}</span>
                <p v-if="ship.note" class="mt-0.5 text-[11px] text-th-muted leading-snug">{{ ship.note }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Progress bar -->
        <div>
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="text-th-muted">Progression</span>
            <span class="font-semibold text-accent">
              {{ completedCount }}/{{ lines.length }}
              <span class="text-th-muted font-normal ml-1">({{ progressPercent }}%)</span>
            </span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-th-card">
            <div
              class="h-full rounded-full bg-gradient-to-r from-accent to-accent/70 transition-all duration-500 shadow-[0_0_6px_rgba(var(--accent-rgb),0.35)]"
              :style="{ width: progressPercent + '%' }"
            />
          </div>
        </div>

        <!-- Market opportunities toggle -->
        <div class="mt-3 pt-3 border-t border-white/[0.05]">
          <div class="flex items-center justify-between gap-3">
            <label class="flex items-center gap-2 cursor-pointer select-none" @click.prevent="toggleMarketOpp">
              <div class="relative shrink-0 w-8 h-4">
                <div class="w-8 h-4 rounded-full transition-colors" :class="showMarketOpp ? 'bg-sky-500' : 'bg-th-card'"/>
                <div
                  class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform"
                  :class="showMarketOpp ? 'translate-x-4' : 'translate-x-0'"
                />
              </div>
              <span class="text-xs font-medium" :class="showMarketOpp ? 'text-sky-300' : 'text-th-muted'">
                Opportunités de marché
              </span>
            </label>
            <button
              v-if="showMarketOpp"
              @click.stop="fetchAllOpportunities()"
              :disabled="loadingOpp"
              class="flex items-center gap-1 rounded border border-sky-400/20 bg-sky-400/8 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-sky-400/15 transition disabled:opacity-40"
            >
              <svg class="w-2.5 h-2.5" :class="{ 'animate-spin': loadingOpp }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Actualiser
            </button>
          </div>

          <div v-if="showMarketOpp" class="mt-2 flex items-center gap-1.5">
            <span class="text-[11px] text-th-muted">Budget</span>
            <input
              type="number" min="0"
              :value="marketBudget ?? ''"
              @input="marketBudget = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)"
              @change="saveMarketBudget"
              @keydown.enter="saveMarketBudget"
              class="w-28 rounded border border-th-subtle bg-th-card px-2 py-0.5 text-xs text-th-primary focus:outline-none focus:border-emerald-400/50"
              placeholder="optionnel"
            />
            <span class="text-[11px] text-th-muted">cr</span>
          </div>
        </div>
      </div>

      <!-- Itinerary -->
      <div class="flex-1 min-h-0 overflow-y-auto space-y-2">
        <p class="text-[11px] font-semibold uppercase tracking-widest text-th-muted px-0.5">Itinéraire</p>

        <div v-if="!lines.length" class="rounded-lg border border-dashed border-th-subtle p-4 text-center text-sm text-th-muted">
          Aucune étape dans l'itinéraire.
        </div>

        <div
          v-for="(leg, idx) in lines"
          :key="legKey(leg) ?? idx"
          class="rounded-lg border transition-colors overflow-hidden"
          :class="leg.completed ? 'border-emerald-400/15 bg-emerald-400/[0.04]' : 'border-accent/15 bg-black/25'"
        >
          <!-- Leg header -->
          <div
            class="flex items-start gap-3 px-3 py-2.5 cursor-pointer select-none"
            @click="toggleExpand(leg)"
          >
            <!-- Step number -->
            <div
              class="mt-0.5 shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-xs font-extrabold border transition-colors"
              :class="leg.completed
                ? 'bg-emerald-400/10 border-emerald-400/25 text-emerald-300'
                : 'bg-th-card border-th-subtle text-th-secondary'"
            >
              <svg v-if="leg.completed" class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd"
                      d="M16.704 5.29a1 1 0 00-1.408-1.418l-7.057 6.99L4.704 8.29A1 1 0 003.296 9.71l4 3.96a1 1 0 001.408 0l7-6.38z"
                      clip-rule="evenodd"/>
              </svg>
              <span v-else>{{ leg.orderIndex ?? idx + 1 }}</span>
            </div>

            <!-- From → To -->
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  class="text-sm font-semibold truncate transition-colors"
                  :class="leg.completed ? 'text-th-muted line-through' : 'text-th-primary'"
                >
                  {{ leg.pickupName ?? '—' }}
                </span>
                <span v-if="leg.pickupSystemName" class="text-[10px] px-1.5 py-0.5 rounded-full bg-th-card text-th-muted">
                  {{ leg.pickupSystemName }}
                </span>
              </div>

              <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                <svg class="w-3 h-3 text-th-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                </svg>
                <span
                  class="text-xs truncate"
                  :class="leg.dropoffName ? 'text-accent/80' : 'text-emerald-400/80 font-semibold'"
                >
                  {{ leg.dropoffName ?? '✓ Fin de l\'itinéraire' }}
                </span>
                <span v-if="leg.dropoffName && leg.dropoffSystemName" class="text-[10px] px-1.5 py-0.5 rounded-full bg-th-card text-th-muted">
                  {{ leg.dropoffSystemName }}
                </span>
              </div>

              <!-- Cargo badges -->
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                <span
                  v-if="unloadOps(leg).length"
                  class="inline-flex items-center gap-1 rounded-md border border-orange-400/20 bg-orange-400/8 px-2 py-0.5 text-[11px] font-semibold text-orange-300"
                >
                  <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
                  </svg>
                  Décharger · {{ sumScu(unloadOps(leg)) }} SCU
                </span>
                <span
                  v-if="loadOps(leg).length"
                  class="inline-flex items-center gap-1 rounded-md border border-emerald-400/20 bg-emerald-400/8 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"
                >
                  <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
                  </svg>
                  Charger · {{ sumScu(loadOps(leg)) }} SCU
                </span>
              </div>
            </div>

            <!-- Complete toggle + chevron -->
            <div class="shrink-0 flex items-center gap-2 mt-0.5" @click.stop>
              <button
                @click="toggleLeg(leg)"
                :disabled="savingLeg === String(leg.legId)"
                class="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
                :class="leg.completed
                  ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15'
                  : 'border-th-subtle bg-th-card text-th-secondary hover:border-accent/30 hover:text-accent'"
              >
                <svg v-if="savingLeg === String(leg.legId)" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <span v-else-if="leg.completed">✓ Fait</span>
                <span v-else>Faire</span>
              </button>

              <svg
                class="w-3.5 h-3.5 text-th-muted transition-transform duration-150 hover:text-th-secondary"
                :class="{ '-rotate-180': isExpanded(leg) }"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </div>
          </div>

          <!-- Market opportunities for this leg -->
          <div
            v-if="isExpanded(leg) && showMarketOpp && leg.pickup && leg.dropoff"
            class="border-t border-sky-400/10 bg-sky-950/15"
          >
            <div class="px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                <svg class="w-3 h-3 text-sky-400/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                </svg>
                <span class="text-[10px] font-bold uppercase tracking-widest text-sky-300/80">Opportunités de marché</span>
                <span v-if="loadingOpp" class="text-[10px] text-th-muted italic">chargement…</span>
                <span
                  v-else-if="legOpps(leg).length > 0"
                  class="text-[10px] text-sky-400/60"
                >{{ legOpps(leg).length }} option(s)</span>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="freespaceForLeg(leg) > 0" class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">
                  Libre : <strong class="text-sky-300 ml-1">{{ freespaceForLeg(leg) }} SCU</strong>
                </span>
                <span v-if="marketBudget != null" class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">
                  Budget : <strong class="text-emerald-300 ml-1">{{ marketBudget.toLocaleString('fr-FR') }} cr</strong>
                </span>
              </div>
            </div>

            <!-- No results / rows -->
            <div v-if="!loadingOpp" class="px-3 pb-2">
              <div
                v-if="!legOpps(leg).length"
                class="text-[11px] text-th-muted italic"
              >
                {{ shipCapacity <= 0 ? 'Aucun vaisseau avec cargaison définie.' : 'Aucune opportunité trouvée pour ce trajet.' }}
              </div>

              <!-- Opportunity rows -->
              <div
                v-for="(opp, oi) in legOpps(leg)"
                :key="opp.commodityId ?? oi"
                class="flex items-start justify-between gap-3 py-1.5 text-xs border-t border-sky-400/[0.08] first:border-0"
              >
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-th-primary truncate">{{ opp.commodityName ?? '—' }}</p>
                  <p class="text-[11px] text-th-muted truncate mt-0.5">
                    <span class="text-sky-300/70">{{ opp.depTerminalName ?? '?' }}</span>
                    <span class="mx-1 text-th-muted">→</span>
                    <span class="text-accent/70">{{ opp.arrTerminalName ?? '?' }}</span>
                  </p>
                  <p class="text-[11px] text-th-muted mt-0.5">
                    Achat {{ (opp.buyPrice ?? 0).toLocaleString('fr-FR') }} cr
                    · Vente {{ (opp.sellPrice ?? 0).toLocaleString('fr-FR') }} cr
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="font-bold text-emerald-300 text-xs">
                    +{{ (opp.profitPerUnit ?? 0).toLocaleString('fr-FR') }} cr/u
                  </p>
                  <p v-if="opp.maxQty" class="text-[11px] text-th-muted mt-0.5">
                    max {{ opp.maxQty }} SCU
                  </p>
                  <p v-if="opp.profitTotal" class="text-[11px] text-emerald-400/70 mt-0.5">
                    ≈ {{ (opp.profitTotal).toLocaleString('fr-FR') }} cr
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Expanded cargo detail -->
          <div v-if="isExpanded(leg)" class="border-t border-white/[0.05] grid grid-cols-2 divide-x divide-white/[0.05]">

            <!-- Unload -->
            <div class="px-3 py-2">
              <p class="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-orange-400/70">
                Décharger <span class="ml-1 font-normal text-orange-400/50">{{ sumScu(unloadOps(leg)) }} SCU</span>
              </p>
              <div v-if="!unloadOps(leg).length" class="text-xs text-th-muted italic">— rien —</div>
              <div
                v-for="(item, i) in unloadOps(leg)"
                :key="item.id ?? i"
                class="flex items-start justify-between gap-2 py-1 text-xs border-t border-orange-400/[0.07] first:border-0"
              >
                <div class="min-w-0">
                  <p class="font-medium text-th-primary truncate">{{ item.commodityName ?? '—' }}</p>
                  <p v-if="item.dropoffPoiName" class="text-th-muted truncate">→ {{ item.dropoffPoiName }}</p>
                </div>
                <span class="shrink-0 font-bold text-orange-300">{{ item.quantity ?? '—' }}</span>
              </div>
            </div>

            <!-- Load -->
            <div class="px-3 py-2">
              <p class="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400/70">
                Charger <span class="ml-1 font-normal text-emerald-400/50">{{ sumScu(loadOps(leg)) }} SCU</span>
              </p>
              <div v-if="!loadOps(leg).length" class="text-xs text-th-muted italic">— rien —</div>
              <div
                v-for="(item, i) in loadOps(leg)"
                :key="item.id ?? i"
                class="flex items-start justify-between gap-2 py-1 text-xs border-t border-emerald-400/[0.07] first:border-0"
              >
                <div class="min-w-0">
                  <p class="font-medium text-th-primary truncate">{{ item.commodityName ?? '—' }}</p>
                  <p v-if="item.pickupPoiName" class="text-th-muted truncate">← {{ item.pickupPoiName }}</p>
                </div>
                <span class="shrink-0 font-bold text-emerald-300">{{ item.quantity ?? '—' }}</span>
              </div>
            </div>

          </div>
        </div>
      </div>

    </template>

  </section>
</template>
