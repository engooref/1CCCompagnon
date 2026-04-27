<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { http } from '../../services/http'
import { logger } from '../../services/logger'
import { createOverlayUrls } from '../../config/api'
import { usePinnedMap } from '../../composables/usePinnedMap'
import { useMercure } from '../../composables/useMercure'
import { useMapLeaflet, type MapFeature } from '../../composables/useMapLeaflet'

const { pinnedMapId } = usePinnedMap()
const { connected: liveConnected, sseError, connect: connectMercure, disconnect: disconnectMercure } = useMercure()

const leaflet = useMapLeaflet()

interface MapInfo {
  id: number
  name: string
  imageUrl: string
  width: number
  height: number
  gridCols: number
  gridRows: number
}

const mapReady     = ref(false)
const mapError     = ref(false)
const mapContainer = ref<HTMLElement | null>(null)

let token    = ''
let siteBase = ''
let urls: ReturnType<typeof createOverlayUrls> | null = null
let imageBlobUrl = ''
let currentMapInfo: MapInfo | null = null
let refreshInterval: ReturnType<typeof setInterval> | null = null
let loadGen = 0

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchMapInfo(id: number): Promise<MapInfo | null> {
  logger.info('[MapModule] fetchMapInfo →', id, { hasToken: !!token, hasUrls: !!urls })
  if (!token || !urls) { logger.warn('[MapModule] fetchMapInfo: token ou urls manquant'); return null }
  try {
    const { data } = await http.get(urls.maps.show(id), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const raw = (data?.data ?? data) as MapInfo
    if (raw?.imageUrl?.startsWith('/')) raw.imageUrl = siteBase + raw.imageUrl
    logger.info('[MapModule] fetchMapInfo ✓', raw)
    return raw
  } catch (e) {
    logger.error('[MapModule] fetchMapInfo ✗', e)
    return null
  }
}

async function fetchAndApplyFeatures(id: number) {
  logger.info('[MapModule] fetchAndApplyFeatures →', id, { hasToken: !!token, hasUrls: !!urls, hasMapInfo: !!currentMapInfo })
  if (!token || !urls || !currentMapInfo) { logger.warn('[MapModule] fetchAndApplyFeatures: prérequis manquants'); return }
  try {
    const { data } = await http.get(urls.maps.features(id), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const raw = data?.data ?? data
    const features = (Array.isArray(raw) ? raw.filter(Boolean) : []) as MapFeature[]
    logger.info('[MapModule] fetchAndApplyFeatures ✓ count=', Array.isArray(features) ? features.length : 'NOT_ARRAY', features)
    if (Array.isArray(features) && currentMapInfo) leaflet.applyFeatures(features, currentMapInfo)
  } catch (e) {
    logger.error('[MapModule] fetchAndApplyFeatures ✗', e)
  }
}


// ─── Chargement carte ─────────────────────────────────────────────────────────

async function loadMap(id: number | null) {
  logger.info('[MapModule] loadMap →', id, 'gen=', loadGen + 1)
  const gen = ++loadGen

  mapReady.value = false
  mapError.value = false
  leaflet.destroy()
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null }
  if (imageBlobUrl) { URL.revokeObjectURL(imageBlobUrl); imageBlobUrl = '' }
  currentMapInfo = null

  if (!id) { logger.info('[MapModule] loadMap: id null, arrêt'); return }

  const info = await fetchMapInfo(id)
  if (gen !== loadGen) { logger.warn('[MapModule] loadMap: génération obsolète après fetchMapInfo gen=' + gen + ' loadGen=' + loadGen); return }
  if (!info) { logger.error('[MapModule] loadMap: fetchMapInfo retourné null → mapError'); mapError.value = true; return }
  currentMapInfo = info

  logger.info('[MapModule] loadMap: fetch image →', info.imageUrl)
  try {
    const resp = await fetch(info.imageUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (gen !== loadGen) { logger.warn('[MapModule] loadMap: génération obsolète après fetch image'); return }
    if (!resp.ok) { logger.error('[MapModule] loadMap: fetch image HTTP', resp.status, resp.statusText); mapError.value = true; return }
    imageBlobUrl = URL.createObjectURL(await resp.blob())
    logger.info('[MapModule] loadMap: image blob créée →', imageBlobUrl)
  } catch (e) { logger.error('[MapModule] loadMap: erreur fetch image', e); mapError.value = true; return }

  if (gen !== loadGen) { logger.warn('[MapModule] loadMap: génération obsolète avant nextTick'); return }

  await nextTick()
  if (!mapContainer.value) { logger.error('[MapModule] loadMap: mapContainer.value null après nextTick'); return }
  if (gen !== loadGen) { logger.warn('[MapModule] loadMap: génération obsolète après nextTick'); return }

  logger.info('[MapModule] loadMap: init Leaflet')
  leaflet.init(mapContainer.value, info, imageBlobUrl, false)
  mapReady.value = true
  logger.info('[MapModule] loadMap: mapReady = true')

  await fetchAndApplyFeatures(id)
  if (gen !== loadGen) return

  const url = urls?.maps.mercureInfo(id)
  logger.info('[MapModule] loadMap: connexion Mercure →', url)
  if (!url || !token) { logger.warn('[MapModule] loadMap: pas de Mercure url=' + url + ' token=' + !!token); return }

  // Evite de reconnecter si déjà connecté à la même URL
  if (liveConnected.value && (leaflet as any).mercureUrl === url) {
    logger.info('[MapModule] Mercure déjà connecté sur la même URL, réutilisation')
  } else {
    // on expose l'url sur leaflet pour savoir ce qui est connecté (ou utilise une variable locale)
    await connectMercure(
      url,
      `Bearer ${token}`,
      (msg: any) => {
        logger.debug('[MapModule] Mercure message reçu', msg)
        if (!currentMapInfo) return
        if (msg?.action === 'upsert' && msg.feature) { leaflet.applyFeature(msg.feature, currentMapInfo) }
        else if (msg?.action === 'delete' && msg.id)  { leaflet.removeFeature(msg.id) }
        else if (msg && !msg.action) { fetchAndApplyFeatures(id) }
      }
    )
    ;(leaflet as any).mercureUrl = url
  }

  logger.info('[MapModule] Mercure connecté ? liveConnected=', liveConnected.value, 'sseError=', sseError.value)

  if (gen !== loadGen) return

  refreshInterval = setInterval(() => { if (gen === loadGen) { logger.debug('[MapModule] refreshInterval: fetch features'); fetchAndApplyFeatures(id) } }, 60_000)
  logger.info('[MapModule] loadMap: terminé ✓ id=' + id + ' gen=' + gen)
}

watch(pinnedMapId, (id) => {
  logger.info('[MapModule] watch pinnedMapId →', id)
  loadMap(id)
})

onMounted(async () => {
  logger.info('[MapModule] onMounted, pinnedMapId=', pinnedMapId.value)
  try {
    const settings = await window.oneCC.getSettings()
    logger.info('[MapModule] settings chargés')
    urls     = createOverlayUrls(settings)
    siteBase = settings.siteUrl.replace(/\/$/, '')
    const auth = await window.oneCC.overlayAuth()
    logger.info('[MapModule] auth ok, token=', auth?.token ? auth.token.slice(0, 12) + '…' : 'ABSENT')
    token = auth.token
    if (pinnedMapId.value) await loadMap(pinnedMapId.value)
    else logger.info('[MapModule] aucune carte épinglée au mount')
  } catch (e) { logger.error('[MapModule] onMounted erreur', e) }
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
  // mercureDisconnect est appelé automatiquement par useMercure via onUnmounted
  leaflet.destroy()
  if (imageBlobUrl) URL.revokeObjectURL(imageBlobUrl)
})

defineExpose({
  refresh: () => leaflet.fitView(),
})
</script>

<template>
  <!-- ── Carte Leaflet ───────────────────────────────────────────────────── -->
  <div
    v-if="pinnedMapId && !mapError"
    class="relative w-full h-full overflow-hidden rounded-2xl border border-white/[0.12]"
    style="background-color: rgba(var(--accent-rgb), 0.08);"
  >
    <!-- Liseré tactique -->
    <div class="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent/50 to-transparent z-10 pointer-events-none" />

    <!-- Coins OTAN -->
    <div :style="`position:absolute;top:0;left:0;width:10px;height:10px;border-top:2px solid rgba(var(--accent-rgb),0.4);border-left:2px solid rgba(var(--accent-rgb),0.4);z-index:1000;pointer-events:none`"/>
    <div :style="`position:absolute;top:0;right:0;width:10px;height:10px;border-top:2px solid rgba(var(--accent-rgb),0.4);border-right:2px solid rgba(var(--accent-rgb),0.4);z-index:1000;pointer-events:none`"/>
    <div :style="`position:absolute;bottom:0;left:0;width:10px;height:10px;border-bottom:2px solid rgba(var(--accent-rgb),0.4);border-left:2px solid rgba(var(--accent-rgb),0.4);z-index:1000;pointer-events:none`"/>
    <div :style="`position:absolute;bottom:0;right:0;width:10px;height:10px;border-bottom:2px solid rgba(var(--accent-rgb),0.4);border-right:2px solid rgba(var(--accent-rgb),0.4);z-index:1000;pointer-events:none`"/>

    <!-- Loading -->
    <div v-if="!mapReady" class="absolute inset-0 flex items-center justify-center z-10">
      <svg class="w-5 h-5 text-accent/40 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    </div>

    <!-- Conteneur Leaflet -->
    <div ref="mapContainer" class="w-full h-full" />
  </div>

  <!-- ── Erreur ──────────────────────────────────────────────────────────── -->
  <div
    v-else-if="mapError"
    class="w-full h-full flex flex-col items-center justify-center gap-1 rounded-2xl border border-rose-400/20 bg-black/40"
  >
    <svg class="w-6 h-6 text-rose-400/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
        d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    </svg>
    <p class="text-[9px] uppercase tracking-widest text-rose-400/40">Carte indisponible</p>
  </div>

  <!-- ── Aucune carte épinglée ──────────────────────────────────────────── -->
  <div
    v-else
    class="w-full h-full flex items-center justify-center rounded-2xl border border-dashed border-white/[0.07] bg-black/30"
  >
    <p class="text-[10px] uppercase tracking-widest text-th-disabled">Aucune carte épinglée</p>
  </div>
</template>
