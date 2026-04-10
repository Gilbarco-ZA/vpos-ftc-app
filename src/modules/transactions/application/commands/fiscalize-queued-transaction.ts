import { fiscalizeQueuedTransactionRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export type FiscalizeCustomerInput = {
  id?: string | null
  tin?: string | null
  buyerName?: string | null
}
export async function fiscalizeQueuedTransaction(input: {
  stationId: string
  transactionId: string
  customer?: FiscalizeCustomerInput | null
}) {
  return await fiscalizeQueuedTransactionRepo(
    input.stationId,
    input.transactionId,
    input.customer ?? null,
  )
}
