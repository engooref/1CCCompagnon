import { ref, onMounted, onUnmounted } from 'vue'

export function useNow(intervalMs = 1000) {
  const now = ref(Date.now())
  let handle: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    handle = setInterval(() => { now.value = Date.now() }, intervalMs)
  })

  onUnmounted(() => {
    if (handle) clearInterval(handle)
    handle = null
  })

  return { now }
}
