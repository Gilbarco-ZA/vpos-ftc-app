import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { enqueueReportPrint } from '@/src/modules/reports/application/enqueueReportPrint'
import { listReports } from '@/src/modules/reports/application/listReports'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type PrintReportBody = {
  csrf_token?: string
  filename?: string
  reportId?: string
  data?: unknown
}

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const limit = searchParams.get('limit')
    const rows = await listReports(
      user.stationId,
      limit ? Number(limit) : undefined,
    )
    return ok({ rows })
  },
})

export const POST = defineMutationRoute<PrintReportBody>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const reportId = String(body?.reportId || body?.filename || '').trim()
    const job = await enqueueReportPrint(user.stationId, reportId)
    return ok(job)
  },
})
