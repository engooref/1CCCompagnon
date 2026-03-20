import { BrowserWindow, app, screen } from 'electron'
import path from 'node:path'

let win: BrowserWindow | null = null

export function createOverlayWindow(): BrowserWindow {
  const RENDERER_DIST = path.join(app.getAppPath(), 'dist')
  const { width, height } = screen.getPrimaryDisplay().size

  win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    show: false,
    title: '1CC Overlay',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setMenu(null)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/overlay`)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: '/overlay' })
  }

  win.webContents.on('did-finish-load', () => {
    win?.webContents.openDevTools({ mode: 'detach' })
  })

  win.on('closed', () => { win = null })
  return win
}

export function getOverlayWindow(): BrowserWindow | null { return win }

export function showOverlay(): void {
  if (!win || win.isDestroyed()) return
  win.setAlwaysOnTop(true, 'screen-saver')
  win.showInactive()
}

export function hideOverlay(): void {
  if (!win || win.isDestroyed()) return
  win.hide()
}

export function setOverlayBounds(b: { x: number; y: number; width: number; height: number }): void {
  if (!win || win.isDestroyed()) return
  win.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }, false)
}

export function sendToOverlay(channel: string, ...args: unknown[]): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send(channel, ...args)
}
