import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getTransactionInvoicePayloadRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function getTransactionInvoicePayload(
  stationId: string,
  transactionId: string,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedTransactionId = requireNonEmptyString(
    transactionId,
    'transactionId',
  )
  return await getTransactionInvoicePayloadRepo(
    scopedStationId,
    scopedTransactionId,
  )
}
