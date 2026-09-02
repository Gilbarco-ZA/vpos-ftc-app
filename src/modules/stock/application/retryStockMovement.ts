import { AppError } from '@/src/shared/errors/AppError'

import { stockMovementRequiresProxy } from '@/src/modules/stock/domain/stockMovement'
import { getStockMovementRepo } from '@/src/modules/stock/infrastructure/stock.repository'
import { sendStockMovementToProxy } from '@/src/modules/stock/infrastructure/stockProxy'

export async function retryStockMovement(
  stationId: string,
  movementId: string,
) {
  const movement = await getStockMovementRepo(stationId, movementId)
  if (!movement) {
    throw new AppError('NOT_FOUND', 'Stock movement was not found.', 404)
  }
  if (movement.proxyStatus === 'SENT') {
    throw new AppError(
      'CONFLICT',
      'This stock movement has already been sent through vpos-proxy.',
      409,
    )
  }

  if (!stockMovementRequiresProxy(movement.sourceType)) {
    throw new AppError(
      'CONFLICT',
      'POS transaction stock movements are local-only because invoice submission updates cloud stock.',
      409,
    )
  }

  const proxy = await sendStockMovementToProxy(stationId, movementId)
  const updated = await getStockMovementRepo(stationId, movementId)

  return { movement: updated ?? movement, proxy }
}
