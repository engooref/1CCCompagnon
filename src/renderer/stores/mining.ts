import { defineStore } from 'pinia'
import { logger } from '../services/logger'
import { createOverlayUrls } from '../config/api'
import { useAppStore } from './app'
import {
  fetchBootstrap,
  fetchWorkOrders,
  createWorkOrder as svcCreateWorkOrder,
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
  fetchLoadoutCatalog as svcFetchLoadoutCatalog,
  fetchUserLoadouts as svcFetchUserLoadouts,
  createLoadout as svcCreateLoadout,
  updateLoadout as svcUpdateLoadout,
  deleteLoadout as svcDeleteLoadout,
  fetchPublicLoadouts as svcFetchPublicLoadouts,
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
    sessionCreateForm: {
      show:    false,
      name:    '',
      saving:  false,
      error:   null as string | null,
    },
    sessionJoinForm: {
      show:            false,
      targetSessionId: null as number | null,
      role:            'miner' as string,
      saving:          false,
      error:           null as string | null,
    },
    rockForm: {
      show:             false,
      saving:           false,
      error:            null as string | null,
      bodyName:         '',
      sizeScuEstimate:  '' as string | number,
      minerals:         [] as Array<{ commodityId: number | null; percentage: string }>,
    },
    collectForm: {
      show:    false,
      saving:  false,
      error:   null as string | null,
      rockId:  null as number | null,
      lines:   [] as Array<{ commodityId: number | null; commodityName: string; quantityScuActual: string }>,
    },
    rockFilter:       'all' as 'all' | 'active' | 'done',
    _currentUserId:   null as number | null,

    loading: {
      bootstrap:        false,
      workOrders:       false,
      createWO:         false,
      deleteWO:         false,
      completeWO:       false,
      collectAll:       false,
      session:          false,
      sessionDetail:    false,
      createSession:    false,
      joinSession:      false,
      leaveSession:     false,
      addRock:          false,
      claimRock:        false,
      collectRock:      false,
      closeSession:     false,
      updateRockStatus: false,
    },
    errors: {
      global:     null as string | null,
      workOrders: null as string | null,
      createWO:   null as string | null,
      session:    null as string | null,
    },

    _sessionEs: null as EventSource | null,

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
      if (state.rockFilter === 'active') return rocks.filter((r) => r.status !== 'depleted' && r.status !== 'completed')
      if (state.rockFilter === 'done')   return rocks.filter((r) => r.status === 'depleted' || r.status === 'completed')
      return rocks
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
    },

    // ─── Work Orders ────────────────────────────────────────────────────────

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
        const msg = err?.response?.data?.message ?? err?.message ?? 'Erreur création work order.'
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
          rocks: session.rocks ?? [],
          cargos: session.cargos ?? [],
          logs: [],
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
        this.sessionCreateForm.error = err?.response?.data?.message ?? err?.message ?? 'Erreur création session.'
      } finally {
        this.sessionCreateForm.saving = false
      }
    },

    _openSessionSse(sessionId: number) {
      this._destroySessionSse()
      const urls = this._urls()
      const sessionsUrl = urls?.mining?.sessions ?? `${this._base()}/mining/api/sessions`
      const mercureUrl  = `${sessionsUrl}/${sessionId}/mercure`
      const headers     = this._headers()

      fetch(mercureUrl, {
        credentials: 'include',
        headers,
      })
        .then((res) => res.ok ? res.json() : null)
        .then((info) => {
          if (!info?.subscribeUrl) return

          // Pose le cookie JWT si tokenUrl fourni
          const tokenPromise = info.tokenUrl
            ? fetch(info.tokenUrl, { method: 'POST', credentials: 'include', headers }).then(() => {})
            : Promise.resolve()

          return tokenPromise.then(() => {
            this._sessionEs = new EventSource(info.subscribeUrl, { withCredentials: true })
            this._sessionEs.onmessage = (e) => {
              try { this._handleSessionEvent(JSON.parse(e.data)) } catch { /* ignore parse errors */ }
            }
          })
        })
        .catch(() => { /* SSE optional - no block on failure */ })
    },

    _destroySessionSse() {
      if (this._sessionEs) {
        try { this._sessionEs.close() } catch { /* ignore */ }
        this._sessionEs = null
      }
    },

    _handleSessionEvent(data: any) {
      if (!data?.action) return
      const session = this.sessionActive
      if (!session) return

      switch (data.action) {
        case 'session_closed':
          if (session.id === data.sessionId) session.status = 'closed'
          break
        case 'participant_joined':
          if (!session.participants.find((p) => p.id === data.participant?.id)) {
            session.participants.push(data.participant)
          }
          this._pushSessionLog('👤', `${data.participant?.username ?? '?'} a rejoint la session.`, 'success')
          break
        case 'participant_updated': {
          const idx = session.participants.findIndex((p) => p.id === data.participant?.id)
          if (idx !== -1) session.participants[idx] = data.participant
          break
        }
        case 'participant_left':
          session.participants = session.participants.filter((p) => p.id !== data.participantId)
          this._pushSessionLog('🚪', 'Un participant a quitté la session.', 'warning')
          break
        case 'rock_added':
          this._applyRockUpdate(data.rock)
          this._pushSessionLog('🪨', `Rocher signalé${data.rock?.bodyName ? ' — ' + data.rock.bodyName : ''}.`, 'info')
          break
        case 'rock_updated':
          this._applyRockUpdate(data.rock)
          break
        case 'rock_collected':
          this._applyRockUpdate(data.rock)
          this._pushSessionLog('✅', `Rocher #${data.rock?.id ?? '?'} collecté.`, 'success')
          break
        case 'rock_assigned':
          this._applyRockUpdate(data.rock)
          break
        case 'rock_deleted':
          if (session.rocks) session.rocks = session.rocks.filter((r) => r.id !== data.rockId)
          this._pushSessionLog('🗑️', `Rocher #${data.rockId ?? '?'} supprimé.`, 'warning')
          break
        case 'cargo_created':
        case 'cargo_updated':
          if (data.cargo && session.cargos) {
            const ci = session.cargos.findIndex((c: any) => c.id === data.cargo.id)
            if (ci === -1) session.cargos.push(data.cargo)
            else session.cargos.splice(ci, 1, data.cargo)
          }
          break
      }
    },

    _applyRockUpdate(rock: MiningRock | null | undefined) {
      if (!rock || !this.sessionActive) return
      const idx = this.sessionActive.rocks.findIndex((r) => r.id === rock.id)
      if (idx === -1) this.sessionActive.rocks.unshift(rock)
      else this.sessionActive.rocks.splice(idx, 1, rock)
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
      this.sessionActive.logs.unshift(entry)
      if (this.sessionActive.logs.length > 100) {
        this.sessionActive.logs = this.sessionActive.logs.slice(0, 100)
      }
    },

    // ─── Actions session collaborative ────────────────────────────────────

    showJoinForm(sessionId: number) {
      this.sessionJoinForm.targetSessionId = sessionId
      this.sessionJoinForm.role  = 'miner'
      this.sessionJoinForm.error = null
      this.sessionJoinForm.show  = true
    },

    async joinSession() {
      const sessionId = this.sessionJoinForm.targetSessionId
      if (!sessionId) return
      this.sessionJoinForm.saving = true
      this.sessionJoinForm.error  = null
      this.loading.joinSession    = true
      try {
        await svcJoinSession(sessionId, { role: this.sessionJoinForm.role })
        this.sessionJoinForm.show = false
        await this.openSession(sessionId)
      } catch (err: any) {
        this.sessionJoinForm.error = err?.response?.data?.message ?? err?.message ?? 'Erreur lors du rejoindre.'
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
        this.errors.session = err?.response?.data?.message ?? err?.message ?? 'Erreur lors du départ.'
      } finally {
        this.loading.leaveSession = false
      }
    },

    openRockForm() {
      this.rockForm.show = true
      this.rockForm.bodyName = ''
      this.rockForm.sizeScuEstimate = ''
      this.rockForm.minerals = [{ commodityId: null, percentage: '' }]
      this.rockForm.error = null
    },

    async addRock() {
      if (!this.sessionActive) return
      this.rockForm.saving = true
      this.rockForm.error  = null
      this.loading.addRock = true
      try {
        const minerals = this.rockForm.minerals
          .filter((m) => m.commodityId !== null && m.percentage !== '')
          .map((m) => ({ commodityId: m.commodityId as number, percentage: Number(m.percentage) }))
        const rock = await svcAddRock(this.sessionActive.id, {
          bodyName:        this.rockForm.bodyName.trim() || undefined,
          sizeScuEstimate: this.rockForm.sizeScuEstimate !== '' ? Number(this.rockForm.sizeScuEstimate) : undefined,
          minerals,
        })
        if (rock) this._applyRockUpdate(rock)
        this.rockForm.show = false
        this._pushSessionLog('🪨', `Rocher signalé${this.rockForm.bodyName ? ' — ' + this.rockForm.bodyName : ''}.`, 'info')
      } catch (err: any) {
        this.rockForm.error = err?.response?.data?.message ?? err?.message ?? 'Erreur ajout rocher.'
      } finally {
        this.rockForm.saving = false
        this.loading.addRock = false
      }
    },

    async claimRock(rockId: number) {
      this.loading.claimRock = true
      try {
        await svcClaimRock(rockId)
        const rock = this.sessionActive?.rocks.find((r) => r.id === rockId)
        if (rock) this._applyRockUpdate({ ...rock, status: 'en_route', claimedByUserId: this._currentUserId })
      } catch (err: any) {
        this.errors.session = err?.response?.data?.message ?? err?.message ?? 'Erreur claim rocher.'
      } finally {
        this.loading.claimRock = false
      }
    },

    async unclaimRock(rockId: number) {
      this.loading.claimRock = true
      try {
        await svcUnclaimRock(rockId)
        const rock = this.sessionActive?.rocks.find((r) => r.id === rockId)
        if (rock) this._applyRockUpdate({ ...rock, status: 'available', claimedByUserId: null })
      } catch (err: any) {
        this.errors.session = err?.response?.data?.message ?? err?.message ?? 'Erreur unclaim rocher.'
      } finally {
        this.loading.claimRock = false
      }
    },

    openCollectForm(rockId: number) {
      const rock = this.sessionActive?.rocks.find((r) => r.id === rockId)
      if (!rock) return
      const scanMinerals = rock.minerals.filter((m) => m.phase === 'scan')
      this.collectForm.rockId = rockId
      this.collectForm.lines  = scanMinerals.length
        ? scanMinerals.map((m) => ({ commodityId: m.commodityId, commodityName: m.commodityName, quantityScuActual: '' }))
        : [{ commodityId: null, commodityName: '', quantityScuActual: '' }]
      this.collectForm.error = null
      this.collectForm.show  = true
    },

    async collectRock() {
      const rockId = this.collectForm.rockId
      if (!rockId) return
      this.collectForm.saving   = true
      this.collectForm.error    = null
      this.loading.collectRock  = true
      try {
        const lines = this.collectForm.lines
          .filter((l) => l.quantityScuActual !== '' && Number(l.quantityScuActual) > 0)
          .map((l) => ({ commodityId: l.commodityId, quantityScuActual: Number(l.quantityScuActual) }))
        const rock = await svcCollectRock(rockId, { lines })
        if (rock) this._applyRockUpdate(rock)
        this.collectForm.show = false
        this._pushSessionLog('✅', `Rocher #${rockId} collecté.`, 'success')
      } catch (err: any) {
        this.collectForm.error = err?.response?.data?.message ?? err?.message ?? 'Erreur collecte rocher.'
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
        this.errors.session = err?.response?.data?.message ?? err?.message ?? 'Erreur fermeture session.'
      } finally {
        this.loading.closeSession = false
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
        if (rock) this._applyRockUpdate(rock)
      } catch (err: any) {
        this.errors.session = err?.response?.data?.message ?? err?.message ?? 'Erreur mise à jour statut.'
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

    async saveLoadout(payload: Partial<MiningLoadout> & { name: string; shipId: number | null; slots: MiningLoadout['slots'] }) {
      this.loadout.savingLoadout = true
      this.loadout.error = null
      try {
        if (payload.id) {
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
        const msg = err?.response?.data?.message ?? err?.message ?? 'Erreur sauvegarde loadout.'
        this.loadout.error = msg
        throw new Error(msg)
      } finally {
        this.loadout.savingLoadout = false
      }
    },

    async deleteLoadout(id: number) {
      this.loadout.deletingId = id
      this.loadout.error = null
      try {
        await svcDeleteLoadout(id)
        this.loadout.savedList = this.loadout.savedList.filter((l) => l.id !== id)
      } catch (err) {
        logger.error('[mining] deleteLoadout failed', err)
        this.loadout.error = 'Erreur suppression loadout.'
      } finally {
        this.loadout.deletingId = null
      }
    },

    async loadPublicLoadouts(force = false) {
      if (!force && this.loadout.publicList.length) return
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

  },
})
