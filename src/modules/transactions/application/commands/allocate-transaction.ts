import type { TransactionVehicleDetailsInput } from '@/src/modules/transactions/infrastructure/persistence/transaction.types'

import { allocateTransactionRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function allocateTransaction(input: {
  stationId: string
  transactionId: string
  customerId: string
  allocatedBy?: string | null
  vehicleDetails?: TransactionVehicleDetailsInput | null
}) {
  return await allocateTransactionRepo(
    input.stationId,
    input.transactionId,
    input.customerId,
    input.allocatedBy ?? null,
    input.vehicleDetails ?? null,
  )
}
