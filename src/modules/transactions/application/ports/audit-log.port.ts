import type { TransactionStatus } from '@/src/modules/transactions/domain/transaction-status'

export type TransactionStatusAuditEntry = {
  stationId: string
  transactionId: string
  previousStatus: TransactionStatus | null
  nextStatus: TransactionStatus
  actorId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface AuditLogPort {
  recordTransactionStatusChange(
    entry: TransactionStatusAuditEntry,
  ): Promise<void>
}
