<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAppStore } from '../stores/app'
import { usePinnedTransport } from '../composables/usePinnedTransport'

// ─── Stores & composables ─────────────────────────────────────────────────────

const app = useAppStore()
const { pinnedId, isPinned } = usePinnedTransport()
// ─── Profile ──────────────────────────────────────────────────────────────────

const profile = computed(() => app.profile)
const rh      = computed(() => app.profile?.rh ?? null)

const xpPercent = computed(() => {
  const r = rh.value
  if (!r || !r.nextLevelXp || r.nextLevelXp <= 0) return 0
  return Math.min(100, Math.round((r.totalXp / r.nextLevelXp) * 100))
})

const rhStatusColor = computed(() => {
  const s = rh.value?.status?.toLowerCase() ?? ''
  if (s === 'actif') return 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
  if (s === 'inactif') return 'text-rose-300 border-rose-400/30 bg-rose-400/10'
  return 'text-amber-300 border-amber-400/30 bg-amber-400/10'
})

// ─── Connection ───────────────────────────────────────────────────────────────

const connDotClass = computed(() => {
  if (app.status.connected) return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
  if (app.status.level === 'loading') return 'bg-amber-400 animate-pulse'
  return 'bg-rose-400'
})

const connTextClass = computed(() => {
  if (app.status.connected) return 'text-emerald-300'
  if (app.status.level === 'loading') return 'text-amber-300'
  return 'text-rose-300'
})

const connLabel = computed(() => {
  if (app.status.connected) return 'Connecté'
  if (app.status.level === 'loading') return 'Connexion…'
  return 'Déconnecté'
})

// ─── Transport orders ─────────────────────────────────────────────────────────

const orders      = computed(() => app.transports)
const loadingOrds = computed(() => app.transportsLoading)

function orderProgress(order: (typeof orders.value)[number]): number {
  const lines = order.itinerary?.lines ?? []
  if (!lines.length) return 0
  return Math.round((lines.filter(l => l.completed).length / lines.length) * 100)
}

// ─── Agenda ───────────────────────────────────────────────────────────────────

const agendaEvents  = computed(() => app.agendaEvents.slice(0, 3))
const loadingAgenda = computed(() => !app.agendaLoaded && app.status.authReady)

function formatEventDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function minutesUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const activeOrdersCount = computed(() => orders.value.filter(o => {
  const lines = o.itinerary?.lines ?? []
  return lines.length > 0 && lines.some(l => !l.completed)
}).length)

const pinnedOrder = computed(() =>
  pinnedId.value != null ? orders.value.find(o => o.id === pinnedId.value) ?? null : null
)

const recentOrders = computed(() => orders.value.slice(0, 3))

</script>

<template>
  <section class="h-full flex flex-col gap-4 min-h-0 overflow-y-auto">

    <!-- ── Non connecté ──────────────────────────────────────────────────── -->
    <div
      v-if="!app.status.authReady"
      class="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4 flex items-center gap-3"
    >
      <svg class="w-5 h-5 text-amber-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      </svg>
      <p class="text-sm text-amber-200">
        Connecte-toi via la barre du bas pour accéder aux données du dashboard.
      </p>
    </div>

    <!-- ── Profil + connexion ─────────────────────────────────────────────── -->
    <div class="shrink-0 rounded-lg border border-accent/20 bg-black/20 p-4 flex items-center gap-4">
      <!-- Avatar -->
      <img
        v-if="profile?.avatar"
        :src="profile.avatar"
        alt="Avatar"
        class="h-14 w-14 rounded-full border-2 border-accent/40 object-cover shadow-lg shrink-0"
      />
      <div
        v-else
        class="h-14 w-14 rounded-full border-2 border-accent/20 bg-th-card flex items-center justify-center text-2xl text-th-muted shrink-0"
      >?</div>

      <!-- Infos -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="text-base font-bold text-th-primary truncate">
            {{ profile?.username ?? 'Non connecté' }}
          </p>
          <span
            v-if="rh?.status"
            class="inline-block rounded border px-2 py-0.5 text-[10px] font-semibold"
            :class="rhStatusColor"
          >{{ rh.status }}</span>
        </div>
        <p v-if="rh?.grade?.name" class="text-xs text-th-secondary mt-0.5">
          {{ rh.grade.name }}
          <span v-if="rh.level" class="text-th-muted"> · Niv. {{ rh.level }}</span>
        </p>

        <!-- Barre XP compacte -->
        <div v-if="rh?.nextLevelXp" class="mt-2">
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-th-card">
            <div
              class="h-full rounded-full bg-gradient-to-r from-accent to-accent/70 transition-all duration-500 shadow-[0_0_6px_rgba(var(--accent-rgb),0.4)]"
              :style="{ width: xpPercent + '%' }"
            />
          </div>
          <p class="mt-0.5 text-[10px] text-th-muted text-right">
            {{ rh.totalXp.toLocaleString('fr-FR') }} / {{ rh.nextLevelXp.toLocaleString('fr-FR') }} XP
            <span class="text-accent/70">({{ xpPercent }}%)</span>
          </p>
        </div>
      </div>

      <!-- Statut connexion -->
      <div class="shrink-0 flex flex-col items-end gap-1">
        <div class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full shrink-0" :class="connDotClass"/>
          <span class="text-xs font-semibold" :class="connTextClass">{{ connLabel }}</span>
        </div>
        <span v-if="app.status.latencyMs" class="text-[10px] text-th-muted font-mono">{{ app.status.latencyMs }} ms</span>
        <span v-if="app.status.checkedAt" class="text-[10px] text-th-disabled">
          {{ new Date(app.status.checkedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }}
        </span>
      </div>
    </div>

    <!-- ── Stats row ──────────────────────────────────────────────────────── -->
    <div class="shrink-0 grid grid-cols-3 gap-3">

      <!-- Transports actifs -->
      <div class="rounded-lg border border-accent/15 bg-black/20 p-3 flex items-center gap-3">
        <div class="h-8 w-8 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
          <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-lg font-bold text-th-primary leading-none">
            <span v-if="loadingOrds" class="text-th-muted text-sm">…</span>
            <span v-else>{{ activeOrdersCount }}</span>
          </p>
          <p class="text-[10px] text-th-muted mt-0.5 truncate">Ordres actifs</p>
        </div>
      </div>

      <!-- Ordre épinglé -->
      <div class="rounded-lg border border-amber-400/15 bg-black/20 p-3 flex items-center gap-3">
        <div class="h-8 w-8 rounded-md bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
          <svg class="w-4 h-4 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-[11px] font-semibold text-th-primary truncate leading-tight">
            {{ pinnedOrder?.name ?? (pinnedId != null ? `#${pinnedId}` : '—') }}
          </p>
          <p class="text-[10px] text-th-muted mt-0.5">Transport épinglé</p>
        </div>
      </div>

    </div>

    <!-- ── Agenda à venir ─────────────────────────────────────────────────── -->
    <div v-if="app.status.authReady" class="shrink-0 flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="h-6 w-6 rounded-md bg-violet-400/10 border border-violet-400/20 flex items-center justify-center shrink-0">
            <svg class="w-3.5 h-3.5 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <span class="text-xs font-semibold uppercase tracking-widest text-th-secondary">Agenda</span>
        </div>
        <RouterLink
          to="/agenda"
          class="text-[11px] text-violet-400/60 hover:text-violet-300 transition flex items-center gap-1"
        >
          Voir tous
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </RouterLink>
      </div>

      <!-- Chargement -->
      <div v-if="loadingAgenda" class="rounded-lg border border-violet-400/10 bg-black/20 p-3 text-xs text-th-muted text-center">
        Chargement…
      </div>

      <!-- Vide -->
      <div
        v-else-if="!agendaEvents.length"
        class="rounded-lg border border-dashed border-violet-400/10 bg-black/10 p-3 text-xs text-th-muted text-center"
      >
        Aucun événement à venir
      </div>

      <!-- Liste compacte -->
      <div v-else class="grid grid-cols-3 gap-2">
        <RouterLink
          v-for="event in agendaEvents"
          :key="event.id"
          :to="`/agenda/${event.id}`"
          class="group rounded-lg border border-violet-400/15 bg-black/20 p-3 hover:border-violet-400/35 hover:bg-black/30 transition-colors"
        >
          <div class="flex items-start gap-2">
            <div class="flex-1 min-w-0">
              <!-- Type badge -->
              <div class="flex items-center gap-1.5 mb-1 flex-wrap">
                <span
                  v-if="event.type"
                  class="shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold border"
                  :style="event.type.color
                    ? { borderColor: event.type.color + '55', backgroundColor: event.type.color + '20', color: event.type.color }
                    : {}"
                  :class="!event.type.color ? 'border-th-subtle bg-th-card text-th-secondary' : ''"
                >{{ event.type.name }}</span>

                <!-- Badge "bientôt" -->
                <span
                  v-if="minutesUntil(event.start) !== null && minutesUntil(event.start)! <= 60 && minutesUntil(event.start)! > 0"
                  class="shrink-0 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300"
                >
                  {{ minutesUntil(event.start) }} min
                </span>
              </div>
              <p class="text-xs font-bold text-th-primary truncate group-hover:text-violet-200 transition-colors">
                {{ event.name }}
              </p>
              <p class="text-[10px] text-th-muted mt-0.5">{{ formatEventDate(event.start) }}</p>
            </div>
            <svg class="shrink-0 w-3 h-3 mt-0.5 text-th-disabled group-hover:text-th-muted transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </RouterLink>
      </div>
    </div>

    <!-- ── Transports récents ──────────────────────────────────────────── -->
    <div class="shrink-0 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="h-6 w-6 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
              <svg class="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/>
              </svg>
            </div>
            <span class="text-xs font-semibold uppercase tracking-widest text-th-secondary">Transports</span>
            <span v-if="orders.length" class="text-xs text-th-muted">({{ orders.length }})</span>
          </div>
          <RouterLink
            to="/transport"
            class="text-[11px] text-accent/60 hover:text-accent transition flex items-center gap-1"
          >
            Voir tous
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </RouterLink>
        </div>

        <!-- Loading -->
        <div v-if="loadingOrds" class="rounded-lg border border-accent/10 bg-black/20 p-4 text-xs text-th-muted text-center">
          Chargement…
        </div>

        <!-- Non connecté -->
        <div
          v-else-if="!app.status.authReady"
          class="rounded-lg border border-dashed border-th-subtle p-4 text-xs text-th-muted text-center"
        >
          Connexion requise
        </div>

        <!-- Aucun ordre -->
        <div
          v-else-if="!orders.length"
          class="rounded-lg border border-dashed border-accent/10 bg-black/10 p-4 text-xs text-th-muted text-center"
        >
          Aucun ordre de transport
        </div>

        <!-- Liste compacte -->
        <div v-else class="space-y-2">
          <RouterLink
            v-for="order in recentOrders"
            :key="order.id"
            :to="`/transport/${order.id}`"
            class="group block rounded-lg border border-accent/15 bg-black/20 p-3 hover:border-accent/35 hover:bg-black/30 transition-colors"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <p class="text-xs font-bold truncate text-th-primary group-hover:text-accent transition-colors">
                    {{ order.name ?? `Ordre #${order.id}` }}
                  </p>
                  <span
                    v-if="isPinned(order.id)"
                    class="shrink-0 inline-flex items-center gap-0.5 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent"
                  >
                    <svg class="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                    </svg>
                    Overlay
                  </span>
                  <span
                    v-if="order.itinerary?.obsolete"
                    class="shrink-0 inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300"
                  >Obsolète</span>
                </div>
                <p v-if="order.originName" class="text-[10px] text-th-muted truncate">
                  {{ order.originName }}
                </p>
                <!-- Progress -->
                <div v-if="order.itinerary?.lines?.length" class="mt-1.5">
                  <div class="h-1 w-full overflow-hidden rounded-full bg-th-card">
                    <div
                      class="h-full rounded-full bg-gradient-to-r from-accent to-accent/70 transition-all duration-500"
                      :style="{ width: orderProgress(order) + '%' }"
                    />
                  </div>
                  <div class="flex items-center justify-between mt-0.5 text-[9px] text-th-muted">
                    <span>{{ order.itinerary.lines.filter(l => l.completed).length }}/{{ order.itinerary.lines.length }} étapes</span>
                    <span>{{ orderProgress(order) }}%</span>
                  </div>
                </div>
              </div>
              <svg class="mt-0.5 shrink-0 w-3.5 h-3.5 text-th-muted group-hover:text-th-secondary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </RouterLink>
        </div>

        <!-- Navigation rapide vers transport-new -->
        <RouterLink
          v-if="app.status.authReady"
          to="/transport/new"
          class="shrink-0 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-400/20 bg-emerald-400/5 py-2 text-xs font-medium text-emerald-300/60 hover:border-emerald-400/35 hover:text-emerald-300 transition"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Nouvel ordre
        </RouterLink>
      </div>

  </section>
</template>
