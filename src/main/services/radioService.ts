// ─── Radio Service (main process) ─────────────────────────────────────────────
// Gère la détection PTT via uIOhook et dispatch les événements IPC au renderer.

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
}

let pttUiCode: number | null = null
let pttKeyDownHandler: ((e: any) => void) | null = null
let pttKeyUpHandler: ((e: any) => void) | null = null
let pttPressed = false
let targetWindow: BrowserWindow | null = null

function sendPttEvent(event: 'radio:ptt-start' | 'radio:ptt-stop') {
  if (!targetWindow || targetWindow.isDestroyed()) return
  targetWindow.webContents.send(event)
}

export function setPttTargetWindow(win: BrowserWindow) {
  targetWindow = win
}

export function registerPttKey(domKeyCode: number | null) {
  // Nettoyer les anciens handlers
  unregisterPttKey()

  if (domKeyCode === null) return

  const uiCode = DOM_TO_UIOHOOK[domKeyCode]
  if (uiCode === undefined) {
    logger.warn(`[radio] PTT keyCode ${domKeyCode} non mappé vers uIOhook`)
    return
  }

  pttUiCode = uiCode
  logger.info(`[radio] PTT enregistré: DOM=${domKeyCode} → uIOhook=${uiCode}`)

  pttKeyDownHandler = (event: any) => {
    if (event?.keycode !== pttUiCode) return
    if (pttPressed) return // éviter repeat
    pttPressed = true
    sendPttEvent('radio:ptt-start')
  }

  pttKeyUpHandler = (event: any) => {
    if (event?.keycode !== pttUiCode) return
    if (!pttPressed) return
    pttPressed = false
    sendPttEvent('radio:ptt-stop')
  }

  uIOhook.on('keydown', pttKeyDownHandler)
  uIOhook.on('keyup', pttKeyUpHandler)
}

export function unregisterPttKey() {
  if (pttKeyDownHandler) {
    uIOhook.off('keydown', pttKeyDownHandler)
    pttKeyDownHandler = null
  }
  if (pttKeyUpHandler) {
    uIOhook.off('keyup', pttKeyUpHandler)
    pttKeyUpHandler = null
  }
  pttPressed = false
  pttUiCode = null
}

export function isPttPressed(): boolean {
  return pttPressed
}
