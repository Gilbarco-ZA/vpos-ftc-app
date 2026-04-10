import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { listNonFiscalizedTransactionsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function listNonFiscalizedTransactions(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await listNonFiscalizedTransactionsRepo(scopedStationId)
}
