import { ipcMain, desktopCapturer } from 'electron'
import ElectronStore from 'electron-store'
import type { OcrProfile } from '../../renderer/ocr/OcrTypes'
import { getOverlayWindow, sendToOverlay } from '../windows/overlayWindow'
import { sendToMain } from '../windows/mainWindow'

// ─── Persistance profils OCR ──────────────────────────────────────────────────

interface OcrStoredData {
  profiles: OcrProfile[]
  selectedProfileId: string | null
  scanIntervalMs: number
  selectedSourceName: string | null
}

const StoreCtor: any = (ElectronStore as any).default ?? ElectronStore
const ocrStore = new StoreCtor({
  name: 'ocr-profiles',
  defaults: {
    profiles: [],
    selectedProfileId: null,
    scanIntervalMs: 2000,
    selectedSourceName: null,
  },
})

// ─── Sources SC prioritaires ──────────────────────────────────────────────────

const SC_KEYWORDS = ['Star Citizen', 'StarCitizen', 'RSI', 'LIVE', 'starcitizen']

function isStarCitizenSource(name: string): boolean {
  return SC_KEYWORDS.some(kw => name.toLowerCase().includes(kw.toLowerCase()))
}

// ─── Enregistrement IPC ───────────────────────────────────────────────────────

export function registerOcrIpc(): void {
  // Charger profils
  ipcMain.handle('ocr:load-profiles', () => {
    return {
      profiles: ocrStore.get('profiles'),
      selectedProfileId: ocrStore.get('selectedProfileId'),
      scanIntervalMs: ocrStore.get('scanIntervalMs'),
      selectedSourceName: ocrStore.get('selectedSourceName'),
    }
  })

  // Sauvegarder profils
  ipcMain.handle('ocr:save-profiles', (_e, data: OcrStoredData) => {
    ocrStore.set('profiles', data.profiles)
    ocrStore.set('selectedProfileId', data.selectedProfileId)
    ocrStore.set('scanIntervalMs', data.scanIntervalMs ?? 2000)
    ocrStore.set('selectedSourceName', data.selectedSourceName)
    // Si l'appel vient de l'overlay → notifier la main window de recharger ses profils
    const overlayWin = getOverlayWindow()
    if (overlayWin && !overlayWin.isDestroyed() && _e.sender.id === overlayWin.webContents.id) {
      sendToMain('ocr:profiles-changed')       // overlay a sauvé → notifier main
    } else {
      sendToOverlay('ocr:profiles-changed')    // main a sauvé → notifier overlay
    }
    return true
  })

  // Lister les sources desktopCapturer
  ipcMain.handle('ocr:list-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 },
    })
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen') ? 'screen' : 'window',
      thumbnail: s.thumbnail?.toDataURL() ?? null,
    }))
  })

  // Source préférée (Star Citizen ou écran principal)
  ipcMain.handle('ocr:get-preferred-source', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 1, height: 1 },
    })
    const sc = sources.find(s => isStarCitizenSource(s.name))
    if (sc) {
      return { id: sc.id, name: sc.name, type: 'window' }
    }
    // Fallback : écran principal
    const screen = sources.find(s => s.id.startsWith('screen:'))
    if (screen) {
      return { id: screen.id, name: screen.name, type: 'screen' }
    }
    return null
  })

  // Contrôle overlay : click-through ON/OFF
  ipcMain.handle('ocr:set-overlay-click-through', (_e, enabled: boolean) => {
    const win = getOverlayWindow()
    if (!win || win.isDestroyed()) return false
    win.setIgnoreMouseEvents(enabled, { forward: true })
    return true
  })

  // Protection de contenu overlay (évite d'être capturé par desktopCapturer)
  ipcMain.handle('ocr:set-overlay-content-protection', (_e, enabled: boolean) => {
    const win = getOverlayWindow()
    if (!win || win.isDestroyed()) return false
    try {
      win.setContentProtection(enabled)
      return true
    } catch {
      return false
    }
  })

  // ── Calibration OCR sur overlay ───────────────────────────────────────────

  ipcMain.handle('ocr:enter-overlay-calibration', (_e, profileId: string) => {
    const win = getOverlayWindow()
    if (!win || win.isDestroyed()) return false
    win.setIgnoreMouseEvents(false)
    win.webContents.send('ocr:calibration-start', profileId)
    return true
  })

  ipcMain.handle('ocr:exit-overlay-calibration', () => {
    const win = getOverlayWindow()
    if (!win || win.isDestroyed()) return false
    win.setIgnoreMouseEvents(true, { forward: true })
    win.webContents.send('ocr:calibration-stop')
    return true
  })

  // Relay zone rect update : overlay → main window renderer
  ipcMain.handle('ocr:update-zone-rect', (_e, data: { id: string; rect: unknown }) => {
    sendToMain('ocr:zone-rect-update', data)
    return true
  })

  // Cycle profil OCR (appele depuis main via global)
  ;(global as any).__cycleOcrProfile = (): string | null => {
    const profiles: OcrProfile[] = ocrStore.get('profiles') ?? []
    if (profiles.length < 2) return null
    const currentId: string | null = ocrStore.get('selectedProfileId') ?? null
    const idx = profiles.findIndex(p => p.id === currentId)
    const nextIdx = (idx + 1) % profiles.length
    const next = profiles[nextIdx]
    ocrStore.set('selectedProfileId', next.id)
    sendToOverlay('ocr:profiles-changed')
    sendToMain('ocr:profiles-changed')
    return next.label
  }
}
