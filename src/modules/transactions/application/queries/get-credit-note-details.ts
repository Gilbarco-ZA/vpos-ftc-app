import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getCreditNoteDetailsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function getCreditNoteDetails(
  stationId: string,
  transactionId: string,
) {
  return await getCreditNoteDetailsRepo(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(transactionId, 'transactionId'),
  )
}
