import type { FiscalizationEventWriteDetails } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'

import { markTransactionFiscalizedRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function markTransactionFiscalized(input: {
  stationId: string
  transactionId: string
  fiscalizationReference?: string | null
  fiscalizationResponse?: unknown
  fiscalDocumentId?: string | null
  fiscalEvent?: FiscalizationEventWriteDetails
  client?: any | null
}) {
  return await markTransactionFiscalizedRepo(input)
}
