import type { ProductRecord } from '@/src/modules/products/infrastructure/persistence/product.repository'

import { getProductByIdRepo } from '@/src/modules/products/infrastructure/persistence/product.repository'

export async function getProductById(args: {
  stationId: string
  productId: string
}): Promise<ProductRecord | null> {
  return await getProductByIdRepo(args.stationId, args.productId)
}
