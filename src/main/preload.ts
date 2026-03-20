import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('oneCC', {
  getSettings: () => ipcRenderer.invoke('app:get-settings'),
  updateSettings: (partial: unknown) => ipcRenderer.invoke('app:update-settings', partial),
  getApiKey: () => ipcRenderer.invoke('app:get-api-key'),
  setApiKey: (apiKey: string) => ipcRenderer.invoke('app:set-api-key', apiKey),
  clearApiKey: () => ipcRenderer.invoke('app:clear-api-key'),
  checkConnection: () => ipcRenderer.invoke('app:check-connection'),
  overlayAuth: () => ipcRenderer.invoke('app:overlay-auth'),
  overlayMe: (token: string) => ipcRenderer.invoke('app:overlay-me', token),

  mercureConnect: (url: string) => ipcRenderer.invoke('mercure:connect', url),
  mercureDisconnect: () => ipcRenderer.invoke('mercure:disconnect'),
  onMercureMessage: (cb: (data: string) => void) =>
    ipcRenderer.on('mercure:message', (_e, data) => cb(data)),
  offMercureMessage: () => ipcRenderer.removeAllListeners('mercure:message'),
  onMercureError: (cb: (reason: string) => void) =>
    ipcRenderer.on('mercure:error', (_e, reason: string) => cb(reason)),
  offMercureError: () => ipcRenderer.removeAllListeners('mercure:error'),
  pickFolder: () => ipcRenderer.invoke('app:pick-folder'),
  setWindowSize: (size: string) => ipcRenderer.invoke('app:set-window-size', size),
  setToggleKey: (payload: any) => ipcRenderer.invoke('app:set-toggle-key', payload),
  setMapToggleKey: (payload: any) => ipcRenderer.invoke('app:set-map-toggle-key', payload),

  gamelogStart:    (folder: string) => ipcRenderer.invoke('gamelog:start', folder),
  gamelogStop:     () => ipcRenderer.invoke('gamelog:stop'),
  gamelogGetState: () => ipcRenderer.invoke('gamelog:state'),
  onGamelogState:  (cb: (s: unknown) => void) => ipcRenderer.on('gamelog:state', (_e, s) => cb(s)),
  onGamelogEvent:  (cb: (e: unknown) => void) => ipcRenderer.on('gamelog:event', (_e, e) => cb(e)),
  offGamelog:      () => {
    ipcRenderer.removeAllListeners('gamelog:state')
    ipcRenderer.removeAllListeners('gamelog:event')
  },

  // ── Overlay passif ────────────────────────────────────────────────────────
  overlaySubscribe:   () => ipcRenderer.invoke('overlay:subscribe'),
  overlayGetLayout:   () => ipcRenderer.invoke('overlay:get-layout'),
  onOverlayState:     (cb: (s: unknown) => void) => ipcRenderer.on('overlay:state',         (_e, s)  => cb(s)),
  onOverlayEvent:     (cb: (e: unknown) => void) => ipcRenderer.on('overlay:event',         (_e, e)  => cb(e)),
  onOverlayLayoutUpdate: (cb: (l: unknown) => void) => ipcRenderer.on('overlay:layout-update', (_e, l) => cb(l)),
  onMapToggle:  (cb: () => void) => ipcRenderer.on('overlay:map-toggle', () => cb()),
  offMapToggle: () => ipcRenderer.removeAllListeners('overlay:map-toggle'),

  offOverlay: () => {
    ipcRenderer.removeAllListeners('overlay:state')
    ipcRenderer.removeAllListeners('overlay:event')
    ipcRenderer.removeAllListeners('overlay:layout-update')
    ipcRenderer.removeAllListeners('overlay:map-toggle')
  },

  // ── Editeur overlay ───────────────────────────────────────────────────────
  openOverlayEditor:  () => ipcRenderer.invoke('overlay:open-editor'),
  editorGetLayout:    () => ipcRenderer.invoke('editor:get-layout'),
  editorGetContext:   () => ipcRenderer.invoke('editor:get-context'),
  editorSave:         (layout: unknown) => ipcRenderer.invoke('editor:save', layout),
  editorPreview:      (layout: unknown) => ipcRenderer.invoke('editor:preview', layout),
  onEditorGameState:  (cb: (s: unknown) => void) => ipcRenderer.on('editor:game-state', (_e, s) => cb(s)),
  offEditor: () => {
    ipcRenderer.removeAllListeners('editor:game-state')
  },
  closeEditor: () => ipcRenderer.invoke('editor:close'),

  onSettingsUpdate: (cb: (s: unknown) => void) => ipcRenderer.on('overlay:settings-update', (_e, s) => cb(s)),
  offSettingsUpdate: () => ipcRenderer.removeAllListeners('overlay:settings-update'),

  // ── Performances ─────────────────────────────────────────────────────────
  getPerfMetrics: () => ipcRenderer.invoke('perf:get-metrics'),

  // ── Logging ───────────────────────────────────────────────────────────────
  log: (level: string, message: string) => ipcRenderer.invoke('app:log', level, message),
  // ── Updates ───────────────────────────────────────────────────────────────
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
  installUpdate: (url: string) => ipcRenderer.invoke('app:install-update', url),
  onUpdateAvailable: (cb: (d: any) => void) => ipcRenderer.on('app:update-available', (_e, d) => cb(d)),
  setAutoUpdateEnabled: (enabled: boolean) => ipcRenderer.invoke('app:enable-auto-update', enabled),
  // ── Native auto-updater (electron-updater)
  initAutoUpdater: () => ipcRenderer.invoke('app:init-auto-updater'),
  nativeCheckForUpdates: () => ipcRenderer.invoke('app:auto-check-updates-native'),
  nativeDownloadUpdate: () => ipcRenderer.invoke('app:auto-download-update-native'),
  nativeInstallUpdate: () => ipcRenderer.invoke('app:auto-install-update-native'),
  onNativeAutoUpdateEvent: (cb: (d: any) => void) => ipcRenderer.on('app:auto-update-event', (_e, d) => cb(d)),
  setUpdateFeed: (url: string) => ipcRenderer.invoke('app:set-update-feed', url),
})
