import { sendStockMovementToProxy } from '@/src/modules/stock/infrastructure/stockProxy'

export type StockMovementSyncResult = {
  movementId: string
  success: boolean
  message: string | null
}

async function sendMovement(
  stationId: string,
  movementId: string,
): Promise<StockMovementSyncResult> {
  try {
    await sendStockMovementToProxy(stationId, movementId)
    return { movementId, success: true, message: null }
  } catch (error) {
    return {
      movementId,
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function syncStockMovements(
  stationId: string,
  movementIds: string[],
): Promise<StockMovementSyncResult[]> {
  const results: StockMovementSyncResult[] = []

  for (const movementId of movementIds) {
    const result = await sendMovement(stationId, movementId)
    results.push(result)
    if (!result.success) break
  }

  return results
}

export async function syncStockMovementsIndependently(
  stationId: string,
  movementIds: string[],
): Promise<StockMovementSyncResult[]> {
  if (movementIds.length === 0) return []

  const results = new Array<StockMovementSyncResult>(movementIds.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < movementIds.length) {
      const index = nextIndex
      nextIndex += 1
      const movementId = movementIds[index]
      if (!movementId) continue
      results[index] = await sendMovement(stationId, movementId)
    }
  }

  const workerCount = Math.min(4, movementIds.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
