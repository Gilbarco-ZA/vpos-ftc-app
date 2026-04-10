import type {
  FuelSelectionInput,
  ManualTransactionInput,
} from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { createManualTransactionRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function createManualTransaction(
  stationId: string,
  input: ManualTransactionInput & { fuelSelection?: FuelSelectionInput | null },
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await createManualTransactionRepo(scopedStationId, input)
}
