import { markTransactionFailedRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function markTransactionFailed(input: {
  stationId: string
  transactionId: string
  lastError?: string | null
  incrementRetryCount?: boolean
  fiscalDocumentId?: string | null
  fiscalizationResponse?: unknown
  client?: any | null
}) {
  return await markTransactionFailedRepo(input)
}
