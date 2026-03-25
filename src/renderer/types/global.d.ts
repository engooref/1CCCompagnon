import type { AppSettings, ConnectionState, OverlayAuthResponse, OverlayProfile, LayoutState, OverlayContext } from '@shared/general'
import type { LogEntry } from '../../main/services/logger'

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
      mercureConnect: (url: string) => Promise<void>
      mercureDisconnect: () => Promise<void>
      onMercureMessage: (cb: (data: string) => void) => void
      offMercureMessage: () => void
      onMercureError: (cb: (reason: string) => void) => void
      offMercureError: () => void
      pickFolder: () => Promise<string | null>
      setWindowSize: (size: string) => Promise<boolean>
      setToggleKey:    (key: string | { accel: string; keyCode: number | null }) => Promise<boolean>
      setMapToggleKey: (key: string | { accel: string; keyCode: number | null }) => Promise<boolean>
      // Overlay logs
      getLogs:         () => Promise<LogEntry[]>
      subscribeLogs:   () => Promise<LogEntry[]>
      unsubscribeLogs: () => Promise<void>
      onLogEntry:      (cb: (entry: LogEntry) => void) => void
      offLogEntry:     () => void

      // Passive overlay
      overlayGetLayout:      () => Promise<LayoutState>
      onOverlayLayoutUpdate: (cb: (l: LayoutState) => void) => void
      onMapToggle:           (cb: () => void) => void
      offMapToggle:          () => void
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

      // Notifications
      showNotification: (title: string, body: string) => Promise<void>

      // Logging
      log: (level: string, message: string) => Promise<void>
    }
  }
}

export {}
