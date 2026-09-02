import type {
  FuelSelectionInput,
  ManualTransactionInput,
  TransactionMutationActor,
} from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { createManualTransactionRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function createManualTransaction(
  stationId: string,
  input: ManualTransactionInput & { fuelSelection?: FuelSelectionInput | null },
  actor: TransactionMutationActor,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const result = await createManualTransactionRepo(
    scopedStationId,
    input,
    actor,
  )
  return result
}
