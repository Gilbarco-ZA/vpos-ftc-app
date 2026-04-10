import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listPendingReports } from '@/src/modules/reports/application/listPendingReports'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    const rows = await listPendingReports(user.stationId)
    return ok({ rows })
  },
})
