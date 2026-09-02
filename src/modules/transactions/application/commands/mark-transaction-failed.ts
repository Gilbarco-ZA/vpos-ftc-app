import type { FiscalizationEventWriteDetails } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'

import { enqueueFiscalInboxReviewItem } from '@/src/modules/fiscal-inbox/application/fiscalInbox'
import { markTransactionFailedRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function markTransactionFailed(input: {
  stationId: string
  transactionId: string
  lastError?: string | null
  incrementRetryCount?: boolean
  fiscalDocumentId?: string | null
  fiscalizationResponse?: unknown
  fiscalEvent?: FiscalizationEventWriteDetails
  client?: any | null
}) {
  const result = await markTransactionFailedRepo(input)

  await enqueueFiscalInboxReviewItem({
    stationId: input.stationId,
    transactionId: input.transactionId,
    requestId: `txn-review:${input.transactionId}`,
    errorText: input.lastError || 'Transaction fiscalization failed',
    message: {
      source: 'markTransactionFailed',
      fiscalDocumentId: input.fiscalDocumentId ?? null,
      fiscalEventId: result?.latest_fiscal_event_id ?? null,
      fiscalizationSummary: result?.fiscalization_response ?? null,
    },
  }).catch(() => {})

  return result
}
