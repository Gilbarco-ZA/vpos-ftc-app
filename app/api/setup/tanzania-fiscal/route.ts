import { ok } from '@/src/platform/web/api/response'
import {
  definePublicGetRoute,
  definePublicMutationRoute,
} from '@/src/shared/http/defineRoute'

import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'
import { assertStationIsTanzania } from '@/src/modules/tanzania-fiscal/application/country'
import {
  getTanzaniaProxyRegistration,
  saveTanzaniaProxyRegistration,
  submitTanzaniaEwuraRegistration,
  submitTanzaniaProxyRegistration,
  submitTanzaniaTraRegistration,
} from '@/src/modules/tanzania-fiscal/application/proxyRegistration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = definePublicGetRoute({
  handler: async () => {
    const { stationId } = await resolveSetupRequestContext()
    await assertStationIsTanzania(stationId)
    return ok(await getTanzaniaProxyRegistration(stationId))
  },
})

export const POST = definePublicMutationRoute<Record<string, any>>({
  csrf: true,
  handler: async (_req, { body }) => {
    const { stationId } = await resolveSetupRequestContext()
    await assertStationIsTanzania(stationId)
    const action = String(body?.action || 'save')
      .trim()
      .toLowerCase()
    const payload =
      body?.payload && typeof body.payload === 'object' ? body.payload : body
    const data =
      action === 'register-tra'
        ? await submitTanzaniaTraRegistration(stationId, payload)
        : action === 'register-ewura'
          ? await submitTanzaniaEwuraRegistration(stationId, payload)
          : action === 'register'
            ? await submitTanzaniaProxyRegistration(stationId, payload)
            : await saveTanzaniaProxyRegistration(stationId, payload)
    return ok(data)
  },
})
