import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
}

const MAX_LOG_FILES = 7
const MAX_BUFFER = 500

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

function timestamp(): string {
  const d = new Date()
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  )
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatArg(a: unknown): string {
  if (a === null) return 'null'
  if (a === undefined) return 'undefined'
  if (typeof a === 'string') return a
  if (a instanceof Error) return a.stack ?? a.message
  try { return JSON.stringify(a) } catch { return String(a) }
}

class Logger {
  private logDir: string | null = null
  private currentDate = ''
  private stream: fs.WriteStream | null = null
  private buffer: LogEntry[] = []
  private listeners: ((entry: LogEntry) => void)[] = []

  private getLogDir(): string {
    if (!this.logDir) {
      this.logDir = app.getPath('logs')
      try { fs.mkdirSync(this.logDir, { recursive: true }) } catch { /* ignore */ }
    }
    return this.logDir
  }

  private getStream(): fs.WriteStream {
    const date = todayStr()
    if (this.currentDate !== date || !this.stream) {
      try { this.stream?.destroy() } catch { /* ignore */ }
      this.currentDate = date
      const logFile = path.join(this.getLogDir(), `app-${date}.log`)
      this.stream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf8' })
      this.rotateOldLogs()
    }
    return this.stream
  }

  private rotateOldLogs(): void {
    try {
      const dir = this.getLogDir()
      const files = fs.readdirSync(dir)
        .filter(f => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(f))
        .sort()
      if (files.length > MAX_LOG_FILES) {
        for (const old of files.slice(0, files.length - MAX_LOG_FILES)) {
          try { fs.unlinkSync(path.join(dir, old)) } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  write(level: LogLevel, ...args: unknown[]): void {
    try {
      if (level === 'debug' && app.isPackaged) return
      const msg = args.map(formatArg).join(' ')
      const ts = timestamp()
      const line = `[${ts}] [${level.toUpperCase().padEnd(5)}] ${msg}\n`
      this.getStream().write(line)
      const entry: LogEntry = { timestamp: ts, level, message: msg }
      this.buffer.push(entry)
      if (this.buffer.length > MAX_BUFFER) this.buffer.shift()
      for (const cb of this.listeners) { try { cb(entry) } catch { /* ignore */ } }
    } catch { /* ignore */ }
  }

  getLogs(): LogEntry[] { return [...this.buffer] }
  onLog(cb: (entry: LogEntry) => void): void { this.listeners.push(cb) }
  offLog(cb: (entry: LogEntry) => void): void { this.listeners = this.listeners.filter(l => l !== cb) }

  debug(...args: unknown[]): void { this.write('debug', ...args) }
  info(...args:  unknown[]): void { this.write('info',  ...args) }
  warn(...args:  unknown[]): void { this.write('warn',  ...args) }
  error(...args: unknown[]): void { this.write('error', ...args) }
}

export const logger = new Logger()
