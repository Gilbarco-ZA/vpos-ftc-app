import type { SessionUser } from '@/src/shared/types'

import { notFound, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { updateProductStatus } from '@/src/modules/products/application/commands/update-product-status'
import { getProductById } from '@/src/modules/products/application/queries/get-product-by-id'
import {
  buildProductCloudSyncInput,
  resolveProductOnlineStatus,
  syncProductsToCloudService,
} from '@/src/modules/products/application/services/product-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = async (
  req: Request,
  { params }: { params: { productId: string } },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    const product = await getProductById({
      stationId: user.stationId,
      productId: params.productId,
    })
    if (!product) {
      return notFound('Product not found')
    }

    const createdByName = user.fullName || user.username || 'Unknown User'
    const isOnline = await resolveProductOnlineStatus(user.stationId)

    const syncRes = await syncProductsToCloudService({
      stationId: user.stationId,
      products: [
        buildProductCloudSyncInput(product, {
          createdByName,
          isOnline,
        }),
      ],
    })

    const syncOk = syncRes.ok
    const syncMessage =
      (syncRes.data as any)?.error?.message ||
      (syncRes.data as any)?.message ||
      (syncOk ? 'Synced' : 'Sync failed')

    await updateProductStatus({
      stationId: user.stationId,
      productId: product.extProductId ?? product.productId,
      status: syncOk ? 'synced' : 'failed',
      message: syncOk ? null : syncMessage,
    })

    return ok({ ok: syncOk, message: syncMessage })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
