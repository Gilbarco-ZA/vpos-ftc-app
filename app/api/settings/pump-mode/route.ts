import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getPumpModeSettings } from '@/src/modules/settings/application/getPumpModeSettings'
import { savePumpModeSettings } from '@/src/modules/settings/application/savePumpModeSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return ok(await getPumpModeSettings(user.stationId))
  },
})

export const POST = defineMutationRoute({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await savePumpModeSettings(user.stationId, body)
    return result instanceof Response ? result : ok(result)
  },
})
