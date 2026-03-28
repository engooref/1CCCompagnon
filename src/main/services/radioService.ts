// ─── Radio Service (main process) ─────────────────────────────────────────────
// Gère la détection PTT via uIOhook et dispatch les événements IPC au renderer.
// Supporte plusieurs liaisons canal → touche (système murmure TeamSpeak).

import { BrowserWindow } from 'electron'
import { uIOhook } from 'uiohook-napi'
import { logger } from './logger'

// Mapping DOM keyCode → uIOhook keycode (subset courant)
const DOM_TO_UIOHOOK: Record<number, number> = {
  20: 58,   // CapsLock
  112: 59, 113: 60, 114: 61, 115: 62, 116: 63, 117: 64,
  118: 65, 119: 66, 120: 67, 121: 68, 122: 87, 123: 88,
  65: 30, 66: 48, 67: 46, 68: 32, 69: 18, 70: 33,
  71: 34, 72: 35, 73: 23, 74: 36, 75: 37, 76: 38,
  77: 50, 78: 49, 79: 24, 80: 25, 81: 16, 82: 19,
  83: 31, 84: 20, 85: 22, 86: 47, 87: 17, 88: 45,
  89: 21, 90: 44,
  48: 11, 49: 2, 50: 3, 51: 4, 52: 5, 53: 6, 54: 7, 55: 8, 56: 9, 57: 10,
  32: 57, 9: 15, 13: 28, 27: 1,
  160: 42, 161: 54,  // LShift, RShift
  162: 29, 163: 3613, // LCtrl, RCtrl
  164: 56, 165: 3640, // LAlt, RAlt
  // Pavé numérique
  96: 82, 97: 79, 98: 80, 99: 81, 100: 75, 101: 76, 102: 77, 103: 71, 104: 72, 105: 73,
  106: 55, 107: 78, 109: 74, 110: 83, 111: 53,
}

interface BindingEntry {
  channelId: string
  uiCode: number
  pressed: boolean
  keyDown: (e: any) => void
  keyUp: (e: any) => void
}

// Bindings actifs : un par canal
const activeBindings: Map<string, BindingEntry> = new Map()

let targetWindow: BrowserWindow | null = null

function sendPttEvent(event: 'radio:ptt-start' | 'radio:ptt-stop', channelId: string) {
  if (!targetWindow || targetWindow.isDestroyed()) return
  targetWindow.webContents.send(event, channelId)
}

export function setPttTargetWindow(win: BrowserWindow) {
  targetWindow = win
}

export function registerPttBindings(bindings: Array<{ channelId: string; keyCode: number | null }>) {
  unregisterAllPttBindings()

  for (const { channelId, keyCode } of bindings) {
    if (!keyCode) continue

    const uiCode = DOM_TO_UIOHOOK[keyCode]
    if (uiCode === undefined) {
      logger.warn(`[radio] PTT keyCode ${keyCode} (canal ${channelId}) non mappé vers uIOhook`)
      continue
    }

    const entry: BindingEntry = {
      channelId,
      uiCode,
      pressed: false,
      keyDown: null!,
      keyUp: null!,
    }

    entry.keyDown = (event: any) => {
      logger.debug(`[radio][uIOhook] keydown keycode=${event?.keycode} attendu=${entry.uiCode} canal=${channelId} déjàPress=${entry.pressed}`)
      if (event?.keycode !== entry.uiCode) return
      if (entry.pressed) return
      entry.pressed = true
      sendPttEvent('radio:ptt-start', channelId)
    }

    entry.keyUp = (event: any) => {
      logger.debug(`[radio][uIOhook] keyup keycode=${event?.keycode} attendu=${entry.uiCode} canal=${channelId} pressed=${entry.pressed}`)
      if (event?.keycode !== entry.uiCode) return
      if (!entry.pressed) return
      entry.pressed = false
      sendPttEvent('radio:ptt-stop', channelId)
    }

    uIOhook.on('keydown', entry.keyDown)
    uIOhook.on('keyup', entry.keyUp)
    activeBindings.set(channelId, entry)

    logger.info(`[radio] PTT enregistré: canal=${channelId} DOM=${keyCode} → uIOhook=${uiCode}`)
  }
}

export function unregisterAllPttBindings() {
  logger.debug(`[radio] unregisterAllPttBindings — ${activeBindings.size} binding(s) actifs`, new Error('trace').stack)
  for (const entry of activeBindings.values()) {
    uIOhook.off('keydown', entry.keyDown)
    uIOhook.off('keyup', entry.keyUp)
  }
  activeBindings.clear()
}

export function isPttPressed(channelId?: string): boolean {
  if (channelId) return activeBindings.get(channelId)?.pressed ?? false
  return Array.from(activeBindings.values()).some(b => b.pressed)
}

