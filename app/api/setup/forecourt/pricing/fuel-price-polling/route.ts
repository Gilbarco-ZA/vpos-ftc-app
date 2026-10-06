import { badRequest, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import {
  getFuelPricePollingSettings,
  updateFuelPricePollingSettings,
} from '@/src/modules/forecourt/application/fuelPricePollingSettings'
import {
  getFuelPricePollStatus,
  pollFuelPriceChangesOnce,
} from '@/src/modules/forecourt/infrastructure/fuelPriceChangeWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager', 'field_engineer'],
  handler: async (_req, { user }) => {
    const [settings, lastPoll] = await Promise.all([
      getFuelPricePollingSettings(user.stationId),
      getFuelPricePollStatus(user.stationId),
    ])
    return ok({ ...settings, lastPoll })
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
      await updateFuelPricePollingSettings(user.stationId, {
        enabled: payload.enabled,
      }),
    )
  },
})

export const POST = defineMutationRoute({
  roles: ['administrator', 'manager', 'field_engineer'],
  handler: async (_req, { user }) => {
    const result = await pollFuelPriceChangesOnce(user.stationId)
    const lastPoll = await getFuelPricePollStatus(user.stationId)
    return ok({ result, lastPoll })
  },
})
