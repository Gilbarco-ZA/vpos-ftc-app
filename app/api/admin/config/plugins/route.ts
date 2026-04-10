import type { PluginConfigInput } from '@/src/modules/admin-config/application/deviceConfigTypes'

import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getAdminPluginConfigs } from '@/src/modules/admin-config/application/getAdminPluginConfigs'
import { saveAdminPluginConfig } from '@/src/modules/admin-config/application/saveAdminPluginConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return ok(await getAdminPluginConfigs(user.stationId))
  },
})

export const POST = defineMutationRoute<PluginConfigInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    return await saveAdminPluginConfig(user.stationId, user.id, body)
  },
})
