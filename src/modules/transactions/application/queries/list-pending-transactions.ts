import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { listPendingTransactionsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function listPendingTransactions(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await listPendingTransactionsRepo(scopedStationId)
}
