import { enqueueFiscalInboxReviewItem } from '@/src/shared/runtime/fiscalInbox'

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
  const result = await markTransactionFailedRepo(input)

  await enqueueFiscalInboxReviewItem({
    stationId: input.stationId,
    transactionId: input.transactionId,
    requestId: `txn-review:${input.transactionId}`,
    errorText: input.lastError || 'Transaction fiscalization failed',
    message: {
      source: 'markTransactionFailed',
      fiscalDocumentId: input.fiscalDocumentId ?? null,
      fiscalizationResponse:
        input.fiscalizationResponse &&
        typeof input.fiscalizationResponse === 'object'
          ? (input.fiscalizationResponse as Record<string, unknown>)
          : input.fiscalizationResponse != null
            ? { value: String(input.fiscalizationResponse) }
            : null,
    },
  }).catch(() => {})

  return result
}
