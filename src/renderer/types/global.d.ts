import type { AppSettings, ConnectionState, OverlayAuthResponse, OverlayProfile, LayoutState, OverlayContext, ModeRegistry, OverlayMode, OverlayModeUpdate, OverlayNotification } from '@shared/general'
import type { LogEntry } from '../../main/services/logger'
import type { RadioSettings, PttBinding } from '@shared/radio'

declare global {
  interface Window {
    oneCC: {
      getSettings: () => Promise<AppSettings>
      updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
      getApiKey: () => Promise<string | null>
      setApiKey: (apiKey: string) => Promise<boolean>
      clearApiKey: () => Promise<boolean>
      checkConnection: () => Promise<ConnectionState>
      overlayAuth: () => Promise<OverlayAuthResponse>
      overlayMe: (token: string) => Promise<OverlayProfile>
      ackRefineryNotification: (payload: {
        ackUrl: string
        notificationToken: string
        authHeader?: string
      }) => Promise<{ status: number }>
      mercureConnect: (url: string) => Promise<void>
      mercureDisconnect: () => Promise<void>
      onMercureMessage: (cb: (data: string) => void) => void
      offMercureMessage: () => void
      onMercureError: (cb: (reason: string) => void) => void
      offMercureError: () => void
      sessionSseConnect: (url: string) => Promise<void>
      sessionSseDisconnect: () => Promise<void>
      onSessionSseMessage: (cb: (data: string) => void) => void
      offSessionSseMessage: () => void
      onSessionSseError: (cb: (reason: string) => void) => void
      offSessionSseError: () => void
      onSessionSseMessage: (cb: (data: string) => void) => void
      offSessionSseMessage: () => void
      onSessionSseError: (cb: (reason: string) => void) => void
      offSessionSseError: () => void
      pickFolder: () => Promise<string | null>
      setWindowSize: (size: string) => Promise<boolean>
      setToggleKey:    (key: string | { accel: string; keyCode: number | null }) => Promise<boolean>
      setMapToggleKey: (key: string | { accel: string; keyCode: number | null }) => Promise<boolean>
      setPinnedMap:    (id: number | null) => Promise<boolean>
      setCycleModeKey:    (key: string | { accel: string; keyCode: number | null } | null) => Promise<boolean>
      setCycleBuiltInKey: (key: { accel: string; keyCode: number | null } | null) => Promise<boolean>
      setCycleCustomKey:       (key: { accel: string; keyCode: number | null } | null) => Promise<boolean>
      setOcrCycleProfileKey:   (key: { accel: string; keyCode: number | null } | null) => Promise<boolean>
      // Overlay logs
      getLogs:         () => Promise<LogEntry[]>
      subscribeLogs:   () => Promise<LogEntry[]>
      unsubscribeLogs: () => Promise<void>
      onLogEntry:      (cb: (entry: LogEntry) => void) => void
      offLogEntry:     () => void

      // Passive overlay
      overlayGetLayout:      () => Promise<LayoutState>
      setOverlayEditMode:    (enabled: boolean) => Promise<boolean>
      onOverlayLayoutUpdate: (cb: (l: LayoutState) => void) => void
      onOverlayEditMode:     (cb: (enabled: boolean) => void) => void
      onMapToggle:           (cb: () => void) => void
      offMapToggle:          () => void
      onPinnedMap?:          (cb: (id: number | null) => void) => void
      offPinnedMap?:         () => void
      onMapOnlyMode:         (cb: (v: boolean) => void) => void
      onInteractionMode:     (cb: (active: boolean) => void) => void
      offOverlay:            () => void

      // Overlay editor
      openOverlayEditor: () => Promise<boolean>
      editorGetLayout:   () => Promise<LayoutState>
      editorGetContext:  () => Promise<OverlayContext>
      editorSave:        (layout: LayoutState) => Promise<boolean>
      editorPreview:     (layout: LayoutState) => Promise<boolean>
      offEditor:         () => void
      closeEditor:      () => Promise<void>
      getPerfMetrics:   () => Promise<unknown>
      onSettingsUpdate: (cb: (s: AppSettings) => void) => void
      offSettingsUpdate: () => void

      refreshOverlayTransport: () => Promise<boolean>
      onTransportRefresh: (cb: () => void) => void
      offTransportRefresh: () => void
      onSessionEvent: (cb: (data: string) => void) => void
      offSessionEvent: () => void

      // Notifications
      showNotification: (title: string, body: string) => Promise<void>

      // Logging
      log: (level: string, message: string) => Promise<void>

      // Radio
      radioGetSettings: () => Promise<RadioSettings>
      radioUpdateSettings: (partial: Partial<RadioSettings>) => Promise<boolean>
      radioSetPttBindings: (bindings: PttBinding[]) => Promise<boolean>
      radioStopPtt: () => Promise<boolean>
      onRadioPttStart: (cb: (channelId: string) => void) => void
      onRadioPttStop: (cb: (channelId: string) => void) => void
      offRadioPtt: () => void
      radioRelayState?: (state: unknown) => void
      onRadioState?: (cb: (state: unknown) => void) => void
      offRadioState?: () => void

      // App version & updates
      getAppVersion: () => Promise<string>
      initAutoUpdater: () => Promise<void>
      nativeCheckForUpdates: () => Promise<void>
      nativeDownloadUpdate: () => Promise<void>
      nativeInstallUpdate: () => Promise<void>
      onUpdateAvailable: (cb: (info: unknown) => void) => void
      onNativeAutoUpdateEvent: (cb: (d: unknown) => void) => void
      setUpdateFeed: (url: string) => Promise<void>

      // Game bounds
      onOverlayGameBounds: (cb: (b: { x: number; y: number; width: number; height: number } | null) => void) => void

      onOverlayState: (cb: (s: { visible: boolean }) => void) => void

      // Mode system
      getModeRegistry:     () => Promise<ModeRegistry>
      setActiveMode:       (modeId: string) => Promise<{ success: boolean; mode?: OverlayMode; error?: string }>
      createMode:          (label: string, baseId?: string) => Promise<OverlayMode>
      deleteMode:          (modeId: string) => Promise<boolean>
      updateModeMetadata:  (modeId: string, update: OverlayModeUpdate) => Promise<OverlayMode | null>
      saveModeLayout:      (modeId: string, layout: LayoutState) => Promise<boolean>
      onActiveModeChange:  (cb: (modeId: string) => void) => void
      offActiveModeChange: () => void

      // Notifications overlay
      pushOverlayNotification:  (notif: OverlayNotification) => Promise<boolean>
      onOverlayNotification?:   (cb: (notif: OverlayNotification) => void) => void
      offOverlayNotification?:  () => void


      // OCR
      ocrLoadProfiles: () => Promise<{
        profiles: import('../ocr/OcrTypes').OcrProfile[]
        selectedProfileId: string | null
        scanIntervalMs: number
        selectedSourceName: string | null
      }>
      ocrSaveProfiles: (data: {
        profiles: import('../ocr/OcrTypes').OcrProfile[]
        selectedProfileId: string | null
        scanIntervalMs: number
        selectedSourceName: string | null
      }) => Promise<boolean>
      ocrListSources: () => Promise<import('../ocr/OcrTypes').OcrCaptureSource[]>
      ocrGetPreferredSource: () => Promise<import('../ocr/OcrTypes').OcrCaptureSource | null>
      ocrSetOverlayClickThrough: (enabled: boolean) => Promise<boolean>
      ocrSetOverlayContentProtection: (enabled: boolean) => Promise<boolean>
      ocrEnterOverlayCalibration: (profileId: string) => Promise<boolean>
      ocrExitOverlayCalibration: () => Promise<boolean>
      ocrUpdateZoneRect: (id: string, rect: unknown) => Promise<boolean>
      onOcrCalibrationStart: (cb: (profileId: string) => void) => void
      onOcrCalibrationStop: (cb: () => void) => void
      onOcrZoneRectUpdate: (cb: (data: { id: string; rect: unknown }) => void) => void
      offOcrCalibration: () => void
      onOcrProfilesChanged: (cb: () => void) => void
      offOcrProfilesChanged: () => void
    }
  }
}

export {}
