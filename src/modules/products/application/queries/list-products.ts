import type { ProductListItemRecord } from '@/src/modules/products/infrastructure/persistence/product.repository'

import { listProductsRepo } from '@/src/modules/products/infrastructure/persistence/product.repository'

export async function listProducts(args: {
  stationId: string
}): Promise<ProductListItemRecord[]> {
  return await listProductsRepo(args.stationId)
}
