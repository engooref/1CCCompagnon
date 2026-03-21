import path from 'node:path'
import { app as electronApp, ipcMain, dialog, BrowserWindow, screen, Notification } from 'electron'
import { clearApiKey, getApiKey, setApiKey } from '../services/secureStore'
import { authenticateOverlay, checkConnection, getAppVersion, checkForUpdates, installUpdate, startAutoUpdateChecker, stopAutoUpdateChecker } from '../services/overlayService'
import { initAutoUpdater, checkForUpdatesNative, downloadUpdateNative, installUpdateAndQuit, setFeedUrl } from '../services/autoUpdaterService'
import { getSettings, setSettings } from '../services/settingsStore'
import { startMercureSse, stopMercureSse } from '../services/mercureService'
import { logParser } from '../services/logParserService'
import { getLayout, saveLayout } from '../services/layoutStore'
import type { OverlayContext } from '../../shared/general'
import { sendToOverlay } from '../windows/overlayWindow'
import { openOverlayEditor, sendToEditor, closeOverlayEditor } from '../windows/overlayEditorWindow'
import { logger } from '../services/logger'

type GetGameBounds = () => { x: number; y: number; width: number; height: number } | null

let gamelogListener: ((state: unknown, event: unknown) => void) | null = null

export function registerAppIpc(getGameBounds: GetGameBounds) {
  ipcMain.handle('app:get-settings', async () => getSettings())
  ipcMain.handle('app:update-settings', async (_e, partial) => {
    const updated = setSettings(partial)
    sendToOverlay('overlay:settings-update', updated)
    return updated
  })

  ipcMain.handle('app:set-window-size', async (event, size: string) => {
    const [w, h] = size.split('x').map(Number)
    if (!w || !h) return false
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.setResizable(true)
      win.setContentSize(w, h, true)
      win.setResizable(false)
    }
    setSettings({ windowSize: size })
    return true
  })

  ipcMain.handle('app:set-toggle-key', async (_e, payload: any) => {
    const setKey = (global as any).__setToggleKey
    if (typeof payload === 'string') {
      setSettings({ toggleKey: payload, toggleKeyCode: null })
      setKey?.(payload)
    } else if (payload && typeof payload === 'object') {
      const accel = payload.accel ?? payload.accelerator ?? payload.key ?? ''
      const keyCode = typeof payload.keyCode === 'number' ? payload.keyCode : null
      setSettings({ toggleKey: accel, toggleKeyCode: keyCode })
      setKey?.({ accel, keyCode })
    }
    return true
  })

  ipcMain.handle('app:set-map-toggle-key', async (_e, payload: any) => {
    const setKey = (global as any).__setMapToggleKey
    if (typeof payload === 'string') {
      setSettings({ mapToggleKey: payload, mapToggleKeyCode: null })
      setKey?.(payload)
    } else if (payload && typeof payload === 'object') {
      const accel = payload.accel ?? payload.accelerator ?? payload.key ?? ''
      const keyCode = typeof payload.keyCode === 'number' ? payload.keyCode : null
      setSettings({ mapToggleKey: accel, mapToggleKeyCode: keyCode })
      setKey?.({ accel, keyCode })
    }
    return true
  })

  ipcMain.handle('app:get-api-key', async () => getApiKey())
  ipcMain.handle('app:get-version', async () => getAppVersion())
  ipcMain.handle('app:check-updates', async () => checkForUpdates())
  ipcMain.handle('app:install-update', async (_e, url: string) => installUpdate(url))
  ipcMain.handle('app:enable-auto-update', async (_e, enabled: boolean) => {
    if (enabled) startAutoUpdateChecker()
    else stopAutoUpdateChecker()
    return true
  })

  // Native auto-updater (electron-updater)
  ipcMain.handle('app:init-auto-updater', async () => { await initAutoUpdater(); return true })
  ipcMain.handle('app:auto-check-updates-native', async () => { return await checkForUpdatesNative() })
  ipcMain.handle('app:auto-download-update-native', async () => { return await downloadUpdateNative() })
  ipcMain.handle('app:auto-install-update-native', async () => { await installUpdateAndQuit(); return true })
  ipcMain.handle('app:set-update-feed', async (_e, url: string) => { setFeedUrl(url); return true })
  ipcMain.handle('app:set-api-key', async (_e, apiKey: string) => { await setApiKey(apiKey); return true })
  ipcMain.handle('app:clear-api-key', async () => { await clearApiKey(); return true })
  ipcMain.handle('app:check-connection', async () => checkConnection())
  ipcMain.handle('app:overlay-auth', async () => authenticateOverlay())

  ipcMain.handle('mercure:connect', (event, url: string) => {
    const sender = event.sender
    startMercureSse(
      sender.id,
      url,
      (data: string)   => { if (!sender.isDestroyed()) sender.send('mercure:message', data) },
      (reason: string) => { if (!sender.isDestroyed()) sender.send('mercure:error', reason) },
    )
  })
  ipcMain.handle('mercure:disconnect', (event) => stopMercureSse(event.sender.id))

  ipcMain.handle('app:pick-folder', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: 'Choisir le dossier du jeu' })
    return result.canceled ? null : result.filePaths[0]
  })

  // -- Game log --------------------------------------------------------------
  logParser.on((state, gameEvent) => {
    sendToOverlay('overlay:state', state)
    sendToOverlay('overlay:event', gameEvent)
    sendToEditor('editor:game-state', state)
  })

  ipcMain.handle('gamelog:start', (_event, folderPath: string) => {
    if (gamelogListener) { logParser.off(gamelogListener as any); gamelogListener = null }
    const sender = _event.sender
    gamelogListener = (state, event) => {
      if (!sender.isDestroyed()) {
        sender.send('gamelog:state', state)
        sender.send('gamelog:event', event)
      }
    }
    logParser.on(gamelogListener as any)
    const targetPath = folderPath.endsWith('Game.log') ? folderPath : path.join(folderPath, 'Game.log')
    if (!logParser.isRunning() || logParser.getFilePath() !== targetPath) logParser.start(folderPath)
    return logParser.getState()
  })

  ipcMain.handle('gamelog:stop', () => logParser.stop())
  ipcMain.handle('gamelog:state', () => logParser.getState())
  ipcMain.handle('overlay:subscribe', () => logParser.getState())

  // -- Overlay layout API ----------------------------------------------------
  ipcMain.handle('overlay:get-layout', () => getLayout())
  ipcMain.handle('overlay:get-context', (): OverlayContext => ({ layout: getLayout(), gameBounds: getGameBounds() }))

  // -- Open editor -----------------------------------------------------------
  ipcMain.handle('overlay:open-editor', async () => {
    openOverlayEditor()
    return true
  })

  // Editor sends live preview (drag in progress) -> relay to overlay
  ipcMain.handle('editor:preview', (_e, layout) => {
    sendToOverlay('overlay:layout-update', layout)
    return true
  })

  // Editor saves final layout
  ipcMain.handle('editor:save', (_e, layout) => {
    saveLayout(layout)
    return true
  })

  // Editor requests initial data
  ipcMain.handle('editor:get-layout', () => getLayout())
  ipcMain.handle('editor:get-context', (): OverlayContext => {
    const display = screen.getPrimaryDisplay()
    const dpr = display.scaleFactor ?? 1

    function toLogical(b: { x: number; y: number; width: number; height: number }) {
      return {
        x:      Math.round(b.x      / dpr),
        y:      Math.round(b.y      / dpr),
        width:  Math.round(b.width  / dpr),
        height: Math.round(b.height / dpr),
      }
    }

    const gameBounds = getGameBounds()
    if (gameBounds) return { layout: getLayout(), gameBounds: toLogical(gameBounds) }

    const { width, height } = display.workAreaSize
    return { layout: getLayout(), gameBounds: { x: 0, y: 0, width, height } }
  })

  // Editor close (window.close() is blocked in sandboxed renderer)
  ipcMain.handle('editor:close', () => { closeOverlayEditor() })

  // -- Notifications ---------------------------------------------------------
  ipcMain.handle('app:show-notification', (_e, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  })

  // -- Renderer logging ------------------------------------------------------
  ipcMain.handle('app:log', (_e, level: string, message: string) => {
    if (level === 'debug') logger.debug('[renderer]', message)
    else if (level === 'warn')  logger.warn('[renderer]', message)
    else if (level === 'error') logger.error('[renderer]', message)
    else                        logger.info('[renderer]', message)
  })

  // -- Performance metrics ---------------------------------------------------
  ipcMain.handle('perf:get-metrics', () => ({
    processes:    electronApp.getAppMetrics(),
    mainMemory:   process.memoryUsage(),
    systemMemory: process.getSystemMemoryInfo(),
    uptime:       process.uptime(),
  }))
}
