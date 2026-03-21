import { exec } from 'node:child_process'
import type { Rectangle } from 'electron'

const GAME_EXE  = 'StarCitizen.exe'
const GAME_PROC = 'StarCitizen'          // nom sans .exe pour Get-Process

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isGameRunning(): Promise<boolean> {
  return new Promise(resolve => {
    exec(
      `tasklist /FI "IMAGENAME eq ${GAME_EXE}" /NH /FO CSV`,
      { timeout: 3000 },
      (err, stdout) => resolve(!err && stdout.includes(GAME_EXE))
    )
  })
}

/**
 * Retourne les bounds visibles de la fenêtre Star Citizen.
 * Utilise DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS=9) qui exclut
 * les bordures DWM invisibles (important en mode fenêtré).
 * Fallback sur GetWindowRect si DWM échoue (fullscreen / erreur).
 */
function getGameScreenBounds(): Promise<Rectangle | null> {
  const script = [
    '$p = Get-Process -Name StarCitizen -ErrorAction SilentlyContinue | Select-Object -First 1',
    'if (-not $p -or $p.MainWindowHandle -eq [IntPtr]::Zero) { Write-Output "NOT_FOUND"; exit }',
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class GWB {',
    '    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
    '    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int sz);',
    '    public struct RECT { public int Left, Top, Right, Bottom; }',
    '}',
    '"@',
    '$r = New-Object GWB+RECT',
    // DWMWA_EXTENDED_FRAME_BOUNDS = 9 ; retourne les bounds visibles sans ombre DWM
    '$hr = [GWB]::DwmGetWindowAttribute($p.MainWindowHandle, 9, [ref]$r, [System.Runtime.InteropServices.Marshal]::SizeOf($r))',
    'if ($hr -ne 0) { [GWB]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null }',
    'Write-Output "$($r.Left),$($r.Top),$($r.Right - $r.Left),$($r.Bottom - $r.Top)"',
  ].join('\n')

  // Encodage UTF-16LE + Base64 pour éviter les problèmes d'échappement
  const encoded = Buffer.from(script, 'utf16le').toString('base64')

  return new Promise(resolve => {
    exec(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      { timeout: 6000 },
      (err, stdout) => {
        const out = stdout.trim()
        if (err || out === 'NOT_FOUND' || !out) { resolve(null); return }
        const parts = out.split(',').map(Number)
        if (parts.length === 4 && parts.every(n => !isNaN(n))) {
          resolve({ x: parts[0], y: parts[1], width: parts[2], height: parts[3] })
        } else {
          resolve(null)
        }
      }
    )
  })
}

export { getGameScreenBounds as getGameWindowBounds }

// ─── Watcher ──────────────────────────────────────────────────────────────────

export type GameWatcherCallbacks = {
  onStart: (bounds: Rectangle) => void
  onStop:  () => void
}

let watchInterval: ReturnType<typeof setInterval> | null = null
let wasRunning = false

function processTick(callbacks: GameWatcherCallbacks, running: boolean, alreadyRunning: boolean): void {
  if (running && !wasRunning) {
    wasRunning = true
    // Si le jeu tournait déjà quand l'app a démarré, la fenêtre existe → pas de délai.
    // Sinon, attendre 4s que le jeu initialise sa fenêtre.
    const delay = alreadyRunning ? 0 : 4000
    setTimeout(async () => {
      const bounds = await getGameScreenBounds()
      callbacks.onStart(bounds ?? { x: 0, y: 0, width: 1920, height: 1080 })
    }, delay)

  } else if (!running && wasRunning) {
    wasRunning = false
    callbacks.onStop()
  }
}

async function tick(callbacks: GameWatcherCallbacks): Promise<void> {
  const running = await isGameRunning()
  processTick(callbacks, running, false)
}

export function startGameWatcher(callbacks: GameWatcherCallbacks): void {
  stopGameWatcher()
  wasRunning = false

  // Vérification immédiate au démarrage — on réutilise le résultat déjà obtenu
  // pour éviter un double appel tasklist (1-3s chacun sur Windows)
  isGameRunning().then(alreadyRunning => {
    processTick(callbacks, alreadyRunning, alreadyRunning)
    watchInterval = setInterval(() => tick(callbacks), 2000)
  })
}

export function stopGameWatcher(): void {
  if (watchInterval) {
    clearInterval(watchInterval)
    watchInterval = null
  }
}


