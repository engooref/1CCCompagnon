/**
 * Gestionnaires d'événements Mercure pour le mining
 * Sépare la logique realtime du store principal
 */

import { useMiningStore } from '@renderer/stores/mining'
import { useNotificationBus } from './useNotificationBus'
import { logger } from '@renderer/services/logger'
import { normalizeWO } from '@renderer/utils/miningNormalization'

export function useMiningEventHandlers() {
  const mining = useMiningStore()
  const { push: pushNotif } = useNotificationBus()

  /**
   * Traite un événement Mercure de raffinerie
   * Peut déclencher une notification overlay
   */
  async function handleRefineryMercureEvent(payload: unknown) {
    const evt = (payload ?? {}) as Record<string, any>
    const action = String(evt.action ?? evt.type ?? evt.event ?? '')

    logger.info('[mining:events] refinery mercure event', { action, workOrderId: evt?.workOrderId ?? evt?.orderId ?? evt?.data?.workOrderId ?? null })

    // Mettre à jour l'état local du work order si présent
    const rawWorkOrder = evt.workOrder ?? evt.order ?? evt.data?.workOrder ?? evt.data?.order
    const workOrder = rawWorkOrder && typeof rawWorkOrder === 'object' && 'id' in rawWorkOrder
      ? normalizeWO(rawWorkOrder)
      : null
    if (workOrder?.id) {
      mining._applyWorkOrderUpdate(workOrder)
    }

    // Seul l'event de notification doit déclencher une notif overlay + ack
    if (action !== 'refinery_order_notify_group') {
      logger.debug('[mining:events] refinery event ignored (not notify_group)', { action })
      return
    }

    const ackUrl: string | null = mining._urls()?.mining?.refineryNotifyAck ?? null
    const notificationToken: string | null = evt.notificationToken ?? null
    const ttlSeconds: number | null = evt.ttlSeconds ?? null
    const readyCount = Number.isFinite(Number(evt.count ?? evt.data?.count))
      ? Math.max(1, Math.trunc(Number(evt.count ?? evt.data?.count)))
      : 1

    logger.info('[mining:events] refinery_order_notify_group', {
      ackUrl,
      notificationToken: notificationToken ? '***' : null,
      ttlSeconds,
      count: readyCount,
    })

    // Ignorer si le TTL est déjà expiré
    if (ttlSeconds !== null && ttlSeconds <= 0) return

    const overlaySent = await mining._notifyReadyOverlay(readyCount)
    if (!overlaySent) return

    if (ackUrl && notificationToken) {
      await mining._ackRefineryNotification(ackUrl, notificationToken)
    } else {
      logger.warn('[mining:events] ack skipped: missing ackUrl or notificationToken', {
        hasAckUrl: Boolean(ackUrl),
        hasToken: Boolean(notificationToken),
      })
    }
  }

  /**
   * Traite un événement Mercure de session collaborative
   * Met à jour l'état de la session (participants, rochers, cargos, etc.)
   */
  function handleSessionMercureEvent(data: any) {
    const action = String(data?.action ?? data?.type ?? data?.event ?? '')
    logger.info('[mining:events] session mercure event', { action, raw: JSON.stringify(data)?.slice(0, 200) })

    if (!action) return
    const session = mining.sessionActive
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

      case 'participant_joined':
        if (!session.participants.find((p) => p.id === data.participant?.id)) {
          session.participants.push(data.participant)
        }
        mining._pushSessionLog('👤', `${data.participant?.username ?? '?'} a rejoint la session.`, 'success')
        break

      case 'participant_updated': {
        const idx = session.participants.findIndex((p) => p.id === data.participant?.id)
        if (idx !== -1) session.participants[idx] = data.participant
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

      case 'participant_left':
      case 'participant_removed': {
        const leftId = data.participantId ?? data.participant?.id
        if (leftId) session.participants = session.participants.filter((p) => p.id !== leftId)
        mining._pushSessionLog('🚪', 'Un participant a quitté la session.', 'warning')
        break
      }

      case 'rock_added': {
        mining._applyRockUpdate(data.rock)
        mining._pushSessionLog('🪨', `Rocher signalé${data.rock?.bodyName ? ' — ' + data.rock.bodyName : ''}.`, 'info')
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
        mining._applyRockUpdate(data.rock)
        const isMyRock = data.rock?.claimedByUserId != null && Number(data.rock.claimedByUserId) === Number(mining._currentUserId)
        if (isMyRock && prevStatus !== 'extraction' && data.rock?.status === 'extraction') {
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
        mining._applyRockUpdate(data.rock)
        mining._pushSessionLog('✅', `Rocher #${data.rock?.id ?? '?'} collecté.`, 'success')
        break

      case 'rock_assigned': {
        mining._applyRockUpdate(data.rock)
        const assignedToMe = data.rock?.claimedByUserId != null && Number(data.rock.claimedByUserId) === Number(mining._currentUserId)
        if (assignedToMe) {
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
        mining._pushSessionLog('🗑️', `Rocher #${data.rockId ?? '?'} supprimé.`, 'warning')
        break

      case 'cargo_created':
      case 'cargo_updated':
      case 'cargo_assigned_transporter':
      case 'cargo_delivered':
        if (Array.isArray(data.cargos)) {
          data.cargos.forEach((cargo: any) => mining._applyCargoUpdate(cargo))
        } else if (data.cargo) {
          mining._applyCargoUpdate(data.cargo)
        }
        break
    }
  }

  return {
    handleRefineryMercureEvent,
    handleSessionMercureEvent,
  }
}
