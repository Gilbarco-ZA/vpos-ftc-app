import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getOrCreateLatestTransactionReceiptRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function getOrCreateLatestTransactionReceipt(
  stationId: string,
  transactionId: string,
) {
  return await getOrCreateLatestTransactionReceiptRepo(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(transactionId, 'transactionId'),
  )
}
