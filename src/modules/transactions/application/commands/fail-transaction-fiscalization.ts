import type { FiscalRunResult } from '@/src/modules/transactions/infrastructure/fiscalization/fiscal-run-result'

import { enqueueFiscalInboxReviewItem } from '@/src/shared/runtime/fiscalInbox'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { failTransactionFiscalizationRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function failTransactionFiscalization(input: {
  stationId: string
  transactionId: string
  fiscalResult: FiscalRunResult & { status: 'FAILED' }
}) {
  const stationId = requireNonEmptyString(input.stationId, 'stationId')
  const transactionId = requireNonEmptyString(
    input.transactionId,
    'transactionId',
  )
  const result = await failTransactionFiscalizationRepo({
    stationId,
    transactionId,
    fiscalResult: input.fiscalResult,
  })

  await enqueueFiscalInboxReviewItem({
    stationId,
    transactionId,
    requestId: `txn-review:${transactionId}`,
    errorText: input.fiscalResult.errorMessage || 'Fiscalization failed',
    message: {
      source: 'failTransactionFiscalization',
      engine: input.fiscalResult.engine,
      requestPayload: input.fiscalResult.requestPayload ?? null,
      responsePayload: input.fiscalResult.responsePayload ?? null,
      rawResponse: input.fiscalResult.rawResponse ?? null,
    },
  }).catch(() => {})

  return result
}
