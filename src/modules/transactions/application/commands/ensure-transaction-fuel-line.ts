import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { ensureTransactionFuelLineRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction-write.repository'

export async function ensureTransactionFuelLine(
  stationId: string,
  transactionId: string,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedTransactionId = requireNonEmptyString(
    transactionId,
    'transactionId',
  )

  return await ensureTransactionFuelLineRepo(
    scopedStationId,
    scopedTransactionId,
  )
}
