import type { OverlayNotification } from '@shared/general'

type Listener = (notif: OverlayNotification) => void

// Singleton module-level — partagé entre toutes les instances de composants
const listeners = new Set<Listener>()

export function useNotificationBus() {
  function push(notif: OverlayNotification) {
    listeners.forEach((l) => l(notif))
  }

  function subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  return { push, subscribe }
}
