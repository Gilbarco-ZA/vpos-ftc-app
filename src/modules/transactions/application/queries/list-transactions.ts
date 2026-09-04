import type { ListTransactionsRepoOptions } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { listTransactionsWithReceiptNumbersRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction-list-with-receipts.repository'

export type ListTransactionsOptions = ListTransactionsRepoOptions

export async function listTransactions(
  stationId: string,
  opts?: number | ListTransactionsOptions,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const normalizedOpts =
    typeof opts === 'number' ? { limit: opts } : opts || { limit: 200 }
  return await listTransactionsWithReceiptNumbersRepo(
    scopedStationId,
    normalizedOpts,
  )
}
