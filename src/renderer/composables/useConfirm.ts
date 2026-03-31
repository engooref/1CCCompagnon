import { ref } from 'vue'

const visible = ref(false)
const message = ref('')
let _resolve: ((v: boolean) => void) | null = null

export function useConfirm() {
  function confirm(msg: string): Promise<boolean> {
    message.value = msg
    visible.value = true
    return new Promise<boolean>(resolve => {
      _resolve = resolve
    })
  }

  function accept() {
    visible.value = false
    _resolve?.(true)
    _resolve = null
  }

  function cancel() {
    visible.value = false
    _resolve?.(false)
    _resolve = null
  }

  return { visible, message, confirm, accept, cancel }
}
