import type {
  PersistTransactionStatusInput,
  TransactionRepositoryPort,
} from '@/src/modules/transactions/application/ports/transaction-repository.port'

import { queryOne, txQuery } from '@/src/platform/db/postgres'
import { auditReceiptPrinted } from '@/src/shared/audit/log'

import { createTransactionStatusService } from '@/src/modules/transactions/application/services/transaction-status-service'
import { normalizeTransactionStatus } from '@/src/modules/transactions/domain/transaction-status'

import { mapTransactionStatusSnapshot } from './transaction.mapper'
import {
  buildPersistTransactionStatusUpdate,
  getTransactionStatusSnapshotSql,
} from './transaction.sql'

export const queryOneMaybeTx = async (
  client: any | null | undefined,
  sql: string,
  params: unknown[],
) => {
  if (client) {
    const result = await txQuery<any>(client, sql, params)
    return result.rows?.[0] ?? null
  }

  return await queryOne<any>(sql, params)
}

const transactionStatusRepository: TransactionRepositoryPort = {
  async getStatusSnapshot(input) {
    const row = await queryOneMaybeTx(
      input.client,
      getTransactionStatusSnapshotSql,
      [input.stationId, input.transactionId],
    )

    return mapTransactionStatusSnapshot(row)
  },

  async persistStatus(input: PersistTransactionStatusInput) {
    const statement = buildPersistTransactionStatusUpdate(input)
    return await queryOneMaybeTx(input.client, statement.sql, statement.params)
  },
}

const transactionStatusAuditLog = {
  async recordTransactionStatusChange(_entry: {
    stationId: string
    transactionId: string
    previousStatus: string | null
    nextStatus: string
    actorId?: string | null
    metadata?: Record<string, unknown> | null
  }) {
    return
  },
}

export const transactionStatusService = createTransactionStatusService({
  repository: transactionStatusRepository,
  auditLog: transactionStatusAuditLog,
})

export async function allocateTransactionRepo(
  stationId: string,
  transactionId: string,
  customerId: string,
  allocatedBy?: string | null,
) {
  return await transactionStatusService.assignCustomerAndMaybeAllocate({
    stationId,
    transactionId,
    customerId,
    allocatedBy: allocatedBy ?? null,
    client: null,
  })
}

export async function markTransactionFiscalizingRepo(
  stationId: string,
  transactionId: string,
  client?: any | null,
) {
  return await transactionStatusService.markFiscalizing({
    stationId,
    transactionId,
    client: client ?? null,
  })
}

export async function markTransactionFiscalizedRepo(input: {
  stationId: string
  transactionId: string
  fiscalizationReference?: string | null
  fiscalizationResponse?: unknown
  fiscalDocumentId?: string | null
  client?: any | null
}) {
  return await transactionStatusService.markFiscalized(input)
}

export async function markTransactionFailedRepo(input: {
  stationId: string
  transactionId: string
  lastError?: string | null
  incrementRetryCount?: boolean
  fiscalDocumentId?: string | null
  fiscalizationResponse?: unknown
  client?: any | null
}) {
  return await transactionStatusService.markFailed(input)
}

export async function retryFailedTransactionFiscalizationRepo(
  stationId: string,
  transactionId: string,
) {
  await transactionStatusService.retryFiscalization({
    stationId,
    transactionId,
    client: null,
  })
}

export async function markTransactionReceiptPrintedRepo(input: {
  stationId: string
  transactionId: string
  receiptId: string
  userId?: string | null
  isReprint?: boolean
  ipAddress?: string
}) {
  const snapshot = await transactionStatusRepository.getStatusSnapshot({
    stationId: input.stationId,
    transactionId: input.transactionId,
    client: null,
  })
  if (!snapshot || snapshot.deletedAt != null) return null

  const currentStatus = normalizeTransactionStatus(snapshot.status)
  const nextStatus =
    input.isReprint ||
    currentStatus === 'PRINTED' ||
    currentStatus === 'REPRINTED'
      ? 'REPRINTED'
      : 'PRINTED'

  const updated = await transactionStatusService.transition({
    stationId: input.stationId,
    transactionId: input.transactionId,
    nextStatus,
    actorId: input.userId ?? null,
    metadata: {
      receiptId: input.receiptId,
      isReprint: Boolean(input.isReprint),
    },
    client: null,
  })

  if (input.userId) {
    await auditReceiptPrinted(
      input.stationId,
      input.userId,
      input.receiptId,
      input.transactionId,
      nextStatus === 'REPRINTED',
      input.ipAddress,
    ).catch(() => {})
  }

  return updated
}
