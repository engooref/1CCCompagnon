<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'
import { logger } from '../services/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventType {
  id: number
  name: string
  color: string | null
}

interface EventSummary {
  id: number
  name: string
  type: EventType | null
  start: string | null
  end: string | null
  location: string | null
  picture: string | null
}

// ─── State ────────────────────────────────────────────────────────────────────

const app    = useAppStore()
const router = useRouter()

const events  = ref<EventSummary[]>([])
const loading = ref(false)
const error   = ref<string | null>(null)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urls = computed(() => app.settings ? createOverlayUrls(app.settings) : null)

function authHeaders() {
  return { Authorization: `Bearer ${app.bearerToken}` }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchEvents() {
  if (!app.bearerToken) return
  const url = urls.value?.agendaIndex
  if (!url) return

  loading.value = true
  error.value = null
  try {
    logger.info('[Agenda] GET', url)
    const { data } = await http.get(url, { headers: authHeaders(), params: { limit: 20 } })
    events.value = data?.events ?? []
  } catch (e: any) {
    logger.error('[Agenda] erreur :', e)
    error.value = `${e?.response?.status ? `HTTP ${e.response.status} – ` : ''}${e?.response?.data?.message ?? e?.message ?? 'Erreur de chargement'}`
    events.value = []
  } finally {
    loading.value = false
  }
}

function testNotification() {
  window.oneCC.showNotification('⏰ Événement dans 15 min', 'Test — Opération Nexus')
}

onMounted(() => {
  if (app.status.authReady) fetchEvents()
})
</script>

<template>
  <section class="h-full flex flex-col gap-4">

    <!-- Not authenticated -->
    <div
      v-if="!app.status.authReady"
      class="flex flex-1 items-center justify-center text-slate-500 text-sm"
    >
      Connexion requise pour accéder à l'agenda.
    </div>

    <template v-else>

      <!-- ── Header bar ─────────────────────────────────────────────────── -->
      <div class="shrink-0 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <div class="h-7 w-7 rounded-md bg-violet-400/10 border border-violet-400/20 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <span class="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Agenda
            <span v-if="events.length" class="ml-1 font-normal text-slate-600">({{ events.length }})</span>
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="testNotification()"
            class="flex items-center gap-1.5 rounded-md border border-slate-600/40 bg-slate-700/20 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-700/40 hover:text-slate-300 transition"
            title="Simuler une alerte agenda"
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            Tester alerte
          </button>

          <button
            @click="fetchEvents()"
            :disabled="loading"
            class="flex items-center gap-1.5 rounded-md border border-violet-400/20 bg-violet-400/5 px-2.5 py-1 text-xs font-medium text-violet-300/70 hover:bg-violet-400/10 hover:text-violet-200 transition disabled:opacity-40"
          >
            <svg class="w-3 h-3" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Actualiser
          </button>
        </div>
      </div>

      <!-- ── Scrollable content ────────────────────────────────────────── -->
      <div class="flex-1 min-h-0 overflow-y-auto">

        <!-- Loading -->
        <div v-if="loading && !events.length" class="rounded-lg border border-violet-400/10 bg-black/20 p-4 text-sm text-slate-500">
          Chargement des événements…
        </div>

        <!-- Error -->
        <div v-else-if="error" class="rounded-lg border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-300">
          <span class="font-semibold">Erreur :</span> {{ error }}
        </div>

        <!-- Empty -->
        <div
          v-else-if="!events.length"
          class="rounded-lg border border-dashed border-violet-400/15 bg-black/10 p-6 text-center text-sm text-slate-500"
        >
          Aucun événement à venir.
        </div>

        <!-- ── Events list ──────────────────────────────────────────────── -->
        <div v-else class="space-y-2">
          <div
            v-for="event in events"
            :key="event.id"
            class="group rounded-lg border border-violet-400/20 bg-black/20 p-4 cursor-pointer hover:border-violet-400/40 hover:bg-black/30 transition-colors"
            @click="router.push({ name: 'agenda-detail', params: { id: event.id } })"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">

                <!-- Type badge + name -->
                <div class="flex items-center gap-2 mb-1">
                  <span
                    v-if="event.type"
                    class="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border"
                    :style="event.type.color
                      ? { borderColor: event.type.color + '55', backgroundColor: event.type.color + '20', color: event.type.color }
                      : {}"
                    :class="!event.type.color ? 'border-slate-600 bg-slate-800 text-slate-400' : ''"
                  >
                    {{ event.type.name }}
                  </span>
                  <p class="text-sm font-bold truncate text-slate-100 group-hover:text-violet-200 transition-colors">
                    {{ event.name }}
                  </p>
                </div>

                <!-- Date -->
                <p class="text-xs text-slate-500">
                  <span class="text-slate-400">{{ formatDate(event.start) }}</span>
                  <span v-if="event.end" class="text-slate-600"> → {{ formatDate(event.end) }}</span>
                </p>

                <!-- Location -->
                <p v-if="event.location" class="mt-0.5 text-xs text-slate-600">
                  📍 {{ event.location }}
                </p>
              </div>

              <!-- Chevron -->
              <svg class="mt-1 shrink-0 w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </div>
        </div>

      </div><!-- end scrollable -->

    </template>
  </section>
</template>
