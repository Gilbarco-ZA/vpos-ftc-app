import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getReportById } from '@/src/modules/reports/application/getReportById'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute<{ id: string }>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, params }) => {
    const row = await getReportById(user.stationId, params.id)
    return ok(row)
  },
})
