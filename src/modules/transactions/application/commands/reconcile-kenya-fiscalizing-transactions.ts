import { reconcileKenyaFiscalizingTransactions } from '@/src/modules/transactions/infrastructure/fiscalization/proxySenderWorker'

/** Operator-triggered, strictly station-scoped status reconciliation. */
export async function reconcileKenyaFiscalizingTransactionsCommand(input: {
  stationId: string
  transactionIds: string[]
}) {
  return await reconcileKenyaFiscalizingTransactions(input)
}
