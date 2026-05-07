import { app as electronApp, ipcMain, dialog, BrowserWindow, screen, Notification } from 'electron'
import axios from 'axios'
import { clearApiKey, getApiKey, setApiKey } from '../services/secureStore'
import { authenticateOverlay, checkConnection, getAppVersion } from '../services/overlayService'
import { initAutoUpdater, checkForUpdatesNative, downloadUpdateNative, installUpdateAndQuit, setFeedUrl } from '../services/autoUpdaterService'
import { getSettings, setSettings } from '../services/settingsStore'
import { startMercureSse, stopMercureSse } from '../services/mercureService'
import { getLayout, saveLayout } from '../services/layoutStore'
import {
  getRegistry, setActiveMode, createCustomMode, deleteCustomMode,
  updateModeMetadata, saveModeLayout,
} from '../services/modeStore'
import type { OverlayContext, OverlayModeUpdate, LayoutState, OverlayNotification } from '../../shared/general'
import type { LogEntry } from '../services/logger'
import { sendToOverlay } from '../windows/overlayWindow'
import { openOverlayEditor, sendToEditor, closeOverlayEditor } from '../windows/overlayEditorWindow'
import { logger } from '../services/logger'

type GetGameBounds = () => { x: number; y: number; width: number; height: number } | null

let logSubscriberCb: ((entry: LogEntry) => void) | null = null

export function registerAppIpc(
  getGameBounds: GetGameBounds,
  onOverlayEnabledChange?: (enabled: boolean) => void,
) {
  ipcMain.handle('app:get-settings', async () => getSettings())
  ipcMain.handle('app:update-settings', async (_e, partial) => {
    const updated = setSettings(partial)
    sendToOverlay('overlay:settings-update', updated)
    if ('overlayEnabled' in partial && onOverlayEnabledChange) {
      onOverlayEnabledChange(Boolean(updated.overlayEnabled ?? true))
    }
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

  ipcMain.handle('app:set-cycle-mode-key', async (_e, payload: any) => {
    const setKey = (global as any).__setCycleModeKey
    if (typeof payload === 'string') {
      setSettings({ cycleModeKey: payload, cycleModeKeyCode: null })
      setKey?.(payload)
    } else if (payload && typeof payload === 'object') {
      const accel = payload.accel ?? payload.key ?? ''
      const keyCode = typeof payload.keyCode === 'number' ? payload.keyCode : null
      setSettings({ cycleModeKey: accel || null, cycleModeKeyCode: keyCode })
      setKey?.({ accel, keyCode })
    }
    return true
  })


  ipcMain.handle('app:set-cycle-builtin-key', async (_e, payload: any) => {
    const setKey = (global as any).__setCycleBuiltInKey
    if (payload === null) {
      setSettings({ cycleBuiltInKey: null, cycleBuiltInKeyCode: null })
      setKey?.(null)
    } else if (payload && typeof payload === 'object') {
      const accel = payload.accel ?? payload.key ?? ''
      const keyCode = typeof payload.keyCode === 'number' ? payload.keyCode : null
      setSettings({ cycleBuiltInKey: accel || null, cycleBuiltInKeyCode: keyCode })
      setKey?.({ accel, keyCode })
    }
    return true
  })

  ipcMain.handle('app:set-cycle-custom-key', async (_e, payload: any) => {
    const setKey = (global as any).__setCycleCustomKey
    if (payload === null) {
      setSettings({ cycleCustomKey: null, cycleCustomKeyCode: null })
      setKey?.(null)
    } else if (payload && typeof payload === 'object') {
      const accel = payload.accel ?? payload.key ?? ''
      const keyCode = typeof payload.keyCode === 'number' ? payload.keyCode : null
      setSettings({ cycleCustomKey: accel || null, cycleCustomKeyCode: keyCode })
      setKey?.({ accel, keyCode })
    }
    return true
  })

  ipcMain.handle('app:set-interaction-key', async (_e, payload: any) => {
    const setKey = (global as any).__setInteractionKey
    if (payload === null) {
      setSettings({ interactionKey: null, interactionKeyCode: null })
      setKey?.(null)
    } else if (payload && typeof payload === 'object') {
      const accel = payload.accel ?? payload.key ?? ''
      const keyCode = typeof payload.keyCode === 'number' ? payload.keyCode : null
      setSettings({ interactionKey: accel || null, interactionKeyCode: keyCode })
      setKey?.({ accel, keyCode })
    }
    return true
  })

  ipcMain.handle('app:set-interaction-key-mode', async (_e, mode: 'hold' | 'toggle') => {
    setSettings({ interactionKeyMode: mode })
    ;(global as any).__setInteractionKeyMode?.(mode)
    return true
  })

  ipcMain.handle('app:set-overlay-edit-key', async (_e, payload: any) => {
    if (payload === null) {
      setSettings({ overlayEditKey: null, overlayEditKeyCode: null })
      ;(global as any).__setOverlayEditKey?.(null)
    } else if (payload && typeof payload === 'object') {
      const accel = payload.accel ?? ''
      const keyCode = typeof payload.keyCode === 'number' ? payload.keyCode : null
      setSettings({ overlayEditKey: accel || null, overlayEditKeyCode: keyCode })
      ;(global as any).__setOverlayEditKey?.({ accel, keyCode })
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

  // POST server-side ack for refinery notifications (bypasses renderer CORS).
  ipcMain.handle('app:refinery-notify-ack', async (_e, payload: {
    ackUrl: string
    notificationToken: string
    authHeader?: string
  }) => {
    const ackUrl = String(payload?.ackUrl ?? '')
    const notificationToken = String(payload?.notificationToken ?? '')
    const authHeader = String(payload?.authHeader ?? '')

    if (!ackUrl || !notificationToken) {
      throw new Error('Invalid ack payload')
    }

    // Limit requests to the configured site origin to avoid arbitrary SSRF.
    const siteOrigin = new URL(getSettings().siteUrl).origin
    const targetOrigin = new URL(ackUrl).origin
    if (siteOrigin !== targetOrigin) {
      throw new Error('Ack target origin not allowed')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Origin: siteOrigin,
      Referer: `${siteOrigin}/`,
    }
    if (authHeader) headers.Authorization = authHeader

    const response = await axios.post(
      ackUrl,
      { notificationToken },
      { headers, timeout: 10000 },
    )

    return { status: response.status }
  })

  ipcMain.handle('mercure:connect', (event, url: string) => {
    const sender = event.sender
    startMercureSse(
      String(sender.id),
      url,
      (data: string) => {
        if (!sender.isDestroyed()) sender.send('mercure:message', data)
        sendToOverlay('mercure:session-event', data)
      },
      (reason: string) => { if (!sender.isDestroyed()) sender.send('mercure:error', reason) },
    )
  })
  ipcMain.handle('mercure:disconnect', (event) => stopMercureSse(String(event.sender.id)))

  // ── Session SSE — canal dédié indépendant du canal Mercure refinery ──────
  ipcMain.handle('session-sse:connect', (event, url: string) => {
    const sender = event.sender
    startMercureSse(
      `${sender.id}:session`,
      url,
      (data: string) => {
        if (!sender.isDestroyed()) sender.send('session-sse:message', data)
        sendToOverlay('mercure:session-event', data)
      },
      (reason: string) => { if (!sender.isDestroyed()) sender.send('session-sse:error', reason) },
    )
  })
  ipcMain.handle('session-sse:disconnect', (event) => stopMercureSse(`${event.sender.id}:session`))

  ipcMain.handle('app:pick-folder', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: 'Choisir le dossier du jeu' })
    return result.canceled ? null : result.filePaths[0]
  })

  // -- Logs overlay ----------------------------------------------------------
  ipcMain.handle('app:get-logs', () => logger.getLogs())
  ipcMain.handle('app:subscribe-logs', (event) => {
    if (logSubscriberCb) logger.offLog(logSubscriberCb)
    const sender = event.sender
    logSubscriberCb = (entry: LogEntry) => {
      if (!sender.isDestroyed()) sender.send('app:log-entry', entry)
    }
    logger.onLog(logSubscriberCb)
    return logger.getLogs()
  })
  ipcMain.handle('app:unsubscribe-logs', () => {
    if (logSubscriberCb) { logger.offLog(logSubscriberCb); logSubscriberCb = null }
  })

  // -- Overlay layout API ----------------------------------------------------
  ipcMain.handle('overlay:get-layout', () => getLayout())
  ipcMain.handle('overlay:set-edit-mode', (_e, enabled: boolean) => {
    const setEditMode = (global as any).__setOverlayEditMode
    setEditMode?.(Boolean(enabled))
    return true
  })
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

  // -- Overlay transport refresh ---------------------------------------------
  ipcMain.handle('overlay:refresh-transport', () => {
    sendToOverlay('overlay:transport-refresh')
    return true
  })

  // ── Système de modes ───────────────────────────────────────────────────────

  ipcMain.handle('mode:get-registry', () => getRegistry())

  ipcMain.handle('mode:set-active', (_e, modeId: string) => {
    const mode = setActiveMode(modeId)
    if (!mode) return { success: false, error: 'Mode not found' }
    // Pousse le layout du nouveau mode vers l'overlay via le canal existant
    sendToOverlay('overlay:layout-update', getLayout())
    return { success: true, mode }
  })

  ipcMain.handle('mode:create', (_e, label: string, baseId?: string) => {
    return createCustomMode(label, baseId)
  })

  ipcMain.handle('mode:delete', (_e, modeId: string) => {
    return deleteCustomMode(modeId)
  })

  ipcMain.handle('mode:update-metadata', (_e, modeId: string, update: OverlayModeUpdate) => {
    return updateModeMetadata(modeId, update)
  })

  // ── Notifications overlay ─────────────────────────────────────────────────

  ipcMain.handle('overlay:push-notification', (_e, notif: OverlayNotification) => {
    sendToOverlay('overlay:notification', notif)
    return true
  })

  ipcMain.handle('mode:save-layout', (_e, modeId: string, layout: LayoutState) => {
    const ok = saveModeLayout(modeId, layout)
    // Si le mode sauvegardé est l'actif, pousse la mise à jour vers l'overlay
    if (ok && getRegistry().activeModeId === modeId) {
      sendToOverlay('overlay:layout-update', layout)
    }
    return ok
  })

}
