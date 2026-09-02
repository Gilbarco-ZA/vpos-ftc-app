import type { TransactionStatus } from '@/src/modules/transactions/domain/transaction-status'
import type { PoolClient } from '@/src/platform/db/postgres'

export type TransactionStatusSnapshot = {
  id: string
  stationId: string
  status: TransactionStatus | null
  customerId?: string | null
  deletedAt?: string | Date | null
}

export type TransactionStatusPersistenceContext = {
  client?: PoolClient | null
}

export type PersistTransactionStatusInput = {
  stationId: string
  transactionId: string
  nextStatus: TransactionStatus
  expectedCurrentStatus?: TransactionStatus | null
  customerId?: string | null
  allocatedBy?: string | null
  touchAllocatedAt?: boolean
  fiscalizationReference?: string | null
  fiscalizationResponse?: unknown
  fiscalDocumentId?: string | null
  latestFiscalEventId?: string | null
  touchFiscalizedAt?: boolean
  lastError?: string | null
  clearLastError?: boolean
  incrementRetryCount?: boolean
} & TransactionStatusPersistenceContext

export interface TransactionRepositoryPort {
  getStatusSnapshot(
    input: {
      stationId: string
      transactionId: string
    } & TransactionStatusPersistenceContext,
  ): Promise<TransactionStatusSnapshot | null>
  persistStatus(input: PersistTransactionStatusInput): Promise<any>
}
