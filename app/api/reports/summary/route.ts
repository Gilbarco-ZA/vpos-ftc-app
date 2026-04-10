import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getReportSummary } from '@/src/modules/reports/application/getReportSummary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['manager', 'administrator'],
  handler: async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const summary = await getReportSummary(
      user.stationId,
      searchParams.get('startDate'),
      searchParams.get('endDate'),
    )
    return ok(summary)
  },
})
