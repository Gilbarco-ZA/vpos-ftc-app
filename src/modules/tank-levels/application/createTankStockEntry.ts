import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import {
  createStockEntryRepo,
  buildStockInPayloadForMovement as legacyBuildStockInPayloadForMovement,
  sendMovementToProxyRepo,
} from '@/src/modules/tank-levels/infrastructure/tankLevelsRepo'

export async function createStockEntry(input: {
  stationId: string
  tankId: string
  quantityLitres: number
  stockInType?: 'StockCount' | 'Delivery' | null
  unitPrice?: number | null
  purchaseDate?: string | null
  supplierPin?: string | null
  supplierName?: string | null
  supplierInvoiceNumber?: string | null
  createdByName?: string | null
  effectiveAt?: string | null
  documentId?: string | null
}) {
  const movement = await createStockEntryRepo({
    ...input,
    stationId: requireNonEmptyString(input.stationId, 'stationId'),
    tankId: requireNonEmptyString(input.tankId, 'tankId'),
  })

  if (!movement?.id) {
    return movement
  }

  try {
    const proxy = await sendMovementToProxyRepo(
      requireNonEmptyString(input.stationId, 'stationId'),
      String(movement.id),
    )
    return {
      ...movement,
      proxy: { ok: true, ...proxy },
    }
  } catch (error: any) {
    return {
      ...movement,
      proxy: {
        ok: false,
        message: String(error?.message || error || 'Proxy send failed'),
      },
    }
  }
}

export function buildStockInPayloadForMovement(movement: unknown) {
  return legacyBuildStockInPayloadForMovement(movement)
}

export async function sendMovementToProxy(
  stationId: string,
  movementId: string,
) {
  return await sendMovementToProxyRepo(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(movementId, 'movementId'),
  )
}
