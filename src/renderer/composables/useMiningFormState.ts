/**
 * État local des formulaires Mining
 * Garde l'état UI hors du store Pinia
 */

import { ref, reactive } from 'vue'

/**
 * État du formulaire d'ajout/édition de rocher
 */
export function useRockFormState() {
  return reactive({
    show: false,
    saving: false,
    error: null as string | null,
    editRockId: null as number | null,
    posX: '' as string,
    posY: '' as string,
    bodySearch: '',
    bodyResults: [] as any[],
    selectedBody: null as any | null,
    sizeScuEstimate: '' as string,
    mass: '' as string,
    instability: '' as string,
    resistance: '' as string,
    notes: '',
    minerals: [] as Array<{ commodityId: number | null; percentage: string; quality: number; _name: string; _query: string; _search?: string; _open: boolean; _hi?: number }>,
    zoneQuery: '' as string,
    zoneQueryId: null as number | null,
    zoneQueryOpen: false,
    zoneQuerySearch: '' as string,
    zoneQueryHi: -1,
    zoneSearchState: 'idle' as 'idle' | 'loading' | 'found' | 'not_found',
    zoneLocationName: null as string | null,
    zoneCreate: {
      show: false,
      primaryQualityMax: 500,
      secondary: { commodityId: null as number | null, _query: '', _search: '', _open: false, _hi: -1, qualityMax: 500 },
      tertiary: { commodityId: null as number | null, _query: '', _search: '', _open: false, _hi: -1, qualityMax: 500 },
      saving: false,
      error: null as string | null,
    },
  })
}

/**
 * État du formulaire de collecte de rocher
 */
export function useCollectFormState() {
  return reactive({
    show: false,
    saving: false,
    error: null as string | null,
    rockId: null as number | null,
    mode: 'complete' as 'partial' | 'complete',
    rockMineralIds: [] as number[],
    lines: [] as Array<{ commodityId: number | null; commodityName: string; quantityScuActual: string; scanEstimateScu: number; alreadyCollectedScu: number; _name?: string; _query?: string; _search?: string; _open?: boolean; _hi?: number }>,
  })
}

/**
 * État du formulaire de création de session
 */
export function useSessionCreateFormState() {
  return reactive({
    show: false,
    name: '',
    saving: false,
    error: null as string | null,
    bodySearch: '',
    bodyResults: [] as any[],
    selectedBody: null as any | null,
    refineryQuery: '',
    selectedRefineryId: null as number | null,
    refineryOpen: false,
  })
}

/**
 * État du formulaire de rejoindre une session
 */
export function useSessionJoinFormState() {
  return reactive({
    show: false,
    targetSessionId: null as number | null,
    role: 'miner' as string,
    saving: false,
    error: null as string | null,
    shipId: null as number | null,
    selectedShip: null as any | null,
    shipSearch: '',
    shipResults: [] as any[],
    crewKey: null as string | null,
    crewTotal: 1,
  })
}

/**
 * État du formulaire de changement de zone
 */
export function useChangeZoneFormState() {
  return reactive({
    show: false,
    bodySearch: '',
    bodyResults: [] as any[],
    selectedBody: null as any | null,
  })
}

/**
 * État du formulaire de changement de raffinerie
 */
export function useChangeRefineryFormState() {
  return reactive({
    show: false,
    refineryQuery: '',
    selectedRefineryId: null as number | null,
  })
}

/**
 * État de la confirmation de départ d'un participant
 */
export function useLeaveConfirmState() {
  return reactive({
    show: false,
    sessionId: null as number | null,
    participantId: null as number | null,
    selectedCaptainId: null as number | null,
    candidates: [] as any[],
  })
}

/**
 * État de la confirmation de claim d'un rocher
 */
export function useClaimConfirmState() {
  return reactive({
    show: false,
    rockId: null as number | null,
  })
}

/**
 * Composable pour tous les formulaires Mining (pour utilisation optionnelle)
 */
export function useMiningFormStates() {
  const rockForm = useRockFormState()
  const collectForm = useCollectFormState()
  const sessionCreateForm = useSessionCreateFormState()
  const sessionJoinForm = useSessionJoinFormState()
  const changeZone = useChangeZoneFormState()
  const changeRefinery = useChangeRefineryFormState()
  const leaveConfirm = useLeaveConfirmState()
  const claimConfirm = useClaimConfirmState()

  return {
    rockForm,
    collectForm,
    sessionCreateForm,
    sessionJoinForm,
    changeZone,
    changeRefinery,
    leaveConfirm,
    claimConfirm,
  }
}
