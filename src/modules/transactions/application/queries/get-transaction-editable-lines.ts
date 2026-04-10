import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getTransactionEditableLinesRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function getTransactionEditableLines(
  stationId: string,
  transactionId: string,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedTransactionId = requireNonEmptyString(
    transactionId,
    'transactionId',
  )
  return await getTransactionEditableLinesRepo(
    scopedStationId,
    scopedTransactionId,
  )
}
