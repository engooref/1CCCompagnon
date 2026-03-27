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

  // ── Logs overlay ─────────────────────────────────────────────────────────
  getLogs:         () => ipcRenderer.invoke('app:get-logs'),
  subscribeLogs:   () => ipcRenderer.invoke('app:subscribe-logs'),
  unsubscribeLogs: () => ipcRenderer.invoke('app:unsubscribe-logs'),
  onLogEntry:      (cb: (entry: unknown) => void) => ipcRenderer.on('app:log-entry', (_e, entry) => cb(entry)),
  offLogEntry:     () => ipcRenderer.removeAllListeners('app:log-entry'),

  // ── Overlay passif ────────────────────────────────────────────────────────
  overlayGetLayout:   () => ipcRenderer.invoke('overlay:get-layout'),
  onOverlayLayoutUpdate: (cb: (l: unknown) => void) => ipcRenderer.on('overlay:layout-update', (_e, l) => cb(l)),
  onMapToggle:  (cb: () => void) => ipcRenderer.on('overlay:map-toggle', () => cb()),
  offMapToggle: () => ipcRenderer.removeAllListeners('overlay:map-toggle'),
  /** Bounds logiques (CSS px) de la fenêtre SC sur l'écran. null = SC absent/minimisé. */
  onOverlayGameBounds: (cb: (b: { x: number; y: number; width: number; height: number } | null) => void) =>
    ipcRenderer.on('overlay:game-bounds', (_e, b) => cb(b)),

  onMapOnlyMode: (cb: (v: boolean) => void) => ipcRenderer.on('overlay:map-only-mode', (_e, v) => cb(v)),

  offOverlay: () => {
    ipcRenderer.removeAllListeners('overlay:state')
    ipcRenderer.removeAllListeners('overlay:event')
    ipcRenderer.removeAllListeners('overlay:layout-update')
    ipcRenderer.removeAllListeners('overlay:map-toggle')
    ipcRenderer.removeAllListeners('overlay:game-bounds')
    ipcRenderer.removeAllListeners('overlay:map-only-mode')
  },

  // ── Editeur overlay ───────────────────────────────────────────────────────
  openOverlayEditor:  () => ipcRenderer.invoke('overlay:open-editor'),
  editorGetLayout:    () => ipcRenderer.invoke('editor:get-layout'),
  editorGetContext:   () => ipcRenderer.invoke('editor:get-context'),
  editorSave:         (layout: unknown) => ipcRenderer.invoke('editor:save', layout),
  editorPreview:      (layout: unknown) => ipcRenderer.invoke('editor:preview', layout),
  offEditor: () => {
    ipcRenderer.removeAllListeners('editor:game-state')
  },
  closeEditor: () => ipcRenderer.invoke('editor:close'),

  onSettingsUpdate: (cb: (s: unknown) => void) => ipcRenderer.on('overlay:settings-update', (_e, s) => cb(s)),
  offSettingsUpdate: () => ipcRenderer.removeAllListeners('overlay:settings-update'),

  refreshOverlayTransport: () => ipcRenderer.invoke('overlay:refresh-transport'),
  onTransportRefresh: (cb: () => void) => ipcRenderer.on('overlay:transport-refresh', () => cb()),
  offTransportRefresh: () => ipcRenderer.removeAllListeners('overlay:transport-refresh'),

  // ── Performances ─────────────────────────────────────────────────────────
  getPerfMetrics: () => ipcRenderer.invoke('perf:get-metrics'),

  // ── Notifications ─────────────────────────────────────────────────────────
  showNotification: (title: string, body: string) => ipcRenderer.invoke('app:show-notification', title, body),

  // ── Radio ─────────────────────────────────────────────────────────────────
  radioSetPttKey: (payload: { accel?: string; keyCode?: number } | null) => ipcRenderer.invoke('radio:set-ptt-key', payload),
  onRadioPttStart: (cb: () => void) => ipcRenderer.on('radio:ptt-start', () => cb()),
  onRadioPttEnd:   (cb: () => void) => ipcRenderer.on('radio:ptt-end',   () => cb()),
  offRadioPtt: () => {
    ipcRenderer.removeAllListeners('radio:ptt-start')
    ipcRenderer.removeAllListeners('radio:ptt-end')
  },

  // ── Logging ───────────────────────────────────────────────────────────────
  log: (level: string, message: string) => ipcRenderer.invoke('app:log', level, message),
  // ── Updates ───────────────────────────────────────────────────────────────
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  // ── Native auto-updater (electron-updater)
  initAutoUpdater: () => ipcRenderer.invoke('app:init-auto-updater'),
  nativeCheckForUpdates: () => ipcRenderer.invoke('app:auto-check-updates-native'),
  nativeDownloadUpdate: () => ipcRenderer.invoke('app:auto-download-update-native'),
  nativeInstallUpdate: () => ipcRenderer.invoke('app:auto-install-update-native'),
  onUpdateAvailable: (cb: (info: any) => void) =>
    ipcRenderer.on('app:auto-update-event', (_e, d) => { if (d?.type === 'update-available') cb(d.info) }),
  onNativeAutoUpdateEvent: (cb: (d: any) => void) => ipcRenderer.on('app:auto-update-event', (_e, d) => cb(d)),
  setUpdateFeed: (url: string) => ipcRenderer.invoke('app:set-update-feed', url),
})
