import { nextTick } from 'vue'
import { useMiningStore } from '@renderer/stores/mining'

export function useMineralDropdown() {
  const mining = useMiningStore()

  function filteredMinerals(q: string) {
    const lq = String(q ?? '').trim().toLowerCase()
    const list = !lq
      ? mining.minerals
      : mining.minerals.filter((m) =>
          String(m.name ?? '').toLowerCase().includes(lq) ||
          String((m as any).code ?? '').toLowerCase().includes(lq) ||
          String((m as any).slug ?? '').toLowerCase().includes(lq),
        )
    return list.slice(0, 30)
  }

  function mineralNameById(id: number | string | null | undefined): string {
    if (id === null || id === undefined || id === '') return ''
    return String(mining.minerals.find((m: any) => String(m.id) === String(id))?.name ?? '')
  }

  function mineralDisplayName(row: any): string {
    return String(row?._name || row?.commodityName || mineralNameById(row?.commodityId) || row?._query || '').trim()
  }

  function mineralSearch(row: any): string {
    return String(row?._search ?? '')
  }

  function setMineralSearch(row: any, event: Event) {
    row._search = (event.target as HTMLInputElement).value
    row._hi = -1
  }

  function filteredMineralsForRow(row: any) {
    return filteredMinerals(mineralSearch(row))
  }

  function focusDropdownSearch(event?: Event | null) {
    const root = (event?.currentTarget as HTMLElement | null)?.closest('.relative')
    nextTick(() => {
      const input = root?.querySelector<HTMLInputElement>('.mineral-dropdown-search')
      input?.focus()
    })
  }

  function openMineralDropdown(row: any, event?: Event) {
    row._open = true
    row._hi = -1
    row._search = ''
    focusDropdownSearch(event)
  }

  function closeMineralDropdown(row: any, delay = 160) {
    setTimeout(() => { row._open = false }, delay)
  }

  function clearMineral(row: any) {
    row.commodityId = null
    row.commodityName = ''
    row._name = ''
    row._query = ''
    row._search = ''
    row._open = false
    row._hi = -1
  }

  function selectMineral(row: any, min: any) {
    row.commodityId = min.id
    row.commodityName = min.name
    row._query = min.name
    row._name = min.name
    row._search = ''
    row._open = false
    row._hi = -1
  }

  function mineralDropdownKeydown(event: KeyboardEvent, row: any) {
    const list = filteredMineralsForRow(row)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      row._hi = Math.min(Number(row._hi ?? -1) + 1, list.length - 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      row._hi = Math.max(Number(row._hi ?? 0) - 1, 0)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = list[Number(row._hi ?? -1)] ?? list[0]
      if (item) selectMineral(row, item)
    } else if (event.key === 'Escape') {
      row._open = false
    }
    nextTick(() => {
      const root = (event.currentTarget as HTMLElement | null)?.closest('.relative')
      const item = root?.querySelectorAll<HTMLElement>('.mineral-dropdown-item')?.[Number(row._hi ?? -1)]
      item?.scrollIntoView({ block: 'nearest' })
    })
  }

  function searchBodies(q: string, target: { bodySearch: string; bodyResults: any[]; selectedBody: any }) {
    if (!q || q.length < 2) { target.bodyResults = []; return }
    setTimeout(async () => {
      target.bodyResults = await mining.searchWhereBodies(q)
    }, 300)
  }

  function selectBody(body: any, target: { bodySearch: string; bodyResults: any[]; selectedBody: any }) {
    target.selectedBody = body
    target.bodySearch   = body.name ?? body.label ?? ''
    target.bodyResults  = []
  }

  return {
    mining,
    filteredMinerals,
    mineralNameById,
    mineralDisplayName,
    mineralSearch,
    setMineralSearch,
    filteredMineralsForRow,
    openMineralDropdown,
    closeMineralDropdown,
    clearMineral,
    selectMineral,
    mineralDropdownKeydown,
    searchBodies,
    selectBody,
  }
}
