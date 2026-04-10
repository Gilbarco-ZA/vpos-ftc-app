import { claimEligibleTransactionFiscalizationQueueRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function claimTransactionsForFiscalizationQueue(input: {
  stationId: string
  limit?: number
  linkingWindowSeconds: number | null
}) {
  return await claimEligibleTransactionFiscalizationQueueRepo(input)
}
