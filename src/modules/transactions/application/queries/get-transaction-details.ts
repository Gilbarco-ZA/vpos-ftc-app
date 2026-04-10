import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getTransactionDetailsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function getTransactionDetails(
  stationId: string,
  transactionId: string,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedTransactionId = requireNonEmptyString(
    transactionId,
    'transactionId',
  )
  return await getTransactionDetailsRepo(scopedStationId, scopedTransactionId)
}
