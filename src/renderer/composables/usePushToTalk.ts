// ─── Composable Push-to-Talk ──────────────────────────────────────────────────
// Gère le PTT côté renderer en tant que fallback clavier (en plus du uIOhook main).

import { onMounted, onUnmounted } from 'vue'
import { useRadioStore } from '../stores/radio'

/**
 * Composable qui écoute les événements clavier locaux comme fallback PTT.
 * Le principal PTT passe par uIOhook (main → IPC → renderer),
 * mais celui-ci assure que le PTT marche aussi quand la fenêtre a le focus.
 */
export function usePushToTalk() {
  const radio = useRadioStore()

  let pttActive = false

  function onKeyDown(e: KeyboardEvent) {
    if (!radio.settings.pttKeyCode) return
    if (e.keyCode !== radio.settings.pttKeyCode) return
    if (pttActive) return // éviter repeat

    e.preventDefault()
    pttActive = true

    if (radio.connected && !radio.muted) {
      radio.startTransmit()
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (!radio.settings.pttKeyCode) return
    if (e.keyCode !== radio.settings.pttKeyCode) return
    if (!pttActive) return

    e.preventDefault()
    pttActive = false
    radio.stopTransmit()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    if (pttActive) {
      pttActive = false
      radio.stopTransmit()
    }
  })
}
