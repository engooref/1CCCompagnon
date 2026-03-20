import { autoUpdater } from 'electron-updater'
import { getSettings } from './settingsStore'
import { logger } from './logger'
import { sendToOverlay } from '../windows/overlayWindow'

let initialized = false

export function initAutoUpdater() {
  if (initialized) return
  const settings = getSettings()
  try {
    const feed = settings?.updateUrl
    if (feed) autoUpdater.setFeedURL({ url: feed })
  } catch (e: any) {
    logger.warn('[autoUpdater] setFeedURL failed', e?.message ?? e)
  }

  autoUpdater.on('checking-for-update', () => sendToOverlay('app:auto-update-event', { type: 'checking' }))
  autoUpdater.on('update-available', (info) => sendToOverlay('app:auto-update-event', { type: 'update-available', info }))
  autoUpdater.on('update-not-available', (info) => sendToOverlay('app:auto-update-event', { type: 'update-not-available', info }))
  autoUpdater.on('error', (err) => sendToOverlay('app:auto-update-event', { type: 'error', error: err?.message ?? String(err) }))
  autoUpdater.on('download-progress', (progress) => sendToOverlay('app:auto-update-event', { type: 'progress', progress }))
  autoUpdater.on('update-downloaded', (info) => sendToOverlay('app:auto-update-event', { type: 'downloaded', info }))

  initialized = true
}

export async function checkForUpdatesNative() {
  initAutoUpdater()
  try {
    return await autoUpdater.checkForUpdates()
  } catch (e) {
    logger.error('[autoUpdater] checkForUpdates error', e as any)
    throw e
  }
}

export async function downloadUpdateNative() {
  initAutoUpdater()
  try {
    return await autoUpdater.downloadUpdate()
  } catch (e) {
    logger.error('[autoUpdater] downloadUpdate error', e as any)
    throw e
  }
}

export function installUpdateAndQuit() {
  initAutoUpdater()
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
