import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getAdminConfigStatus } from '@/src/modules/admin-config/application/getAdminConfigStatus'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return ok(await getAdminConfigStatus(user.stationId))
  },
})
