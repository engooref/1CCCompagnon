<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'
import { usePinnedMap } from '../composables/usePinnedMap'
import { useMercure } from '../composables/useMercure'
import { useMapLeaflet, type MapFeature } from '../composables/useMapLeaflet'

// ─── State ────────────────────────────────────────────────────────────────────

const route  = useRoute()
const router = useRouter()
const app    = useAppStore()
const { isPinned, toggle: togglePin } = usePinnedMap()
const { connected: liveConnected, sseError, connect: connectMercure, disconnect: disconnectMercure } = useMercure()
const leaflet = useMapLeaflet()

const mapId = computed(() => Number(route.params.id))

interface MapInfo {
  id: number
  name: string
  imageUrl: string
  width: number
  height: number
  gridCols: number
  gridRows: number
}

const mapInfo      = ref<MapInfo | null>(null)
const loading      = ref(false)
const mapReady     = ref(false)
const mapContainer = ref<HTMLElement | null>(null)

let imageBlobUrl = ''

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urls = computed(() => app.settings ? createOverlayUrls(app.settings) : null)
function authHeaders() { return { Authorization: `Bearer ${app.bearerToken}` } }

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchMap() {
  const url = urls.value?.mapShow(mapId.value)
  if (!url || !app.bearerToken) return
  loading.value = true
  try {
    const { data } = await http.get(url, { headers: authHeaders() })
    const raw = (data?.data ?? data) as MapInfo
    const base = app.settings?.siteUrl.replace(/\/$/, '') ?? ''
    raw.imageUrl = base  + raw.imageUrl
    mapInfo.value = raw

    // Fetch image avec token → blob URL
    const resp = await fetch(raw.imageUrl, { headers: authHeaders() })
    if (resp.ok) imageBlobUrl = URL.createObjectURL(await resp.blob())
  } catch {
    mapInfo.value = null
  } finally {
    loading.value = false
  }
}

async function fetchFeatures() {
  const url = urls.value?.mapFeatures(mapId.value)
  if (!url || !app.bearerToken || !mapInfo.value) return
  try {
    const { data } = await http.get(url, { headers: authHeaders() })
    const features = (data?.data ?? data) as MapFeature[]
    if (Array.isArray(features)) leaflet.applyFeatures(features, mapInfo.value)
  } catch { /* ignore */ }
}

// ─── Init carte Leaflet ───────────────────────────────────────────────────────

async function initMap() {
  if (!mapContainer.value || !mapInfo.value || !imageBlobUrl) return
  leaflet.init(mapContainer.value, mapInfo.value, imageBlobUrl, true)
  mapReady.value = true
  await fetchFeatures()
  connectMercure(
    urls.value!.mapMercureInfo(mapId.value),
    `Bearer ${app.bearerToken}`,
    async (msg: any) => {
      if (!mapInfo.value) return
      if (msg?.action === 'upsert' && msg.feature) leaflet.applyFeature(msg.feature, mapInfo.value)
      else if (msg?.action === 'delete' && msg.id)  leaflet.removeFeature(msg.id)
      // Fallback : re-fetch si pas de structure action/feature
      else if (msg && !msg.action) fetchFeatures()
    },
  )
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  await fetchMap()
  if (mapInfo.value && imageBlobUrl) {
    await nextTick()
    await initMap()
  }
})

onUnmounted(() => {
  disconnectMercure()
  leaflet.destroy()
  if (imageBlobUrl) URL.revokeObjectURL(imageBlobUrl)
})
</script>

<template>
  <section class="h-full flex flex-col gap-3">

    <!-- Not authenticated -->
    <div v-if="!app.status.authReady" class="flex flex-1 items-center justify-center text-slate-500 text-sm">
      Connexion requise.
    </div>

    <template v-else>

      <!-- ── Header ─────────────────────────────────────────────────── -->
      <div class="shrink-0 flex items-center gap-3">
        <button
          @click="router.push({ name: 'maps' })"
          class="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:border-slate-600 transition"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Retour
        </button>

        <div class="flex-1 min-w-0">
          <div v-if="loading" class="h-5 w-40 rounded bg-slate-800 animate-pulse" />
          <h2 v-else class="text-sm font-bold text-slate-100 truncate">
            {{ mapInfo?.name ?? `Carte #${mapId}` }}
          </h2>
        </div>

        <!-- Mercure status -->
        <div v-if="mapReady" class="shrink-0 flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full" :class="liveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'" />
          <span class="text-[10px] text-slate-600">{{ liveConnected ? 'Temps réel' : 'Hors-ligne' }}</span>
        </div>

        <!-- Pin button -->
        <button
          v-if="mapInfo"
          @click="togglePin(mapInfo.id)"
          class="shrink-0 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition"
          :class="isPinned(mapInfo.id)
            ? 'border-rose-400/30 bg-rose-400/8 text-rose-300 hover:bg-rose-400/15'
            : 'border-cyan-400/25 bg-cyan-400/8 text-cyan-300 hover:bg-cyan-400/15'"
        >
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
          </svg>
          {{ isPinned(mapInfo.id) ? 'Désépingler' : 'Épingler sur l\'overlay' }}
        </button>
      </div>

      <!-- ── Loading ────────────────────────────────────────────────── -->
      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <svg class="w-6 h-6 text-slate-600 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      </div>

      <!-- ── Carte Leaflet ───────────────────────────────────────────── -->
      <div
        v-else-if="mapInfo"
        class="flex-1 min-h-0 relative rounded-xl overflow-hidden border border-green-900/40 bg-black/30"
      >
        <!-- Coins décoratifs style mil -->
        <div style="position:absolute;top:0;left:0;width:12px;height:12px;border-top:2px solid #00e87a44;border-left:2px solid #00e87a44;z-index:1000;pointer-events:none"/>
        <div style="position:absolute;top:0;right:0;width:12px;height:12px;border-top:2px solid #00e87a44;border-right:2px solid #00e87a44;z-index:1000;pointer-events:none"/>
        <div style="position:absolute;bottom:0;left:0;width:12px;height:12px;border-bottom:2px solid #00e87a44;border-left:2px solid #00e87a44;z-index:1000;pointer-events:none"/>
        <div style="position:absolute;bottom:0;right:0;width:12px;height:12px;border-bottom:2px solid #00e87a44;border-right:2px solid #00e87a44;z-index:1000;pointer-events:none"/>

        <!-- Badge épinglée -->
        <div
          v-if="isPinned(mapInfo.id)"
          class="absolute top-2 left-3 z-[1001] flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-black/70 px-2.5 py-1 backdrop-blur-sm pointer-events-none"
        >
          <svg class="w-3 h-3 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
          </svg>
          <span class="text-[10px] font-semibold text-cyan-300">Épinglée</span>
        </div>

        <!-- Conteneur Leaflet -->
        <div ref="mapContainer" class="w-full h-full" />

        <!-- Erreur Mercure -->
        <div
          v-if="sseError"
          class="absolute bottom-2 right-2 z-[1001] rounded border border-rose-400/20 bg-black/70 px-2 py-1 text-[10px] text-rose-400/70 pointer-events-none"
        >
          {{ sseError }}
        </div>
      </div>

      <!-- ── Carte introuvable ───────────────────────────────────────── -->
      <div v-else class="flex-1 flex items-center justify-center text-slate-600 text-sm">
        Carte introuvable.
      </div>

    </template>
  </section>
</template>
