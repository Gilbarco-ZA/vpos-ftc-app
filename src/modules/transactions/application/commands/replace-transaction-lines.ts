import type {
  FuelSelectionInput,
  TransactionMutationActor,
  UpsertTransactionLineInput,
} from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { replaceTransactionLinesRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function replaceTransactionLines(
  stationId: string,
  transactionId: string,
  lines: UpsertTransactionLineInput[],
  actor: TransactionMutationActor,
  removedProductIds: string[] = [],
  fuelSelection?: FuelSelectionInput | null,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedTransactionId = requireNonEmptyString(
    transactionId,
    'transactionId',
  )
  const result = await replaceTransactionLinesRepo(
    scopedStationId,
    scopedTransactionId,
    lines,
    actor,
    removedProductIds,
    fuelSelection,
  )
  return result
}
