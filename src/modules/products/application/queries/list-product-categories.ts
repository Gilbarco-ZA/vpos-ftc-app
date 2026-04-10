import type { ProductCategoryRecord } from '@/src/modules/products/infrastructure/persistence/product-category.repository'

import { listProductCategoriesRepo } from '@/src/modules/products/infrastructure/persistence/product-category.repository'

export async function listProductCategories(params: {
  stationId: string
  includeInactive?: boolean
}): Promise<ProductCategoryRecord[]> {
  return await listProductCategoriesRepo(params.stationId, {
    includeInactive: params.includeInactive,
  })
}
