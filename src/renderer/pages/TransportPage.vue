<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'
import { TransportOrder } from '../../shared/deliveries'
import { usePinnedTransport } from '../composables/usePinnedTransport'

// ─── State ────────────────────────────────────────────────────────────────────

const app    = useAppStore()
const router = useRouter()
const { isPinned, toggle: togglePin } = usePinnedTransport()

const orders     = computed(() => app.transports)
const loading    = computed(() => app.transportsLoading)
const deletingId = ref<number | null>(null)

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
      <div class="shrink-0 flex items-center justify-between gap-3">
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
          @click="router.push({ name: 'transport-new' })"
          class="flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-400/8 px-2.5 py-1 text-xs font-medium text-emerald-300/80 hover:bg-emerald-400/12 hover:text-emerald-200 transition"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Nouvel ordre
        </button>
      </div>

      <!-- ── Scrollable content ────────────────────────────────────────── -->
      <div class="flex-1 min-h-0 overflow-y-auto">

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
      <div v-else class="space-y-2">
        <div
          v-for="order in orders"
          :key="order.id"
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
            <div class="shrink-0 flex items-center gap-1 mt-0.5" @click.stop>
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

    </template>
  </section>
</template>
