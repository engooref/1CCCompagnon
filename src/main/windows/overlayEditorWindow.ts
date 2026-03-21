import { BrowserWindow, app, screen } from 'electron'
import path from 'node:path'

let win: BrowserWindow | null = null

export function openOverlayEditor(): BrowserWindow {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return win
  }

  const RENDERER_DIST = path.join(app.getAppPath(), 'out/renderer')
  const display = screen.getPrimaryDisplay().workArea
  const width = Math.min(1560, Math.max(1180, display.width - 80))
  const height = Math.min(980, Math.max(760, display.height - 80))

  win = new BrowserWindow({
    width,
    height,
    x: display.x + Math.max(20, Math.round((display.width - width) / 2)),
    y: display.y + Math.max(20, Math.round((display.height - height) / 2)),
    frame: true,
    transparent: false,
    backgroundColor: '#060b12',
    autoHideMenuBar: true,
    title: 'Éditeur Overlay — 1CC',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  win.setMenu(null)
  win.once('ready-to-show', () => win?.show())
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools()
  })

  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/overlay-editor`)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: '/overlay-editor' })
  }

  win.on('closed', () => {
    win = null
  })

  return win
}

export function getOverlayEditorWindow(): BrowserWindow | null { return win }

export function closeOverlayEditor(): void {
  if (!win || win.isDestroyed()) return
  win.close()
}

export function updateEditorBounds(_b: { x: number; y: number; width: number; height: number }): void {
  // L'éditeur utilise désormais une vraie workspace indépendante.
}

export function sendToEditor(channel: string, ...args: unknown[]): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send(channel, ...args)
}
