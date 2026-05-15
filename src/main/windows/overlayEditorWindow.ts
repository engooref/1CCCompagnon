import { BrowserWindow, app, screen } from 'electron'
import path from 'node:path'
import { execSync } from 'node:child_process'

let win: BrowserWindow | null = null

function getScDisplayBounds(): { x: number; y: number; width: number; height: number } {
  try {
    const ps = `
      Add-Type @"
      using System;using System.Runtime.InteropServices;
      public class W{[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);public struct RECT{public int L,T,R,B;}}
"@
      $p=Get-Process -Name 'StarCitizen' -ErrorAction SilentlyContinue | Select-Object -First 1
      if(!$p){exit 1}
      $r=New-Object W+RECT
      [W]::GetWindowRect($p.MainWindowHandle,[ref]$r)|Out-Null
      Write-Output "$($r.L) $($r.T)"
    `
    const out = execSync(`powershell -NoProfile -Command "${ps.replace(/\n\s*/g, ' ')}"`, { timeout: 3000 }).toString().trim()
    const [lx, ly] = out.split(' ').map(Number)
    if (!isNaN(lx) && !isNaN(ly)) {
      const d = screen.getDisplayNearestPoint({ x: lx, y: ly })
      return d.bounds
    }
  } catch (_) { /* SC pas lancé ou erreur → fallback */ }
  return screen.getPrimaryDisplay().bounds
}

export function openOverlayEditor(): BrowserWindow {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return win
  }

  const RENDERER_DIST = path.join(app.getAppPath(), 'out/renderer')
  const { x, y, width, height } = getScDisplayBounds()

  win = new BrowserWindow({
    width,
    height,
    x,
    y,
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
