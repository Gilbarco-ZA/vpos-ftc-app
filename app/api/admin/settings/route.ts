import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getAdminSettings } from '@/src/modules/admin-config/application/getAdminSettings'
import { saveAdminSettings } from '@/src/modules/admin-config/application/saveAdminSettings'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return ok(await getAdminSettings(user.stationId))
  },
})

export const POST = defineMutationRoute<Record<string, any>>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await saveAdminSettings({
      stationId: user.stationId,
      userId: user.id,
      body,
    })
    return result instanceof Response ? result : ok(result)
  },
})
