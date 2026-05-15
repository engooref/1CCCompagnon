<script setup lang="ts">
/**
 * OcrZoneBox — zone drag+resize en mode calibration.
 * Coordonnées en ratio (0→1). Le parent passe containerWidth/containerHeight
 * pour convertir pixels ↔ ratio.
 */
import { computed, ref } from 'vue'
import type { OcrZone } from '@renderer/ocr/OcrTypes'
import { useOcrStore } from '@renderer/stores/ocrStore'

const props = defineProps<{
  zone: OcrZone
  containerWidth: number
  containerHeight: number
  selected?: boolean
  /** Si fourni, remplace l'écriture directe dans le store (ex: mode calibration overlay) */
  updateHandler?: (id: string, partial: Partial<OcrZone>) => void
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const ocr = useOcrStore()

function doUpdate(id: string, partial: Partial<OcrZone>) {
  if (props.updateHandler) props.updateHandler(id, partial)
  else ocr.updateZone(id, partial)
}

const MIN_RATIO_W = 0.01
const MIN_RATIO_H = 0.008

// ── Pixels calculés ────────────────────────────────────────────────────────
const px = computed(() => ({
  x: props.zone.rect.x * props.containerWidth,
  y: props.zone.rect.y * props.containerHeight,
  w: props.zone.rect.w * props.containerWidth,
  h: props.zone.rect.h * props.containerHeight,
}))

const style = computed(() => ({
  left:   `${px.value.x}px`,
  top:    `${px.value.y}px`,
  width:  `${px.value.w}px`,
  height: `${px.value.h}px`,
  outline: props.selected
    ? '2px solid var(--primary-color, #22d3ee)'
    : '1px solid rgba(34,211,238,0.5)',
}))

// ── Drag ────────────────────────────────────────────────────────────────────
let dragStart: { mx: number; my: number; rx: number; ry: number } | null = null

function onDragStart(e: MouseEvent) {
  if (e.button !== 0) return
  e.stopPropagation()
  emit('select', props.zone.id)
  dragStart = {
    mx: e.clientX,
    my: e.clientY,
    rx: props.zone.rect.x,
    ry: props.zone.rect.y,
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd, { once: true })
}

function onDragMove(e: MouseEvent) {
  if (!dragStart) return
  const dx = (e.clientX - dragStart.mx) / props.containerWidth
  const dy = (e.clientY - dragStart.my) / props.containerHeight

  const newX = Math.max(0, Math.min(1 - props.zone.rect.w, dragStart.rx + dx))
  const newY = Math.max(0, Math.min(1 - props.zone.rect.h, dragStart.ry + dy))

  doUpdate(props.zone.id, {
    rect: { ...props.zone.rect, x: newX, y: newY },
  })
}

function onDragEnd() {
  dragStart = null
  window.removeEventListener('mousemove', onDragMove)
}

// ── Resize ──────────────────────────────────────────────────────────────────
type ResizeDir = 'se' | 'sw' | 'ne' | 'nw'

let resizeStart: {
  mx: number; my: number; dir: ResizeDir
  rx: number; ry: number; rw: number; rh: number
} | null = null

function onResizeStart(e: MouseEvent, dir: ResizeDir) {
  e.stopPropagation()
  e.preventDefault()
  emit('select', props.zone.id)
  resizeStart = {
    mx: e.clientX, my: e.clientY, dir,
    rx: props.zone.rect.x, ry: props.zone.rect.y,
    rw: props.zone.rect.w, rh: props.zone.rect.h,
  }
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd, { once: true })
}

function onResizeMove(e: MouseEvent) {
  if (!resizeStart) return
  const { mx, my, dir, rx, ry, rw, rh } = resizeStart
  const dx = (e.clientX - mx) / props.containerWidth
  const dy = (e.clientY - my) / props.containerHeight

  let newX = rx, newY = ry, newW = rw, newH = rh

  if (dir === 'se') {
    newW = Math.max(MIN_RATIO_W, Math.min(1 - rx, rw + dx))
    newH = Math.max(MIN_RATIO_H, Math.min(1 - ry, rh + dy))
  } else if (dir === 'sw') {
    const dw = Math.min(rw - MIN_RATIO_W, -dx)
    newX = Math.max(0, rx - dw)
    newW = Math.max(MIN_RATIO_W, rw + dw)
    newH = Math.max(MIN_RATIO_H, Math.min(1 - ry, rh + dy))
  } else if (dir === 'ne') {
    newW = Math.max(MIN_RATIO_W, Math.min(1 - rx, rw + dx))
    const dh = Math.min(rh - MIN_RATIO_H, -dy)
    newY = Math.max(0, ry - dh)
    newH = Math.max(MIN_RATIO_H, rh + dh)
  } else if (dir === 'nw') {
    const dwx = Math.min(rw - MIN_RATIO_W, -dx)
    newX = Math.max(0, rx - dwx)
    newW = Math.max(MIN_RATIO_W, rw + dwx)
    const dhy = Math.min(rh - MIN_RATIO_H, -dy)
    newY = Math.max(0, ry - dhy)
    newH = Math.max(MIN_RATIO_H, rh + dhy)
  }

  doUpdate(props.zone.id, {
    rect: { x: newX, y: newY, w: newW, h: newH },
  })
}

function onResizeEnd() {
  resizeStart = null
  window.removeEventListener('mousemove', onResizeMove)
}
</script>

<template>
  <div
    class="ocr-zone-box"
    :class="{ 'is-disabled': !zone.enabled }"
    :style="style"
    @mousedown="onDragStart"
  >
    <span class="zone-label">{{ zone.label }}</span>

    <!-- Poignées de resize -->
    <div class="resize-handle ne" @mousedown.stop="onResizeStart($event, 'ne')" />
    <div class="resize-handle nw" @mousedown.stop="onResizeStart($event, 'nw')" />
    <div class="resize-handle se" @mousedown.stop="onResizeStart($event, 'se')" />
    <div class="resize-handle sw" @mousedown.stop="onResizeStart($event, 'sw')" />
  </div>
</template>

<style scoped>
.ocr-zone-box {
  position: absolute;
  box-sizing: border-box;
  cursor: move;
  user-select: none;
  background: rgba(34, 211, 238, 0.06);
  transition: background 0.1s;
}
.ocr-zone-box:hover { background: rgba(34, 211, 238, 0.12); }
.ocr-zone-box.is-disabled {
  outline-color: rgba(255,255,255,0.2) !important;
  background: rgba(255,255,255,0.02);
}
.zone-label {
  position: absolute;
  top: -16px;
  left: 0;
  font-size: 10px;
  color: var(--primary-color, #22d3ee);
  white-space: nowrap;
  pointer-events: none;
  text-shadow: 0 0 4px #000;
}
.resize-handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: var(--primary-color, #22d3ee);
  border-radius: 2px;
  opacity: 0.8;
}
.resize-handle.nw { top: -4px; left: -4px; cursor: nw-resize; }
.resize-handle.ne { top: -4px; right: -4px; cursor: ne-resize; }
.resize-handle.sw { bottom: -4px; left: -4px; cursor: sw-resize; }
.resize-handle.se { bottom: -4px; right: -4px; cursor: se-resize; }
</style>
