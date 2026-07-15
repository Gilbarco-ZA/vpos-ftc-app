import { requireNonEmptyString } from '@/src/shared/utils/inputs'
import { isUuid } from '@/src/shared/utils/uuid'

import { createCreditNoteRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function createCreditNote(input: {
  stationId: string
  transactionId: string
  reasonCode?: string | null
  notes?: string | null
  createdByName?: string | null
}) {
  const stationId = requireNonEmptyString(input.stationId, 'stationId')
  const transactionId = requireNonEmptyString(
    input.transactionId,
    'transactionId',
  )

  if (!isUuid(transactionId)) {
    throw new Error('transactionId must be a UUID')
  }

  return await createCreditNoteRepo(stationId, transactionId, input)
}
