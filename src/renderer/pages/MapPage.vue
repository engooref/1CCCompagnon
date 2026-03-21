<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'
import { usePinnedMap } from '../composables/usePinnedMap'

// ─── State ────────────────────────────────────────────────────────────────────

const app    = useAppStore()
const router = useRouter()
const { isPinned, toggle: togglePin, pinnedMapId } = usePinnedMap()

interface MapInfo {
  id: number
  name: string
}

const maps    = ref<MapInfo[]>([])
const loading = ref(false)
const error   = ref<string | null>(null)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urls = computed(() => app.settings ? createOverlayUrls(app.settings) : null)

function authHeaders() {
  return { Authorization: `Bearer ${app.bearerToken}` }
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchAll() {
  if (!app.bearerToken) return
  const url = urls.value?.mapsIndex
  if (!url) return
  loading.value = true
  error.value   = null
  try {
    const { data } = await http.get(url, { headers: authHeaders() })
    const raw = data?.data ?? data
    maps.value = (Array.isArray(raw) ? raw.filter(Boolean) : [raw].filter(Boolean)) as MapInfo[]
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e?.message ?? 'Erreur de chargement'
    maps.value  = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (app.status.authReady) fetchAll()
})
</script>

<template>
  <section class="h-full flex flex-col gap-4">

    <!-- Not authenticated -->
    <div
      v-if="!app.status.authReady"
      class="flex flex-1 items-center justify-center text-slate-500 text-sm"
    >
      Connexion requise pour accéder aux cartes.
    </div>

    <template v-else>

      <!-- ── Header bar ─────────────────────────────────────────────────── -->
      <div class="shrink-0 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <div class="h-7 w-7 rounded-md bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7"/>
            </svg>
          </div>
          <span class="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Cartes
            <span v-if="maps.length" class="ml-1 font-normal text-slate-600">({{ maps.length }})</span>
          </span>
        </div>

        <button
          @click="fetchAll"
          :disabled="loading"
          class="flex items-center gap-1.5 rounded-md border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-1 text-xs font-medium text-cyan-300/70 hover:bg-cyan-400/10 hover:text-cyan-200 transition disabled:opacity-40"
        >
          <svg class="w-3 h-3" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Actualiser
        </button>
      </div>

      <!-- ── Info ────────────────────────────────────────────────────────── -->
      <p class="shrink-0 text-xs text-slate-600">
        Épinglez une carte pour l'afficher sur l'overlay. Utilisez la touche configurée dans les paramètres pour l'afficher ou la masquer.
      </p>

      <!-- ── Scrollable content ────────────────────────────────────────── -->
      <div class="flex-1 min-h-0 overflow-y-auto">

        <div v-if="loading && !maps.length" class="rounded-lg border border-cyan-400/10 bg-black/20 p-4 text-sm text-slate-500">
          Chargement des cartes…
        </div>

        <div v-else-if="error" class="rounded-lg border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-300">
          <span class="font-semibold">Erreur :</span> {{ error }}
        </div>

        <div
          v-else-if="!maps.length"
          class="rounded-lg border border-dashed border-cyan-400/15 bg-black/10 p-6 text-center text-sm text-slate-500"
        >
          Aucune carte disponible.
        </div>

        <!-- ── Maps list ───────────────────────────────────────────────── -->
        <div v-else class="space-y-2">
          <div
            v-for="map in maps"
            :key="map.id"
            class="group rounded-lg border bg-black/20 p-4 flex items-center justify-between gap-3 transition-colors cursor-pointer"
            :class="isPinned(map.id)
              ? 'border-cyan-400/40 bg-cyan-400/5 hover:border-cyan-400/60'
              : 'border-cyan-400/20 hover:border-cyan-400/40 hover:bg-black/30'"
            @click="router.push({ name: 'map-detail', params: { id: map.id } })"
          >
            <!-- Icon + Name -->
            <div class="flex items-center gap-3 min-w-0">
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                :class="isPinned(map.id)
                  ? 'border-cyan-400/40 bg-cyan-400/10'
                  : 'border-slate-700 bg-slate-800/50'"
              >
                <svg
                  class="w-4 h-4"
                  :class="isPinned(map.id) ? 'text-cyan-300' : 'text-slate-500'"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7"/>
                </svg>
              </div>

              <div class="min-w-0">
                <p class="text-sm font-semibold truncate" :class="isPinned(map.id) ? 'text-cyan-200' : 'text-slate-200'">
                  {{ map.name }}
                </p>
                <div v-if="isPinned(map.id)" class="flex items-center gap-1 mt-0.5">
                  <span class="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  <span class="text-[10px] text-cyan-400/70">Épinglée sur l'overlay</span>
                </div>
              </div>
            </div>

            <!-- Chevron -->
            <svg class="shrink-0 w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>

            <!-- Pin button -->
            <button
              @click.stop="togglePin(map.id)"
              class="shrink-0 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition"
              :class="isPinned(map.id)
                ? 'border-rose-400/30 bg-rose-400/8 text-rose-300 hover:bg-rose-400/15'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-cyan-400/30 hover:text-cyan-300 hover:bg-cyan-400/5'"
              :title="isPinned(map.id) ? 'Désépingler de l\'overlay' : 'Épingler dans l\'overlay'"
            >
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
              </svg>
              {{ isPinned(map.id) ? 'Désépingler' : 'Épingler' }}
            </button>
          </div>
        </div>

      </div><!-- end scrollable -->

      <!-- ── Aucune carte épinglée info ────────────────────────────────── -->
      <div
        v-if="!pinnedMapId && maps.length"
        class="shrink-0 rounded-lg border border-slate-800/60 bg-black/10 px-4 py-2.5 text-xs text-slate-600"
      >
        Aucune carte épinglée — sélectionnez une carte ci-dessus pour l'afficher sur l'overlay.
      </div>

    </template>
  </section>
</template>
