import type {
  FuelSelectionInput,
  UpsertTransactionLineInput,
} from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { replaceTransactionLinesRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function replaceTransactionLines(
  stationId: string,
  transactionId: string,
  lines: UpsertTransactionLineInput[],
  removedProductIds: string[] = [],
  fuelSelection?: FuelSelectionInput | null,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedTransactionId = requireNonEmptyString(
    transactionId,
    'transactionId',
  )
  return await replaceTransactionLinesRepo(
    scopedStationId,
    scopedTransactionId,
    lines,
    removedProductIds,
    fuelSelection,
  )
}
