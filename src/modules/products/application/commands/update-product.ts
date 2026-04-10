import type { ProductCreateInput } from '@/src/modules/products/infrastructure/validators/product.schemas'

import { updateProductService } from '@/src/modules/products/application/services/product-service'

export async function updateProduct(args: {
  stationId: string
  user: { fullName?: string; username: string }
  input: ProductCreateInput
}) {
  return await updateProductService(args)
}
