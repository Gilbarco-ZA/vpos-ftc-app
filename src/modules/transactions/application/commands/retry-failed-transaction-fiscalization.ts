import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { retryFailedTransactionFiscalizationRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function retryFailedTransactionFiscalization(
  stationId: string,
  transactionId: string,
) {
  return await retryFailedTransactionFiscalizationRepo(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(transactionId, 'transactionId'),
  )
}
