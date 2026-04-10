import { deleteProductCategoryService } from '@/src/modules/products/application/services/product-category-service'

export async function deleteProductCategory(params: {
  stationId: string
  categoryId: string
}): Promise<{ deleted: true }> {
  return await deleteProductCategoryService(params)
}
