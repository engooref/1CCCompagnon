import { app, BrowserWindow, shell, screen, globalShortcut, Menu, session } from 'electron'
import path from 'node:path'
import { logger } from './services/logger'
import { registerAppIpc } from './ipc/app.ipc'
import { createOverlayWindow, showOverlay, hideOverlay, sendToOverlay, getOverlayWindow, setOverlayInteractive } from './windows/overlayWindow'
import { setMainWindow } from './windows/mainWindow'
import { getOverlayEditorWindow } from './windows/overlayEditorWindow'
import { startGameWatcher, stopGameWatcher, getGameWindowBounds } from './services/gameWatcher'
import { loadNativeTracker } from './services/scTrackerNative'
import { initAutoUpdater, checkForUpdatesNative } from './services/autoUpdaterService'
import { getSettings } from './services/settingsStore'
import { onLayoutChange, getLayout } from './services/layoutStore'
import { getRegistry, setActiveMode, onRegistryChange } from './services/modeStore'
import { registerRadioIpc } from './ipc/radio.ipc'
import { registerOcrIpc } from './ipc/ocr.ipc'
import { registerPttBindings, setPttTargetWindow } from './services/radioService'
import { uIOhook } from 'uiohook-napi'

interface ToggleKeyObject { accel?: string; keyCode?: number }

const DOM_TO_UIOHOOK: Record<number, number> = {
  112: 59, 113: 60, 114: 61, 115: 62, 116: 63, 117: 64,
  118: 65, 119: 66, 120: 67, 121: 68, 122: 87, 123: 88,
  65: 30,  66: 48,  67: 46,  68: 32,  69: 18,  70: 33,
  71: 34,  72: 35,  73: 23,  74: 36,  75: 37,  76: 38,
  77: 50,  78: 49,  79: 24,  80: 25,  81: 16,  82: 19,
  83: 31,  84: 20,  85: 22,  86: 47,  87: 17,  88: 45,
  89: 21,  90: 44,
  48: 11, 49: 2, 50: 3, 51: 4, 52: 5, 53: 6, 54: 7, 55: 8, 56: 9, 57: 10,
  8: 14, 9: 15, 13: 28, 27: 1, 32: 57, 20: 58,
  37: 331, 38: 328, 39: 333, 40: 336,
  45: 338, 46: 339, 36: 327, 35: 335, 33: 329, 34: 337,
  96: 82, 97: 79, 98: 80, 99: 81, 100: 75, 101: 76,
  102: 77, 103: 71, 104: 72, 105: 73,
}

// Correspondance accelerator Electron (nom de touche) → code uIOhook
const ACCEL_TO_UIOHOOK: Record<string, number> = {
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64,
  F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
  A: 30, B: 48, C: 46, D: 32, E: 18, F: 33, G: 34,
  H: 35, I: 23, J: 36, K: 37, L: 38, M: 50, N: 49,
  O: 24, P: 25, Q: 16, R: 19, S: 31, T: 20, U: 22,
  V: 47, W: 17, X: 45, Y: 21, Z: 44,
  '0': 11, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6,
  '6': 7, '7': 8, '8': 9, '9': 10,
  Space: 57, Backspace: 14, Tab: 15, Return: 28, Escape: 1,
  Insert: 338, Delete: 339, Home: 327, End: 335, PageUp: 329, PageDown: 337,
  Left: 331, Up: 328, Right: 333, Down: 336,
  Num0: 82, Num1: 79, Num2: 80, Num3: 81, Num4: 75,
  Num5: 76, Num6: 77, Num7: 71, Num8: 72, Num9: 73,
}

function accelToUiohook(accel: string): number | null {
  const key = accel.split('+').pop() ?? accel
  return ACCEL_TO_UIOHOOK[key] ?? null
}

/**
 * Vérifie qu'un event uIOhook correspond exactement à un accelerator Electron.
 * Ex: 'Ctrl+F9' → keycode F9 ET ctrlKey=true ET shiftKey=false ET altKey=false.
 * Évite qu'un raccourci Ctrl+F9 déclenche aussi le handler F9.
 */
function accelMatchesEvent(accel: string, event: any): boolean {
  const parts  = accel.split('+')
  const key    = parts[parts.length - 1]
  const uiCode = ACCEL_TO_UIOHOOK[key]
  if (uiCode === undefined || event?.keycode !== uiCode) return false

  const needsCtrl  = parts.includes('Ctrl') || parts.includes('CommandOrControl') || parts.includes('CmdOrCtrl')
  const needsAlt   = parts.includes('Alt')
  const needsShift = parts.includes('Shift')

  return Boolean(event.ctrlKey)  === needsCtrl  &&
         Boolean(event.altKey)   === needsAlt   &&
         Boolean(event.shiftKey) === needsShift
}

function domKeyCodeToUiohook(domCode: number): number {
  const mapped = DOM_TO_UIOHOOK[domCode]
  if (mapped === undefined) logger.warn('[main] domKeyCodeToUiohook: code clavier non mappé', domCode)
  return mapped ?? domCode
}

const APP_ROOT      = app.getAppPath()
const RENDERER_DIST = path.join(APP_ROOT, 'out/renderer')

let mainWindow:       BrowserWindow | null = null
let ioHookHandler:    ((e: any) => void) | null = null
let mapIoHookHandler: ((e: any) => void) | null = null
let editIoHookKeyDown: ((e: any) => void) | null = null
let editIoHookKeyUp:   ((e: any) => void) | null = null
let ioHookStarted  = false
let manuallyHidden = false
let isGameFocused  = false
let mapOnlyMode         = false
let mapCurrentlyVisible = false
let overlayEditMode     = false
let editCtrlPressed     = false
let editShiftPressed    = false
let lastEditToggleAt    = 0

// ─── Helpers overlay ──────────────────────────────────────────────────────────

/** Convertit des bounds physiques (raw DPI) en bounds logiques (CSS pixels) pour Electron. */
function toLogicalBounds(b: { x: number; y: number; width: number; height: number }) {
  const dpr = screen.getPrimaryDisplay().scaleFactor ?? 1
  return {
    x:      Math.round(b.x      / dpr),
    y:      Math.round(b.y      / dpr),
    width:  Math.round(b.width  / dpr),
    height: Math.round(b.height / dpr),
  }
}

/** Envoie les bounds logiques du jeu au renderer de l'overlay pour positionner le conteneur. */
function sendGameBounds(b: { x: number; y: number; width: number; height: number } | null) {
  sendToOverlay('overlay:game-bounds', b ? toLogicalBounds(b) : null)
}

function setOverlayEditMode(enabled: boolean): boolean {
  const ow = getOverlayWindow()
  if (!ow || ow.isDestroyed()) return false

  if (enabled) {
    if (mapCurrentlyVisible) {
      logger.info('[overlay] edit mode refused: map visible')
      return false
    }

    if (!ow.isVisible()) {
      const bounds = getGameWindowBounds()
      if (!bounds && app.isPackaged) {
        logger.info('[overlay] edit mode refused: SC non détecté')
        return false
      }

      if (bounds) sendGameBounds(bounds)
      manuallyHidden = false
      showOverlay()
    }

    overlayEditMode = true
    setOverlayInteractive(true)
    sendToOverlay('overlay:edit-mode', true)
    logger.info('[overlay] edit mode enabled')
    return true
  } 

  overlayEditMode = false
  setOverlayInteractive(false)
  if (!ow.isDestroyed() && ow.isFocused()) ow.blur()
  sendToOverlay('overlay:edit-mode', false)
  logger.info('[overlay] edit mode disabled')
  return true
}

function toggleOverlayEditMode() {
  const now = Date.now()
  if (now - lastEditToggleAt < 250) return
  lastEditToggleAt = now
  const ow = getOverlayWindow()
  // Ignore si overlay non visible
  if (!ow || !ow.isVisible()) return
  setOverlayEditMode(!overlayEditMode)
}


// ─── Main window ──────────────────────────────────────────────────────────────

function createMainWindow() {
  const settings = getSettings()
  const [w, h] = (settings.windowSize ?? '1120x760').split('x').map(Number)

  // Ouvrir la fenêtre sur l'écran où se trouve la souris
  const cursorPos = screen.getCursorScreenPoint()
  const display   = screen.getDisplayNearestPoint(cursorPos)
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea
  const winW = w || 1120
  const winH = h || 760
  const winX = Math.round(dx + (dw - winW) / 2)
  const winY = Math.round(dy + (dh - winH) / 2)

  mainWindow = new BrowserWindow({
    width:  winW,
    height: winH,
    x: winX,
    y: winY,
    minWidth: 980,
    minHeight: 680,
    resizable: false,
    useContentSize: true,
    backgroundColor: '#070b12',
    title: '1CC Desktop',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    icon: path.join(APP_ROOT, 'build/icon.ico'),
  })

  setMainWindow(mainWindow)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    setImmediate(() => {
      uIOhook.start()
      ioHookStarted = true
    })
    // Ouvrir automatiquement les DevTools de la fenêtre principale en dev
    if (!app.isPackaged) {
      setTimeout(() => mainWindow?.webContents.openDevTools({ mode: 'detach' }), 100)
    }
  })
  
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') mainWindow?.webContents.toggleDevTools()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  mainWindow.on('closed', () => {
    try {
      const ow = getOverlayWindow()
      if (ow && !ow.isDestroyed()) { try { ow.destroy() } catch {} }
    } catch {}
    try {
      const ed = getOverlayEditorWindow()
      if (ed && !ed.isDestroyed()) { try { ed.destroy() } catch {} }
    } catch {}
  })
}

// ─── Chromium flags ───────────────────────────────────────────────────────────
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disk-cache-size', '1')

// ─── App ready ────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)

  // ── Permission micro : nécessaire pour getUserMedia (WebRTC LiveKit) ──────────
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media'
  })

  // ── Referrer policy : inject Referer + Origin for all requests to the API domain
  // so that servers configured with strict-origin-when-cross-origin get a valid referrer.
  const _siteUrl = (getSettings().siteUrl ?? 'https://www.1ercorpscolonial.fr').replace(/\/$/, '')
  try {
    const _apiOrigin = new URL(_siteUrl).origin
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: [`${_apiOrigin}/*`] },
      (details, callback) => {
        details.requestHeaders['Referer'] = `${_apiOrigin}/`
        details.requestHeaders['Origin']  = _apiOrigin
        callback({ requestHeaders: details.requestHeaders })
      }
    )
  } catch { /* invalid siteUrl – skip */ }

  // Charger l'addon natif en premier — synchrone, < 5 ms
  loadNativeTracker()

  // Helper : lit overlayEnabled depuis les settings (synchrone)
  const isOverlayEnabled = () => getSettings().overlayEnabled !== false

  // L'IPC utilise getGameWindowBounds() (synchrone, cache mis à jour par le watcher)
  registerAppIpc(getGameWindowBounds, (enabled) => {
    if (!enabled) {
      // Désactivation immédiate : on cache l'overlay et on sort du mode édition
      setOverlayEditMode(false)
      mapOnlyMode = false
      mapCurrentlyVisible = false
      hideOverlay()
    } else if (isGameFocused) {
      // Réactivation : si SC est au premier plan, on réaffiche l'overlay
      const b = getGameWindowBounds()
      if (b) {
        sendGameBounds(b)
        showOverlay()
        logger.info('[overlay] overlayEnabled → true, SC focused → show')
      }
    }
  })
  registerRadioIpc()
  registerOcrIpc()

  createMainWindow()
  createOverlayWindow()

  // Register a dev-only global shortcut to toggle overlay DevTools
  if (!app.isPackaged) {
    const overlayDevtoolsShortcut = 'CommandOrControl+Shift+I'
    try {
      globalShortcut.register(overlayDevtoolsShortcut, () => {
        try {
          const ow = getOverlayWindow()
          if (!ow || ow.isDestroyed()) return
          if (ow.webContents.isDevToolsOpened()) ow.webContents.closeDevTools()
          else ow.webContents.openDevTools({ mode: 'detach' })
        } catch (e) {
          logger.warn('[main] overlay devtools toggle failed', e)
        }
      })
    } catch (e) {
      logger.warn('[main] failed to register overlay devtools shortcut', e)
    }

    app.on('will-quit', () => {
      try { globalShortcut.unregister(overlayDevtoolsShortcut) } catch {}
    })
  }

  // Initialiser le PTT radio sur la mainWindow
  if (mainWindow) {
    setPttTargetWindow(mainWindow)
    const radioSettings = getSettings()
    const bindings = radioSettings.radioPttBindings ?? []
    if (bindings.length) registerPttBindings(bindings)
  }

  // Services en arrière-plan (non bloquants)
  setImmediate(() => {
    initAutoUpdater()
      .then(() => setTimeout(() => checkForUpdatesNative().catch(() => {}), 5000))
      .catch(() => { /* ignore */ })
  })

  // Propagation des changements de layout à l'overlay
  onLayoutChange((layout) => {
    sendToOverlay('overlay:layout-update', layout)
  })


  // ── Watcher de jeu (natif, poll 250 ms) ─────────────────────────────────────
  setImmediate(() => startGameWatcher({

    onStart(bounds, focused) {
      logger.info('[overlay] SC détecté — bounds physiques', JSON.stringify(bounds))
      isGameFocused = focused
      sendGameBounds(bounds)

      if (!manuallyHidden && focused && isOverlayEnabled()) {
        showOverlay()
        logger.info('[overlay] show → SC lancé (focused)')
      } else {
        logger.info(`[overlay] SC lancé mais overlay non affiché — focused=${focused} manuallyHidden=${manuallyHidden} enabled=${isOverlayEnabled()}`)
      }
    },

    onStop() {
      logger.info('[overlay] SC fermé — hide overlay')
      isGameFocused = false
      setOverlayEditMode(false)
      mapOnlyMode = false
      mapCurrentlyVisible = false
      sendGameBounds(null)
      hideOverlay()
      manuallyHidden = false
    },

    onMinimize() {
      logger.info('[overlay] SC minimisé — hide overlay')
      isGameFocused = false
      setOverlayEditMode(false)
      mapOnlyMode = false
      mapCurrentlyVisible = false
      sendGameBounds(null)
      hideOverlay()
    },

    onRestore(foreground: boolean) {
      logger.info(`[overlay] SC restauré — foreground=${foreground} manuallyHidden=${manuallyHidden}`)
      isGameFocused = foreground
      if (manuallyHidden || !foreground || !isOverlayEnabled()) return
      const b = getGameWindowBounds()
      if (b) sendGameBounds(b)
      showOverlay()
      logger.info('[overlay] show → SC restauré')
    },

    onFocus() {
      logger.info(`[overlay] SC focus — manuallyHidden=${manuallyHidden}`)
      isGameFocused = true
      if (manuallyHidden || !isOverlayEnabled()) return
      const b = getGameWindowBounds()
      if (b) sendGameBounds(b)
      showOverlay()
      logger.info('[overlay] show → SC focus')
    },

    onUnfocus() {
      isGameFocused = false
      const ow = getOverlayWindow()
      // Mode interaction : l'overlay prend le focus → SC perd le sien.
      // On ignore complètement le hide ; la désactivation se fait via la touche.
      if (interactionActive) {
        logger.info('[overlay] SC perd le focus — mode interaction actif, ignoré')
        return
      }
      // Mode édition : même logique, mais si l'overlay n'a pas le focus
      // (alt-tab vers autre chose), on ferme l'édition sans cacher l'overlay.
      if (overlayEditMode) {
        if (ow && !ow.isDestroyed() && ow.isFocused()) {
          logger.info('[overlay] SC perd le focus — mode édition, overlay focusé, ignoré')
          return
        }
        logger.info('[overlay] SC perd le focus — mode édition, fermeture sans hide')
        setOverlayEditMode(false)
        return
      }
      logger.info('[overlay] SC perd le focus — hide overlay')
      mapOnlyMode = false
      mapCurrentlyVisible = false
      sendGameBounds(null)
      hideOverlay()
    },

    onBoundsChange(bounds) {
      const ow = getOverlayWindow()
      if (ow && !ow.isDestroyed() && ow.isVisible()) {
        logger.debug(`[overlay] bounds changed → ${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`)
        sendGameBounds(bounds)
      }
    },
  }))

  // ── Map toggle key ────────────────────────────────────────────────────────────

  const toggleMapVisibility = () => {
    if (!isGameFocused) return
    const ow = getOverlayWindow()
    if (!ow) return

    if (!ow.isVisible()) {
      // Overlay caché → entrer en map-only mode
      mapOnlyMode = true
      mapCurrentlyVisible = false
      manuallyHidden = false
      const b = getGameWindowBounds()
      if (b) sendGameBounds(b)
      showOverlay()
      sendToOverlay('overlay:map-only-mode', true)
    }

    mapCurrentlyVisible = !mapCurrentlyVisible
    sendToOverlay('overlay:map-toggle', undefined)

    // Fermeture carte en map-only → cacher l'overlay
    if (mapOnlyMode && !mapCurrentlyVisible) {
      mapOnlyMode = false
      sendToOverlay('overlay:map-only-mode', false)
      manuallyHidden = true
      hideOverlay()
    }
  }

  let _registeredMapKey: string | null = null

  function registerMapIoHook(domKeyCode?: number, accel?: string) {
    if (mapIoHookHandler) { uIOhook.off('keydown', mapIoHookHandler); mapIoHookHandler = null }
    if (typeof domKeyCode !== 'number') return
    try { if (_registeredMapKey) globalShortcut.unregister(_registeredMapKey) } catch {}
    _registeredMapKey = null
    const uiCode = domKeyCodeToUiohook(domKeyCode)
    mapIoHookHandler = (event: any) => {
      if (event?.keycode !== uiCode) return
      // If an accel (accelerator string) is provided, ensure modifiers match exactly.
      if (accel) {
        if (!accelMatchesEvent(accel, event)) return
      } else {
        // Otherwise require no modifiers for a plain keyCode mapping.
        if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return
      }
      toggleMapVisibility()
    }
    uIOhook.on('keydown', mapIoHookHandler)
  }

  function unregisterMapIoHook() {
    if (mapIoHookHandler) { uIOhook.off('keydown', mapIoHookHandler); mapIoHookHandler = null }
  }

  function registerMapToggleKey(key: string) {
    try { if (_registeredMapKey) globalShortcut.unregister(_registeredMapKey) } catch {}
    try { globalShortcut.unregister(key) } catch {}
    globalShortcut.register(key, toggleMapVisibility)
    _registeredMapKey = key
  }

  const initialMapSettings = getSettings()
  if (initialMapSettings.mapToggleKey)                            registerMapToggleKey(initialMapSettings.mapToggleKey)
  if (typeof initialMapSettings.mapToggleKeyCode === 'number')   registerMapIoHook(initialMapSettings.mapToggleKeyCode, initialMapSettings.mapToggleKey)

  ;(global as any).__setMapToggleKey = (newKey: string | ToggleKeyObject) => {
    if (typeof newKey === 'string') {
      try { if (newKey) globalShortcut.unregister(newKey) } catch {}
      registerMapToggleKey(newKey)
      unregisterMapIoHook()
    } else if (newKey && typeof newKey === 'object') {
      if (newKey.accel) {
        try { globalShortcut.unregister(newKey.accel) } catch {}
        registerMapToggleKey(newKey.accel)
      }
      if (typeof newKey.keyCode === 'number') { unregisterMapIoHook(); registerMapIoHook(newKey.keyCode, newKey.accel) }
    }
  }

  // ── Overlay toggle key ────────────────────────────────────────────────────────

  let currentKey = getSettings().toggleKey || 'F10'
  const currentKeyCode = getSettings().toggleKeyCode
  let overlayEditShortcut = getSettings().overlayEditKey || 'CommandOrControl+Shift+E'

  let lastToggleAt = 0
  const toggleOverlay = () => {
    if (interactionActive) {
      interactionActive = false
      setOverlayInteractive(false)
      sendToOverlay('overlay:interaction-mode', false)
      logger.info('[overlay] toggle → désactivation mode interaction')
    }
    const now = Date.now()
    if (now - lastToggleAt < 100) {
      logger.debug('[overlay] toggle ignoré (debounce)')
      return
    }
    lastToggleAt = now

    if (mapCurrentlyVisible) return
    if (!isOverlayEnabled()) return
    const ow = getOverlayWindow()
    if (!ow) return

    if (ow.isVisible()) {
      logger.info('[overlay] toggle → hide (manuallyHidden)')
      setOverlayEditMode(false)
      mapOnlyMode = false
      mapCurrentlyVisible = false
      sendToOverlay('overlay:map-only-mode', false)
      hideOverlay()
      manuallyHidden = true
      return
    }

    mapOnlyMode = false
    mapCurrentlyVisible = false
    sendToOverlay('overlay:map-only-mode', false)
    manuallyHidden = false

    const b = getGameWindowBounds()
    if (b) {
      logger.info('[overlay] toggle → show (SC running)')
      sendGameBounds(b)
      showOverlay()
      return
    }

    logger.info('[overlay] toggle → SC non détecté, affiche en dev')

    if (app.isPackaged) return

    // En dev : afficher en plein écran principal sans SC
    showOverlay()
  }

  function registerIoHook(domKeyCode?: number, accel?: string) {
    if (ioHookHandler) { uIOhook.off('keydown', ioHookHandler); ioHookHandler = null }
    if (typeof domKeyCode !== 'number') return
    const uiCode = domKeyCodeToUiohook(domKeyCode)
    ioHookHandler = (event: any) => {
      if (event?.keycode !== uiCode) return
      if (accel) {
        if (!accelMatchesEvent(accel, event)) return
      } else {
        if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return
      }
      toggleOverlay()
    }
    uIOhook.on('keydown', ioHookHandler)
  }

  function unregisterIoHook() {
    if (ioHookHandler) { uIOhook.off('keydown', ioHookHandler); ioHookHandler = null }
  }

  let _registeredToggleKey: string | null = null
  function registerToggleKey(key: string) {
    try { if (_registeredToggleKey) globalShortcut.unregister(_registeredToggleKey) } catch {}
    const ok = globalShortcut.register(key, toggleOverlay)
    _registeredToggleKey = ok ? key : null
    if (!ok) {
      const ok2 = globalShortcut.register('F10', toggleOverlay)
      if (ok2) _registeredToggleKey = 'F10'
    }
    // Fallback uIOhook via table accel (fonctionne même quand le jeu a le focus)
    const uiCode = accelToUiohook(key)
    if (uiCode !== null) registerIoHook2(uiCode, key)
  }

  /** Enregistre uIOhook sans toucher au keyCode persisté (utilisé par registerToggleKey). */
  function registerIoHook2(uiCode: number, accel?: string) {
    if (ioHookHandler) { uIOhook.off('keydown', ioHookHandler); ioHookHandler = null }
    ioHookHandler = (event: any) => {
      if (event?.keycode !== uiCode) return
      if (accel) {
        if (!accelMatchesEvent(accel, event)) return
      } else {
        if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return
      }
      toggleOverlay()
    }
    uIOhook.on('keydown', ioHookHandler)
  }

  registerToggleKey(currentKey)
  if (typeof currentKeyCode === 'number') registerIoHook(currentKeyCode, currentKey)

  function registerEditKey(accel: string, domCode: number | null | undefined) {
    try { globalShortcut.unregister(overlayEditShortcut) } catch {}
    overlayEditShortcut = accel
    try { globalShortcut.register(accel, toggleOverlayEditMode) } catch {}
    if (editIoHookKeyDown) { uIOhook.off('keydown', editIoHookKeyDown); editIoHookKeyDown = null }
    if (editIoHookKeyUp)   { uIOhook.off('keyup',   editIoHookKeyUp);   editIoHookKeyUp   = null }
    if (domCode) {
      editIoHookKeyDown = (event: any) => { if (accelMatchesEvent(accel, event)) toggleOverlayEditMode() }
      uIOhook.on('keydown', editIoHookKeyDown)
    } else {
      editIoHookKeyDown = (event: any) => {
        if (event?.keycode === 29 || event?.keycode === 3613) editCtrlPressed = true
        if (event?.keycode === 42 || event?.keycode === 54) editShiftPressed = true
        if (event?.keycode === 18 && editCtrlPressed && editShiftPressed) toggleOverlayEditMode()
      }
      editIoHookKeyUp = (event: any) => {
        if (event?.keycode === 29 || event?.keycode === 3613) editCtrlPressed = false
        if (event?.keycode === 42 || event?.keycode === 54) editShiftPressed = false
      }
      uIOhook.on('keydown', editIoHookKeyDown)
      uIOhook.on('keyup',   editIoHookKeyUp)
    }
  }
  const _es = getSettings()
  registerEditKey(_es.overlayEditKey || 'CommandOrControl+Shift+E', _es.overlayEditKeyCode)

  ;(global as any).__setToggleKey = (newKey: string | ToggleKeyObject) => {
    if (typeof newKey === 'string') {
      currentKey = newKey
      registerToggleKey(newKey)
    } else if (newKey && typeof newKey === 'object') {
      if (newKey.accel) { currentKey = newKey.accel; registerToggleKey(newKey.accel) }
      if (typeof newKey.keyCode === 'number') { unregisterIoHook(); registerIoHook(newKey.keyCode, newKey.accel) }
    }
  }

  ;(global as any).__setOverlayEditKey = (payload: { accel: string; keyCode: number | null } | null) => {
    registerEditKey(payload?.accel || 'CommandOrControl+Shift+E', payload?.keyCode ?? null)
  }

  ;(global as any).__setOverlayEditMode = (enabled: boolean) => {
    return setOverlayEditMode(Boolean(enabled))
  }

  // ── Hotkeys de modes ─────────────────────────────────────────────────────────

  const modeHotkeyHandlers = new Map<string, (e: any) => void>()

  function registerModeHotkeys() {
    // Nettoyer les anciens handlers
    for (const handler of modeHotkeyHandlers.values()) {
      uIOhook.off('keydown', handler)
    }
    modeHotkeyHandlers.clear()

    const registry = getRegistry()
    for (const mode of registry.modes) {
      const uiCode = mode.hotkey
        ? accelToUiohook(mode.hotkey)
        : typeof mode.hotkeyCode === 'number'
          ? DOM_TO_UIOHOOK[mode.hotkeyCode] ?? null
          : null

      if (uiCode === null) continue

      const modeId  = mode.id
      const hotkey  = mode.hotkey ?? null
      const handler = (event: any) => {
        // Si on a un accelerator complet, vérifier aussi les modificateurs
        if (hotkey ? !accelMatchesEvent(hotkey, event) : event?.keycode !== uiCode) return
        setActiveMode(modeId)
        sendToOverlay('overlay:layout-update', getLayout())
        sendToOverlay('overlay:active-mode', modeId)
      }
      uIOhook.on('keydown', handler)
      modeHotkeyHandlers.set(modeId, handler)
    }
  }

  registerModeHotkeys()
  onRegistryChange(() => registerModeHotkeys())

  // ── Touche de cycle de modes ──────────────────────────────────────────────────

  let cycleModeHandler: ((e: any) => void) | null = null

  function cycleToNextMode() {
    const registry = getRegistry()
    const idx = registry.modes.findIndex((m) => m.id === registry.activeModeId)
    const nextIdx = (idx + 1) % registry.modes.length
    const nextMode = registry.modes[nextIdx]
    if (!nextMode) return
    setActiveMode(nextMode.id)
    sendToOverlay('overlay:layout-update', getLayout())
    sendToOverlay('overlay:active-mode', nextMode.id)
  }

  function registerCycleModeKey(accel?: string | null, keyCode?: number | null) {
    if (cycleModeHandler) { uIOhook.off('keydown', cycleModeHandler); cycleModeHandler = null }

    if (accel) {
      const uiCode = accelToUiohook(accel)
      if (uiCode !== null) {
        cycleModeHandler = (e: any) => { if (accelMatchesEvent(accel, e)) cycleToNextMode() }
        uIOhook.on('keydown', cycleModeHandler)
      }
    } else if (typeof keyCode === 'number') {
      const uiCode = DOM_TO_UIOHOOK[keyCode]
      if (uiCode !== undefined) {
        cycleModeHandler = (e: any) => { if (e?.keycode === uiCode && !e.ctrlKey && !e.altKey && !e.shiftKey) cycleToNextMode() }
        uIOhook.on('keydown', cycleModeHandler)
      }
    }
  }

  const initialCycleKey = getSettings().cycleModeKey
  const initialCycleKeyCode = getSettings().cycleModeKeyCode
  registerCycleModeKey(initialCycleKey, initialCycleKeyCode)

  ;(global as any).__setCycleModeKey = (payload: string | { accel: string; keyCode: number | null } | null) => {
    if (!payload) { registerCycleModeKey(null, null); return }
    if (typeof payload === 'string') registerCycleModeKey(payload, null)
    else registerCycleModeKey(payload.accel || null, payload.keyCode)
  }

  // ─── Touche cycle modes généraux ────────────────────────────────────────────

  let cycleBuiltInHandler: ((e: any) => void) | null = null

  function cycleToNextBuiltIn() {
    const registry = getRegistry()
    const builtIn = registry.modes.filter((m) => m.builtIn)
    if (builtIn.length < 2) return
    const idx = builtIn.findIndex((m) => m.id === registry.activeModeId)
    const nextIdx = (idx + 1) % builtIn.length
    const next = builtIn[nextIdx]
    if (!next) return
    setActiveMode(next.id)
    sendToOverlay('overlay:layout-update', getLayout())
    sendToOverlay('overlay:active-mode', next.id)
  }

  function registerCycleBuiltInKey(accel?: string | null, keyCode?: number | null) {
    if (cycleBuiltInHandler) { uIOhook.off('keydown', cycleBuiltInHandler); cycleBuiltInHandler = null }
    if (accel) {
      const uiCode = accelToUiohook(accel)
      if (uiCode !== null) {
        cycleBuiltInHandler = (e: any) => { if (accelMatchesEvent(accel, e)) cycleToNextBuiltIn() }
        uIOhook.on('keydown', cycleBuiltInHandler)
      }
    } else if (typeof keyCode === 'number') {
      const uiCode = DOM_TO_UIOHOOK[keyCode]
      if (uiCode !== undefined) {
        cycleBuiltInHandler = (e: any) => { if (e?.keycode === uiCode && !e.ctrlKey && !e.altKey && !e.shiftKey) cycleToNextBuiltIn() }
        uIOhook.on('keydown', cycleBuiltInHandler)
      }
    }
  }

  registerCycleBuiltInKey(getSettings().cycleBuiltInKey, getSettings().cycleBuiltInKeyCode)

  ;(global as any).__setCycleBuiltInKey = (payload: { accel: string; keyCode: number | null } | null) => {
    if (!payload) { registerCycleBuiltInKey(null, null); return }
    registerCycleBuiltInKey(payload.accel || null, payload.keyCode)
  }

  // ─── Touche cycle modes personnalisés ──────────────────────────────────────

  let cycleCustomHandler: ((e: any) => void) | null = null

  function cycleToNextCustom() {
    const registry = getRegistry()
    const custom = registry.modes.filter((m) => !m.builtIn)
    if (custom.length < 2) return
    const idx = custom.findIndex((m) => m.id === registry.activeModeId)
    const nextIdx = (idx + 1) % custom.length
    const next = custom[nextIdx]
    if (!next) return
    setActiveMode(next.id)
    sendToOverlay('overlay:layout-update', getLayout())
    sendToOverlay('overlay:active-mode', next.id)
  }

  function registerCycleCustomKey(accel?: string | null, keyCode?: number | null) {
    if (cycleCustomHandler) { uIOhook.off('keydown', cycleCustomHandler); cycleCustomHandler = null }
    if (accel) {
      const uiCode = accelToUiohook(accel)
      if (uiCode !== null) {
        cycleCustomHandler = (e: any) => { if (accelMatchesEvent(accel, e)) cycleToNextCustom() }
        uIOhook.on('keydown', cycleCustomHandler)
      }
    } else if (typeof keyCode === 'number') {
      const uiCode = DOM_TO_UIOHOOK[keyCode]
      if (uiCode !== undefined) {
        cycleCustomHandler = (e: any) => { if (e?.keycode === uiCode && !e.ctrlKey && !e.altKey && !e.shiftKey) cycleToNextCustom() }
        uIOhook.on('keydown', cycleCustomHandler)
      }
    }
  }

  registerCycleCustomKey(getSettings().cycleCustomKey, getSettings().cycleCustomKeyCode)

  ;(global as any).__setCycleCustomKey = (payload: { accel: string; keyCode: number | null } | null) => {
    if (!payload) { registerCycleCustomKey(null, null); return }
    registerCycleCustomKey(payload.accel || null, payload.keyCode)
  }

  // ─── Touche cycle profil OCR ─────────────────────────────────────────────

  let ocrCycleHandler: ((e: any) => void) | null = null

  function registerOcrCycleProfileKey(accel?: string | null, keyCode?: number | null) {
    if (ocrCycleHandler) { uIOhook.off('keydown', ocrCycleHandler); ocrCycleHandler = null }
    if (accel) {
      const uiCode = accelToUiohook(accel)
      if (uiCode !== null) {
        ocrCycleHandler = (e: any) => {
          if (!accelMatchesEvent(accel, e)) return
          const label: string | null = (global as any).__cycleOcrProfile?.()
          if (label) {
            sendToOverlay('overlay:notification', {
              id: 'ocr-profile-' + Date.now(),
              title: 'Profil OCR',
              message: label,
              type: 'info',
              duration: 2500,
            })
          }
        }
        uIOhook.on('keydown', ocrCycleHandler)
      }
    } else if (typeof keyCode === 'number') {
      const uiCode = DOM_TO_UIOHOOK[keyCode]
      if (uiCode !== undefined) {
        ocrCycleHandler = (e: any) => {
          if (e?.keycode !== uiCode || e.ctrlKey || e.altKey || e.shiftKey) return
          const label: string | null = (global as any).__cycleOcrProfile?.()
          if (label) {
            sendToOverlay('overlay:notification', {
              id: 'ocr-profile-' + Date.now(),
              title: 'Profil OCR',
              message: label,
              type: 'info',
              duration: 2500,
            })
          }
        }
        uIOhook.on('keydown', ocrCycleHandler)
      }
    }
  }

  registerOcrCycleProfileKey(getSettings().ocrCycleProfileKey, getSettings().ocrCycleProfileKeyCode)

  ;(global as any).__setOcrCycleProfileKey = (payload: { accel: string; keyCode: number | null } | null) => {
    if (!payload) { registerOcrCycleProfileKey(null, null); return }
    registerOcrCycleProfileKey(payload.accel || null, payload.keyCode)
  }

  // ─── Touche interaction modules ──────────────────────────────────────────

  let interactionActive = false
  let interactionKeydownHandler: ((e: any) => void) | null = null
  let interactionKeyupHandler: ((e: any) => void) | null = null

  function pushInteractionNotif(active: boolean) {
    sendToOverlay('overlay:notification', {
      id: 'interaction-' + Date.now(),
      title: 'Interaction souris',
      message: active ? 'Mode interaction activé' : 'Mode interaction désactivé',
      type: 'info',
      duration: 2000,
    })
  }

  function registerInteractionKey(accel: string | null, domCode: number | null | undefined, mode: 'hold' | 'toggle' = 'toggle') {
    if (interactionKeydownHandler) { uIOhook.off('keydown', interactionKeydownHandler); interactionKeydownHandler = null }
    if (interactionKeyupHandler)   { uIOhook.off('keyup',   interactionKeyupHandler);   interactionKeyupHandler   = null }
    if (!domCode || !accel) { logger.info('[overlay] interaction: aucune touche configuree'); return }
    const uiCode = domKeyCodeToUiohook(domCode)
    logger.info('[overlay] interaction key registered: ' + accel + ' uiCode=' + uiCode + ' mode=' + mode)
    if (mode === 'toggle') {
      interactionKeydownHandler = (e: any) => {
        if (e?.keycode !== uiCode) return
        if (!accelMatchesEvent(accel, e)) return
        if (overlayEditMode) { logger.info('[overlay] interaction ignoree: edit mode actif'); return }
        interactionActive = !interactionActive
        setOverlayInteractive(interactionActive)
        sendToOverlay('overlay:interaction-mode', interactionActive)
        logger.info('[overlay] interaction mode ' + (interactionActive ? 'active' : 'desactive') + ' (toggle)')
        pushInteractionNotif(interactionActive)
      }
      uIOhook.on('keydown', interactionKeydownHandler)
    } else {
      interactionKeydownHandler = (e: any) => {
        if (e?.keycode !== uiCode || interactionActive) return
        if (!accelMatchesEvent(accel, e)) return
        if (overlayEditMode) { logger.info('[overlay] interaction ignoree: edit mode actif'); return }
        interactionActive = true
        setOverlayInteractive(true)
        sendToOverlay('overlay:interaction-mode', true)
        logger.info('[overlay] interaction mode active (hold)')
        pushInteractionNotif(true)
      }
      interactionKeyupHandler = (e: any) => {
        if (e?.keycode !== uiCode || !interactionActive) return
        interactionActive = false
        if (!overlayEditMode) {
          setOverlayInteractive(false)
          sendToOverlay('overlay:interaction-mode', false)
          logger.info('[overlay] interaction mode desactive (hold)')
          pushInteractionNotif(false)
        }
      }
      uIOhook.on('keydown', interactionKeydownHandler)
      uIOhook.on('keyup', interactionKeyupHandler)
    }
  }

  const _is = getSettings()
  registerInteractionKey(_is.interactionKey ?? null, _is.interactionKeyCode, _is.interactionKeyMode ?? 'toggle')

  ;(global as any).__setInteractionKey = (payload: { accel: string; keyCode: number | null } | null) => {
    const mode = getSettings().interactionKeyMode ?? 'toggle'
    registerInteractionKey(payload?.accel ?? null, payload?.keyCode ?? null, mode)
  }
  ;(global as any).__setInteractionKeyMode = (mode: 'hold' | 'toggle') => {
    const s = getSettings()
    registerInteractionKey(s.interactionKey ?? null, s.interactionKeyCode, mode)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// ─── Nettoyage ────────────────────────────────────────────────────────────────

// Stopper uIOhook le plus tôt possible (avant la destruction des fenêtres)
// pour éviter le lag souris causé par un hook Windows orphelin en fin de vie.
app.on('before-quit', () => {
  if (ioHookStarted) {
    try { uIOhook.stop() } catch { /* ignore */ }
    ioHookStarted = false
  }
  stopGameWatcher()
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  try {
    const ow = getOverlayWindow()
    if (ow && !ow.isDestroyed()) { try { ow.destroy() } catch {} }
  } catch {}
  try {
    const ed = getOverlayEditorWindow()
    if (ed && !ed.isDestroyed()) { try { ed.destroy() } catch {} }
  } catch {}

  if (process.platform !== 'darwin') app.quit()
})
