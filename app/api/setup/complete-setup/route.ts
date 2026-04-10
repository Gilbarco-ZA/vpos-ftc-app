import { fail, ok } from '@/src/platform/web/api/response'
import { definePublicMutationRoute } from '@/src/shared/http/defineRoute'

import { completeStationSetup } from '@/src/modules/setup/application/completeStationSetup'
import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = definePublicMutationRoute({
  csrf: false,
  handler: async (_req, { body }) => {
    const ctx = await resolveSetupRequestContext({
      rolesWhenConfigured: ['administrator', 'manager'],
    })
    const result = await completeStationSetup(
      ctx.stationId,
      (body || {}) as Record<string, unknown>,
    )
    if (!result.success) {
      return fail(result.error, result.status)
    }
    return ok({
      message: result.message,
      proxy: result.proxy,
      deviceId: result.deviceId,
      deviceName: result.deviceName,
    })
  },
})
