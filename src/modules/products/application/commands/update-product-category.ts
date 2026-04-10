import { updateProductCategoryService } from '@/src/modules/products/application/services/product-category-service'
import { type ProductCategoryRecord } from '@/src/modules/products/infrastructure/persistence/product-category.repository'
import { type ProductCategoryImageFile } from '@/src/modules/products/infrastructure/storage/product-category-image.storage'

export async function updateProductCategory(params: {
  stationId: string
  categoryId: string
  name?: string | null
  code?: string | null
  description?: string | null
  icon?: string | null
  sortOrder?: number | null
  isActive?: boolean | null
  imageFile?: ProductCategoryImageFile | null
}): Promise<ProductCategoryRecord | null> {
  return await updateProductCategoryService(params)
}
