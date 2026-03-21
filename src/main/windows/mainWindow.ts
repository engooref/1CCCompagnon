import { BrowserWindow } from 'electron'

let win: BrowserWindow | null = null

export function setMainWindow(w: BrowserWindow) {
  win = w
}

export function getMainWindow(): BrowserWindow | null {
  return win
}

export function sendToMain(channel: string, payload?: unknown) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}
