import { allocateTransactionRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function allocateTransaction(input: {
  stationId: string
  transactionId: string
  customerId: string
  allocatedBy?: string | null
}) {
  return await allocateTransactionRepo(
    input.stationId,
    input.transactionId,
    input.customerId,
    input.allocatedBy ?? null,
  )
}
