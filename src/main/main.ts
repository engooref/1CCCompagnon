import { app, BrowserWindow, shell, screen, globalShortcut, Menu } from 'electron'
import path from 'node:path'
import { logger } from './services/logger'
import { registerAppIpc } from './ipc/app.ipc'
import { createOverlayWindow, showOverlay, hideOverlay, sendToOverlay, getOverlayWindow } from './windows/overlayWindow'
import { setMainWindow } from './windows/mainWindow'
import { getOverlayEditorWindow } from './windows/overlayEditorWindow'
import { startGameWatcher, stopGameWatcher, getGameWindowBounds } from './services/gameWatcher'
import { loadNativeTracker } from './services/scTrackerNative'
import { initAutoUpdater, checkForUpdatesNative } from './services/autoUpdaterService'
import { logParser } from './services/logParserService'
import { getSettings } from './services/settingsStore'
import { startAutoUpdateChecker } from './services/overlayService'
import { onLayoutChange } from './services/layoutStore'
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
let ioHookStarted  = false
let manuallyHidden = false
let isGameFocused  = false

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


// ─── Main window ──────────────────────────────────────────────────────────────

function createMainWindow() {
  const settings = getSettings()
  const [w, h] = (settings.windowSize ?? '1120x760').split('x').map(Number)

  mainWindow = new BrowserWindow({
    width:  w || 1120,
    height: h || 760,
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

// ─── App ready ────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)

  // Charger l'addon natif en premier — synchrone, < 5 ms
  loadNativeTracker()

  // L'IPC utilise getGameWindowBounds() (synchrone, cache mis à jour par le watcher)
  registerAppIpc(getGameWindowBounds)

  createMainWindow()
  createOverlayWindow()

  // Services en arrière-plan (non bloquants)
  setImmediate(() => {
    try { startAutoUpdateChecker() } catch { /* ignore */ }
    initAutoUpdater()
      .then(() => setTimeout(() => checkForUpdatesNative().catch(() => {}), 5000))
      .catch(() => { /* ignore */ })
  })

  // Propagation des changements de layout à l'overlay
  onLayoutChange((layout) => {
    sendToOverlay('overlay:layout-update', layout)
  })

  // Propagation des événements de jeu à l'overlay + logique show/hide
  logParser.on((state, event) => {
    sendToOverlay('overlay:state', state)
    sendToOverlay('overlay:event', event)

    if (!manuallyHidden) {
      if (event.type === 'shard' && isGameFocused) showOverlay()
      else if (event.type === 'activity' && event.payload.activity === 'hangar') hideOverlay()
    }
  })

  // ── Watcher de jeu (natif, poll 250 ms) ─────────────────────────────────────
  setImmediate(() => startGameWatcher({

    onStart(bounds, focused) {
      logger.info('[overlay] SC détecté — bounds physiques', JSON.stringify(bounds))
      isGameFocused = focused
      sendGameBounds(bounds)

      const { gameFolder } = getSettings()
      if (gameFolder) logParser.start(gameFolder)

      if (!manuallyHidden && focused) {
        showOverlay()
        logger.info('[overlay] show → SC lancé (focused)')
      } else {
        logger.info(`[overlay] SC lancé mais overlay non affiché — focused=${focused} manuallyHidden=${manuallyHidden}`)
      }
    },

    onStop() {
      logger.info('[overlay] SC fermé — hide overlay')
      isGameFocused = false
      logParser.stop()
      sendGameBounds(null)
      hideOverlay()
      manuallyHidden = false
    },

    onMinimize() {
      logger.info('[overlay] SC minimisé — hide overlay')
      isGameFocused = false
      sendGameBounds(null)
      hideOverlay()
    },

    onRestore(foreground: boolean) {
      logger.info(`[overlay] SC restauré — foreground=${foreground} manuallyHidden=${manuallyHidden}`)
      isGameFocused = foreground
      if (manuallyHidden || !foreground) return
      const b = getGameWindowBounds()
      if (b) sendGameBounds(b)
      showOverlay()
      logger.info('[overlay] show → SC restauré')
    },

    onFocus() {
      logger.info(`[overlay] SC focus — manuallyHidden=${manuallyHidden}`)
      isGameFocused = true
      if (manuallyHidden) return
      const b = getGameWindowBounds()
      if (b) sendGameBounds(b)
      showOverlay()
      logger.info('[overlay] show → SC focus')
    },

    onUnfocus() {
      logger.info('[overlay] SC perd le focus — hide overlay')
      isGameFocused = false
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
    sendToOverlay('overlay:map-toggle', undefined)
  }

  let _registeredMapKey: string | null = null

  function registerMapIoHook(domKeyCode?: number) {
    if (mapIoHookHandler) { uIOhook.off('keydown', mapIoHookHandler); mapIoHookHandler = null }
    if (typeof domKeyCode !== 'number') return
    try { if (_registeredMapKey) globalShortcut.unregister(_registeredMapKey) } catch {}
    _registeredMapKey = null
    const uiCode = domKeyCodeToUiohook(domKeyCode)
    mapIoHookHandler = (event: any) => {
      if (event?.keycode === uiCode) toggleMapVisibility()
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
  if (typeof initialMapSettings.mapToggleKeyCode === 'number')   registerMapIoHook(initialMapSettings.mapToggleKeyCode)

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
      if (typeof newKey.keyCode === 'number') { unregisterMapIoHook(); registerMapIoHook(newKey.keyCode) }
    }
  }

  // ── Overlay toggle key ────────────────────────────────────────────────────────

  let currentKey = getSettings().toggleKey || 'F10'
  const currentKeyCode = getSettings().toggleKeyCode

  const toggleOverlay = () => {
    const ow = getOverlayWindow()
    if (!ow) return

    if (ow.isVisible()) {
      logger.info('[overlay] toggle → hide (manuallyHidden)')
      hideOverlay()
      manuallyHidden = true
      return
    }

    manuallyHidden = false

    const b = getGameWindowBounds()
    if (b) {
      logger.info('[overlay] toggle → show (SC running)')
      sendGameBounds(b)
      showOverlay()
      return
    }

    logger.info('[overlay] toggle → SC non détecté, overlay non affiché')

    if (app.isPackaged) return

    // En dev : afficher en plein écran principal sans SC
    showOverlay()
  }

  function registerIoHook(domKeyCode?: number) {
    if (ioHookHandler) { uIOhook.off('keydown', ioHookHandler); ioHookHandler = null }
    if (typeof domKeyCode !== 'number') return
    const uiCode = domKeyCodeToUiohook(domKeyCode)
    ioHookHandler = (event: any) => {
      if (event?.keycode === uiCode) toggleOverlay()
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
  }

  registerToggleKey(currentKey)
  if (typeof currentKeyCode === 'number') registerIoHook(currentKeyCode)

  ;(global as any).__setToggleKey = (newKey: string | ToggleKeyObject) => {
    if (typeof newKey === 'string') {
      currentKey = newKey
      registerToggleKey(newKey)
      unregisterIoHook()
    } else if (newKey && typeof newKey === 'object') {
      if (newKey.accel) { currentKey = newKey.accel; registerToggleKey(newKey.accel) }
      if (typeof newKey.keyCode === 'number') { unregisterIoHook(); registerIoHook(newKey.keyCode) }
    }
  }

  uIOhook.on('keydown', (_e: any) => { /* debug hook */ })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// ─── Nettoyage ────────────────────────────────────────────────────────────────

app.on('window-all-closed', () => {
  stopGameWatcher()
  globalShortcut.unregisterAll()
  if (ioHookStarted) { try { uIOhook.stop() } catch { /* ignore */ } }

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
