/**
 * Composable Leaflet pour l'affichage en lecture seule d'une carte tactique.
 * Gère : image overlay, grille, markers, positions, escouades, polylines.
 * Repris de la logique du site (maps/mapViewer.js + features.js + etc.)
 */
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Ref } from 'vue'

// ─── Constantes escouades ─────────────────────────────────────────────────────

export const SQUADS: Record<string, { label: string; color: string; bg: string }> = {
  alpha:   { label: 'Alpha',   color: '#00e87a', bg: '#001a0d' },
  bravo:   { label: 'Bravo',   color: '#ff4444', bg: '#1a0000' },
  charlie: { label: 'Charlie', color: '#4d9fff', bg: '#00101a' },
  delta:   { label: 'Delta',   color: '#ffaa00', bg: '#1a0d00' },
  echo:    { label: 'Echo',    color: '#cc44ff', bg: '#120019' },
}

// ─── Utilitaires de coordonnées ──────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)) }
function toLL(px: number, py: number, h: number) { return L.latLng(h - py, px) }
function normToLL(nx: number, ny: number, w: number, h: number) { return toLL(nx * w, ny * h, h) }

function timeAgo(iso: string): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff <  60)    return `il y a ${diff}s`
  if (diff < 3600)   return `il y a ${Math.floor(diff / 60)}min`
  if (diff < 86400)  return `il y a ${Math.floor(diff / 3600)}h`
  return `il y a ${Math.floor(diff / 86400)}j`
}

// ─── Icônes ───────────────────────────────────────────────────────────────────

const _divIconCache = new Map<string, L.DivIcon>()
const _squadIconCache = new Map<string, L.DivIcon>()

function makeDivIcon(shape: string, color: string) {
  const key = `${shape}|${color}`
  const cached = _divIconCache.get(key)
  if (cached) return cached
  const s = 18
  const paths: Record<string, string> = {
    square:   `<rect x="3" y="3" width="${s - 6}" height="${s - 6}" rx="2"/>`,
    triangle: `<path d="M${s / 2} 3 L${s - 3} ${s - 3} L3 ${s - 3}Z"/>`,
    circle:   `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 3}"/>`,
  }
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:${s}px;height:${s}px"><svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      <g fill="${color}" stroke="rgba(0,0,0,.55)" stroke-width="1.5">${paths[shape] ?? paths['circle']}</g>
    </svg></div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  })
  _divIconCache.set(key, icon)
  return icon
}

function makePositionIcon(label: string, color = '#ff9500') {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%)">
      <div style="background:${color};color:#000;font:bold 11px/1.4 'Courier New',monospace;padding:3px 8px;border-radius:3px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.6)">${label}</div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color}"></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

function makeSquadIcon(squadKey: string) {
  const cached = _squadIconCache.get(squadKey)
  if (cached) return cached
  const sq = SQUADS[squadKey] ?? SQUADS['alpha']
  const col = sq.color
  const icon = L.divIcon({
    className: '',
    html: `<div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);filter:drop-shadow(0 3px 10px ${col}55)">
        <div style="position:relative;background:${sq.bg};border:2px solid ${col};padding:4px 10px;white-space:nowrap;min-width:64px;text-align:center;clip-path:polygon(10px 0%,100% 0%,100% 100%,0% 100%,0% 10px)">
          <div style="position:absolute;top:-1px;left:-1px;width:0;height:0;border-top:10px solid ${col};border-right:10px solid transparent"></div>
          <span style="font:bold 12px/1.4 'Courier New',monospace;color:${col};letter-spacing:1.5px">${sq.label.toUpperCase()}</span>
          <span style="position:absolute;top:-5px;right:-5px;width:9px;height:9px;background:${col};border-radius:50%;border:2px solid #000;animation:squadPulse 1.6s ease-in-out infinite"></span>
        </div>
        <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${col}"></div>
      </div>
      <style>@keyframes squadPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.4)}}</style>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
  _squadIconCache.set(squadKey, icon)
  return icon
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MapFeature {
  id: number | string
  type: string
  data: Record<string, any>
  updatedAt?: string
}

export interface MapConfig {
  width: number
  height: number
  gridCols?: number
  gridRows?: number
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useMapLeaflet() {
  let _map: L.Map | null = null
  let _featureById = new Map<string, L.Layer>()
  let _squadStore  = new Map<string, { marker: L.Marker; trail: L.LayerGroup | null; feature: MapFeature }>()
  let _fitBounds: (() => void) | null = null
  let _mapBounds: [[number, number], [number, number]] | null = null
  let _resizeObserver: ResizeObserver | null = null

  // interactive: false = lecture seule (overlay plein écran)
  //              true  = pan molette uniquement (mode overlay interactif)
  //              'full'= drag clic gauche + scroll zoom (minimap)
  function init(el: HTMLElement, cfg: MapConfig, imageBlobUrl: string, interactive: boolean | 'full' = true) {
    if (_map) destroy()

    const { width, height } = cfg
    const gridCols = clamp(parseInt(String(cfg.gridCols ?? 20), 10), 2, 60)
    const cellSize = width / gridCols
    const gridRows = Math.max(2, Math.round(height / cellSize))
    const fullInteractive = interactive === 'full'
    const anyInteractive  = !!interactive

    _map = L.map(el, {
      crs: L.CRS.Simple,
      minZoom: -4,
      maxZoom: 4,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 60,
      attributionControl: false,
      doubleClickZoom: false,
      dragging: fullInteractive,
      scrollWheelZoom: fullInteractive,
      touchZoom: false,
      keyboard: false,
      zoomControl: fullInteractive,
    })

    _mapBounds = [[0, 0], [height, width]]
    L.imageOverlay(imageBlobUrl, _mapBounds).addTo(_map)

    _fitBounds = () => {
      _map?.invalidateSize({ animate: false })
      _map?.fitBounds(_mapBounds!, { animate: false, padding: [8, 8] })
    }
    _fitBounds()
    requestAnimationFrame(_fitBounds)
    if (typeof ResizeObserver !== 'undefined') {
      _resizeObserver = new ResizeObserver(_fitBounds)
      _resizeObserver.observe(el)
    }

    // Grille
    const gridGroup = L.layerGroup().addTo(_map)
    const go = { weight: 1, opacity: 0.3, color: '#2a3a2a' }
    for (let c = 1; c < gridCols; c++)
      L.polyline([[0, c * cellSize], [height, c * cellSize]], go).addTo(gridGroup)
    for (let r = 1; r < gridRows; r++) {
      const lat = r * cellSize
      if (lat > height) break
      L.polyline([[lat, 0], [lat, width]], go).addTo(gridGroup)
    }

    // Drag bouton molette (pan) — uniquement en mode interactif non-full
    if (anyInteractive && !fullInteractive) {
      _map.dragging.disable()
      let panning = false, lastX = 0, lastY = 0
      el.addEventListener('mousedown', e => {
        if (e.button !== 1) return; e.preventDefault()
        panning = true; lastX = e.clientX; lastY = e.clientY; el.style.cursor = 'grabbing'
      })
      window.addEventListener('mousemove', e => {
        if (!panning) return
        _map?.panBy([-(e.clientX - lastX), -(e.clientY - lastY)], { animate: false })
        lastX = e.clientX; lastY = e.clientY
      })
      window.addEventListener('mouseup', e => {
        if (e.button === 1 && panning) { panning = false; el.style.cursor = '' }
      })
    }
  }

  function applyFeature(f: MapFeature, cfg: MapConfig) {
    if (!_map || !f?.id || !f?.type || !f?.data) return
    const id = String(f.id)
    const { width, height } = cfg

    // Supprimer le layer existant pour cet id (sauf squads gérés séparément)
    if (f.type !== 'squad') {
      const existing = _featureById.get(id)
      if (existing) { _map.removeLayer(existing); _featureById.delete(id) }
    }

    if (f.type === 'marker') {
      const { pos, shape = 'circle', color = '#0a84ff', label } = f.data
      if (!pos) return
      const m = L.marker(normToLL(pos.nx, pos.ny, width, height), { icon: makeDivIcon(shape, color) }).addTo(_map)
      if (label) m.bindTooltip(String(label))
      _featureById.set(id, m)
      return
    }

    if (f.type === 'position') {
      const { pos, label = 'POS', color = '#ff9500' } = f.data
      if (!pos) return
      const m = L.marker(normToLL(pos.nx, pos.ny, width, height), {
        icon: makePositionIcon(String(label), color),
        zIndexOffset: 1000,
      }).addTo(_map)
      m.bindTooltip(String(label), { direction: 'top', offset: [0, -10] })
      _featureById.set(id, m)
      return
    }

    if (f.type === 'squad') {
      const { pos, squad, cell } = f.data
      if (!pos || !squad) return
      const sq = SQUADS[squad]
      if (!sq) return
      const newLL = normToLL(pos.nx, pos.ny, width, height)
      const entry = _squadStore.get(squad)

      // Trail de mouvement
      let trailLayer: L.LayerGroup | null = null
      if (entry) {
        if (entry.trail) _map.removeLayer(entry.trail)
        const oldLL = entry.marker.getLatLng()
        const oldPx = _map.latLngToContainerPoint(oldLL)
        const newPx = _map.latLngToContainerPoint(newLL)
        if (Math.hypot(newPx.x - oldPx.x, newPx.y - oldPx.y) > 3) {
          trailLayer = L.layerGroup().addTo(_map)
          L.polyline([oldLL, newLL], { color: sq.color, weight: 2, opacity: 0.55, dashArray: '6 5' }).addTo(trailLayer)
          L.circleMarker(oldLL, { radius: 4, color: sq.color, fillColor: sq.bg, fillOpacity: 1, weight: 1.5, opacity: 0.5 }).addTo(trailLayer)
        }
        _map.removeLayer(entry.marker)
      }

      const updatedAt = f.updatedAt ?? new Date().toISOString()
      const m = L.marker(newLL, { icon: makeSquadIcon(squad), zIndexOffset: 2000 }).addTo(_map)
      m.bindTooltip('', { direction: 'top', offset: [0, -14], sticky: false, permanent: false })
      m.on('mouseover', () => {
        m.setTooltipContent(
          `<b style="color:${sq.color}">${sq.label.toUpperCase()}</b><br>` +
          `<span style="color:rgba(255,255,255,.5)">pos:</span> ${cell ?? '—'}<br>` +
          `<span style="color:rgba(255,255,255,.5)">upd:</span> <b>${timeAgo(updatedAt)}</b>`
        )
      })
      _squadStore.set(squad, { marker: m, trail: trailLayer, feature: f })
      // Enregistrer aussi par id pour removeFeature
      _featureById.set(id, m)
      return
    }

    if (f.type === 'polyline' || f.type === 'polygon') {
      const pts = ((f.data.points ?? []) as any[]).map((p: any) => normToLL(p.nx, p.ny, width, height))
      if (pts.length < (f.type === 'polygon' ? 3 : 2)) return
      const opts = { weight: f.data.width ?? 3, opacity: 0.9, color: f.data.color ?? '#ffffff' }
      const l = f.type === 'polygon'
        ? L.polygon(pts, { ...opts, fillOpacity: 0.2 }).addTo(_map)
        : L.polyline(pts, opts).addTo(_map)
      _featureById.set(id, l)
    }
  }

  function removeFeature(id: string | number) {
    if (!_map) return
    const sid = String(id)
    const l = _featureById.get(sid)
    if (l) { _map.removeLayer(l); _featureById.delete(sid) }
    // Nettoyage squads
    for (const [key, entry] of _squadStore) {
      if (String(entry.feature.id) === sid) {
        _map.removeLayer(entry.marker)
        if (entry.trail) _map.removeLayer(entry.trail)
        _squadStore.delete(key)
        break
      }
    }
  }

  function applyFeatures(features: MapFeature[], cfg: MapConfig) {
    features.forEach(f => applyFeature(f, cfg))
  }

  function fitView() {
    _fitBounds?.()
  }

  function destroy() {
    _resizeObserver?.disconnect()
    _resizeObserver = null
    _map?.remove()
    _map = null
    _featureById.clear()
    _squadStore.clear()
    _fitBounds = null
    _mapBounds = null
  }

  return { init, applyFeature, applyFeatures, removeFeature, fitView, destroy }
}
