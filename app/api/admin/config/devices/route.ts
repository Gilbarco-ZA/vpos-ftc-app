import type { DeviceConfigInput } from '@/src/modules/admin-config/application/deviceConfigTypes'

import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getAdminDeviceConfigs } from '@/src/modules/admin-config/application/getAdminDeviceConfigs'
import { saveAdminDeviceConfig } from '@/src/modules/admin-config/application/saveAdminDeviceConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return ok(await getAdminDeviceConfigs(user.stationId))
  },
})

export const POST = defineMutationRoute<DeviceConfigInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    return await saveAdminDeviceConfig(user.stationId, user.id, body)
  },
})
