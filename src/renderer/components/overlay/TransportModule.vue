<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { http } from '../../services/http'
import { createOverlayUrls } from '../../config/api'
import type { TransportOrder, ItineraryLine, CargoItem } from '../../../shared/deliveries'
import { usePinnedTransport } from '../../composables/usePinnedTransport'

const props = withDefaults(defineProps<{
  preview?: boolean
  previewOrder?: TransportOrder | null
  interactionMode?: boolean
}>(), {
  preview: false,
  previewOrder: null,
  interactionMode: false,
})

const { pinnedId } = usePinnedTransport()

const order = ref<TransportOrder | null>(props.previewOrder ?? null)
const marketOpps = ref<any[]>([])
let token = ''
let urls: ReturnType<typeof createOverlayUrls> | null = null
let refreshInterval: ReturnType<typeof setInterval> | null = null
const marketOppsEnabled = ref(false)
let marketOppsBudget: number | null = null
const savingStep = ref(false)

async function toggleMarketOppsLocal() {
  marketOppsEnabled.value = !marketOppsEnabled.value
  await window.oneCC.updateSettings({ marketOppsEnabled: marketOppsEnabled.value })
  fetchMarketOpps()
}

watch(
  () => props.previewOrder,
  (value) => {
    if (props.preview) order.value = value ?? null
  },
  { immediate: true },
)

// Re-fetch immédiatement quand l'ordre épinglé change depuis le compagnon
watch(pinnedId, () => {
  if (!props.preview) fetchActiveOrder()
})

const lines = computed<ItineraryLine[]>(() =>
  [...(order.value?.itinerary?.lines ?? [])].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
)

const completedCount  = computed(() => lines.value.filter((l) => l.completed).length)
const progressPercent = computed(() => {
  if (!lines.value.length) return 0
  return Math.round((completedCount.value / lines.value.length) * 100)
})

const nextLeg     = computed<ItineraryLine | null>(() => lines.value.find((l) => !l.completed) ?? null)
const nextNextLeg = computed<ItineraryLine | null>(() => lines.value.filter((l) => !l.completed)[1] ?? null)

const currentStepIndex = computed(() =>
  nextLeg.value ? (nextLeg.value.orderIndex ?? completedCount.value + 1) : lines.value.length
)

// Recharge les opportunités quand le leg courant change
watch(nextLeg, () => {
  if (!props.preview) fetchMarketOpps()
})

function loadOps(leg: ItineraryLine): CargoItem[] {
  return (leg.cargos ?? []).filter((c) => !c.action || c.action === 'load')
}
function unloadOps(leg: ItineraryLine): CargoItem[] {
  return (leg.cargos ?? []).filter((c) => c.action === 'unload')
}
function sumScu(items: CargoItem[]): number {
  return items.reduce((s, c) => s + (Number(c.quantity) || 0), 0)
}

/** Capacité totale = somme du champ cargo de chaque vaisseau de l'ordre. */
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
    if (legIdx < targetIdx) {
      onBoard -= sumScu(unloadOps(leg))
    }
  }
  return Math.max(0, capacity - onBoard)
}

async function fetchMarketOpps() {
  if (!marketOppsEnabled.value) { marketOpps.value = []; return }
  const leg = nextLeg.value
  if (!token || !urls || !leg?.pickup || !leg?.dropoff) { marketOpps.value = []; return }
  const freeScu = freespaceForLeg(leg)
  if (freeScu <= 0) { marketOpps.value = []; return }
  try {
    const { data } = await http.post(
      urls.transports.opportunities,
      JSON.stringify({
        legs: [{ legIndex: leg.orderIndex, fromPoi: leg.pickup, toPoi: leg.dropoff, freeSpace: freeScu, budgetRemaining: marketOppsBudget }],
        limit: 3,
      }),
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    )
    const results: Record<string, any[]> = data?.data ?? {}
    marketOpps.value = results[String(leg.orderIndex)] ?? []
  } catch {
    marketOpps.value = []
  }
}

async function fetchActiveOrder() {
  if (!token || !urls) return
  try {
    // Priorité à l'ordre épinglé
    if (pinnedId.value) {
      try {
        const { data } = await http.get(urls.transports.show(pinnedId.value), {
          headers: { Authorization: `Bearer ${token}` },
        })
        const raw = data?.data ?? data
        const o = (raw?.order ?? raw) as TransportOrder | null
        if (o && o.id) { order.value = o; return }
      } catch {
        // ordre épinglé introuvable → fallback
      }
    }

    // Fallback : premier ordre avec des étapes restantes
    const { data } = await http.get(urls.transports.index, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const raw = data?.data ?? data
    const orders = (Array.isArray(raw) ? raw.filter(Boolean) : [raw].filter(Boolean)) as TransportOrder[]
    order.value =
      orders.find((o) => {
        const l = o.itinerary?.lines ?? []
        return l.length === 0 || l.some((line) => !line.completed)
      }) ??
      orders[0] ??
      null
  } catch {
    // overlay optionnel
  }
}

async function validateCurrentStep() {
  if (props.preview || !token || !urls || !nextLeg.value?.legId || savingStep.value) return

  const currentLegId = nextLeg.value.legId
  savingStep.value = true
  try {
    await http.post(
      urls.transports.progress(currentLegId),
      JSON.stringify({ completed: true }),
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    )
    await fetchActiveOrder()
    await fetchMarketOpps()
    void window.oneCC.refreshOverlayTransport()
  } catch {
    // action silencieuse dans l'overlay
  } finally {
    savingStep.value = false
  }
}

onMounted(async () => {
  if (props.preview) {
    order.value = props.previewOrder ?? null
    return
  }
  try {
    const settings = await window.oneCC.getSettings()
    urls = createOverlayUrls(settings)
    marketOppsEnabled.value = settings.marketOppsEnabled ?? false
    marketOppsBudget = settings.marketOppsBudget ?? null
    const auth = await window.oneCC.overlayAuth()
    token = auth.token
    await fetchActiveOrder()
    await fetchMarketOpps()
    refreshInterval = setInterval(async () => { await fetchActiveOrder(); await fetchMarketOpps() }, 60_000)
  } catch {
    // auth échouée
  }

  window.oneCC.onSettingsUpdate((s: any) => {
    marketOppsEnabled.value = s.marketOppsEnabled ?? false
    marketOppsBudget = s.marketOppsBudget ?? null
    fetchMarketOpps()
  })

  window.oneCC.onTransportRefresh(() => fetchActiveOrder())
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
  window.oneCC.offSettingsUpdate()
  window.oneCC.offTransportRefresh()
})
</script>

<template>
  <!-- ── Ordre actif ─────────────────────────────────────────── -->
  <div
    v-if="order"
    class="relative w-full overflow-hidden rounded-xl border border-white/[0.08] shadow-2xl backdrop-blur-md"
    style="background-color: rgb(from var(--bg-color, #000000) r g b / var(--bg-alpha, 0.65))"
  >
    <!-- Liseré accent en haut -->
    <div class="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent/70 to-transparent" />

    <div class="flex flex-col gap-0 px-3 pb-2.5 pt-2.5">

      <!-- ── En-tête ── -->
      <div class="flex items-center gap-2 mb-2">
        <span class="text-[9px] font-black uppercase tracking-[0.2em] text-accent/50 shrink-0">Transport</span>
        <div class="h-px flex-1 bg-white/[0.05]" />
        <button
          @click="toggleMarketOppsLocal"
          :title="marketOppsEnabled ? 'Désactiver les opportunités de marché' : 'Activer les opportunités de marché'"
          class="shrink-0 flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"
        >
          <svg class="h-2.5 w-2.5" :class="marketOppsEnabled ? 'text-sky-400' : 'text-th-muted'" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
          </svg>
        </button>
        <span class="shrink-0 text-[10px] font-semibold tabular-nums text-th-muted">
          <span class="text-accent/80">{{ currentStepIndex }}</span>
          <span class="text-th-disabled">/{{ lines.length }}</span>
        </span>
      </div>

      <!-- Nom de l'ordre -->
      <p class="mb-2.5 truncate text-[11px] font-bold leading-tight text-th-primary">
        {{ order.name ?? `Ordre #${order.id}` }}
      </p>

      <!-- ── Étape courante ── -->
      <div v-if="nextLeg" class="flex flex-col gap-1.5">

        <!-- Pickup -->
        <div class="flex items-center gap-2">
          <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-th-subtle/60 bg-th-card/70">
            <svg class="h-2.5 w-2.5 text-th-secondary" fill="currentColor" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="3"/>
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[11px] font-semibold text-th-primary">{{ nextLeg.pickupName ?? '—' }}</p>
            <p v-if="nextLeg.pickupSystemName" class="text-[9px] uppercase tracking-widest text-th-muted">
              {{ nextLeg.pickupSystemName }}
            </p>
          </div>
        </div>

        <!-- Ligne verticale + actions cargo -->
        <div class="flex gap-2.5 pl-[9px]">
          <div class="w-px self-stretch bg-th-hover shrink-0" />
          <div class="flex-1 min-w-0 space-y-1 py-0.5">

            <!-- CHARGER -->
            <div
              v-if="loadOps(nextLeg).length"
              class="flex items-start gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-950/50 px-2 py-1.5"
            >
              <svg class="mt-[1px] h-3 w-3 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
              </svg>
              <div class="min-w-0 flex-1">
                <p class="text-[10px] font-bold text-emerald-400">
                  Charger · {{ sumScu(loadOps(nextLeg)) }} SCU
                </p>
                <p class="mt-0.5 truncate text-[10px] text-emerald-300/55 leading-snug">
                  {{ loadOps(nextLeg).map(c => `${c.commodityName} ×${c.quantity}`).join('  ·  ') }}
                </p>
              </div>
            </div>

            <!-- DÉCHARGER -->
            <div
              v-if="unloadOps(nextLeg).length"
              class="flex items-start gap-1.5 rounded-md border border-orange-400/20 bg-orange-950/50 px-2 py-1.5"
            >
              <svg class="mt-[1px] h-3 w-3 shrink-0 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
              </svg>
              <div class="min-w-0 flex-1">
                <p class="text-[10px] font-bold text-orange-400">
                  Décharger · {{ sumScu(unloadOps(nextLeg)) }} SCU
                </p>
                <p class="mt-0.5 truncate text-[10px] text-orange-300/55 leading-snug">
                  {{ unloadOps(nextLeg).map(c => `${c.commodityName} ×${c.quantity}`).join('  ·  ') }}
                </p>
              </div>
            </div>

            <!-- Aucune marchandise -->
            <p v-if="!nextLeg.cargos?.length" class="text-[10px] italic text-th-disabled py-0.5 pl-0.5">
              Aucun cargo défini
            </p>
          </div>
        </div>

        <!-- Dropoff -->
        <div v-if="nextLeg.dropoffName" class="flex items-center gap-2">
          <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-accent/30 bg-accent/10">
            <svg class="h-2.5 w-2.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[11px] font-semibold text-accent">{{ nextLeg.dropoffName }}</p>
            <p v-if="nextLeg.dropoffSystemName" class="text-[9px] uppercase tracking-widest text-th-muted">
              {{ nextLeg.dropoffSystemName }}
            </p>
          </div>
        </div>

        <!-- ── Opportunités de marché ── -->
        <div v-if="marketOpps.length" class="mt-0.5 space-y-1">
          <div class="flex items-center gap-1.5">
            <svg class="h-2.5 w-2.5 shrink-0 text-sky-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
            </svg>
            <span class="text-[9px] font-bold uppercase tracking-widest text-sky-400/60">Marché</span>
          </div>
          <div
            v-for="(opp, i) in marketOpps"
            :key="i"
            class="flex items-center justify-between gap-2 rounded border border-sky-400/10 bg-sky-950/30 px-2 py-1"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-[10px] font-semibold text-th-primary">{{ opp.commodityName ?? '—' }}</p>
              <p class="truncate text-[9px] text-th-muted">
                {{ opp.depTerminalName ?? '?' }} → {{ opp.arrTerminalName ?? '?' }}
              </p>
            </div>
            <div class="shrink-0 text-right">
              <p class="text-[10px] font-bold text-emerald-300">+{{ (opp.profitPerUnit ?? 0).toLocaleString('fr-FR') }} cr/u</p>
              <p v-if="opp.maxQty" class="text-[9px] text-th-muted">{{ opp.maxQty }} SCU</p>
            </div>
          </div>
        </div>

      </div>

      <!-- ── Itinéraire terminé ── -->
      <div v-else-if="lines.length > 0" class="flex flex-1 items-center justify-center">
        <div class="text-center">
          <p class="text-2xl font-black text-emerald-400">✓</p>
          <p class="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/50 mt-1">Terminé</p>
        </div>
      </div>

      <!-- ── Pied : next hint + progress ── -->
      <div class="space-y-1.5 pt-2">
        <button
          v-if="nextLeg && !preview && interactionMode"
          class="w-full rounded-md border border-accent/35 bg-accent/15 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="savingStep"
          @click="validateCurrentStep"
        >
          {{ savingStep ? 'Validation…' : 'Valider et passer a l\'etape suivante' }}
        </button>

        <!-- Hint prochaine étape -->
        <div v-if="nextNextLeg" class="flex items-center gap-1.5">
          <span class="shrink-0 text-[9px] uppercase tracking-widest text-th-disabled">suivant</span>
          <div class="h-px flex-1 bg-th-card" />
          <span class="max-w-[130px] truncate text-[10px] text-th-muted">{{ nextNextLeg.pickupName }}</span>
        </div>

        <!-- Barre de progression -->
        <div class="flex items-center gap-2">
          <div class="relative h-[3px] flex-1 overflow-hidden rounded-full bg-th-card">
            <div
              class="h-full rounded-full transition-all duration-700"
              :style="{
                width: progressPercent + '%',
                background: 'linear-gradient(to right, rgba(var(--accent-rgb), 0.6), rgb(var(--accent-rgb)))',
                boxShadow: 'var(--shadow-glow)',
              }"
            />
          </div>
          <span class="shrink-0 text-[10px] font-bold tabular-nums text-accent/60">{{ progressPercent }}%</span>
        </div>
      </div>

    </div>
  </div>

  <!-- ── Aucun ordre ─────────────────────────────────────────── -->
  <div
    v-else
    class="w-full rounded-xl border border-white/10 backdrop-blur-sm px-3 py-2.5 shadow-xl"
    style="background-color: rgb(from var(--bg-color, #000000) r g b / var(--bg-alpha, 0.65))"
  >
    <div class="flex items-center gap-2">
      <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-th-muted bg-th-card">
        <svg class="h-2.5 w-2.5 text-th-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
        </svg>
      </div>
      <span class="text-[11px] font-semibold uppercase tracking-wider text-th-muted">Aucun transport</span>
    </div>
  </div>
</template>
