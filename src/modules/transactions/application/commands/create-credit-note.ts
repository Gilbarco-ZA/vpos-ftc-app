import { createCreditNoteRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function createCreditNote(input: {
  stationId: string
  transactionId: string
  reasonCode?: string | null
  notes?: string | null
  createdByName?: string | null
}) {
  return await createCreditNoteRepo(input.stationId, input.transactionId, input)
}
