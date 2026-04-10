import type { FiscalInboxRepositoryPort } from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'
import type { FiscalInboxStatus } from '@/src/modules/fiscal-inbox/domain/fiscal-inbox-status'

import { FiscalInboxStatusTransitionError } from '@/src/modules/fiscal-inbox/domain/fiscal-inbox-errors'
import { normalizeFiscalInboxStatus } from '@/src/modules/fiscal-inbox/domain/fiscal-inbox-status'

type FiscalInboxTransitionAction =
  | 'REQUEUE'
  | 'MARK_FAILED'
  | 'MARK_DEAD'
  | 'MARK_PROCESSED'

const FISCAL_INBOX_TRANSITION_RULES: Record<
  FiscalInboxTransitionAction,
  readonly FiscalInboxStatus[]
> = {
  REQUEUE: ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD'],
  MARK_FAILED: ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD'],
  MARK_DEAD: ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD'],
  MARK_PROCESSED: ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD'],
}

export function createFiscalInboxStatusService(deps: {
  repository: FiscalInboxRepositoryPort
}) {
  const { repository } = deps

  const loadCurrentStatus = async (input: {
    id: number
    stationId: string
  }) => {
    const snapshot = await repository.getStatusSnapshot(input)
    if (!snapshot) return null

    const currentStatus = normalizeFiscalInboxStatus(snapshot.status)
    if (!currentStatus) {
      throw new FiscalInboxStatusTransitionError(snapshot.status, 'UNKNOWN')
    }

    return currentStatus
  }

  const assertTransition = (
    action: FiscalInboxTransitionAction,
    currentStatus: FiscalInboxStatus,
    nextStatus: FiscalInboxStatus,
  ) => {
    if (FISCAL_INBOX_TRANSITION_RULES[action].includes(currentStatus)) return
    throw new FiscalInboxStatusTransitionError(currentStatus, nextStatus)
  }

  return {
    async requeue(input: { id: number; stationId: string }) {
      const currentStatus = await loadCurrentStatus(input)
      if (!currentStatus) return null
      assertTransition('REQUEUE', currentStatus, 'PENDING')
      return await repository.requeueById(input)
    },

    async markFailed(input: {
      id: number
      stationId: string
      errorText: string
    }) {
      const currentStatus = await loadCurrentStatus(input)
      if (!currentStatus) return null
      assertTransition('MARK_FAILED', currentStatus, 'FAILED')
      return await repository.markFailedById(input)
    },

    async markDead(input: {
      id: number
      stationId: string
      errorText: string
    }) {
      const currentStatus = await loadCurrentStatus(input)
      if (!currentStatus) return null
      assertTransition('MARK_DEAD', currentStatus, 'DEAD')
      return await repository.markDeadById(input)
    },

    async markProcessed(input: { id: number; stationId: string }) {
      const currentStatus = await loadCurrentStatus(input)
      if (!currentStatus) return null
      assertTransition('MARK_PROCESSED', currentStatus, 'PROCESSED')
      return await repository.markProcessedById(input)
    },
  }
}
