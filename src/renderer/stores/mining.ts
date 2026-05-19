import { defineStore } from 'pinia'
import { logger } from '../services/logger'
import { createOverlayUrls } from '../config/api'
import { useAppStore } from './app'
import { useMercure } from '@renderer/composables/useMercure'
import { useNotificationBus } from '@renderer/composables/useNotificationBus'
import {
  fetchBootstrap,
  fetchWorkOrders,
  createWorkOrder as svcCreateWorkOrder,
  suggestZone as svcSuggestZone,
  deleteWorkOrder as svcDeleteWorkOrder,
  postCompleteWorkOrder as svcPostCompleteWorkOrder,
  getRefineryPoiYields as svcGetRefineryPoiYields,
  getAllRefineryYields as svcGetAllRefineryYields,
  fetchSessionList as svcFetchSessionList,
  fetchSessionDetail as svcFetchSessionDetail,
  createSession as svcCreateSession,
  joinSession as svcJoinSession,
  leaveSession as svcLeaveSession,
  addRock as svcAddRock,
  claimRock as svcClaimRock,
  unclaimRock as svcUnclaimRock,
  collectRock as svcCollectRock,
  closeSessionApi as svcCloseSessionApi,
  loadZones as svcLoadZones,
  previewRefineryTime as svcPreviewRefineryTime,
  searchWhereBodies as svcSearchWhereBodies,
  updateRockStatus as svcUpdateRockStatus,
  updateRock as svcUpdateRock,
  fetchLoadoutCatalog as svcFetchLoadoutCatalog,
  fetchUserLoadouts as svcFetchUserLoadouts,
  createLoadout as svcCreateLoadout,
  updateLoadout as svcUpdateLoadout,
  deleteLoadout as svcDeleteLoadout,
  fetchPublicLoadouts as svcFetchPublicLoadouts,
  deleteRock as svcDeleteRock,
  assignRock as svcAssignRock,
  updateParticipant as svcUpdateParticipant,
  updateCrewStatus as svcUpdateCrewStatus,
  assignSubCaptain as svcAssignSubCaptain,
  leaveParticipant as svcLeaveParticipant,
  updateSessionDefaultBody as svcUpdateSessionDefaultBody,
  fetchBodyLabel as svcFetchBodyLabel,
  updateSessionDefaultRefinery as svcUpdateSessionDefaultRefinery,
  pickupCargo as svcPickupCargo,
  transferCrewCargosToSupport as svcTransferCrewCargosToSupport,
  createSessionOperation as svcCreateSessionOperation,
  searchMiningShips as svcSearchMiningShips,
  fetchSessionShips as svcFetchSessionShips,
  parseApiError,
} from '../services/miningService'
import type {
  MiningMineral,
  MiningRefinery,
  MiningRefineryMethod,
  MiningRefineryYield,
  MiningRefineryYieldBonus,
  MiningWorkOrder,
  MiningWOLine,
  MiningSession,
  MiningSessionDetail,
  MiningRock,
  MiningCargo,
  MiningSessionLog,
  MiningZone,
  MiningShip,
  MiningLaser,
  MiningModule,
  MiningLoadout,
} from '@shared/general'



// ─── Helpers ─────────────────────────────────────────────────────────────────


function isWorkOrderNotified(wo: Partial<MiningWorkOrder> | null | undefined): boolean {
  if (!wo) return false
  return Boolean(
    wo.isNotified
    || (wo as any).notified
    || (wo as any).notificationSent
    || wo.notifiedAt
    || (wo as any).notificationSentAt,
  )
}

function normalizeWO(wo: any): MiningWorkOrder {
  const lines = Array.isArray(wo.lines)
    ? wo.lines.map((l: any) => ({
      ...l,
      // support both `scuInput` and `quantityScuInput` coming from API
      scuInput: l.scuInput ?? l.quantityScuInput ?? l.quantityScuInput ?? null,
      quantityScuInput: l.quantityScuInput ?? l.scuInput ?? null,
      // support both output field names
      scuOutput: l.scuOutput ?? l.quantityScuOutput ?? null,
      quantityScuOutput: l.quantityScuOutput ?? l.scuOutput ?? null,
      yieldPercent: l.yieldPercent ?? l.yieldPercent ?? null,
    }))
    : []

  return {
    ...wo,
    userId:           wo.userId ?? wo.ownerId ?? null,
    refineryPoiId:    wo.refineryPoiId ?? wo.refineryId ?? wo.refinery ?? null,
    refineryName:     wo.refineryName ?? wo.refineryName ?? null,
    method:           wo.method ?? wo.method ?? null,
    methodLabel:      wo.methodLabel ?? wo.methodLabel ?? wo.method ?? null,
    startedAt:        wo.startedAt  ?? null,
    endAt:            wo.endAt      ?? null,
    durationSeconds:  wo.durationSeconds ?? null,
    remainingSeconds: wo.remainingSeconds ?? null,
    confidence:       wo.confidence ?? null,
    isReady:          wo.isReady    ?? false,
    lines,
    notes:            wo.notes ?? null,
    notifyOnComplete: typeof wo.notifyOnComplete === 'boolean' ? wo.notifyOnComplete : true,
    isNotified:       isWorkOrderNotified(wo),
    notifiedAt:       wo.notifiedAt ?? wo.notificationSentAt ?? wo.notificationStartedAt ?? null,
  }
}

function getReadyOverlayContent(count?: number): { title: string; message: string } {
  const normalizedCount = Number.isFinite(Number(count)) ? Math.trunc(Number(count)) : 1

  if (normalizedCount > 1) {
    return {
      title: 'Raffineries terminées',
      message: `${normalizedCount} raffineries sont prêtes a etre récupérées.`,
    }
  }
  return {
    title: 'Raffinerie terminée',
    message: `Une raffinerie est prête a etre récupérée.`,
  }
}

// ─── State ────────────────────────────────────────────────────────────────────
const { connect: connectMercure, disconnect: disconnectMercure } = useMercure('session')

export const useMiningStore = defineStore('mining', {
  state: () => ({
    minerals:        [] as MiningMineral[],
    refineries:      [] as MiningRefinery[],
    refineryMethods: [] as MiningRefineryMethod[],
    workOrders:          [] as MiningWorkOrder[],
    refineryYieldsAll:    [] as MiningRefineryYield[],
    refineryYieldsLoaded: false,
    refineryPoiYields:    [] as MiningRefineryYieldBonus[],

    // ── Session collaborative ─────────────────────────────────────────────
    sessionList:   [] as MiningSession[],
    sessionActive: null as MiningSessionDetail | null,
    sessionView:   'list' as 'list' | 'active',
    sessionShips:  [] as any[],
    sessionShipsLoaded: false,
    sessionCreateForm: {
      show:    false,
      name:    '',
      saving:  false,
      error:   null as string | null,
      bodySearch:   '',
      bodyResults:  [] as any[],
      selectedBody: null as any | null,
      refineryQuery: '',
      selectedRefineryId: null as number | null,
      refineryOpen: false,
    },
    sessionJoinForm: {
      show:            false,
      targetSessionId: null as number | null,
      role:            'miner' as string,
      saving:          false,
      error:           null as string | null,
      shipId:          null as number | null,
      selectedShip:    null as any | null,
      shipSearch:      '',
      shipResults:     [] as any[],
      crewKey:         null as string | null,
      crewTotal:       1,
    },
    rockForm: {
      show:            false,
      saving:          false,
      error:           null as string | null,
      editRockId:      null as number | null,
      posX:            '' as string,
      posY:            '' as string,
      bodySearch:      '',
      bodyResults:     [] as any[],
      selectedBody:    null as any | null,
      sizeScuEstimate: '' as string,
      mass:            '' as string,
      instability:     '' as string,
      resistance:      '' as string,
      notes:           '',
      minerals:        [] as Array<{ commodityId: number | null; percentage: string; quality: number; _name: string; _query: string; _search?: string; _open: boolean; _hi?: number }>,
      zoneQuery:         '' as string,
      zoneQueryId:       null as number | null,
      zoneQueryOpen:     false,
      zoneQuerySearch:   '' as string,
      zoneQueryHi:       -1,
      zoneSearchState:   'idle' as 'idle' | 'loading' | 'found' | 'not_found',
      zoneLocationName:  null as string | null,
      zoneCreate: {
        show:              false,
        primaryQualityMax: 500,
        secondary:         { commodityId: null as number | null, _query: '', _search: '', _open: false, _hi: -1, qualityMax: 500 },
        tertiary:          { commodityId: null as number | null, _query: '', _search: '', _open: false, _hi: -1, qualityMax: 500 },
        saving:            false,
        error:             null as string | null,
      },
    },
    collectForm: {
      show:           false,
      saving:         false,
      error:          null as string | null,
      rockId:         null as number | null,
      mode:           'complete' as 'partial' | 'complete',
      rockMineralIds: [] as number[],
      lines:          [] as Array<{ commodityId: number | null; commodityName: string; quantityScuActual: string; scanEstimateScu: number; alreadyCollectedScu: number; _name?: string; _query?: string; _search?: string; _open?: boolean; _hi?: number }>,
    },
    changeZone: {
      show:         false,
      bodySearch:   '',
      bodyResults:  [] as any[],
      selectedBody: null as any | null,
    },
    changeRefinery: {
      show:               false,
      refineryQuery:      '',
      selectedRefineryId: null as number | null,
    },
    claimConfirm: {
      show:   false,
      rockId: null as number | null,
    },
    leaveConfirm: {
      show:              false,
      sessionId:         null as number | null,
      participantId:     null as number | null,
      selectedCaptainId: null as number | null,
      candidates:        [] as any[],
    },
    createOpLoadingId: null as number | null,
    rockFilter:       'all' as 'all' | 'available' | 'inprogress' | 'done',
    _currentUserId:   null as number | null,

    loading: {
      bootstrap:            false,
      workOrders:           false,
      createWO:             false,
      deleteWO:             false,
      completeWO:           false,
      collectAll:           false,
      session:              false,
      sessionDetail:        false,
      createSession:        false,
      joinSession:          false,
      leaveSession:         false,
      addRock:              false,
      claimRock:            false,
      collectRock:          false,
      closeSession:         false,
      updateRockStatus:     false,
      deleteRock:           false,
      assignRock:           false,
      pickupCargo:          false,
      bagChange:            false,
      loadShips:            false,
      updateSessionBody:    false,
      updateSessionRefinery: false,
      createOp:             false,
    },
    errors: {
      global:     null as string | null,
      workOrders: null as string | null,
      createWO:   null as string | null,
      session:    null as string | null,
    },

    _sessionSseActive: false,

    // ── Où Miner ─────────────────────────────────────────────────────────
    where: {
      results:  [] as MiningZone[],
      loading:  false,
      error:    null as string | null,
    },

    // ── Loadout Simulator ─────────────────────────────────────────────────
    loadout: {
      ships:          [] as MiningShip[],
      lasers:         [] as MiningLaser[],
      modules:        [] as MiningModule[],
      catalogLoaded:  false,
      savedList:      [] as MiningLoadout[],
      savedLoaded:    false,
      publicList:     [] as MiningLoadout[],
      loadingCatalog: false,
      loadingSaved:   false,
      loadingPublic:  false,
      savingLoadout:  false,
      deletingId:     null as number | null,
      error:          null as string | null,
    },
  }),

  getters: {
    // Retourne les WO triés : en cours d'abord, terminés ensuite
    sortedWorkOrders: (state): MiningWorkOrder[] =>
      [...state.workOrders].sort((a, b) => {
        if (a.isReady !== b.isReady) return a.isReady ? 1 : -1
        const aEnd = a.endAt ? new Date(a.endAt).getTime() : Infinity
        const bEnd = b.endAt ? new Date(b.endAt).getTime() : Infinity
        return aEnd - bEnd
      }),

    refineryById: (state) => (id: number | string) =>
      state.refineries.find((r) => String(r.id) === String(id)) ?? null,

    methodByKey: (state) => (key: string) =>
      state.refineryMethods.find((m) => m.method === key) ?? null,

    // Session
    sessionActiveRocks: (state): MiningRock[] =>
      (state.sessionActive?.rocks ?? []).filter((r) => r.status !== 'depleted' && r.status !== 'completed'),

    sessionActiveLogs: (state): MiningSessionLog[] =>
      (state.sessionActive?.logs ?? []).slice(0, 30),

    rockFilteredList: (state): MiningRock[] => {
      const rocks = state.sessionActive?.rocks ?? []
      if (state.rockFilter === 'available')  return rocks.filter((r) => r.status === 'available')
      if (state.rockFilter === 'inprogress') return rocks.filter((r) => ['en_route', 'fracturing', 'extraction'].includes(r.status))
      if (state.rockFilter === 'done')       return rocks.filter((r) => ['completed', 'depleted'].includes(r.status))
      return rocks
    },

    rockFilterCount: (state) => (key: string): number => {
      const rocks = state.sessionActive?.rocks ?? []
      if (key === 'available')  return rocks.filter((r) => r.status === 'available').length
      if (key === 'inprogress') return rocks.filter((r) => ['en_route', 'fracturing', 'extraction'].includes(r.status)).length
      if (key === 'done')       return rocks.filter((r) => ['completed', 'depleted'].includes(r.status)).length
      return rocks.length
    },

    myParticipant: (state) =>
      (state.sessionActive?.participants ?? []).find((p) => p.userId === state._currentUserId) ?? null,

    amICaptain: (state) =>
      (state.sessionActive?.participants ?? []).some((p) => p.userId === state._currentUserId && p.isCaptain),

  },

  actions: {
    // ─── Helpers internes ───────────────────────────────────────────────────

    _headers(): Record<string, string> {
      const app = useAppStore()
      const token = app.bearerToken
      return token ? { Authorization: `Bearer ${token}` } : {}
    },

    _base(): string {
      const app = useAppStore()
      return (app.settings?.siteUrl ?? '').replace(/\/$/, '')
    },

    _urls(): any {
      const app = useAppStore()
      return app.settings ? createOverlayUrls(app.settings) : null
    },

    _workOrderLabel(wo: MiningWorkOrder): string {
      if (wo.refineryName) return wo.refineryName
      if (wo.refineryPoiId != null) return `Raffinerie #${wo.refineryPoiId}`
      return 'Raffinerie'
    },

    _applyWorkOrderUpdate(workOrder: MiningWorkOrder) {
      const next = normalizeWO(workOrder)
      const index = this.workOrders.findIndex((item) => item.id === next.id)
      if (index === -1) {
        this.workOrders.unshift(next)
        return next
      }
      this.workOrders.splice(index, 1, next)
      return next
    },

    async _notifyReadyOverlay(count?: number): Promise<boolean> {
      const normalizedCount = Number.isFinite(Number(count)) ? Math.trunc(Number(count)) : 1
      const { title, message } = getReadyOverlayContent(normalizedCount)

      const app = useAppStore()
      if (!app.settings?.overlayEnabled) {
        logger.info('[mining] overlay disabled — skip overlay notification', { count: normalizedCount })
        return false
      }
      if (app.overlayVisible === false) {
        logger.info('[mining] overlay window hidden — skip overlay notification', { count: normalizedCount })
        return false
      }

      logger.info('[mining] sending overlay notification', {
        count: normalizedCount,
      })
      try {
        await window.oneCC?.pushOverlayNotification?.({
          id: `refinery-ready-${normalizedCount}-${Date.now()}`,
          title,
          message,
          type: 'success',
          duration: 7000,
        })
        logger.info('[mining] overlay notification pushed', { count: normalizedCount })
      } catch (err) {
        logger.error('[mining] overlay notification failed', err, { count: normalizedCount })
        return false
      }

      return true
    },

    async _ackRefineryNotification(
      ackUrl: string,
      notificationToken: string,
    ) {
      // Utilise le token comme clé de dédup ; fallback sur l'URL si pas de token
      const dedupKey = notificationToken ?? ackUrl
      if (!ackUrl || !dedupKey) return

      const app = useAppStore()
      if (!app.settings?.overlayEnabled) {
        logger.info('[mining] overlay disabled — skip ack', { ackUrl })
        return
      }
      // Skip if overlay window is currently hidden
      if (app.overlayVisible === false) {
        logger.info('[mining] overlay window hidden — skip ack', { ackUrl })
        return
      }

      logger.info('[mining] sending ack for refinery notification', { ackUrl })
      try {
        const authHeader = this._headers()?.Authorization
        const resp = await window.oneCC.ackRefineryNotification({
          ackUrl,
          notificationToken,
          authHeader,
        })
        logger.info('[mining] ack sent', { ackUrl, status: resp?.status ?? null })
      } catch (err: any) {
        logger.error('[mining] ack failed', err?.response?.status ?? err?.message ?? err, { ackUrl })
        // Ignore ack errors so realtime UX is never blocked by this side request.
      }
    },

    async handleRefineryMercureEvent(payload: unknown) {
      const evt = (payload ?? {}) as Record<string, any>
      const action = String(evt.action ?? evt.type ?? evt.event ?? '')

      logger.info('[mining] refinery mercure event received', { action, workOrderId: evt?.workOrderId ?? evt?.orderId ?? evt?.data?.workOrderId ?? null })
      // Mettre à jour l'état local du work order si présent
      const rawWorkOrder = evt.workOrder ?? evt.order ?? evt.data?.workOrder ?? evt.data?.order
      const workOrder = rawWorkOrder && typeof rawWorkOrder === 'object' && 'id' in rawWorkOrder
        ? normalizeWO(rawWorkOrder)
        : null
      if (workOrder?.id) {
        this._applyWorkOrderUpdate(workOrder)
      }

      // Seul l'event de notification doit déclencher une notif overlay + ack
      if (action !== 'refinery_order_notify_group') {
        logger.debug('[mining] mercure event ignored (not refinery_order_notify_group)', { action })
        return
      }

      const ackUrl: string | null = this._urls()?.mining?.refineryNotifyAck ?? null;
      const notificationToken: string | null = evt.notificationToken ?? null
      const ttlSeconds: number | null = evt.ttlSeconds ?? null
      const readyCount = Number.isFinite(Number(evt.count ?? evt.data?.count))
        ? Math.max(1, Math.trunc(Number(evt.count ?? evt.data?.count)))
        : 1
      logger.info('[mining] refinery_order_notify_group payload', {
        ackUrl,
        notificationToken: notificationToken ? '***' : null,
        ttlSeconds,
        count: readyCount,
      })

      // Ignorer si le TTL est déjà expiré
      if (ttlSeconds !== null && ttlSeconds <= 0) return

      const overlaySent = await this._notifyReadyOverlay(readyCount)
      if (!overlaySent) return

      if (ackUrl && notificationToken) {
        await this._ackRefineryNotification(ackUrl, notificationToken)
      } else {
        logger.warn('[mining] ack skipped: missing ackUrl or notificationToken', {
          hasAckUrl: Boolean(ackUrl),
          hasToken: Boolean(notificationToken),
        })
      }
    },

    // ─── Bootstrap (minerais + raffineries + méthodes) ──────────────────────

    async init() {
      if (this.minerals.length && this.refineries.length) return
      this.loading.bootstrap = true
      this.errors.global = null
      try {
        const { minerals, refineries, refineryMethods } = await fetchBootstrap()
        this.minerals = minerals
        this.refineries = refineries
        this.refineryMethods = refineryMethods
      } catch (err) {
        logger.error('[mining] init failed', err)
        this.errors.global = 'Impossible de charger les données de minage.'
      } finally {
        this.loading.bootstrap = false
      }
      this.loadSessionShips()
    },

    // ─── Work Orders ────────────────────────────────────────────────────────

    async previewRefineryTime(method: string, lines: Array<{ commodityId: number | string; scuInput: number }>) {
      return await svcPreviewRefineryTime(method, lines)
    },

    async loadWorkOrders() {
      this.loading.workOrders = true
      this.errors.workOrders = null
      try {
        const raw = await fetchWorkOrders()
        const workOrders = Array.isArray(raw) ? raw.map(normalizeWO) : []
        this.workOrders = workOrders
      } catch (err) {
        logger.error('[mining] loadWorkOrders failed', err)
        this.errors.workOrders = 'Erreur chargement work orders.'
      } finally {
        this.loading.workOrders = false
      }
    },

    async createWorkOrder(payload: {
      refineryPoiId: string | null
      method: string
      startedAt: string | null
      notes: string | null
      notifyOnComplete: boolean
      durationSeconds?: number | null
      lines: Array<Pick<MiningWOLine, 'commodityId' | 'scuInput'> & { estimatedMinutes?: number }>
    }) {
      this.loading.createWO = true
      this.errors.createWO  = null
      try {
        const created = await svcCreateWorkOrder(payload)
        const wo = normalizeWO(created)
        if (wo?.id) this._applyWorkOrderUpdate(wo)
        return wo
      } catch (err: any) {
        const msg = parseApiError(err, 'Erreur création work order.')
        this.errors.createWO = msg
        throw new Error(msg)
      } finally {
        this.loading.createWO = false
      }
    },

    async deleteWorkOrder(id: number) {
      this.loading.deleteWO = true
      try {
        await svcDeleteWorkOrder(id)
        this.workOrders = this.workOrders.filter((wo) => wo.id !== id)
      } catch (err) {
        logger.error('[mining] deleteWorkOrder failed', err)
        // silence — l'item reste dans la liste
      } finally {
        this.loading.deleteWO = false
      }
    },

    async completeWorkOrder(id: number) {
      this.loading.completeWO = true
      try {
        await svcPostCompleteWorkOrder(id)
        await this.loadWorkOrders()
      } catch (err) {
        logger.error('[mining] completeWorkOrder failed', err)
        // silence — on conserve la liste telle quelle si la complétion échoue
      } finally {
        this.loading.completeWO = false
      }
    },

    async collectAllReady() {
      const readyIds = this.workOrders.filter((wo) => wo.isReady).map((wo) => wo.id)
      if (!readyIds.length) return
      this.loading.collectAll = true
      try {
        await Promise.all(readyIds.map((id) => svcPostCompleteWorkOrder(id)))
        await this.loadWorkOrders()
      } catch (err) {
        logger.error('[mining] collectAllReady failed', err)
        // silence
      } finally {
        this.loading.collectAll = false
      }
    },

    async loadRefineryPoiYields(poiId: string | number) {
      this.refineryPoiYields = []
      if (!poiId) return
      try {
        this.refineryPoiYields = await svcGetRefineryPoiYields(poiId)
      } catch (err) {
        logger.error('[mining] loadRefineryPoiYields failed', err)
        this.refineryPoiYields = []
      }
    },

    async loadAllRefineryYields() {
      if (this.refineryYieldsLoaded) return
      try {
        this.refineryYieldsAll = await svcGetAllRefineryYields()
      } catch (err) {
        logger.error('[mining] loadAllRefineryYields failed', err)
        this.refineryYieldsAll = []
      } finally {
        this.refineryYieldsLoaded = true
      }
    },

    // ─── Session collaborative ─────────────────────────────────────────────

    async loadSessionList() {
      this.loading.session = true
      this.errors.session = null
      try {
        this.sessionList = await svcFetchSessionList()
      } catch (err) {
        logger.error('[mining] loadSessionList failed', err)
        this.errors.session = 'Impossible de charger les sessions.'
      } finally {
        this.loading.session = false
      }
    },

    async loadSessionDetail(id: number) {
      this.loading.sessionDetail = true
      this.errors.session = null
      try {
        const session = await svcFetchSessionDetail(id)
        this.sessionActive = {
          ...session,
          participants: session.participants ?? [],
          crews: session.crews ?? [],
          rocks: session.rocks ?? [],
          cargos: session.cargos ?? [],
          logs: [],
        }
        if (session.defaultBodyId) {
          svcFetchBodyLabel(session.defaultBodyId)
            .then((label) => { if (this.sessionActive) this.sessionActive.defaultBodyLabel = label })
            .catch(() => {})
        }
      } catch (err) {
        logger.error('[mining] loadSessionDetail failed', err)
        this.errors.session = 'Impossible de charger les détails de la session.'
        throw new Error('session load failed')
      } finally {
        this.loading.sessionDetail = false
      }
    },

    async openSession(id: number) {
      this.loading.sessionDetail = true
      this.errors.session = null
      try {
        await this.loadSessionDetail(id)
        this.sessionView = 'active'
        this._openSessionSse(id)
        const app = useAppStore()
        if (app.profile?.id) this._currentUserId = Number(app.profile.id)
      } catch {
        this.errors.session = 'Erreur ouverture de la session.'
      } finally {
        this.loading.sessionDetail = false
      }
    },

    closeSession() {
      this._destroySessionSse()
      this.sessionActive = null
      this.sessionView   = 'list'
      this.loadSessionList()
    },

    async createSession(name: string) {
      if (!name.trim()) return
      this.sessionCreateForm.saving = true
      this.sessionCreateForm.error = null
      try {
        const created = await svcCreateSession(name)
        if (created?.id) {
          this.sessionList.unshift(created)
          this.sessionCreateForm.show = false
          this.sessionCreateForm.name = ''
          await this.openSession(created.id)
        }
      } catch (err: any) {
        logger.error('[mining] createSession failed', err)
        this.sessionCreateForm.error = parseApiError(err, 'Erreur création session.')
      } finally {
        this.sessionCreateForm.saving = false
      }
    },

    async _openSessionSse(sessionId: number) {
      const urls        = this._urls()
      const sessionsUrl = urls?.mining?.sessions ?? `${this._base()}/mining/api/sessions`
      const infoUrl     = `${sessionsUrl}/${sessionId}/mercure`
      const authHeader  = `Bearer ${useAppStore().bearerToken ?? ''}`

      await connectMercure(infoUrl, authHeader, (data) => {
        this._handleSessionEvent(data)
      })
    },

    _destroySessionSse() {
      disconnectMercure()
    },

    _handleSessionEvent(data: any) {
      const action = String(data?.action ?? data?.type ?? data?.event ?? '')
      logger.info('[mining] session mercure event received', { action, raw: JSON.stringify(data)?.slice(0, 200) })
      if (!action) return
      const session = this.sessionActive
      if (!session) return

      const eventSessionId = data.sessionId ?? data.rock?.sessionId ?? data.cargo?.sessionId
      if (eventSessionId && Number(eventSessionId) !== Number(session.id)) return

      switch (action) {
        case 'session_closed':
        case 'session_finished':
          session.status = action === 'session_finished' ? 'finished' : 'closed'
          break
        case 'session_updated':
          if (data.session) Object.assign(session, data.session)
          break
        case 'participant_joined': {
          const participant = data.participant
          if (!participant?.id) break
          const idx = session.participants.findIndex((p) => p.id === participant.id)
          if (idx !== -1) session.participants[idx] = participant
          else session.participants.push(participant)
          this._upsertCrewFromParticipant(participant)
          this._pushSessionLog('👤', `${participant?.username ?? '?'} a rejoint la session.`, 'success')
          break
        }
        case 'participant_updated': {
          const participant = data.participant
          if (!participant?.id) break
          const idx = session.participants.findIndex((p) => p.id === participant.id)
          if (idx !== -1) session.participants[idx] = participant
          else session.participants.push(participant)
          this._upsertCrewFromParticipant(participant)
          break
        }
        case 'crew_updated': {
          const crew = data.crew
          if (!crew) break
          if (Array.isArray((session as any).crews)) {
            const idx = (session as any).crews.findIndex((c: any) => c.id === crew.id)
            if (idx !== -1) (session as any).crews[idx] = { ...(session as any).crews[idx], ...crew }
            else (session as any).crews.push(crew)
          }
          break
        }
        case 'crew_dissolved': {
          const crewId = data.crewId ?? data.crew?.id
          if (crewId != null && Array.isArray((session as any).crews)) {
            ;(session as any).crews = (session as any).crews.filter((c: any) => Number(c.id) !== Number(crewId))
          }
          break
        }
        case 'participant_left':
        case 'participant_removed': {
          const leftId = data.participantId ?? data.participant?.id
          const leftParticipant = leftId
            ? session.participants.find((p) => p.id === leftId)
            : null
          if (leftId) session.participants = session.participants.filter((p) => p.id !== leftId)
          this._removeCrewIfEmpty(leftParticipant)
          this._pushSessionLog('🚪', 'Un participant a quitté la session.', 'warning')
          break
        }
        case 'rock_added': {
          this._applyRockUpdate(data.rock)
          this._pushSessionLog('🪨', `Rocher signalé${data.rock?.bodyName ? ' — ' + data.rock.bodyName : ''}.`, 'info')
          const { push: pushNotif } = useNotificationBus()
          pushNotif({
            id: `rock_added_${data.rock?.id ?? Date.now()}`,
            type: 'info',
            title: '🪨 Nouveau rocher',
            message: `Signalé${data.rock?.bodyName ? ' — ' + data.rock.bodyName : ''}${data.rock?.reportedBy ? ' par ' + data.rock.reportedBy : ''}`,
            duration: 6000,
          })
          break
        }
        case 'rock_updated': {
          const prevRock = session.rocks?.find((r: any) => r.id === data.rock?.id)
          const prevStatus = prevRock?.status
          this._applyRockUpdate(data.rock)
          const isMyRock = data.rock?.claimedByUserId != null && Number(data.rock.claimedByUserId) === Number(this._currentUserId)
          if (isMyRock && prevStatus !== 'extraction' && data.rock?.status === 'extraction') {
            const { push: pushNotif } = useNotificationBus()
            pushNotif({
              id: `rock_extraction_${data.rock?.id ?? Date.now()}`,
              type: 'warning',
              title: '⚒️ Extraction en cours',
              message: `Ton rocher${data.rock?.bodyName ? ' — ' + data.rock.bodyName : ''} est en extraction.`,
              duration: 8000,
            })
          }
          break
        }
        case 'rock_collected':
          this._applyRockUpdate(data.rock)
          this._pushSessionLog('✅', `Rocher #${data.rock?.id ?? '?'} collecté.`, 'success')
          break
        case 'rock_assigned': {
          this._applyRockUpdate(data.rock)
          const assignedToMe = data.rock?.claimedByUserId != null && Number(data.rock.claimedByUserId) === Number(this._currentUserId)
          if (assignedToMe) {
            const { push: pushNotif } = useNotificationBus()
            pushNotif({
              id: `rock_assigned_${data.rock?.id ?? Date.now()}`,
              type: 'success',
              title: '✅ Rocher réclamé',
              message: `Rocher${data.rock?.bodyName ? ' — ' + data.rock.bodyName : ''} assigné à toi.`,
              duration: 6000,
            })
          }
          break
        }
        case 'rock_deleted':
          if (session.rocks) session.rocks = session.rocks.filter((r) => r.id !== data.rockId)
          this._pushSessionLog('🗑️', `Rocher #${data.rockId ?? '?'} supprimé.`, 'warning')
          break
        case 'cargo_created':
        case 'cargo_updated':
        case 'cargo_assigned_transporter':
        case 'cargo_delivered':
          if (Array.isArray(data.cargos)) {
            data.cargos.forEach((cargo: any) => this._applyCargoUpdate(cargo))
          } else if (data.cargo) {
            this._applyCargoUpdate(data.cargo)
          }
          break

        case 'session_default_refinery_changed':
          if (data.defaultRefineryId != null) session.defaultRefineryId = data.defaultRefineryId
          if (data.defaultRefineryName != null) session.defaultRefineryName = data.defaultRefineryName
          break

        case 'session_default_body_changed':
          if (data.defaultBodyId != null) session.defaultBodyId = data.defaultBodyId
          if (data.defaultBodyName != null) session.defaultBodyName = data.defaultBodyName
          break

        case 'operation_created':
          if (data.operationCreated != null) session.operationCreated = data.operationCreated
          break
      }
    },

    _definedPatch<T extends Record<string, any>>(patch: T): Partial<T> {
      return Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ) as Partial<T>
    },

    _mineralPhase(mineral: any): 'actual' | 'scan' {
      return mineral?.phase === 'actual' ? 'actual' : 'scan'
    },

    _mineralMergeKey(mineral: any): string {
      if (mineral?.id != null) return `id:${mineral.id}`
      const phase = this._mineralPhase(mineral)
      const commodity = mineral?.commodityId ?? mineral?.commodityCode ?? mineral?.commodityName ?? 'unknown'
      return `${phase}:${commodity}`
    },

    _dedupeMinerals(minerals: any[]): any[] {
      const map = new Map<string, any>()
      for (const mineral of minerals) {
        if (!mineral) continue
        map.set(this._mineralMergeKey(mineral), mineral)
      }
      return Array.from(map.values())
    },

    _mergeRockMinerals(current: any[] = [], incoming: any[] = []): any[] {
      if (!Array.isArray(incoming)) return current
      if (!incoming.length) return []

      const currentRows = Array.isArray(current) ? current : []
      const incomingHasScan = incoming.some((m) => this._mineralPhase(m) !== 'actual')
      const incomingHasActual = incoming.some((m) => this._mineralPhase(m) === 'actual')
      const currentHasScan = currentRows.some((m) => this._mineralPhase(m) !== 'actual')
      const currentHasActual = currentRows.some((m) => this._mineralPhase(m) === 'actual')

      // Réponse complète: elle contient déjà scan + actual, donc on la prend telle quelle.
      if (incomingHasScan && incomingHasActual) return this._dedupeMinerals(incoming)

      // Réponse partielle après collecte: elle peut ne contenir que les lignes actual.
      if (incomingHasActual && currentHasScan) {
        return this._dedupeMinerals([
          ...currentRows.filter((m) => this._mineralPhase(m) !== 'actual'),
          ...currentRows.filter((m) => this._mineralPhase(m) === 'actual'),
          ...incoming,
        ])
      }

      // Réponse partielle après édition du scan: on garde les collectes déjà déclarées.
      if (incomingHasScan && currentHasActual) {
        return this._dedupeMinerals([
          ...incoming,
          ...currentRows.filter((m) => this._mineralPhase(m) === 'actual'),
        ])
      }

      return this._dedupeMinerals(incoming)
    },

    _applyRockUpdate(rock: Partial<MiningRock> | null | undefined) {
      if (!rock || !this.sessionActive || rock.id == null) return

      const patch = this._definedPatch(rock as Record<string, any>) as Partial<MiningRock>
      const idx = this.sessionActive.rocks.findIndex((r) => Number(r.id) === Number(rock.id))

      if (idx === -1) {
        this.sessionActive.rocks.unshift(patch as MiningRock)
        return
      }

      const current = this.sessionActive.rocks[idx]
      this.sessionActive.rocks.splice(idx, 1, {
        ...current,
        ...patch,
        id: current.id,
        minerals: Object.prototype.hasOwnProperty.call(patch, 'minerals')
          ? this._mergeRockMinerals(current.minerals ?? [], patch.minerals ?? [])
          : (current.minerals ?? []),
      } as MiningRock)
    },

    _applyCargoUpdate(cargo: any | null | undefined) {
      if (!cargo || !this.sessionActive || cargo.id == null) return

      const patch = this._definedPatch(cargo as Record<string, any>)
      const list = this.sessionActive.cargos ?? []
      const idx = list.findIndex((c: any) => Number(c.id) === Number(cargo.id))

      if (idx === -1) list.push(patch as MiningCargo)
      else list.splice(idx, 1, { ...list[idx], ...patch, id: list[idx].id })

      this.sessionActive.cargos = list
    },

    _upsertCrewFromParticipant(participant: any | null | undefined) {
      if (!participant || !this.sessionActive) return

      const crewId = participant.crewId != null ? Number(participant.crewId) : null
      const crewKey = participant.crewKey ?? null
      if (crewId == null && !crewKey) return

      const crews = (this.sessionActive as any).crews
      if (!Array.isArray(crews)) return

      const idx = crews.findIndex((c: any) =>
        (crewId != null && Number(c.id) === crewId)
        || (crewKey && c.crewKey === crewKey),
      )

      const patch = this._definedPatch({
        id: crewId ?? undefined,
        crewKey,
        role: participant.role,
        shipId: participant.shipId,
        shipName: participant.shipName,
        crewTotal: participant.crewTotal,
        crewUsed: participant.crewUsed,
        status: participant.crewStatus,
      })

      if (idx !== -1) {
        crews[idx] = { ...crews[idx], ...patch, id: crews[idx].id ?? patch.id }
        return
      }

      if (crewId == null) return
      crews.push({
        id: crewId,
        sessionId: this.sessionActive.id,
        role: participant.role ?? 'miner',
        crewKey,
        crewTotal: participant.crewTotal ?? null,
        crewUsed: participant.crewUsed ?? null,
        status: participant.crewStatus ?? null,
        shipId: participant.shipId ?? null,
        shipName: participant.shipName ?? null,
      })
    },

    _removeCrewIfEmpty(participant: any | null | undefined) {
      if (!participant || !this.sessionActive) return
      const crews = (this.sessionActive as any).crews
      if (!Array.isArray(crews)) return

      const crewId = participant.crewId != null ? Number(participant.crewId) : null
      const crewKey = participant.crewKey ?? null
      if (crewId == null && !crewKey) return

      const hasMembers = (this.sessionActive.participants ?? []).some((p: any) =>
        (crewId != null && Number(p.crewId) === crewId)
        || (crewKey && p.crewKey === crewKey),
      )
      if (hasMembers) return

      ;(this.sessionActive as any).crews = crews.filter((c: any) =>
        !((crewId != null && Number(c.id) === crewId) || (crewKey && c.crewKey === crewKey)),
      )
    },

    _pushSessionLog(icon: string, message: string, category = 'info') {
      if (!this.sessionActive) return
      const entry: MiningSessionLog = {
        id:       Date.now() + Math.random(),
        time:     new Date().toISOString(),
        icon,
        message,
        category,
      }
      // Vérifie si un événement similaire existe déjà
      const isDuplicate = this.sessionActive.logs.some(log => log.message === message && log.time === entry.time);
      if (isDuplicate) return;

      // Ajoute l'événement s'il n'est pas un doublon
      this.sessionActive.logs.unshift(entry)
      if (this.sessionActive.logs.length > 100) {
        this.sessionActive.logs = this.sessionActive.logs.slice(0, 100)
      }
    },

    // ─── Actions session collaborative ────────────────────────────────────

    showJoinForm(sessionId: number) {
      this.sessionJoinForm.targetSessionId = sessionId
      this.sessionJoinForm.role       = 'miner'
      this.sessionJoinForm.error      = null
      this.sessionJoinForm.shipId     = null
      this.sessionJoinForm.selectedShip = null
      this.sessionJoinForm.shipSearch = ''
      this.sessionJoinForm.shipResults = []
      this.sessionJoinForm.crewKey    = null
      this.sessionJoinForm.crewTotal  = 1
      this.sessionJoinForm.show       = true
      this.loadSessionShips()
    },

    async joinSession() {
      const sessionId = this.sessionJoinForm.targetSessionId
      if (!sessionId) return
      this.sessionJoinForm.saving = true
      this.sessionJoinForm.error  = null
      this.loading.joinSession    = true
      try {

        await svcJoinSession(sessionId, {
          role:     this.sessionJoinForm.role,
          shipId:   this.sessionJoinForm.shipId ?? undefined,
          crewKey:  this.sessionJoinForm.crewKey ?? undefined,
          crewTotal: this.sessionJoinForm.crewTotal,
        })
        this.sessionJoinForm.show = false
        await this.openSession(sessionId)
      } catch (err: any) {
        this.sessionJoinForm.error = parseApiError(err, 'Erreur lors du rejoindre.')
      } finally {
        this.sessionJoinForm.saving = false
        this.loading.joinSession    = false
      }
    },

    async leaveSession() {
      if (!this.sessionActive) return
      const id = this.sessionActive.id
      this.loading.leaveSession = true
      try {
        await svcLeaveSession(id)
        this.closeSession()
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur lors du départ.')
      } finally {
        this.loading.leaveSession = false
      }
    },

    openRockForm() {
      this.rockForm = {
        show: true, saving: false, error: null, editRockId: null,
        posX: '', posY: '',
        bodySearch: this.sessionActive?.defaultBodyName ?? '',
        bodyResults: [],
        selectedBody: this.sessionActive?.defaultBodyId
          ? { id: this.sessionActive.defaultBodyId, name: this.sessionActive.defaultBodyName ?? '' }
          : null,
        sizeScuEstimate: '', mass: '', instability: '', resistance: '', notes: '',
        minerals: [{ commodityId: null, percentage: '', quality: 500, _name: '', _query: '', _search: '', _open: false, _hi: -1 }],
        zoneQuery: '', zoneQueryId: null, zoneQueryOpen: false, zoneQuerySearch: '', zoneQueryHi: -1,
        zoneSearchState: 'idle', zoneLocationName: null,
        zoneCreate: {
          show: false, primaryQualityMax: 500, saving: false, error: null,
          secondary: { commodityId: null, _query: '', _search: '', _open: false, _hi: -1, qualityMax: 500 },
          tertiary:  { commodityId: null, _query: '', _search: '', _open: false, _hi: -1, qualityMax: 500 },
        },
      }
    },

    async rockFormLookupZone() {
      const f = this.rockForm
      if (!f.zoneQueryId) return
      f.zoneSearchState = 'loading'
      f.zoneLocationName = null
      try {
        const bodyId = f.selectedBody?.id ?? this.sessionActive?.defaultBodyId ?? undefined
        await this.loadZones(String(f.zoneQueryId), bodyId)
        const zone = this.where.results[0]
        if (!zone) { f.zoneSearchState = 'not_found'; return }
        f.zoneSearchState  = 'found'
        f.zoneLocationName = zone.locationName ?? zone.bodyName ?? null
        f.minerals = (zone.minerals ?? []).map((m: any) => {
          const rawCommodityId = m.commodityId ?? m.commodity?.id ?? m.mineralId ?? m.mineral?.id ?? null
          const commodityId = rawCommodityId !== null && rawCommodityId !== undefined && rawCommodityId !== ''
            ? Number(rawCommodityId)
            : null
          const catalogName = commodityId != null
            ? (this.minerals.find((min: any) => Number(min.id) === Number(commodityId))?.name ?? '')
            : ''
          const commodityName = [
            m.commodityName,
            m.mineralName,
            m.commodity?.name,
            m.mineral?.name,
            m.name,
            catalogName,
          ].map((value) => String(value ?? '').trim()).find(Boolean) ?? ''

          return {
            commodityId,
            percentage: String(m.percentage ?? m.percent ?? ''),
            quality:    m.qualityMax ?? m.quality ?? 500,
            _name:      commodityName,
            _query:     commodityName,
            _search:    '',
            _open:      false,
            _hi:        -1,
          }
        })
        if (!f.minerals.length) f.minerals = [{ commodityId: null, percentage: '', quality: 500, _name: '', _query: '', _search: '', _open: false, _hi: -1 }]
      } catch {
        f.zoneSearchState = 'not_found'
      }
    },

    async rockFormSuggestZone() {
      const f = this.rockForm
      const bodyId = f.selectedBody?.id ?? this.sessionActive?.defaultBodyId
      if (!f.zoneQueryId || !bodyId) { f.zoneCreate.error = 'Corps céleste requis.'; return }
      f.zoneCreate.saving = true
      f.zoneCreate.error  = null
      try {
        const slots: Array<{ slot: string; commodityId: string; qualityMax: number }> = [
          { slot: 'primary', commodityId: String(f.zoneQueryId), qualityMax: f.zoneCreate.primaryQualityMax },
        ]
        if (f.zoneCreate.secondary.commodityId) {
          slots.push({ slot: 'secondary', commodityId: String(f.zoneCreate.secondary.commodityId), qualityMax: f.zoneCreate.secondary.qualityMax })
        }
        if (f.zoneCreate.tertiary.commodityId) {
          slots.push({ slot: 'tertiary', commodityId: String(f.zoneCreate.tertiary.commodityId), qualityMax: f.zoneCreate.tertiary.qualityMax })
        }
        await svcSuggestZone({ locationId: String(bodyId), locationType: 'body', minerals: slots })
        await this.rockFormLookupZone()
        f.zoneCreate.show = false
      } catch (err: any) {
        f.zoneCreate.error = parseApiError(err, 'Erreur enregistrement zone.')
      } finally {
        f.zoneCreate.saving = false
      }
    },

    async addRock() {
      if (!this.sessionActive) return
      this.rockForm.saving = true
      this.rockForm.error  = null
      this.loading.addRock = true
      try {
        const minerals = this.rockForm.minerals
          .filter((m) => m.commodityId !== null)
          .map((m) => ({ commodityId: m.commodityId as number, percentage: Number(String(m.percentage).replace(',', '.')) || 0, quality: m.quality ?? 500 }))
        const n = (v: string) => {
          if (v === '' || v === null || v === undefined) return undefined
          const parsed = Number(String(v).replace(',', '.'))
          return Number.isFinite(parsed) ? parsed : undefined
        }
        const payload = {
          bodyId:          this.rockForm.selectedBody?.id ?? undefined,
          bodyName:        this.rockForm.bodySearch.trim() || undefined,
          posX:            n(this.rockForm.posX),
          posY:            n(this.rockForm.posY),
          sizeScuEstimate: n(this.rockForm.sizeScuEstimate),
          mass:            n(this.rockForm.mass),
          instability:     n(this.rockForm.instability),
          resistance:      n(this.rockForm.resistance),
          notes:           this.rockForm.notes.trim() || undefined,
          minerals,
        }

        const editRockId = this.rockForm.editRockId
        const rock = editRockId
          ? await svcUpdateRock(editRockId, payload)
          : await svcAddRock(this.sessionActive.id, payload)

        if (rock) this._applyRockUpdate(rock)
        this.rockForm.show = false
        this.rockForm.editRockId = null
        this._pushSessionLog(editRockId ? '✏️' : '🪨', editRockId ? `Rocher #${editRockId} modifié.` : `Rocher signalé.`, editRockId ? 'info' : 'info')
      } catch (err: any) {
        this.rockForm.error = parseApiError(err, this.rockForm.editRockId ? 'Erreur modification rocher.' : 'Erreur ajout rocher.')
      } finally {
        this.rockForm.saving = false
        this.loading.addRock = false
      }
    },

    async claimRock(rockId: number) {
      this.loading.claimRock = true
      try {
        const rock = await svcClaimRock(rockId)
        const patch: any = rock && typeof rock === 'object'
          ? { ...rock, id: rock.id ?? rockId }
          : { id: rockId }

        if (patch.status == null) patch.status = 'en_route'
        if (patch.claimedByUserId == null) patch.claimedByUserId = this._currentUserId
        this._applyRockUpdate(patch)
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur claim rocher.')
      } finally {
        this.loading.claimRock = false
      }
    },

    async unclaimRock(rockId: number) {
      this.loading.claimRock = true
      try {
        const rock = await svcUnclaimRock(rockId)
        const patch: any = rock && typeof rock === 'object'
          ? { ...rock, id: rock.id ?? rockId }
          : { id: rockId }

        if (patch.status == null) patch.status = 'available'
        patch.claimedByUserId = null
        patch.claimedBy = null
        patch.assignedToUserId = null
        patch.assignedTo = null
        this._applyRockUpdate(patch)
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur unclaim rocher.')
      } finally {
        this.loading.claimRock = false
      }
    },

    rockCollectionState(rock: any) {
      const sizeScu = Number(rock?.sizeScuEstimate ?? 0)
      const scanByCommodity: Record<number, number> = {}
      const actualByCommodity: Record<number, number> = {}

      for (const mineral of (rock?.minerals ?? [])) {
        const commodityId = Number(mineral?.commodityId ?? 0)
        if (!commodityId) continue

        if (mineral.phase === 'actual') {
          actualByCommodity[commodityId] = (actualByCommodity[commodityId] ?? 0) + Number(mineral.quantityScuActual ?? 0)
          continue
        }

        scanByCommodity[commodityId] = (scanByCommodity[commodityId] ?? 0) + Number(mineral.percentage ?? 0)
      }

      return { sizeScu, scanByCommodity, actualByCommodity }
    },

    rockHasCollectedMinerals(rock: any) {
      const { actualByCommodity } = this.rockCollectionState(rock)
      return Object.values(actualByCommodity).some((quantity) => Number(quantity) > 0)
    },

    rockHasRemainingCollection(rock: any) {
      const { sizeScu, scanByCommodity, actualByCommodity } = this.rockCollectionState(rock)
      const commodityIds = Object.keys(scanByCommodity)
      if (!commodityIds.length) return false

      return commodityIds.some((commodityId) => {
        const id = Number(commodityId)
        const scanPercent = Number(scanByCommodity[id] ?? 0)
        const expectedScu = sizeScu > 0 ? sizeScu * (scanPercent / 100) : 0
        const collectedScu = Number(actualByCommodity[id] ?? 0)
        return collectedScu + 0.0001 < expectedScu
      })
    },

    async openFinalizeRockCollection(rockId: number) {
      const rock = this.sessionActive?.rocks.find((r) => r.id === rockId)
      if (!rock) return

      if (this.rockHasCollectedMinerals(rock) && !this.rockHasRemainingCollection(rock)) {
        this.collectForm = {
          show: false,
          saving: false,
          error: null,
          rockId,
          mode: 'complete',
          rockMineralIds: [],
          lines: [],
        }
        await this.collectRock()
        return
      }

      this.openCollectForm(rockId, 'complete')
    },

    openCollectForm(rockId: number, mode: 'partial' | 'complete' = 'complete') {
      const rock = this.sessionActive?.rocks.find((r) => r.id === rockId)
      if (!rock) return
      const scu = rock.sizeScuEstimate ?? 0
      const scanMap: Record<number, any> = {}
      const actualMap: Record<number, number> = {}
      for (const m of (rock.minerals ?? [])) {
        if (!m.commodityId) continue
        if (m.phase === 'actual') {
          actualMap[m.commodityId] = (actualMap[m.commodityId] ?? 0) + Number(m.quantityScuActual ?? 0)
        } else if (!scanMap[m.commodityId]) {
          scanMap[m.commodityId] = m
        }
      }
      const rockMineralIds = Object.keys(scanMap).map(Number)
      const scanEntries: any[] = Object.values(scanMap)
      this.collectForm = {
        show: true, saving: false, error: null, rockId, mode, rockMineralIds,
        lines: (scanEntries.length ? scanEntries : [{}]).map((m: any) => {
          const cid = m.commodityId || null
          const alreadyCollectedScu = cid ? (actualMap[cid] ?? 0) : 0
          const scanEstimateScu = cid && m.percentage ? (Number(m.percentage) / 100 * Number(scu)) : 0
          const name = String(m.commodityName || this.minerals.find((min: any) => Number(min.id) === Number(cid))?.name || '')
          return {
            commodityId: cid,
            commodityName: name,
            quantityScuActual: mode === 'partial' ? '' : String(alreadyCollectedScu > 0 ? alreadyCollectedScu : ''),
            scanEstimateScu,
            alreadyCollectedScu,
            _name: name,
            _query: name,
            _search: '',
            _open: false,
            _hi: -1,
          }
        }),
      }
    },

    async collectRock() {
      const rockId = this.collectForm.rockId
      if (!rockId) return
      this.collectForm.saving   = true
      this.collectForm.error    = null
      this.loading.collectRock  = true
      try {
        const minerals = this.collectForm.lines
          .filter((l) => l.commodityId !== null && l.quantityScuActual !== '' && Number(String(l.quantityScuActual).replace(',', '.')) > 0)
          .map((l) => ({ commodityId: l.commodityId, quantityScuActual: Number(String(l.quantityScuActual).replace(',', '.')) }))
        if (!minerals.length && this.collectForm.mode !== 'complete') {
          this.collectForm.error = 'Veuillez saisir au moins une quantité positive.'
          return
        }
        const rock = await svcCollectRock(rockId, { mode: this.collectForm.mode, minerals, lines: minerals })
        if (rock) this._applyRockUpdate(rock)
        this.collectForm.show = false
        this._pushSessionLog('✅', `Rocher #${rockId} collecté.`, 'success')
      } catch (err: any) {
        this.collectForm.error = parseApiError(err, 'Erreur collecte rocher.')
      } finally {
        this.collectForm.saving  = false
        this.loading.collectRock = false
      }
    },

    async closeSessionAction() {
      if (!this.sessionActive) return
      const id = this.sessionActive.id
      this.loading.closeSession = true
      try {
        await svcCloseSessionApi(id)
        if (this.sessionActive) this.sessionActive.status = 'closed'
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur fermeture session.')
      } finally {
        this.loading.closeSession = false
      }
    },

    // ─── Session ships ─────────────────────────────────────────────────────

    async loadSessionShips() {
      if (this.sessionShipsLoaded) return
      this.loading.loadShips = true
      try {
        this.sessionShips = await svcFetchSessionShips()
        this.sessionShipsLoaded = true
      } catch {
        this.sessionShips = []
      } finally {
        this.loading.loadShips = false
      }
    },

    getAvailableCrews(role: string): any[] {
      const crews = ((this.sessionActive as any)?.crews ?? []) as any[]
      const participants = (this.sessionActive?.participants ?? [])
      return crews
        .filter((c) => c.role === role && (c.crewUsed ?? 0) < (c.crewTotal ?? 1))
        .map((c) => {
          const members = participants.filter((p) => p.crewId === c.id || p.crewKey === c.crewKey)
          const captain = members.find((m) => m.isCaptain || m.rank === 'captain') ?? members[0]
          return { ...c, captainName: captain?.username ?? null }
        })
    },

    // ─── Rock extended actions ──────────────────────────────────────────────

    async deleteRock(rockId: number) {
      if (!this.sessionActive) return
      this.loading.deleteRock = true
      try {
        await svcDeleteRock(rockId)
        this.sessionActive.rocks = this.sessionActive.rocks.filter((r) => r.id !== rockId)
        this._pushSessionLog('🗑️', `Rocher #${rockId} supprimé.`, 'warning')
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur suppression rocher.')
      } finally {
        this.loading.deleteRock = false
      }
    },

    async assignRock(rockId: number) {
      this.loading.assignRock = true
      try {
        const rock = await svcAssignRock(rockId)
        if (rock) this._applyRockUpdate(rock)
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur assignation.')
      } finally {
        this.loading.assignRock = false
      }
    },

    // ─── Participant management ─────────────────────────────────────────────

    async updateParticipantStatus(sessionId: number, participantId: number, status: string) {
      try {
        const p = await svcUpdateParticipant(sessionId, participantId, { status })
        if (p && this.sessionActive) {
          const idx = this.sessionActive.participants.findIndex((x) => x.id === participantId)
          if (idx !== -1) this.sessionActive.participants.splice(idx, 1, p)
        }
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur mise à jour statut.')
      }
    },

    async updateParticipantDuty(sessionId: number, participantId: number, duty: string) {
      try {
        const p = await svcUpdateParticipant(sessionId, participantId, { duty })
        if (p && this.sessionActive) {
          const idx = this.sessionActive.participants.findIndex((x) => x.id === participantId)
          if (idx !== -1) this.sessionActive.participants.splice(idx, 1, p)
        }
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur mise à jour participant.')
      }
    },

    async assignSubCaptain(sessionId: number, participantId: number) {
      try {
        const p = await svcAssignSubCaptain(sessionId, participantId)
        if (p && this.sessionActive) {
          const idx = this.sessionActive.participants.findIndex((x) => x.id === participantId)
          if (idx !== -1) this.sessionActive.participants.splice(idx, 1, p)
        }
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur assignation sous-capitaine.')
      }
    },

    async leaveParticipant(sessionId: number, participantId: number) {
      try {
        await svcLeaveParticipant(sessionId, participantId)
        if (this.sessionActive) {
          this.sessionActive.participants = this.sessionActive.participants.filter((p) => p.id !== participantId)
        }
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur départ session.')
      }
    },

    leaveParticipantWithCheck(sessionId: number, participantId: number) {
      const me = (this.sessionActive?.participants ?? []).find((p) => p.id === participantId)
      if (me && (me.isCaptain || me.rank === 'captain')) {
        const crewMembers = (this.sessionActive?.participants ?? []).filter(
          (p) => p.id !== participantId && p.crewKey && p.crewKey === me.crewKey,
        )
        if (crewMembers.length > 0) {
          const subCaptain = crewMembers.find((p) => p.rank === 'sub_captain' || p.isSubCaptain)
          if (subCaptain) {
            // transfert automatique vers le sous-capitaine
            this.leaveConfirm = {
              show: false, sessionId, participantId,
              selectedCaptainId: subCaptain.id,
              candidates: crewMembers,
            }
            this.confirmLeaveParticipant()
            return
          }
          this.leaveConfirm = {
            show: true, sessionId, participantId,
            selectedCaptainId: crewMembers[0].id,
            candidates: crewMembers,
          }
          return
        }
      }
      this.leaveParticipant(sessionId, participantId)
    },

    async confirmLeaveParticipant() {
      const { sessionId, participantId, selectedCaptainId } = this.leaveConfirm
      if (!sessionId || !participantId) return
      try {
        await svcLeaveParticipant(sessionId, participantId, selectedCaptainId)
        if (this.sessionActive) {
          this.sessionActive.participants = this.sessionActive.participants.filter((p) => p.id !== participantId)
        }
        this.leaveConfirm = { show: false, sessionId: null, participantId: null, selectedCaptainId: null, candidates: [] }
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur départ session.')
      }
    },

    async createSessionOperation(sessionId: number) {
      this.createOpLoadingId = sessionId
      this.loading.createOp  = true
      try {
        await svcCreateSessionOperation(sessionId)
        if (this.sessionActive) this.sessionActive.operationCreated = true
        this._pushSessionLog('🚀', 'Opération créée depuis la session.', 'success')
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur création opération.')
      } finally {
        this.createOpLoadingId = null
        this.loading.createOp  = false
      }
    },

    async searchSessionShips(q: string) {
      if (!q || q.length < 2) { this.sessionJoinForm.shipResults = []; return }
      try {
        this.sessionJoinForm.shipResults = await svcSearchMiningShips(q)
      } catch {
        this.sessionJoinForm.shipResults = []
      }
    },

    async setCrewStatusOverride(key: string, status: string | null) {
      if (!key || !this.sessionActive) return
      const sessionId = this.sessionActive.id
      const crews = (this.sessionActive as any).crews as any[] | undefined
      const apiCrew = crews?.find((c: any) => c.crewKey === key || `crew:${c.id}` === key)
      if (apiCrew?.id) {
        await svcUpdateCrewStatus(sessionId, apiCrew.id, status)
        apiCrew.status = status
      }
    },

    // ─── Session default body / refinery ───────────────────────────────────

    async updateSessionDefaultBody(sessionId: number, bodyId: number | null) {
      this.loading.updateSessionBody = true
      try {
        await svcUpdateSessionDefaultBody(sessionId, bodyId)
        if (this.sessionActive) {
          this.sessionActive.defaultBodyId    = bodyId
          this.sessionActive.defaultBodyName  = this.changeZone.selectedBody?.name ?? null
          this.sessionActive.defaultBodyLabel = this.changeZone.selectedBody?.name ?? null
          this.sessionActive.systemName       = this.changeZone.selectedBody?.systemName ?? this.sessionActive.systemName ?? null
        }
        this.changeZone = { show: false, bodySearch: '', bodyResults: [], selectedBody: null }
        this._pushSessionLog('🗺️', `Zone par défaut changée.`)
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur changement de zone.')
      } finally {
        this.loading.updateSessionBody = false
      }
    },

    async updateSessionDefaultRefinery(sessionId: number, refineryId: number | null) {
      this.loading.updateSessionRefinery = true
      try {
        await svcUpdateSessionDefaultRefinery(sessionId, refineryId)
        if (this.sessionActive) {
          const r = this.refineries.find((x) => Number(x.id) === Number(refineryId))
          this.sessionActive.defaultRefineryId   = refineryId
          this.sessionActive.defaultRefineryName = r?.name ?? null
        }
        this.changeRefinery = { show: false, refineryQuery: '', selectedRefineryId: null }
        this._pushSessionLog('🏭', `Raffinerie par défaut changée.`)
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur changement raffinerie.')
      } finally {
        this.loading.updateSessionRefinery = false
      }
    },

    // ─── Cargo ─────────────────────────────────────────────────────────────

    async pickupCargo(sessionId: number, cargoId: number) {
      this.loading.pickupCargo = true
      try {
        const cargo = await svcPickupCargo(sessionId, cargoId)
        this._applyCargoUpdate(cargo)
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur prise en charge cargo.')
      } finally {
        this.loading.pickupCargo = false
      }
    },

    async transferCrewCargosToSupport(sessionId: number, source: { crewId?: number | null; crewKey?: string | null }) {
      this.loading.bagChange = true
      try {
        const data = await svcTransferCrewCargosToSupport(sessionId, source)
        const cargos = Array.isArray(data?.cargos)
          ? data.cargos
          : (data?.cargo ? [data.cargo] : [])

        cargos.forEach((cargo: any) => this._applyCargoUpdate(cargo))

        const summary = data?.summary ?? {
          linesCount: cargos.length,
          totalScu: cargos.reduce((total: number, cargo: any) => total + Number(cargo?.quantityScu ?? 0), 0),
          sourceCrew: data?.sourceCrew ?? null,
        }

        const sourceLabel = summary?.sourceCrew?.shipName
          ?? summary?.sourceCrew?.crewKey
          ?? source.crewKey
          ?? (source.crewId != null ? `Équipage #${source.crewId}` : 'Équipage source')

        this._pushSessionLog(
          '🧺',
          `Changement de sac: ${summary?.linesCount ?? cargos.length} cargo(s) transféré(s) depuis ${sourceLabel}.`,
          'success',
        )

        return { cargos, summary }
      } catch (err: any) {
        const msg = parseApiError(err, 'Erreur changement de sac.')
        this.errors.session = msg
        throw new Error(msg)
      } finally {
        this.loading.bagChange = false
      }
    },

    // ─── Où Miner ───────────────────────────────────────────────────────────

    async loadZones(commodityId: string, bodyId?: string | number | null) {
      if (!commodityId && !bodyId) return
      this.where.loading = true
      this.where.error = null
      this.where.results = []
      try {
        this.where.results = await svcLoadZones(commodityId, bodyId)
      } catch (err) {
        logger.error('[mining] loadZones failed', err)
        this.where.error = 'Erreur chargement des zones.'
      } finally {
        this.where.loading = false
      }
    },

    async searchWhereBodies(q: string): Promise<any[]> {
      return svcSearchWhereBodies(q)
    },

    // ─── Statut rocher ──────────────────────────────────────────────────────

    async updateRockStatus(rockId: number, status: string) {
      this.loading.updateRockStatus = true
      try {
        const rock = await svcUpdateRockStatus(rockId, status)
        const patch: any = rock && typeof rock === 'object'
          ? { ...rock, id: rock.id ?? rockId }
          : { id: rockId }

        // Certaines réponses de statut ne renvoient que { id } ou { id, status }.
        // On force le statut demandé, puis _applyRockUpdate fusionne sans effacer le scan.
        if (patch.status == null) patch.status = status
        this._applyRockUpdate(patch)
      } catch (err: any) {
        this.errors.session = parseApiError(err, 'Erreur mise à jour statut.')
      } finally {
        this.loading.updateRockStatus = false
      }
    },

    // ─── Loadout Simulator ─────────────────────────────────────────────────

    async loadLoadoutCatalog() {
      if (this.loadout.catalogLoaded) return
      this.loadout.loadingCatalog = true
      this.loadout.error = null
      try {
        const { ships, lasers, modules } = await svcFetchLoadoutCatalog()
        this.loadout.ships   = ships
        this.loadout.lasers  = lasers
        this.loadout.modules = modules
        this.loadout.catalogLoaded = true
      } catch (err) {
        logger.error('[mining] loadLoadoutCatalog failed', err)
        this.loadout.error = 'Impossible de charger le catalogue loadout.'
      } finally {
        this.loadout.loadingCatalog = false
      }
    },

    async loadUserLoadouts() {
      this.loadout.loadingSaved = true
      this.loadout.error = null
      try {
        this.loadout.savedList = await svcFetchUserLoadouts()
        this.loadout.savedLoaded = true
      } catch (err) {
        logger.error('[mining] loadUserLoadouts failed', err)
        this.loadout.error = 'Impossible de charger vos loadouts.'
      } finally {
        this.loadout.loadingSaved = false
      }
    },

    async loadPublicLoadouts() {
      this.loadout.loadingPublic = true
      this.loadout.error = null
      try {
        this.loadout.publicList = await svcFetchPublicLoadouts()
      } catch (err) {
        logger.error('[mining] loadPublicLoadouts failed', err)
        this.loadout.error = 'Impossible de charger les loadouts publics.'
      } finally {
        this.loadout.loadingPublic = false
      }
    },


    async saveLoadout(payload: Partial<MiningLoadout> & { name: string; shipId: number | null; slots: MiningLoadout['slots'] }) {
      this.loadout.savingLoadout = true
      this.loadout.error = null
      try {
        if ((payload as any).id) {
          const { id, ...rest } = payload as MiningLoadout
          const updated = await svcUpdateLoadout(id, rest)
          const idx = this.loadout.savedList.findIndex((l) => l.id === id)
          if (idx !== -1) this.loadout.savedList.splice(idx, 1, updated)
          else this.loadout.savedList.unshift(updated)
          return updated
        } else {
          const { id: _id, ...rest } = payload as any
          const created = await svcCreateLoadout(rest)
          this.loadout.savedList.unshift(created)
          return created
        }
      } catch (err: any) {
        const msg = parseApiError(err, 'Erreur sauvegarde loadout.')
        this.loadout.error = msg
        throw new Error(msg)
      } finally {
        this.loadout.savingLoadout = false
      }
    },

    /**
     * Pré-remplit le formulaire rocher depuis les résultats OCR.
     * N'envoie RIEN au serveur — action utilisateur requise ensuite.
     */
    applyOcrPayload(payload: {
      mainMaterial?: string
      rockMass?: number
      instability?: number
      resistance?: number
      totalScu?: number
      materials?: Array<{ name: string; percent?: number }>
      coordinates?: string
    }): void {
      if (payload.totalScu !== undefined) {
        this.rockForm.sizeScuEstimate = String(payload.totalScu)
      }
      if (payload.rockMass !== undefined) {
        this.rockForm.mass = String(payload.rockMass)
      }
      if (payload.instability !== undefined) {
        this.rockForm.instability = String(payload.instability)
      }
      if (payload.resistance !== undefined) {
        this.rockForm.resistance = String(payload.resistance)
      }
      if (payload.materials && payload.materials.length > 0) {
        payload.materials.forEach((mat, idx) => {
          if (this.rockForm.minerals[idx]) {
            this.rockForm.minerals[idx]._name    = mat.name
            this.rockForm.minerals[idx]._query   = mat.name
            if (mat.percent !== undefined) {
              this.rockForm.minerals[idx].percentage = String(mat.percent)
            }
          }
        })
      } else if (payload.mainMaterial && this.rockForm.minerals[0]) {
        this.rockForm.minerals[0]._name  = payload.mainMaterial
        this.rockForm.minerals[0]._query = payload.mainMaterial
      }
      if (payload.coordinates) {
        const parts = payload.coordinates.trim().split(/[\s,]+/)
        if (parts[0]) this.rockForm.posX = parts[0]
        if (parts[1]) this.rockForm.posY = parts[1]
      }
      this.rockForm.show = true
    },

  },
})
