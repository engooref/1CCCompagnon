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
  ackRefineryNotification: (payload: { ackUrl: string; notificationToken: string; authHeader?: string }) =>
    ipcRenderer.invoke('app:refinery-notify-ack', payload),

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
  setToggleKey:    (payload: any) => ipcRenderer.invoke('app:set-toggle-key', payload),
  setMapToggleKey: (payload: any) => ipcRenderer.invoke('app:set-map-toggle-key', payload),
  setCycleModeKey:       (payload: any) => ipcRenderer.invoke('app:set-cycle-mode-key', payload),
  setCycleBuiltInKey:    (payload: any) => ipcRenderer.invoke('app:set-cycle-builtin-key', payload),
  setCycleCustomKey:     (payload: any) => ipcRenderer.invoke('app:set-cycle-custom-key', payload),
  setInteractionKey:     (payload: any) => ipcRenderer.invoke('app:set-interaction-key', payload),
  setInteractionKeyMode: (mode: 'hold' | 'toggle') => ipcRenderer.invoke('app:set-interaction-key-mode', mode),
  setOverlayEditKey:     (payload: any) => ipcRenderer.invoke('app:set-overlay-edit-key', payload),

  // ── Logs overlay ─────────────────────────────────────────────────────────
  getLogs:         () => ipcRenderer.invoke('app:get-logs'),
  subscribeLogs:   () => ipcRenderer.invoke('app:subscribe-logs'),
  unsubscribeLogs: () => ipcRenderer.invoke('app:unsubscribe-logs'),
  onLogEntry:      (cb: (entry: unknown) => void) => ipcRenderer.on('app:log-entry', (_e, entry) => cb(entry)),
  offLogEntry:     () => ipcRenderer.removeAllListeners('app:log-entry'),

  // ── Overlay passif ────────────────────────────────────────────────────────
  overlayGetLayout:   () => ipcRenderer.invoke('overlay:get-layout'),
  setOverlayEditMode: (enabled: boolean) => ipcRenderer.invoke('overlay:set-edit-mode', enabled),
  onOverlayLayoutUpdate: (cb: (l: unknown) => void) => ipcRenderer.on('overlay:layout-update', (_e, l) => cb(l)),
  onOverlayEditMode: (cb: (enabled: boolean) => void) => ipcRenderer.on('overlay:edit-mode', (_e, enabled) => cb(enabled)),
  onMapToggle:  (cb: () => void) => ipcRenderer.on('overlay:map-toggle', () => cb()),
  offMapToggle: () => ipcRenderer.removeAllListeners('overlay:map-toggle'),
  /** Bounds logiques (CSS px) de la fenêtre SC sur l'écran. null = SC absent/minimisé. */
  onOverlayGameBounds: (cb: (b: { x: number; y: number; width: number; height: number } | null) => void) =>
    ipcRenderer.on('overlay:game-bounds', (_e, b) => cb(b)),

  onOverlayState: (cb: (s: { visible: boolean }) => void) => ipcRenderer.on('overlay:state', (_e, s) => cb(s)),

  onMapOnlyMode:     (cb: (v: boolean) => void) => ipcRenderer.on('overlay:map-only-mode', (_e, v) => cb(v)),
  onInteractionMode: (cb: (active: boolean) => void) => ipcRenderer.on('overlay:interaction-mode', (_e, active) => cb(active)),

  offOverlay: () => {
    ipcRenderer.removeAllListeners('overlay:state')
    ipcRenderer.removeAllListeners('overlay:event')
    ipcRenderer.removeAllListeners('overlay:layout-update')
    ipcRenderer.removeAllListeners('overlay:edit-mode')
    ipcRenderer.removeAllListeners('overlay:map-toggle')
    ipcRenderer.removeAllListeners('overlay:game-bounds')
    ipcRenderer.removeAllListeners('overlay:map-only-mode')
    ipcRenderer.removeAllListeners('overlay:active-mode')
    ipcRenderer.removeAllListeners('overlay:interaction-mode')
  },

  // ── Système de modes ──────────────────────────────────────────────────────
  getModeRegistry:    () => ipcRenderer.invoke('mode:get-registry'),
  setActiveMode:      (modeId: string) => ipcRenderer.invoke('mode:set-active', modeId),
  createMode:         (label: string, baseId?: string) => ipcRenderer.invoke('mode:create', label, baseId),
  deleteMode:         (modeId: string) => ipcRenderer.invoke('mode:delete', modeId),
  updateModeMetadata: (modeId: string, update: unknown) => ipcRenderer.invoke('mode:update-metadata', modeId, update),
  saveModeLayout:     (modeId: string, layout: unknown) => ipcRenderer.invoke('mode:save-layout', modeId, layout),
  onActiveModeChange: (cb: (modeId: string) => void) =>
    ipcRenderer.on('overlay:active-mode', (_e, modeId) => cb(modeId)),
  offActiveModeChange: () => ipcRenderer.removeAllListeners('overlay:active-mode'),

  // ── Notifications overlay ─────────────────────────────────────────────────
  pushOverlayNotification: (notif: unknown) => ipcRenderer.invoke('overlay:push-notification', notif),
  onOverlayNotification:   (cb: (notif: unknown) => void) =>
    ipcRenderer.on('overlay:notification', (_e, notif) => cb(notif)),
  offOverlayNotification:  () => ipcRenderer.removeAllListeners('overlay:notification'),

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

  // ── Radio ────────────────────────────────────────────────────────────────
  radioGetSettings:    () => ipcRenderer.invoke('radio:get-settings'),
  radioUpdateSettings: (partial: unknown) => ipcRenderer.invoke('radio:update-settings', partial),
  radioSetPttBindings: (bindings: unknown) => ipcRenderer.invoke('radio:set-ptt-bindings', bindings),
  radioStopPtt:        () => ipcRenderer.invoke('radio:stop-ptt'),
  onRadioPttStart: (cb: (channelId: string) => void) => ipcRenderer.on('radio:ptt-start', (_e, channelId) => cb(channelId)),
  onRadioPttStop:  (cb: (channelId: string) => void) => ipcRenderer.on('radio:ptt-stop',  (_e, channelId) => cb(channelId)),
  offRadioPtt: () => {
    ipcRenderer.removeAllListeners('radio:ptt-start')
    ipcRenderer.removeAllListeners('radio:ptt-stop')
  },
  // Relay état radio main window → main process → overlay window
  radioRelayState: (state: unknown) => ipcRenderer.send('radio:relay-state', state),
  onRadioState:    (cb: (state: unknown) => void) => ipcRenderer.on('radio:state', (_e, s) => cb(s)),
  offRadioState:   () => ipcRenderer.removeAllListeners('radio:state'),
})
