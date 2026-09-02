import { fail, ok } from '@/src/platform/web/api/response'
import { defineGetRoute, defineMutationRoute } from '@/src/shared/http/defineRoute'

import {
  listAdminPrintJobs,
  runAdminPrintJobAction,
} from '@/src/modules/printing/application/adminPrintJobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PrintJobAction = {
  action?: 'retry' | 'clear'
  jobId?: string
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const url = new URL(req.url)
    const result = await listAdminPrintJobs({
      stationId: user.stationId,
      status: url.searchParams.get('status'),
      type: url.searchParams.get('type') ?? '',
      search: url.searchParams.get('search') ?? '',
      limit: Number(url.searchParams.get('limit') ?? 100),
    })
    return ok(result)
  },
})

export const POST = defineMutationRoute<PrintJobAction>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await runAdminPrintJobAction({
      stationId: user.stationId,
      userId: user.id,
      jobId: String(body.jobId ?? ''),
      action: body.action,
    })

    if (!result.ok) return fail(result.error, result.status)
    return ok(result.data)
  },
})
