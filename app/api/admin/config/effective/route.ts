import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getAdminConfigEffective } from '@/src/modules/admin-config/application/getAdminConfigEffective'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return ok(await getAdminConfigEffective(user.stationId))
  },
})
