import { app, BrowserWindow, shell, screen, globalShortcut, Menu } from 'electron'
import path from 'node:path'
import { logger } from './services/logger'
import { registerAppIpc } from './ipc/app.ipc'
import { createOverlayWindow, showOverlay, hideOverlay, setOverlayBounds, sendToOverlay, getOverlayWindow } from './windows/overlayWindow'
import { updateEditorBounds, closeOverlayEditor, getOverlayEditorWindow } from './windows/overlayEditorWindow'
import { startGameWatcher, stopGameWatcher, getGameWindowBounds } from './services/gameWatcher'
import { initAutoUpdater } from './services/autoUpdaterService'
import { startWindowStateWatcher, stopWindowStateWatcher, killPersistentPS } from './services/windowStateWatcher'
import { logParser } from './services/logParserService'
import { getSettings } from './services/settingsStore'
import { startAutoUpdateChecker } from './services/overlayService'
import { getLayout, onLayoutChange } from './services/layoutStore'
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

const APP_ROOT = app.getAppPath()
const RENDERER_DIST = path.join(APP_ROOT, 'dist')

let mainWindow: BrowserWindow | null = null
let boundsInterval: ReturnType<typeof setInterval> | null = null
let ioHookHandler: ((e: any) => void) | null = null
let mapIoHookHandler: ((e: any) => void) | null = null
let ioHookStarted = false
let manuallyHidden = false
let currentGameBounds: { x: number; y: number; width: number; height: number } | null = null

function toLogicalBounds(b: { x: number; y: number; width: number; height: number }) {
  const dpr = screen.getPrimaryDisplay().scaleFactor ?? 1
  return {
    x: Math.round(b.x / dpr),
    y: Math.round(b.y / dpr),
    width: Math.round(b.width / dpr),
    height: Math.round(b.height / dpr),
  }
}

async function refreshOverlayBounds() {
  const b = await getGameWindowBounds()
  if (b) {
    currentGameBounds = b
    const ow = getOverlayWindow()
    if (ow && !ow.isDestroyed()) {
      ow.setBounds(toLogicalBounds(b))
      ow.setAlwaysOnTop(true, 'screen-saver')
      if (!manuallyHidden && !ow.isVisible()) ow.showInactive()
    }
    updateEditorBounds(b)
  }
}

function showOverlayIfInGame() {
  const state = logParser.getState()
  if (state.shard && state.activity !== 'hangar') {
    if (!manuallyHidden) showOverlay()
  }
}

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
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') mainWindow?.webContents.toggleDevTools()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // When main window is closed, ensure overlay and editor are closed/destroyed
  mainWindow.on('closed', () => {
    try {
      const ow = getOverlayWindow()
      if (ow && !ow.isDestroyed()) {
        try { ow.destroy() } catch {}
      }
    } catch {}

    try {
      const ed = getOverlayEditorWindow()
      if (ed && !ed.isDestroyed()) {
        try { ed.destroy() } catch {}
      }
    } catch {}
  })
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerAppIpc(() => currentGameBounds)
  createMainWindow()
  createOverlayWindow()

  // Start automatic update checks (reads settings.updateCheckInterval if present)
  try { startAutoUpdateChecker() } catch (e) { /* ignore */ }
  try { initAutoUpdater() } catch (e) { /* ignore */ }

  // Propagate layout changes to overlay immediately
  onLayoutChange((layout) => {
    sendToOverlay('overlay:layout-update', layout)
  })

  // Propagate game log events to overlay
  logParser.on((state, event) => {
    sendToOverlay('overlay:state', state)
    sendToOverlay('overlay:event', event)

    if (!manuallyHidden) {
      if (event.type === 'shard') showOverlay()
      else if (event.type === 'activity' && event.payload.activity === 'hangar') hideOverlay()
    }
  })

  startGameWatcher({
    onStart(bounds) {
      currentGameBounds = bounds
      setOverlayBounds(toLogicalBounds(bounds))

      if (boundsInterval) clearInterval(boundsInterval)
      boundsInterval = setInterval(() => refreshOverlayBounds(), 5000)

      const { gameFolder } = getSettings()
      if (gameFolder) {
        logParser.start(gameFolder)
        showOverlayIfInGame()
      }

      const toggleOverlay = async () => {
        if (getOverlayWindow()?.isVisible()) {
          hideOverlay()
          manuallyHidden = true
        } else {
          manuallyHidden = false
          await refreshOverlayBounds()
        }
      }

      startWindowStateWatcher({
        onMinimize: hideOverlay,
        onRestore: async () => {
          if (manuallyHidden) return
          const state = logParser.getState()
          if (state.shard && state.activity !== 'hangar') await refreshOverlayBounds()
        },
        onFocus: async () => {
          if (manuallyHidden) return
          const state = logParser.getState()
          if (state.shard && state.activity !== 'hangar') await refreshOverlayBounds()
        },
        onUnfocus: () => {
          hideOverlay()
        },
      })
    },

    onStop() {
      if (boundsInterval) { clearInterval(boundsInterval); boundsInterval = null }
      currentGameBounds = null
      stopWindowStateWatcher()
      logParser.stop()
      hideOverlay()
      manuallyHidden = false
    },
  })

  // Map toggle key setup
  const toggleMapVisibility = () => {
    sendToOverlay('overlay:map-toggle', undefined)
  }

  let _registeredMapKey: string | null = null

  function registerMapIoHook(domKeyCode?: number) {
    if (mapIoHookHandler) { uIOhook.off('keydown', mapIoHookHandler); mapIoHookHandler = null }
    if (typeof domKeyCode !== 'number') return
    // uIOhook prend la main : désenregistrer globalShortcut pour éviter le double-toggle
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
  const initialMapKey = initialMapSettings.mapToggleKey
  const initialMapKeyCode = initialMapSettings.mapToggleKeyCode

  if (initialMapKey) registerMapToggleKey(initialMapKey)
  if (typeof initialMapKeyCode === 'number') registerMapIoHook(initialMapKeyCode)

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

  // Toggle key setup
  let currentKey = getSettings().toggleKey || 'F10'
  const currentKeyCode = getSettings().toggleKeyCode

  const toggleOverlay = () => {
    const ow = getOverlayWindow()
    if (!ow) return

    if (ow.isVisible()) {
      hideOverlay()
      manuallyHidden = true
      return
    }

    // We want to show the overlay
    manuallyHidden = false

    if (currentGameBounds) {
      // In-game: follow the game window bounds as usual
      void refreshOverlayBounds()
      return
    }

    // If no game is running, still allow opening the overlay via shortcut
    // using the primary display bounds.
    const workArea = screen.getPrimaryDisplay().workArea
    setOverlayBounds({
      x: Math.round(workArea.x),
      y: Math.round(workArea.y),
      width: Math.round(workArea.width),
      height: Math.round(workArea.height),
    })
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

  // Export toggle key change handler via IPC
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

  uIOhook.on('keydown', (e: any) => { /* debug */ })
  uIOhook.start()
  ioHookStarted = true

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  stopGameWatcher()
  stopWindowStateWatcher()
  killPersistentPS()
  globalShortcut.unregisterAll()
  if (ioHookStarted) { try { uIOhook.stop() } catch { /* ignore */ } }
  // Make sure overlay/editor windows are destroyed before quitting
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
