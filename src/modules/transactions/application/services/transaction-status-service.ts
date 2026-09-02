import type { AuditLogPort } from '@/src/modules/transactions/application/ports/audit-log.port'
import type {
  PersistTransactionStatusInput,
  TransactionRepositoryPort,
  TransactionStatusPersistenceContext,
} from '@/src/modules/transactions/application/ports/transaction-repository.port'
import type { TransactionStatus } from '@/src/modules/transactions/domain/transaction-status'

import { TransactionStatusNotFoundError } from '@/src/modules/transactions/domain/transaction-errors'
import { assertTransactionStatusTransition } from '@/src/modules/transactions/domain/transaction-policy'
import { normalizeTransactionStatus } from '@/src/modules/transactions/domain/transaction-status'

export function createTransactionStatusService(deps: {
  repository: TransactionRepositoryPort
  auditLog?: AuditLogPort | null
}) {
  const { repository, auditLog } = deps

  const loadSnapshot = async (
    stationId: string,
    transactionId: string,
    context?: TransactionStatusPersistenceContext,
  ) => {
    const snapshot = await repository.getStatusSnapshot({
      stationId,
      transactionId,
      client: context?.client ?? null,
    })
    if (!snapshot || snapshot.deletedAt != null) {
      throw new TransactionStatusNotFoundError(transactionId)
    }
    return snapshot
  }

  const transition = async (
    input: {
      stationId: string
      transactionId: string
      nextStatus: TransactionStatus
      actorId?: string | null
      metadata?: Record<string, unknown> | null
      patch?: Omit<
        PersistTransactionStatusInput,
        | 'stationId'
        | 'transactionId'
        | 'nextStatus'
        | 'expectedCurrentStatus'
        | 'client'
      >
    } & TransactionStatusPersistenceContext,
  ) => {
    const snapshot = await loadSnapshot(
      input.stationId,
      input.transactionId,
      input,
    )
    const currentStatus = normalizeTransactionStatus(snapshot.status)
    assertTransactionStatusTransition(currentStatus, input.nextStatus)

    const updated = await repository.persistStatus({
      stationId: input.stationId,
      transactionId: input.transactionId,
      nextStatus: input.nextStatus,
      expectedCurrentStatus: currentStatus,
      client: input.client ?? null,
      ...(input.patch || {}),
    })

    if (auditLog && currentStatus !== input.nextStatus) {
      await auditLog.recordTransactionStatusChange({
        stationId: input.stationId,
        transactionId: input.transactionId,
        previousStatus: currentStatus,
        nextStatus: input.nextStatus,
        actorId: input.actorId ?? null,
        metadata: input.metadata ?? null,
      })
    }

    return updated
  }

  return {
    transition,

    async assignCustomerAndMaybeAllocate(
      input: {
        stationId: string
        transactionId: string
        customerId: string
        allocatedBy?: string | null
      } & TransactionStatusPersistenceContext,
    ) {
      const snapshot = await repository.getStatusSnapshot({
        stationId: input.stationId,
        transactionId: input.transactionId,
        client: input.client ?? null,
      })
      if (!snapshot || snapshot.deletedAt != null) return null
      const currentStatus = normalizeTransactionStatus(snapshot.status)
      const nextStatus = currentStatus === 'OPEN' ? 'ALLOCATED' : currentStatus

      if (!nextStatus) {
        return await repository.persistStatus({
          stationId: input.stationId,
          transactionId: input.transactionId,
          nextStatus: 'ALLOCATED',
          customerId: input.customerId,
          allocatedBy: input.allocatedBy ?? null,
          touchAllocatedAt: true,
          client: input.client ?? null,
        })
      }

      if (currentStatus === 'OPEN') {
        assertTransactionStatusTransition(currentStatus, nextStatus)
      }

      const updated = await repository.persistStatus({
        stationId: input.stationId,
        transactionId: input.transactionId,
        nextStatus,
        expectedCurrentStatus: currentStatus,
        customerId: input.customerId,
        allocatedBy: input.allocatedBy ?? null,
        touchAllocatedAt: true,
        client: input.client ?? null,
      })

      if (auditLog && currentStatus !== nextStatus) {
        await auditLog.recordTransactionStatusChange({
          stationId: input.stationId,
          transactionId: input.transactionId,
          previousStatus: currentStatus,
          nextStatus,
          actorId: input.allocatedBy ?? null,
          metadata: { customerId: input.customerId },
        })
      }

      return updated
    },

    async retryFiscalization(
      input: {
        stationId: string
        transactionId: string
      } & TransactionStatusPersistenceContext,
    ) {
      const snapshot = await repository.getStatusSnapshot({
        stationId: input.stationId,
        transactionId: input.transactionId,
        client: input.client ?? null,
      })
      if (!snapshot || snapshot.deletedAt != null) return null

      return await transition({
        stationId: input.stationId,
        transactionId: input.transactionId,
        nextStatus: 'PENDING',
        metadata: { reason: 'retry-fiscalization' },
        client: input.client ?? null,
        patch: {
          clearLastError: true,
        },
      })
    },

    async markFiscalizing(
      input: {
        stationId: string
        transactionId: string
      } & TransactionStatusPersistenceContext,
    ) {
      return await transition({
        stationId: input.stationId,
        transactionId: input.transactionId,
        nextStatus: 'FISCALIZING',
        client: input.client ?? null,
      })
    },

    async markFiscalized(
      input: {
        stationId: string
        transactionId: string
        fiscalizationReference?: string | null
        fiscalizationResponse?: unknown
        fiscalDocumentId?: string | null
        latestFiscalEventId?: string | null
      } & TransactionStatusPersistenceContext,
    ) {
      return await transition({
        stationId: input.stationId,
        transactionId: input.transactionId,
        nextStatus: 'FISCALIZED',
        client: input.client ?? null,
        patch: {
          fiscalizationReference: input.fiscalizationReference ?? null,
          fiscalizationResponse: input.fiscalizationResponse,
          fiscalDocumentId: input.fiscalDocumentId ?? null,
          latestFiscalEventId: input.latestFiscalEventId ?? null,
          touchFiscalizedAt: true,
          clearLastError: true,
        },
      })
    },

    async markFailed(
      input: {
        stationId: string
        transactionId: string
        lastError?: string | null
        incrementRetryCount?: boolean
        fiscalDocumentId?: string | null
        fiscalizationResponse?: unknown
        latestFiscalEventId?: string | null
      } & TransactionStatusPersistenceContext,
    ) {
      return await transition({
        stationId: input.stationId,
        transactionId: input.transactionId,
        nextStatus: 'FAILED',
        client: input.client ?? null,
        patch: {
          lastError: input.lastError ?? null,
          incrementRetryCount: input.incrementRetryCount ?? false,
          fiscalDocumentId: input.fiscalDocumentId ?? null,
          fiscalizationResponse: input.fiscalizationResponse,
          latestFiscalEventId: input.latestFiscalEventId ?? null,
        },
      })
    },

    async markCredited(
      input: {
        stationId: string
        transactionId: string
      } & TransactionStatusPersistenceContext,
    ) {
      return await transition({
        stationId: input.stationId,
        transactionId: input.transactionId,
        nextStatus: 'CREDITED',
        client: input.client ?? null,
      })
    },
  }
}
