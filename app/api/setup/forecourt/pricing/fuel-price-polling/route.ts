import { badRequest, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import {
  getFuelPricePollingSettings,
  updateFuelPricePollingSettings,
} from '@/src/modules/forecourt/application/fuelPricePollingSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    return ok(await getFuelPricePollingSettings(user.stationId))
  },
})

export const PUT = defineMutationRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    const payload =
      body?.data && typeof body.data === 'object' ? body.data : body

    if (typeof payload?.enabled !== 'boolean') {
      return badRequest('Fuel price polling enabled must be true or false')
    }

    return ok(
      await updateFuelPricePollingSettings(user.stationId, {
        enabled: payload.enabled,
      }),
    )
  },
})
