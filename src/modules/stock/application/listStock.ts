import {
  listStockMovementsRepo,
  listStockProductsRepo,
} from '@/src/modules/stock/infrastructure/stock.repository'

export async function listStockOverview(stationId: string) {
  const [products, recentMovements] = await Promise.all([
    listStockProductsRepo(stationId),
    listStockMovementsRepo(stationId),
  ])

  return { products, recentMovements }
}
