import { useOcrStore } from '@renderer/stores/ocrStore'
import { ocrCaptureService } from '@renderer/ocr/OcrCaptureService'
import { ocrRunner } from '@renderer/ocr/OcrRunner'

let started = false

/**
 * Détecte Star Citizen automatiquement et démarre l'OCR sans intervention utilisateur.
 * Idempotent — ne fait rien si déjà démarré ou si SC n'est pas trouvé.
 */
export async function autoStartOcr(): Promise<void> {
  if (started) return
  if (ocrCaptureService.isRunning) { started = true; return }

  const ocr = useOcrStore()

  try {
    if (ocr.profiles.length === 0) {
      await ocr.loadProfiles()
    }

    const preferred = await ocrCaptureService.selectPreferredSource()
    if (!preferred) {
      console.log('[OcrAutoStart] SC non détecté — skip')
      return
    }

    console.log('[OcrAutoStart] SC détecté:', preferred.name)
    ocr.setSource(preferred)

    await ocrCaptureService.start(preferred.id)
    await ocrRunner.init()
    ocrRunner.startAutoScanZone('signal', ocr.scanIntervalMs)

    started = true
    console.log('[OcrAutoStart] Capture + scan démarrés')
  } catch (e) {
    console.warn('[OcrAutoStart] Erreur:', e)
  }
}

/** Réinitialise le flag (utile si SC se ferme et relance). */
export function resetOcrAutoStart(): void {
  started = false
}
