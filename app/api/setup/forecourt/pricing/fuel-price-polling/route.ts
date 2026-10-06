import { badRequest, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import {
  checkFuelPricesNow,
  getFuelPricePollingOverview,
  setFuelPricePollingEnabled,
} from '@/src/modules/forecourt/application/fuelPricePolling'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager', 'field_engineer'],
  handler: async (_req, { user }) => {
    return ok(await getFuelPricePollingOverview(user.stationId))
  },
})

export const PUT = defineMutationRoute({
  roles: ['administrator', 'manager', 'field_engineer'],
  handler: async (_req, { user, body }) => {
    const payload =
      body?.data && typeof body.data === 'object' ? body.data : body

    if (typeof payload?.enabled !== 'boolean') {
      return badRequest('Fuel price polling enabled must be true or false')
    }

    return ok(
      await setFuelPricePollingEnabled(user.stationId, payload.enabled),
    )
  },
})

export const POST = defineMutationRoute({
  roles: ['administrator', 'manager', 'field_engineer'],
  handler: async (_req, { user }) => {
    return ok(await checkFuelPricesNow(user.stationId))
  },
})
