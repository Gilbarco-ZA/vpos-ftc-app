import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getTankCloudSettings } from '@/src/modules/settings/application/getTankCloudSettings'
import { saveTankCloudSettings } from '@/src/modules/settings/application/saveTankCloudSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    return ok(await getTankCloudSettings(user.stationId))
  },
})

export const POST = defineMutationRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    return await saveTankCloudSettings(user, body)
  },
})
