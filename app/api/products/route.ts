import type { SessionUser } from '@/src/shared/types'

import { badRequest, ok, serverError } from '@/src/platform/web/api/response'
import { readBody } from '@/src/platform/web/api/validation'
import { requireAuth } from '@/src/shared/auth'
import { withAuth } from '@/src/shared/http/defineRoute'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'
import { logger } from '@/src/shared/utils/logger'

import { createProducts } from '@/src/modules/products/application/commands/create-product'
import { updateProductStatus } from '@/src/modules/products/application/commands/update-product-status'
import { listProducts } from '@/src/modules/products/application/queries/list-products'
import {
  resolveProductOnlineStatus,
  syncProductsToCloudService,
} from '@/src/modules/products/application/services/product-service'
import { createProductSchema } from '@/src/modules/products/infrastructure/validators/product.schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(
  ['administrator', 'manager'],
  async (_req, { user }) => {
    const products = await listProducts({ stationId: user.stationId })
    return ok(products)
  },
)

export const POST = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    const stationId = user.stationId
    const createdByName = user.fullName || user.username || 'Unknown User'
    const body = await readBody(req)

    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })

    const payload = body?.data ?? body?.products ?? body
    const inputs = Array.isArray(payload) ? payload : [payload]

    const parsed = inputs.map((item) => createProductSchema.safeParse(item))
    const invalid = parsed.find((entry) => !entry.success)
    if (invalid && !invalid.success) {
      return badRequest('Invalid product payload', undefined, {
        details: invalid.error.flatten(),
      })
    }

    const validInputs = parsed
      .filter((entry): entry is { success: true; data: any } => entry.success)
      .map((entry) => entry.data)

    const { products, normalized } = await createProducts({
      stationId,
      user,
      inputs: validInputs,
    })

    const updatedProducts = products.map((product) => ({
      ...product,
      lastSyncStatus: 'pending',
      lastSyncAt: null,
      lastSyncMessage: 'Saved locally, sync queued',
    }))

    void (async () => {
      try {
        const onlineStatus = await resolveProductOnlineStatus(stationId)
        if (!onlineStatus) {
          await Promise.all(
            normalized.map((item) =>
              updateProductStatus({
                stationId,
                productId: item.productId,
                status: 'pending',
                message: 'Saved locally, sync pending (offline)',
              }),
            ),
          )
          return
        }

        const syncRes = await syncProductsToCloudService({
          stationId,
          products: normalized.map((item) => ({
            ...item,
            createdByName,
            isOnline: onlineStatus,
          })),
        })

        const syncOk = syncRes.ok
        const syncMessage =
          (syncRes.data as any)?.error?.message ||
          (syncRes.data as any)?.message ||
          (syncOk ? 'Synced' : 'Saved locally, sync pending')

        await Promise.all(
          normalized.map((item) =>
            updateProductStatus({
              stationId,
              productId: item.productId,
              status: syncOk ? 'synced' : 'failed',
              message: syncOk ? null : syncMessage,
            }),
          ),
        )
      } catch (error) {
        logger.error('products-sync', {
          msg: 'Background product sync failed after local save',
          stationId,
          error: error instanceof Error ? error.message : String(error),
        })

        await Promise.all(
          normalized.map((item) =>
            updateProductStatus({
              stationId,
              productId: item.productId,
              status: 'failed',
              message: 'Saved locally, sync failed',
            }),
          ),
        ).catch(() => undefined)
      }
    })()

    return ok({
      products: updatedProducts,
      sync: { ok: false, message: 'Saved locally, sync queued' },
    })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
