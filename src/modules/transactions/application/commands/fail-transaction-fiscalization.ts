import type { FiscalRunResult } from '@/src/modules/transactions/infrastructure/fiscalization/fiscal-run-result'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { failTransactionFiscalizationRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function failTransactionFiscalization(input: {
  stationId: string
  transactionId: string
  fiscalResult: FiscalRunResult & { status: 'FAILED' }
}) {
  return await failTransactionFiscalizationRepo({
    stationId: requireNonEmptyString(input.stationId, 'stationId'),
    transactionId: requireNonEmptyString(input.transactionId, 'transactionId'),
    fiscalResult: input.fiscalResult,
  })
}
