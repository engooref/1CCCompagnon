import { ref } from 'vue'

const STORAGE_KEY = '1cc:pinnedMapId'

// Partagé entre toutes les instances (singleton module-level)
const pinnedMapId = ref<number | null>(
  Number(localStorage.getItem(STORAGE_KEY)) || null
)

// Sync inter-fenêtres Electron (storage event propagé sur le même origin)
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    pinnedMapId.value = e.newValue ? Number(e.newValue) : null
  }
})

export function usePinnedMap() {
  function pin(id: number) {
    pinnedMapId.value = id
    localStorage.setItem(STORAGE_KEY, String(id))
  }

  function unpin() {
    pinnedMapId.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  function toggle(id: number) {
    pinnedMapId.value === id ? unpin() : pin(id)
  }

  function isPinned(id: number) {
    return pinnedMapId.value === id
  }

  return { pinnedMapId, pin, unpin, toggle, isPinned }
}
