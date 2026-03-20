import { ref } from 'vue'

const STORAGE_KEY = '1cc:pinnedTransportId'

// Partagé entre toutes les instances (singleton module-level)
const pinnedId = ref<number | null>(
  Number(localStorage.getItem(STORAGE_KEY)) || null
)

// Sync inter-fenêtres Electron (storage event propagé sur le même origin)
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    pinnedId.value = e.newValue ? Number(e.newValue) : null
  }
})

export function usePinnedTransport() {
  function pin(id: number) {
    pinnedId.value = id
    localStorage.setItem(STORAGE_KEY, String(id))
  }

  function unpin() {
    pinnedId.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  function toggle(id: number) {
    pinnedId.value === id ? unpin() : pin(id)
  }

  function isPinned(id: number) {
    return pinnedId.value === id
  }

  return { pinnedId, pin, unpin, toggle, isPinned }
}
