import { ref } from 'vue'

const STORAGE_KEY = '1cc:pinnedSessionId'

const pinnedSessionId = ref<number | null>(
  Number(localStorage.getItem(STORAGE_KEY)) || null
)

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    pinnedSessionId.value = e.newValue ? Number(e.newValue) : null
  }
})

export function usePinnedSession() {
  function pin(id: number) {
    pinnedSessionId.value = id
    localStorage.setItem(STORAGE_KEY, String(id))
  }

  function unpin() {
    pinnedSessionId.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  function toggle(id: number) {
    pinnedSessionId.value === id ? unpin() : pin(id)
  }

  function isPinned(id: number) {
    return pinnedSessionId.value === id
  }

  return { pinnedSessionId, pin, unpin, toggle, isPinned }
}
