import { BrowserWindow, app, screen } from 'electron'
import path from 'node:path'

let win: BrowserWindow | null = null
let interactive = false

export function createOverlayWindow(): BrowserWindow {
  const RENDERER_DIST = path.join(app.getAppPath(), 'out/renderer')
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
    alwaysOnTop: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
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

  // Do not force the highest "screen-saver" topmost level at creation.
  // We'll enable a milder topmost level when showing the overlay so it
  // follows the game's window without staying above every other app.
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setMenu(null)

  // Empêcher la titlebar Windows de s'afficher en redirigeant le focus
  // Sauf en mode interactif (édition) où le focus est nécessaire pour les inputs
  win.on('focus', () => {
    if (!interactive) win?.blur()
  })

  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/overlay`)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: '/overlay' })
  }

  if (!app.isPackaged) {
    win.webContents.once('did-finish-load', () => {
      win?.webContents.openDevTools({ mode: 'detach' })
    })
  }

  win.on('closed', () => { win = null })
  return win
}

export function getOverlayWindow(): BrowserWindow | null { return win }

export function showOverlay(): void {
  if (!win || win.isDestroyed()) return
  // Use a less aggressive topmost level so other apps can still appear
  // above the overlay when appropriate.
  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.showInactive()
  try { if (!win.webContents.isDestroyed()) win.webContents.send('overlay:state', { visible: true }) } catch (e) { /* noop */ }
}

export function setOverlayInteractive(enabled: boolean): void {
  if (!win || win.isDestroyed()) return
  interactive = enabled
  win.setFocusable(enabled)
  win.setIgnoreMouseEvents(!enabled, { forward: !enabled })
}

export function hideOverlay(): void {
  if (!win || win.isDestroyed()) return
  // Remove topmost flag when hiding to avoid leaving a persistent topmost
  // state if the window is later shown/hidden.
  try { win.setAlwaysOnTop(false) } catch (e) { /* noop */ }
  win.hide()
  try { if (!win.webContents.isDestroyed()) win.webContents.send('overlay:state', { visible: false }) } catch (e) { /* noop */ }
}

export function setOverlayBounds(b: { x: number; y: number; width: number; height: number }): void {
  if (!win || win.isDestroyed()) return
  win.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }, false)
}

export function sendToOverlay(channel: string, ...args: unknown[]): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send(channel, ...args)
}
