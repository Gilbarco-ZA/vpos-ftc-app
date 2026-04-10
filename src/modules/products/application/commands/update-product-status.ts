import type { ProductSyncStatus } from '@/src/shared/types'

import { updateProductStatusService } from '@/src/modules/products/application/services/product-service'

export async function updateProductStatus(args: {
  stationId: string
  productId: string
  status: ProductSyncStatus
  message?: string | null
}) {
  await updateProductStatusService(args)
}
