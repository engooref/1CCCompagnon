<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'
import { TransportOrder } from '../../shared/deliveries'
import { usePinnedTransport } from '../composables/usePinnedTransport'

// ─── State ────────────────────────────────────────────────────────────────────

const app    = useAppStore()
const route = useRoute()
const router = useRouter()
const { isPinned, toggle: togglePin } = usePinnedTransport()

const orders     = computed(() => app.transports)
const loading    = computed(() => app.transportsLoading)
const deletingId = ref<number | null>(null)

// ─── Guide interactif liste work orders ─────────────────────────────────────

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

const showGuide = ref(false)
const guideIndex = ref(0)
const guideRect = ref<GuideRect | null>(null)
const guideTooltipPos = ref<GuideTooltipPos>({ top: 24, left: 24 })
const guideSteps = ref<GuideStep[]>([])
const guideRaf = ref<number | null>(null)

const guideCatalog: GuideStep[] = [
  {
    id: 'header',
    selector: '[data-guide="transport-header"]',
    title: 'Module work orders',
    text: 'Ici tu geres la liste complete de tes work orders de transport.',
  },
  {
    id: 'refresh',
    selector: '[data-guide="refresh"]',
    title: 'Actualiser la liste',
    text: 'Ce bouton recharge les work orders depuis le serveur.',
  },
  {
    id: 'new-order',
    selector: '[data-guide="new-order"]',
    title: 'Ajouter un work order',
    text: 'Clique ici pour ouvrir le formulaire de creation d\'un nouveau work order.',
  },
  {
    id: 'list',
    selector: '[data-guide="workorder-list"]',
    title: 'Liste des work orders',
    text: 'Cette zone affiche tous tes work orders. Clique sur une ligne pour ouvrir son detail.',
  },
  {
    id: 'card',
    selector: '[data-guide="workorder-card"]',
    title: 'Une ligne work order',
    text: 'Chaque ligne montre le nom, le statut, les etapes et la progression.',
  },
  {
    id: 'actions',
    selector: '[data-guide="workorder-actions"]',
    title: 'Actions rapides',
    text: 'Tu peux epingler, modifier ou supprimer un work order directement depuis ici.',
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

function startGuideList() {
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

onMounted(() => {
  window.addEventListener('resize', scheduleGuideRectRefresh)
  window.addEventListener('keydown', handleGuideKeydown)
  if (route.hash === '#guide-list') startGuideList()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleGuideRectRefresh)
  window.removeEventListener('keydown', handleGuideKeydown)
  if (guideRaf.value != null) cancelAnimationFrame(guideRaf.value)
})

watch(() => route.hash, (hash) => {
  if (hash === '#guide-list') startGuideList()
})

watch(() => guideIndex.value, () => {
  scheduleGuideRectRefresh()
})

watch(() => orders.value.length, () => {
  if (showGuide.value) scheduleGuideRectRefresh()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urls = computed(() => app.settings ? createOverlayUrls(app.settings) : null)

function authHeaders() {
  return { Authorization: `Bearer ${app.bearerToken}` }
}

function orderProgress(order: TransportOrder): number {
  const lines = order.itinerary?.lines ?? []
  if (!lines.length) return 0
  return Math.round((lines.filter(l => l.completed).length / lines.length) * 100)
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function deleteOrder(order: TransportOrder, e: MouseEvent) {
  e.stopPropagation()
  if (!confirm(`Supprimer « ${order.name ?? `Ordre #${order.id}` } » ?`)) return
  const url = urls.value?.transports.show(order.id)
  if (!url) return
  deletingId.value = order.id
  try {
    await http.delete(url, { headers: authHeaders() })
  } finally {
    deletingId.value = null
    await app.fetchTransports()
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

      <!-- ── Header bar ─────────────────────────────────────────────────── -->
      <div data-guide="transport-header" class="shrink-0 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <div class="h-7 w-7 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/>
            </svg>
          </div>
          <span class="text-xs font-semibold uppercase tracking-widest text-th-secondary">
            Transports
            <span v-if="orders.length" class="ml-1 font-normal text-th-muted">({{ orders.length }})</span>
          </span>
        </div>

        <button
          data-guide="refresh"
          @click="app.fetchTransports()"
          :disabled="loading"
          class="flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent/70 hover:bg-accent/10 hover:text-accent transition disabled:opacity-40"
        >
          <svg class="w-3 h-3" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Actualiser
        </button>

        <button
          data-guide="new-order"
          @click="router.push({ name: 'transport-new' })"
          class="flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-400/8 px-2.5 py-1 text-xs font-medium text-emerald-300/80 hover:bg-emerald-400/12 hover:text-emerald-200 transition"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Nouvel ordre
        </button>

        <button
          @click="startGuideList"
          class="flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/8 px-2.5 py-1 text-xs font-medium text-accent/80 hover:bg-accent/15 hover:text-accent transition"
          title="Guide de la liste des work orders"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.55-1.165 1.83-2 3.272-2 1.934 0 3.5 1.343 3.5 3 0 1.236-.87 2.298-2.104 2.762-.67.252-1.146.85-1.146 1.567V15M12 18h.01"/>
          </svg>
          Guide liste
        </button>
      </div>

      <!-- ── Scrollable content ────────────────────────────────────────── -->
      <div @scroll.passive="scheduleGuideRectRefresh" class="flex-1 min-h-0 overflow-y-auto">

      <!-- ── Loading / Error / Empty ────────────────────────────────────── -->
      <div v-if="loading && !orders.length" class="rounded-lg border border-accent/10 bg-black/20 p-4 text-sm text-th-muted">
        Chargement des ordres…
      </div>

      <div
        v-else-if="!orders.length"
        class="rounded-lg border border-dashed border-accent/15 bg-black/10 p-6 text-center text-sm text-th-muted"
      >
        Aucun ordre de transport.
      </div>

      <!-- ── Orders list ────────────────────────────────────────────────── -->
      <div v-else data-guide="workorder-list" class="space-y-2">
        <div
          v-for="order in orders"
          :key="order.id"
          :data-guide="order.id === orders[0]?.id ? 'workorder-card' : undefined"
          class="group rounded-lg border border-accent/20 bg-black/20 p-4 cursor-pointer hover:border-accent/40 hover:bg-black/30 transition-colors"
          @click="router.push({ name: 'transport-detail', params: { id: order.id } })"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-0.5">
                <p class="text-sm font-bold truncate text-th-primary group-hover:text-accent transition-colors">
                  {{ order.name ?? `Ordre #${order.id}` }}
                </p>
                <span
                  v-if="isPinned(order.id)"
                  class="shrink-0 inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent"
                >
                  <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                  </svg>
                  Overlay
                </span>
                <span
                  v-if="order.itinerary?.obsolete"
                  class="shrink-0 inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300"
                >Obsolète</span>
                <span
                  v-else-if="order.itinerary"
                  class="shrink-0 inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-400/8 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
                >Valide</span>
              </div>

              <p v-if="order.originName" class="text-xs text-th-muted">
                Départ : <span class="text-th-secondary">{{ order.originName }}</span>
                <span v-if="order.originSystemName" class="text-th-muted"> · {{ order.originSystemName }}</span>
              </p>

              <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-th-muted">
                <span><span class="text-th-secondary font-medium">{{ order.itinerary?.lines?.length ?? 0 }}</span> étape(s)</span>
                <span><span class="text-th-secondary font-medium">{{ order.shipsCount ?? 0 }}</span> vaisseau(x)</span>
              </div>

              <!-- Progress bar -->
              <div v-if="order.itinerary?.lines?.length" class="mt-2">
                <div class="h-1 w-full overflow-hidden rounded-full bg-th-card">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-accent to-accent/70 transition-all duration-500"
                    :style="{ width: orderProgress(order) + '%' }"
                  />
                </div>
                <p class="mt-0.5 text-right text-[10px] text-th-muted">{{ orderProgress(order) }}%</p>
              </div>
            </div>

            <!-- Pin + Edit + Delete + Chevron -->
            <div :data-guide="order.id === orders[0]?.id ? 'workorder-actions' : undefined" class="shrink-0 flex items-center gap-1 mt-0.5" @click.stop>
              <button
                @click="togglePin(order.id)"
                class="rounded border p-1 transition"
                :class="isPinned(order.id)
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-th-subtle bg-th-card text-th-muted hover:text-accent hover:border-accent/30'"
                :title="isPinned(order.id) ? 'Désépingler de l\'overlay' : 'Épingler dans l\'overlay'"
              >
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                </svg>
              </button>
              <button
                @click="router.push({ name: 'transport-edit', params: { id: order.id } })"
                class="rounded border border-th-subtle bg-th-card p-1 text-th-muted hover:text-accent hover:border-accent/30 transition"
                title="Modifier"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </button>
              <button
                @click="deleteOrder(order, $event)"
                :disabled="deletingId === order.id"
                class="rounded border border-th-subtle bg-th-card p-1 text-th-muted hover:text-rose-400 hover:border-rose-400/30 transition disabled:opacity-40"
                title="Supprimer"
              >
                <svg v-if="deletingId === order.id" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
            <svg class="mt-1 shrink-0 w-4 h-4 text-th-muted group-hover:text-th-secondary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </div>
      </div>

      </div><!-- end scrollable -->

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
            <p class="text-[11px] font-bold uppercase tracking-widest text-th-secondary">Guide work orders</p>
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
