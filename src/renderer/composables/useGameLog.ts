import { ref, onUnmounted } from 'vue'
import type { GameState, GameEvent } from '../../main/services/logParserService'

const ACTIVITY_LABEL: Record<string, string> = {
  hangar:  'Dans le hangar',
  space:   'Dans l\'espace',
  quantum: 'En voyage quantique',
  unknown: 'Inconnu',
}

export function useGameLog() {
  const running = ref(false)
  const state   = ref<GameState | null>(null)
  const events  = ref<(GameEvent & { id: number })[]>([])
  let   counter = 0

  function activityLabel(a: string) {
    return ACTIVITY_LABEL[a] ?? a
  }

  async function start(folder: string) {
    window.oneCC.offGamelog()

    window.oneCC.onGamelogState((s) => { state.value = s })
    window.oneCC.onGamelogEvent((e) => {
      if ((e as { type: string }).type === 'restored') return   // état restauré au démarrage, pas un vrai événement
      events.value.unshift({ ...e, id: ++counter })
      if (events.value.length > 200) events.value.length = 200
    })

    state.value = await window.oneCC.gamelogStart(folder)
    running.value = true
  }

  async function stop() {
    window.oneCC.offGamelog()
    await window.oneCC.gamelogStop()
    running.value = false
  }

  onUnmounted(stop)

  return { running, state, events, start, stop, activityLabel }
}
