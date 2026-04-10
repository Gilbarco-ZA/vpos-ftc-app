import type { ProductCategoryRecord } from '@/src/modules/products/infrastructure/persistence/product-category.repository'

import { getProductCategoryByIdRepo } from '@/src/modules/products/infrastructure/persistence/product-category.repository'

export async function getProductCategoryById(params: {
  stationId: string
  categoryId: string
}): Promise<ProductCategoryRecord | null> {
  return await getProductCategoryByIdRepo(params.stationId, params.categoryId)
}
