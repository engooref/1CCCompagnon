// ─── IPC Handlers Radio ───────────────────────────────────────────────────────

import { ipcMain } from 'electron'
import { registerPttBindings, unregisterAllPttBindings } from '../services/radioService'
import { getSettings, setSettings } from '../services/settingsStore'
import { getOverlayWindow } from '../windows/overlayWindow'
import type { RadioSettings, PttBinding } from '../../shared/radio'
import { DEFAULT_RADIO_SETTINGS } from '../../shared/radio'

export function registerRadioIpc() {
  // Récupérer les settings radio
  ipcMain.handle('radio:get-settings', (): RadioSettings => {
    const settings = getSettings()
    return {
      pttBindings: settings.radioPttBindings ?? DEFAULT_RADIO_SETTINGS.pttBindings,
      radioVolume: settings.radioVolume       ?? DEFAULT_RADIO_SETTINGS.radioVolume,
    }
  })

  // Sauvegarder les settings radio (partiel)
  ipcMain.handle('radio:update-settings', (_e, partial: Partial<RadioSettings>) => {
    setSettings({
      ...(partial.pttBindings !== undefined && { radioPttBindings: partial.pttBindings }),
      ...(partial.radioVolume !== undefined && { radioVolume:      partial.radioVolume }),
    })

    if (partial.pttBindings !== undefined) {
      registerPttBindings(partial.pttBindings)
    }

    return true
  })

  // Configurer toutes les liaisons PTT d'un coup
  ipcMain.handle('radio:set-ptt-bindings', (_e, bindings: PttBinding[]) => {
    setSettings({ radioPttBindings: bindings })
    registerPttBindings(bindings)
    return true
  })

  // Arrêter le PTT (cleanup)
  ipcMain.handle('radio:stop-ptt', () => {
    unregisterAllPttBindings()
    return true
  })

  // Relay état radio main renderer → overlay renderer (one-way)
  ipcMain.on('radio:relay-state', (_e, state: unknown) => {
    const overlay = getOverlayWindow()
    if (!overlay || overlay.isDestroyed()) return
    overlay.webContents.send('radio:state', state)
  })
}
