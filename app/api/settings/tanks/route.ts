import { badRequest, ok, serverError } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getTankSettings } from '@/src/modules/settings/application/getTankSettings'
import {
  createTankSetting,
  deleteTankSetting,
  updateTankSetting,
} from '@/src/modules/settings/application/saveTankSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    return ok(await getTankSettings(user.stationId))
  },
})

export const POST = defineMutationRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    const result = await createTankSetting(user, body)
    return result instanceof Response ? result : ok(result)
  },
})

export const PUT = defineMutationRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    const result = await updateTankSetting(user, body)
    return result instanceof Response ? result : ok(result)
  },
})

export const DELETE = defineMutationRoute({
  roles: ['administrator', 'manager'],
  handler: async (req, { user, body }) => {
    try {
      const result = await deleteTankSetting(user.stationId, body)
      return result instanceof Response ? result : ok(result)
    } catch (err: any) {
      if (String(err?.code || '') === '23503') {
        return badRequest('Cannot delete a tank that is in use by nozzles')
      }
      return await serverError(err, { req, stationId: user.stationId })
    }
  },
})
