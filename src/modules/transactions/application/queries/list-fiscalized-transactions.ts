import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { listFiscalizedTransactionsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function listFiscalizedTransactions(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await listFiscalizedTransactionsRepo(scopedStationId)
}
