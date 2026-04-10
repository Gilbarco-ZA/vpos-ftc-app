import type { TransactionStatus } from '@/src/modules/transactions/domain/transaction-status'

import { TransactionStatusTransitionError } from '@/src/modules/transactions/domain/transaction-errors'

const TRANSACTION_STATUS_TRANSITIONS: Partial<
  Record<TransactionStatus, readonly TransactionStatus[]>
> = {
  OPEN: ['ALLOCATED', 'PENDING', 'FISCALIZING', 'FAILED', 'CANCELLED'],
  ALLOCATED: ['PENDING', 'FISCALIZING', 'FAILED', 'CANCELLED'],
  PENDING: ['FISCALIZING', 'FAILED', 'FISCALIZED'],
  FAILED: ['PENDING', 'FISCALIZING', 'FAILED', 'FISCALIZED'],
  FISCALIZING: ['FISCALIZED', 'FAILED'],
  FISCALIZED: ['PRINTED', 'REPRINTED', 'CREDITED'],
  PRINTED: ['REPRINTED', 'CREDITED'],
  REPRINTED: ['CREDITED'],
  CREDITED: [],
  CANCELLED: [],
  QUEUED: ['PENDING', 'FAILED'],
  SENT: ['FISCALIZING', 'FAILED', 'FISCALIZED'],
  SUCCESS: [],
  REJECTED: ['FAILED'],
}

export function canTransitionTransactionStatus(
  currentStatus: TransactionStatus | null,
  nextStatus: TransactionStatus,
) {
  if (!currentStatus) return true
  if (currentStatus === nextStatus) return true
  return (TRANSACTION_STATUS_TRANSITIONS[currentStatus] || []).includes(
    nextStatus,
  )
}

export function assertTransactionStatusTransition(
  currentStatus: TransactionStatus | null,
  nextStatus: TransactionStatus,
) {
  if (!canTransitionTransactionStatus(currentStatus, nextStatus)) {
    throw new TransactionStatusTransitionError(currentStatus, nextStatus)
  }
}
