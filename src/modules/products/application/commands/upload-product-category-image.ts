import { uploadProductCategoryImage as uploadProductCategoryImageService } from '@/src/modules/products/application/services/product-category-service'
import { type ProductCategoryImageFile } from '@/src/modules/products/infrastructure/storage/product-category-image.storage'

export async function uploadProductCategoryImage(params: {
  categoryId: string
  imageFile: ProductCategoryImageFile
}): Promise<string> {
  return await uploadProductCategoryImageService(params)
}
