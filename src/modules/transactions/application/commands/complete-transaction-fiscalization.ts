import type { FiscalRunResult } from '@/src/modules/transactions/infrastructure/fiscalization/fiscal-run-result'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { completeTransactionFiscalizationRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function completeTransactionFiscalization(input: {
  stationId: string
  transactionId: string
  fiscalResult: FiscalRunResult & { status: 'SUCCESS' }
}) {
  return await completeTransactionFiscalizationRepo({
    stationId: requireNonEmptyString(input.stationId, 'stationId'),
    transactionId: requireNonEmptyString(input.transactionId, 'transactionId'),
    fiscalResult: input.fiscalResult,
  })
}
