import type { StationConfigInput } from '@/src/modules/admin-config/application/deviceConfigTypes'

import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getAdminStationConfig } from '@/src/modules/admin-config/application/getAdminStationConfig'
import { saveAdminStationConfig } from '@/src/modules/admin-config/application/saveAdminStationConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return ok(await getAdminStationConfig(user.stationId))
  },
})

export const POST = defineMutationRoute<StationConfigInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    return await saveAdminStationConfig(
      user.stationId,
      user.username ?? 'administrator',
      body,
    )
  },
})
