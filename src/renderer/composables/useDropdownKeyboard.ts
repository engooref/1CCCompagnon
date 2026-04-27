import { ref } from 'vue'

export function useDropdownKeyboard() {
  const activeIndex = ref(-1)

  function clampIndex(index: number, length: number) {
    if (length <= 0) return -1
    if (index < 0) return 0
    if (index >= length) return length - 1
    return index
  }

  function move(active: number, offset: number, length: number) {
    if (length <= 0) return 0
    let idx = active
    if (idx < 0) idx = offset > 0 ? 0 : length - 1
    else idx = idx + offset
    return clampIndex(idx, length)
  }

  return { activeIndex, clampIndex, move }
}
