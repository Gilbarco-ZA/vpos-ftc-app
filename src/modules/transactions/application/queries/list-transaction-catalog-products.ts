import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { listTransactionCatalogProductsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function listTransactionCatalogProducts(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await listTransactionCatalogProductsRepo(scopedStationId)
}
