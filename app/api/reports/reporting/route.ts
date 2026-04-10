import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getReportsReporting } from '@/src/modules/reports/application/getReportsReporting'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    const reporting = await getReportsReporting(user.stationId)
    return ok(reporting)
  },
})
