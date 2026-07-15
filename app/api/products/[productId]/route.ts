import type { SessionUser } from '@/src/shared/types'

import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getProductById } from '@/src/modules/products/application/queries/get-product-by-id'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async (
  _req: Request,
  props: { params: Promise<{ productId: string }> },
) => {
  const params = await props.params
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
    if (!product) return fail('Product not found', 404)
    return ok(product)
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
