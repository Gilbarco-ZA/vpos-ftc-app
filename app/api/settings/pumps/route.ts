import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getPumpSettings } from '@/src/modules/settings/application/getPumpSettings'
import {
  createPumpSetting,
  updatePumpSetting,
} from '@/src/modules/settings/application/savePumpSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    return ok(await getPumpSettings(user.stationId))
  },
})

export const POST = defineMutationRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    const result = await createPumpSetting(user.stationId, body)
    return result instanceof Response ? result : ok(result)
  },
})

export const PUT = defineMutationRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    const result = await updatePumpSetting(user.stationId, body)
    return result instanceof Response ? result : ok(result)
  },
})
