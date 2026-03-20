type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function formatArg(a: unknown): string {
  if (a === null) return 'null'
  if (a === undefined) return 'undefined'
  if (typeof a === 'string') return a
  if (a instanceof Error) return a.stack ?? a.message
  try { return JSON.stringify(a) } catch { return String(a) }
}

function log(level: LogLevel, ...args: unknown[]): void {
  const message = args.map(formatArg).join(' ')
  window.oneCC.log(level, message)
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info:  (...args: unknown[]) => log('info',  ...args),
  warn:  (...args: unknown[]) => log('warn',  ...args),
  error: (...args: unknown[]) => log('error', ...args),
}
