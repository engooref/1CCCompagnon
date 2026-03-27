// ─── IPC Handlers Radio ───────────────────────────────────────────────────────

import { ipcMain } from 'electron'
import { registerPttKey, unregisterPttKey } from '../services/radioService'
import { getSettings, setSettings } from '../services/settingsStore'
import type { RadioSettings } from '../../shared/radio'
import { DEFAULT_RADIO_SETTINGS } from '../../shared/radio'

export function registerRadioIpc() {
  // Récupérer les settings radio
  ipcMain.handle('radio:get-settings', (): RadioSettings => {
    const settings = getSettings()
    return {
      livekitUrl:     settings.radioLivekitUrl     ?? DEFAULT_RADIO_SETTINGS.livekitUrl,
      radioServerUrl: settings.radioServerUrl       ?? DEFAULT_RADIO_SETTINGS.radioServerUrl,
      pttKeyCode:     settings.radioPttKeyCode      ?? DEFAULT_RADIO_SETTINGS.pttKeyCode,
      pttKey:         settings.radioPttKey           ?? DEFAULT_RADIO_SETTINGS.pttKey,
      radioVolume:    settings.radioVolume           ?? DEFAULT_RADIO_SETTINGS.radioVolume,
    }
  })

  // Sauvegarder les settings radio
  ipcMain.handle('radio:update-settings', (_e, partial: Partial<RadioSettings>) => {
    setSettings({
      ...(partial.livekitUrl     !== undefined && { radioLivekitUrl:  partial.livekitUrl }),
      ...(partial.radioServerUrl !== undefined && { radioServerUrl:   partial.radioServerUrl }),
      ...(partial.pttKeyCode     !== undefined && { radioPttKeyCode:  partial.pttKeyCode }),
      ...(partial.pttKey         !== undefined && { radioPttKey:      partial.pttKey }),
      ...(partial.radioVolume    !== undefined && { radioVolume:      partial.radioVolume }),
    })

    // Mettre à jour le PTT si changé
    if (partial.pttKeyCode !== undefined) {
      registerPttKey(partial.pttKeyCode)
    }

    return true
  })

  // Configurer le PTT key
  ipcMain.handle('radio:set-ptt-key', (_e, payload: { keyCode: number | null; key: string }) => {
    setSettings({ radioPttKeyCode: payload.keyCode, radioPttKey: payload.key })
    registerPttKey(payload.keyCode)
    return true
  })

  // Arrêter le PTT (cleanup)
  ipcMain.handle('radio:stop-ptt', () => {
    unregisterPttKey()
    return true
  })
}
