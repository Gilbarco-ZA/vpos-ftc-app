import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getLatestTransactionReceiptRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function getLatestTransactionReceipt(
  stationId: string,
  transactionId: string,
) {
  return await getLatestTransactionReceiptRepo(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(transactionId, 'transactionId'),
  )
}
