import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

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

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    await assertStationIsTanzania(user.stationId)
    return ok(await getTanzaniaProxyRegistration(user.stationId))
  },
})

export const POST = defineMutationRoute<Record<string, any>>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    await assertStationIsTanzania(user.stationId)
    const action = String(body?.action || 'save')
      .trim()
      .toLowerCase()
    const payload =
      body?.payload && typeof body.payload === 'object' ? body.payload : body
    const data =
      action === 'register-tra'
        ? await submitTanzaniaTraRegistration(user.stationId, payload)
        : action === 'register-ewura'
          ? await submitTanzaniaEwuraRegistration(user.stationId, payload)
          : action === 'register'
            ? await submitTanzaniaProxyRegistration(user.stationId, payload)
            : await saveTanzaniaProxyRegistration(user.stationId, payload)
    return ok(data)
  },
})
