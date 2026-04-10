import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { enqueueTransactionReceiptPrintRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function enqueueTransactionReceiptPrint(
  stationId: string,
  transactionId: string,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedTransactionId = requireNonEmptyString(
    transactionId,
    'transactionId',
  )
  return await enqueueTransactionReceiptPrintRepo(
    scopedStationId,
    scopedTransactionId,
  )
}
