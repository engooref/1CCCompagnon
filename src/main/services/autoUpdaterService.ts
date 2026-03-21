import { autoUpdater } from 'electron-updater'
import { getSettings } from './settingsStore'
import { logger } from './logger'
import { sendToOverlay } from '../windows/overlayWindow'
import { createOverlayUrls } from '../../renderer/config/api'

let initialized = false

export async function initAutoUpdater() {
  if (initialized) return
  const settings = getSettings()
  try {
    // derive feed URL from settings (same logic as overlayService)
    const urls = createOverlayUrls(settings)
    const feed = urls.updateUrl || (settings as any)?.updateUrl || (settings?.urls as any)?.updateUrl
    if (feed) {
      try {
        // If feed is a JSON index (manifest), fetch and try to pick platform-specific feed
        // Otherwise use it directly as feed URL
        const axios = await import('axios')
        const res = await axios.default.get(feed, { timeout: 5000 })
        const data = res.data
        let feedUrl: string | null = null
        if (data && typeof data === 'object') {
          // common shapes: { latest?: { win32: '...', darwin: '...', linux: '...' } }
          const platform = process.platform
          if (data.latest && typeof data.latest === 'object' && data.latest[platform]) feedUrl = data.latest[platform]
          // fallback: mapping by platform key
          if (!feedUrl) {
            if (data.platforms && data.platforms[platform]) feedUrl = data.platforms[platform]
          }
          // fallback: assets array with URLs — pick one that looks like a YAML manifest
          if (!feedUrl && Array.isArray(data.assets)) {
            const candidates = data.assets.filter((u: string) => /latest\.yml$|latest\.yaml$|yml$|yaml$/i.test(String(u)))
            if (candidates.length) feedUrl = candidates[0]
          }
        }
        if (!feedUrl) {
          // use provided feed as-is
          feedUrl = feed
        }
        if (feedUrl) autoUpdater.setFeedURL({ url: feedUrl })
      } catch (e: any) {
        // couldn't fetch/parse manifest — fallback to using feed directly
        autoUpdater.setFeedURL({ url: feed })
      }
    }
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
