/**
 * windowStateWatcher.ts
 *
 * Détecte les événements minimize / restore / focus de la fenêtre Star Citizen
 * via un process PowerShell PERSISTANT.
 *
 * Stratégie :
 *  - Le process PS est démarré une fois (compilation Add-Type ~2-3 s).
 *  - Chaque requête suivante est quasi-instantanée (~50 ms).
 *  - Poll toutes les 500 ms → détection dans la demi-seconde.
 *
 * États retournés :
 *  - "foreground" : SC est la fenêtre active (au premier plan)
 *  - "running"    : SC tourne mais une autre fenêtre est au premier plan
 *  - "minimized"  : SC est minimisé
 *  - "gone"       : SC n'existe plus (géré par gameWatcher)
 */

import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

const GAME_TITLE = 'Star Citizen'

// ─── Process PowerShell persistant ───────────────────────────────────────────

let ps: ChildProcessWithoutNullStreams | null = null
let psReady  = false
let psBuf    = ''
const psQ: ((line: string) => void)[] = []

/**
 * Script d'init : charge les types Win32 une seule fois.
 * Le here-string (@"..."@) permet d'insérer du C# sans problème d'échappement.
 */
const PS_INIT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  'Add-Type -TypeDefinition @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public static class OvW {',
  '    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
  '    [DllImport("user32.dll")] public static extern IntPtr FindWindowW(string c, string t);',
  '    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '}',
  '"@',
  'Write-Output "READY"',
  '',
].join('\n')

/** Requête inline : retourne "foreground", "running", "minimized" ou "gone" */
const PS_QUERY =
  `$h=[OvW]::FindWindowW($null,"${GAME_TITLE}");` +
  `if($h -eq [IntPtr]::Zero){Write-Output "gone"}` +
  `elseif([OvW]::IsIconic($h)){Write-Output "minimized"}` +
  `elseif([OvW]::GetForegroundWindow() -eq $h){Write-Output "foreground"}` +
  `else{Write-Output "running"}`

function ensurePS(): Promise<void> {
  if (psReady && ps && !ps.killed) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('windowStateWatcher: PS init timeout')),
      20_000
    )

    ps      = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', '-'])
    psReady = false
    psBuf   = ''

    ps.stdout.on('data', (chunk: Buffer) => {
      psBuf += chunk.toString()
      let nl: number
      while ((nl = psBuf.indexOf('\n')) !== -1) {
        const line = psBuf.slice(0, nl).replace(/\r/g, '').trim()
        psBuf = psBuf.slice(nl + 1)
        if (!line) continue

        if (!psReady) {
          if (line === 'READY') {
            psReady = true
            clearTimeout(timeout)
            resolve()
          }
          continue
        }
        psQ.shift()?.(line)
      }
    })

    ps.on('exit', () => {
      ps = null; psReady = false
      psQ.splice(0).forEach(cb => cb('gone'))
    })

    ps.stdin.write(PS_INIT)
  })
}

function queryWinState(): Promise<'foreground' | 'running' | 'minimized' | 'gone'> {
  if (!ps || !psReady) return Promise.resolve('gone')

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      const i = psQ.indexOf(cb)
      if (i !== -1) psQ.splice(i, 1)
      resolve('gone')
    }, 4000)

    const cb = (line: string) => {
      clearTimeout(timer)
      if (line === 'foreground') resolve('foreground')
      else if (line === 'minimized') resolve('minimized')
      else if (line === 'running') resolve('running')
      else resolve('gone')
    }
    psQ.push(cb)
    ps!.stdin.write(PS_QUERY + '\n')
  })
}

// ─── API publique ─────────────────────────────────────────────────────────────

export type WindowStateCallbacks = {
  onMinimize:  () => void
  onRestore:   () => void
  /** SC est passée au premier plan (aucune autre fenêtre devant) */
  onFocus?:    () => void
  /** Une autre fenêtre s'est mise devant SC, SC reste ouverte */
  onUnfocus?:  () => void
}

let stateInterval: ReturnType<typeof setInterval> | null = null
let lastState: 'foreground' | 'running' | 'minimized' | 'gone' = 'gone'

export async function startWindowStateWatcher(callbacks: WindowStateCallbacks): Promise<void> {
  stopWindowStateWatcher()
  // On part du principe que SC vient de démarrer → elle est au premier plan
  lastState = 'foreground'

  try {
    await ensurePS()
  } catch {
    // Si PS ne démarre pas, on ignore silencieusement
    return
  }

  stateInterval = setInterval(async () => {
    const state = await queryWinState()

    // 'gone' est géré par gameWatcher — on l'ignore ici
    if (state === 'gone') return

    // ── Minimize / restore ───────────────────────────────────────────────────
    if (state === 'minimized' && lastState !== 'minimized') {
      lastState = 'minimized'
      callbacks.onMinimize()
      return
    }

    if (state !== 'minimized' && lastState === 'minimized') {
      lastState = state
      // Petit délai pour laisser la fenêtre se restorer visuellement
      setTimeout(callbacks.onRestore, 250)
      return
    }

    // ── Focus / unfocus (SC au premier plan ou non) ──────────────────────────
    if (state === 'foreground' && lastState !== 'foreground') {
      lastState = 'foreground'
      callbacks.onFocus?.()

    } else if (state === 'running' && lastState === 'foreground') {
      lastState = 'running'
      callbacks.onUnfocus?.()
    }
  }, 500)
}

export function stopWindowStateWatcher(): void {
  if (stateInterval) {
    clearInterval(stateInterval)
    stateInterval = null
  }
  lastState = 'gone'
}

export function killPersistentPS(): void {
  ps?.kill()
  ps = null
  psReady = false
}
