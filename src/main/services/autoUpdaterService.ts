import { autoUpdater } from 'electron-updater'
import { logger } from './logger'
import { sendToMain } from '../windows/mainWindow'

let initialized = false

function broadcast(payload: unknown) {
  sendToMain('app:auto-update-event', payload)
}

export async function initAutoUpdater() {
  if (initialized) return

  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoDownload = false

  autoUpdater.on('checking-for-update', () => broadcast({ type: 'checking' }))
  autoUpdater.on('update-available', (info) => broadcast({ type: 'update-available', info }))
  autoUpdater.on('update-not-available', (info) => broadcast({ type: 'update-not-available', info }))
  autoUpdater.on('error', (err) => broadcast({ type: 'error', error: err?.message ?? String(err) }))
  autoUpdater.on('download-progress', (progress) => broadcast({ type: 'progress', progress }))
  autoUpdater.on('update-downloaded', (info) => broadcast({ type: 'downloaded', info }))

  initialized = true
}

export async function checkForUpdatesNative() {
  await initAutoUpdater()
  try {
    return await autoUpdater.checkForUpdates()
  } catch (e) {
    logger.error('[autoUpdater] checkForUpdates error', e as any)
    throw e
  }
}

export async function downloadUpdateNative() {
  await initAutoUpdater()
  try {
    return await autoUpdater.downloadUpdate()
  } catch (e) {
    logger.error('[autoUpdater] downloadUpdate error', e as any)
    throw e
  }
}

export async function installUpdateAndQuit() {
  await initAutoUpdater()
  try {
    // quit and install the downloaded update
    autoUpdater.quitAndInstall()
  } catch (e) {
    logger.error('[autoUpdater] quitAndInstall error', e as any)
    throw e
  }
}

export function setFeedUrl(url: string) {
  try {
    autoUpdater.setFeedURL({ url })
  } catch (e: any) {
    logger.warn('[autoUpdater] setFeedURL failed', e?.message ?? e)
  }
}
