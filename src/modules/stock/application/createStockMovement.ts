import type { CreateStockMovementInput } from '@/src/modules/stock/application/stockSchemas'

import {
  createStockMovementRepo,
  getStockMovementRepo,
} from '@/src/modules/stock/infrastructure/stock.repository'
import { sendStockMovementToProxy } from '@/src/modules/stock/infrastructure/stockProxy'

export async function createStockMovement(
  input: CreateStockMovementInput & {
    stationId: string
    createdByUserId: string
    createdByName: string
  },
) {
  const movement = await createStockMovementRepo({
    stationId: input.stationId,
    productRecordId: input.productRecordId,
    movementType: input.movementType,
    reason: input.reason,
    quantity: input.quantity,
    unitCost: input.unitCost,
    effectiveAt: input.effectiveAt,
    documentReference: input.documentReference,
    remarks: input.remarks,
    supplierName: input.supplierName,
    supplierPin: input.supplierPin,
    supplierInvoiceNumber: input.supplierInvoiceNumber,
    createdByUserId: input.createdByUserId,
    createdByName: input.createdByName,
  })

  try {
    const proxy = await sendStockMovementToProxy(input.stationId, movement.id)
    const updated = await getStockMovementRepo(input.stationId, movement.id)
    return { movement: updated ?? movement, proxy }
  } catch (error) {
    const updated = await getStockMovementRepo(input.stationId, movement.id)
    return {
      movement: updated ?? movement,
      proxy: {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
