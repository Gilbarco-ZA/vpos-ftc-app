import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getAdminForecourtSyncStatus } from '@/src/modules/forecourt/application/getAdminForecourtSyncStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    return ok(await getAdminForecourtSyncStatus(user.stationId))
  },
})
