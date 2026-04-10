import { fail, ok } from '@/src/platform/web/api/response'
import { definePublicMutationRoute } from '@/src/shared/http/defineRoute'

import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'
import { registerPublicSetupDevice } from '@/src/modules/setup/application/registerPublicSetupDevice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  csrf_token?: string
  registrationCode?: string
  RegistrationCode?: string
}

export const POST = definePublicMutationRoute<Body>({
  handler: async (_req, { body }) => {
    const { stationId } = await resolveSetupRequestContext()
    const result = await registerPublicSetupDevice(stationId, body)
    if (!result.success) {
      return fail(result.error, result.status)
    }
    return ok(result.data)
  },
})
