import { markTransactionFiscalizedRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function markTransactionFiscalized(input: {
  stationId: string
  transactionId: string
  fiscalizationReference?: string | null
  fiscalizationResponse?: unknown
  fiscalDocumentId?: string | null
  client?: any | null
}) {
  return await markTransactionFiscalizedRepo(input)
}
