import type { ProductCreateInput } from '@/src/modules/products/infrastructure/validators/product.schemas'

import {
  createProductService,
  createProductsService,
} from '@/src/modules/products/application/services/product-service'

export async function createProduct(args: {
  stationId: string
  user: { fullName?: string; username: string }
  input: ProductCreateInput
}) {
  return await createProductService(args)
}

export async function createProducts(args: {
  stationId: string
  user: { fullName?: string; username: string }
  inputs: ProductCreateInput[]
}) {
  return await createProductsService(args)
}
