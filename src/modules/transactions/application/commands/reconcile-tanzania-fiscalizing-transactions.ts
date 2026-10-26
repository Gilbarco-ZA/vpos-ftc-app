import { reconcileTanzaniaFiscalizingTransactions } from '@/src/modules/transactions/infrastructure/fiscalization/proxySenderWorker'

/** Operator-triggered, strictly station-scoped Tanzania invoice status check. */
export async function reconcileTanzaniaFiscalizingTransactionsCommand(input: {
  stationId: string
  transactionIds: string[]
}) {
  return await reconcileTanzaniaFiscalizingTransactions(input)
}
