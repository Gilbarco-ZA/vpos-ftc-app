import { badRequest, ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import {
  MAX_ATG_POLLING_INTERVAL_MINUTES,
  MIN_ATG_POLLING_INTERVAL_MINUTES,
  updateAtgPollingSettings,
} from '@/src/modules/forecourt/application/atgPollingSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const PUT = defineMutationRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    const payload =
      body?.data && typeof body.data === 'object' ? body.data : body
    const enabled = payload?.enabled
    const intervalMinutes = Number(payload?.intervalMinutes)

    if (typeof enabled !== 'boolean') {
      return badRequest('ATG polling enabled must be true or false')
    }

    if (
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < MIN_ATG_POLLING_INTERVAL_MINUTES ||
      intervalMinutes > MAX_ATG_POLLING_INTERVAL_MINUTES
    ) {
      return badRequest(
        `ATG polling interval must be a whole number between ${MIN_ATG_POLLING_INTERVAL_MINUTES} and ${MAX_ATG_POLLING_INTERVAL_MINUTES} minutes`,
      )
    }

    return ok(
      await updateAtgPollingSettings(user.stationId, {
        enabled,
        intervalMinutes,
      }),
    )
  },
})
