import { created, fail, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { createStockMovement } from '@/src/modules/stock/application/createStockMovement'
import { listStockOverview } from '@/src/modules/stock/application/listStock'
import { createStockMovementSchema } from '@/src/modules/stock/application/stockSchemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user }) => {
    return ok(await listStockOverview(user.stationId))
  },
})

export const POST = defineMutationRoute({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const payload = body?.data ?? body
    const parsed = createStockMovementSchema.safeParse(payload)

    if (!parsed.success) {
      return fail('Invalid stock movement payload.', 400, undefined, {
        details: parsed.error.flatten(),
      })
    }

    const result = await createStockMovement({
      ...parsed.data,
      stationId: user.stationId,
      createdByUserId: user.id,
      createdByName: user.fullName || user.name || user.username || user.email,
    })

    return created(result)
  },
})
