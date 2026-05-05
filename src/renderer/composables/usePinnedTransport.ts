import { ref, computed } from 'vue'

const STORAGE_KEY = '1cc:pinnedTransport'

const pinnedId = ref<number | null>(
  Number(localStorage.getItem(STORAGE_KEY)) || null
)

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    pinnedId.value = e.newValue ? Number(e.newValue) : null
  }
})

export function usePinnedTransport() {
  const pinnedTransport = computed(() => pinnedId.value !== null)

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

  return { pinnedId, pinnedTransport, pin, unpin, toggle, isPinned }
}
