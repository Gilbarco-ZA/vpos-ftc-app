import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { retryStockMovement } from '@/src/modules/stock/application/retryStockMovement'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<
  { csrf_token?: string },
  { movementId: string }
>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, params }) => {
    return ok(
      await retryStockMovement(
        user.stationId,
        String(params.movementId || '').trim(),
      ),
    )
  },
})
