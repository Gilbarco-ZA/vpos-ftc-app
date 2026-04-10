import { markTransactionFiscalizingRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function markTransactionFiscalizing(input: {
  stationId: string
  transactionId: string
  client?: any | null
}) {
  return await markTransactionFiscalizingRepo(
    input.stationId,
    input.transactionId,
    input.client ?? null,
  )
}
