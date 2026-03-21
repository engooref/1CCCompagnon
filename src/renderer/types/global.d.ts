import type { AppSettings, ConnectionState, OverlayAuthResponse, OverlayProfile, LayoutState, OverlayContext } from '@shared/general'
import type { GameState, GameEvent } from '../../main/services/logParserService'

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
      gamelogStart:    (folder: string) => Promise<GameState>
      gamelogStop:     () => Promise<void>
      gamelogGetState: () => Promise<GameState>
      onGamelogState:  (cb: (s: GameState) => void) => void
      onGamelogEvent:  (cb: (e: GameEvent) => void) => void
      offGamelog:      () => void

      // Passive overlay
      overlaySubscribe:      () => Promise<GameState>
      overlayGetLayout:      () => Promise<LayoutState>
      onOverlayState:        (cb: (s: GameState) => void) => void
      onOverlayEvent:        (cb: (e: GameEvent) => void) => void
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
      onEditorGameState: (cb: (s: GameState) => void) => void
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
