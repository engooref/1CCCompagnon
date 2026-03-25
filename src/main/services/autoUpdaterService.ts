import { autoUpdater } from 'electron-updater'
import { logger } from './logger'
import { sendToMain } from '../windows/mainWindow'
import { getSettings } from './settingsStore'

const UPDATE_BASE_URL = 'https://updates.1ercorpscolonial.fr'

let listenersRegistered = false

function broadcast(payload: unknown) {
  sendToMain('app:auto-update-event', payload)
}

function configureUpdater() {
  const { preProd } = getSettings()
  if (preProd) {
    autoUpdater.channel = 'draft'
    autoUpdater.setFeedURL({ provider: 'generic', url: `${UPDATE_BASE_URL}/preprod/` })
  } else {
    autoUpdater.channel = 'latest'
    autoUpdater.setFeedURL({ provider: 'generic', url: `${UPDATE_BASE_URL}/` })
  }
}

export async function initAutoUpdater() {
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoDownload = false

  configureUpdater()

  if (!listenersRegistered) {
    autoUpdater.on('checking-for-update', () => broadcast({ type: 'checking' }))
    autoUpdater.on('update-available', (info) => broadcast({ type: 'update-available', info }))
    autoUpdater.on('update-not-available', (info) => broadcast({ type: 'update-not-available', info }))
    autoUpdater.on('error', (err) => broadcast({ type: 'error', error: err?.message ?? String(err) }))
    autoUpdater.on('download-progress', (progress) => broadcast({ type: 'progress', progress }))
    autoUpdater.on('update-downloaded', (info) => broadcast({ type: 'downloaded', info }))
    listenersRegistered = true
  }
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
    autoUpdater.quitAndInstall(true, true)
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
