import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { markTransactionSendNowRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function markTransactionSendNow(
  stationId: string,
  transactionId: string,
) {
  return await markTransactionSendNowRepo(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(transactionId, 'transactionId'),
  )
}
