// ─── Composable Push-to-Talk (multi-canal) ────────────────────────────────────
// Fallback clavier côté renderer pour le PTT multi-canal.
// Le PTT principal passe par uIOhook (main → IPC → renderer) qui gère les cas
// où le jeu est au premier plan. Ce composable gère le cas fenêtre active.

import { onMounted, onUnmounted } from 'vue'
import { useRadioStore } from '../stores/radio'
import { isCategoryPttTarget, isGlobalPttTarget } from '@shared/radio'

export function usePushToTalk() {
  const radio = useRadioStore()

  // targetId (canal ou catégorie) → true si PTT enfoncé (pour éviter repeat)
  const pttActive = new Map<string, boolean>()

  function isTypingTarget(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null
    if (!t) return false
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isTypingTarget(e)) return

    for (const binding of radio.settings.pttBindings) {
      if (!binding.keyCode || e.keyCode !== binding.keyCode) continue
      if (pttActive.get(binding.channelId)) continue

      // Si le binding cible un canal précis et qu'on est déjà connecté
      // normalement (non murmure) sur ce canal, pas besoin d'utiliser le PTT.
      if (!isCategoryPttTarget(binding.channelId) && !isGlobalPttTarget(binding.channelId)) {
        const cs = radio.channelState[binding.channelId]
        if (cs?.connected && !cs.whisperOnly) {
          continue
        }
      }

      e.preventDefault()
      pttActive.set(binding.channelId, true)
      if (!radio.muted) {
        if (typeof (radio as any).handlePttStart === 'function') (radio as any).handlePttStart(binding.channelId)
        else radio.startPttTarget(binding.channelId)
      }
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (isTypingTarget(e)) return

    for (const binding of radio.settings.pttBindings) {
      if (!binding.keyCode || e.keyCode !== binding.keyCode) continue
      if (!pttActive.get(binding.channelId)) continue

      e.preventDefault()
      pttActive.set(binding.channelId, false)
      if (typeof (radio as any).handlePttStop === 'function') (radio as any).handlePttStop(binding.channelId)
      else radio.stopPttTarget(binding.channelId)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    // Arrêter toutes les transmissions actives
    for (const [targetId, active] of pttActive) {
      if (active) radio.stopPttTarget(targetId)
    }
    pttActive.clear()
  })
}
