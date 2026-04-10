import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getTransactionReceiptRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function getTransactionReceipt(
  stationId: string,
  transactionId: string,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedTransactionId = requireNonEmptyString(
    transactionId,
    'transactionId',
  )
  return await getTransactionReceiptRepo(scopedStationId, scopedTransactionId)
}
