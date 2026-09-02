import { fail, ok } from '@/src/platform/web/api/response'
import { definePublicMutationRoute } from '@/src/shared/http/defineRoute'
import { resetDeviceViaProxy } from '@/src/shared/proxy/client'
import { storeStationKv } from '@/src/shared/setup/api'

import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'
import { registerPublicSetupDevice } from '@/src/modules/setup/application/registerPublicSetupDevice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  csrf_token?: string
  action?: 'register' | 'reset'
  registrationCode?: string
  RegistrationCode?: string
  countryCode?: string
  countryId?: string
}

export const POST = definePublicMutationRoute<Body>({
  handler: async (_req, { body }) => {
    const { stationId } = await resolveSetupRequestContext()

    if (body?.action === 'reset') {
      const result = await resetDeviceViaProxy(stationId)
      if (!result.ok) {
        return fail(
          result.data?.message ||
            result.data?.error ||
            'Failed to reset device registration',
          result.status || 502,
        )
      }
      await Promise.all([
        storeStationKv(stationId, 'vpos.device.data', null),
        storeStationKv(stationId, 'vpos.device.registration', {
          isRegistered: false,
          resetAt: new Date().toISOString(),
        }),
        storeStationKv(stationId, 'proxy.identity', null),
      ])
      return ok({ reset: true })
    }

    const result = await registerPublicSetupDevice(stationId, body)
    if (!result.success) {
      return fail(result.error, result.status)
    }
    return ok(result.data)
  },
})
